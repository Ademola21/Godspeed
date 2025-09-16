// FIX: Declare '__dirname' to resolve TypeScript error about missing Node.js type definitions.
declare const __dirname: string;

import TelegramBot from 'node-telegram-bot-api';
import OpenAI from 'openai';
import { getAnalyticsSummary } from './analyticsService';
import { setUserState, clearUserState } from './utils';
import fs from 'fs';
import path from 'path';
import { Movie, Actor } from './types';
import { atomicWrite } from './utils';
import { storageService } from '../services/storageAbstraction';

// --- Azure OpenAI Client Setup ---
const azureEndpoint = process.env.AZURE_OPENAI_ENDPOINT;
const azureApiKey = process.env.AZURE_OPENAI_API_KEY;
const azureDeploymentName = process.env.AZURE_OPENAI_DEPLOYMENT_NAME;

let client: OpenAI | null = null;
if (azureEndpoint && azureApiKey && azureDeploymentName) {
    try {
        // Normalize endpoint and create baseURL
        const baseEndpoint = azureEndpoint.replace(/\/+$/, '');
        const baseURL = `${baseEndpoint}/openai/deployments/${azureDeploymentName}`;
        
        client = new OpenAI({
            apiKey: azureApiKey,
            baseURL: baseURL,
            defaultQuery: { 'api-version': '2024-08-01-preview' },
            defaultHeaders: {
                'api-key': azureApiKey,
            },
        });
        console.log('✅ Bot Azure OpenAI client initialized');
    } catch (error) {
        console.error('❌ Failed to initialize Bot Azure OpenAI client:', error);
    }
} else {
    console.error("Azure OpenAI environment variables are not set. Bot AI features will be disabled.");
}
// ---

const readMovies = async (): Promise<Movie[]> => {
    return await storageService.getMovies();
};

const readActors = async (): Promise<Actor[]> => {
    return await storageService.getActors();
};

const writeActors = async (actors: Actor[]) => {
    await storageService.saveActors(actors);
};

const invokeAzureAI = async (systemInstruction: string, userPrompt: string): Promise<string> => {
    if (!client) {
        return "The AI service is not configured on the server.";
    }
    const messages = [
        { role: "system" as const, content: systemInstruction },
        { role: "user" as const, content: userPrompt },
    ];

    try {
        const result = await client.chat.completions.create({
            model: azureDeploymentName!,
            messages: messages,
            max_tokens: 2048
        });
        return result.choices[0].message?.content || "Sorry, I received an empty response.";
    } catch (error: any) {
        console.error("Azure OpenAI Error:", error);
        return `Sorry, there was an error with the AI service: ${error.message}`;
    }
};

const endChatKeyboard = {
    inline_keyboard: [[{ text: "🔚 End Chat", callback_data: "ai_end_chat" }]]
};


export const startAiChat = (bot: TelegramBot, chatId: number) => {
    setUserState(chatId, { command: 'ai_chat' });
    bot.sendMessage(chatId, "🤖 You are now chatting with the Analytics AI. Ask me about site activity or the movie catalog. For example:\n- 'How is the site doing today?'\n- 'What movies are similar to Anikulapo?'", {
        reply_markup: endChatKeyboard
    });
};

export const endAiChat = (bot: TelegramBot, chatId: number, messageId: number) => {
    clearUserState(chatId);
    bot.editMessageText("🤖 AI chat session ended. You can now use other commands.", {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: { inline_keyboard: [] } // Remove the button
    });
};


export const handleAiQuery = async (bot: TelegramBot, msg: TelegramBot.Message) => {
    const chatId = msg.chat.id;
    const query = msg.text;

    if (!query) return;

    await bot.sendChatAction(chatId, 'typing');

    try {
        let days = 1;
        if (query.toLowerCase().includes('last week')) days = 7;
        if (query.toLowerCase().includes('last month')) days = 30;

        const analytics = getAnalyticsSummary(days);
        const movies = await readMovies();
        const movieContext = movies.map((m: Movie) => `Title: ${m.title}, Genre: ${m.genre}, Category: ${m.category}`).join('\n');

        const systemInstruction = `You are a helpful AI assistant for the admin of Yoruba Cinemax. Provide concise, friendly, and natural language answers.

1.  **For analytics questions:** Use the provided data to summarize website performance.
2.  **For movie catalog questions:** (e.g., "suggest a thriller", "what's like Jagun Jagun?"), use the provided movie list. Do not mention movies outside this list.

**Analytics Data for the last ${days} day(s):**
- Visitors: ${analytics.dailyVisitors}
- New Sign-ups: ${analytics.todaysSignups}
- Most Popular Movies (by clicks):
  ${analytics.mostClicked.map((m, i) => `${i + 1}. ${m.title} (${m.clicks} clicks)`).join('\n') || 'No movie clicks recorded.'}

**Available Movie Catalog:**
${movieContext}
`;

        const responseText = await invokeAzureAI(systemInstruction, query);
        bot.sendMessage(chatId, responseText, { reply_markup: endChatKeyboard });

    } catch (error) {
        console.error("Azure AI Error:", error);
        bot.sendMessage(chatId, "Sorry, I'm having trouble thinking right now. Please try again later.", { reply_markup: endChatKeyboard });
    }
};

export const suggestNewMovies = async (bot: TelegramBot, chatId: number) => {
    await bot.sendChatAction(chatId, 'typing');
    try {
        const currentMovies = await readMovies();
        const existingTitles = currentMovies.map((m: Movie) => m.title).join(', ');

        const system = "You are a movie suggestion expert. Your task is to find 3 popular or trending Yoruba movies that are NOT in the provided list. Use your internal knowledge of world cinema.";
        const prompt = `Find 3 movies that are not on this list: ${existingTitles}.`;

        const responseText = await invokeAzureAI(system, prompt);

        bot.sendMessage(chatId, `🧠 *AI Suggestions based on its knowledge:*\n\n${responseText}`, { parse_mode: 'Markdown' });

    } catch(e) {
        bot.sendMessage(chatId, "Could not fetch suggestions at this time.");
        console.error(e);
    }
};

export const getWeeklyDigest = async (bot: TelegramBot) => {
    const adminId = process.env.ADMIN_TELEGRAM_USER_ID;
    if (!adminId) {
        console.log("Weekly Digest skipped: No Admin ID.");
        return;
    }

    console.log("Generating weekly digest...");
    await bot.sendChatAction(parseInt(adminId, 10), 'typing');
    try {
        const analytics = getAnalyticsSummary(7);
        const systemInstruction = `You are an AI assistant generating a weekly performance report for the admin of a movie website. Provide a concise, friendly summary using Markdown formatting. Highlight key numbers and trends.`;

        const prompt = `Here is the data for the last 7 days:
- Total Visitors: ${analytics.dailyVisitors}
- New Sign-ups: ${analytics.todaysSignups}
- Top 3 Most Clicked Movies: ${analytics.mostClicked.slice(0, 3).map(m => `${m.title} (${m.clicks} clicks)`).join(', ') || 'None'}

Please generate the weekly report.`;

        const responseText = await invokeAzureAI(systemInstruction, prompt);

        const reportHeader = "📊 *Your Weekly Performance Report* 📊\n\n";
        bot.sendMessage(adminId, reportHeader + responseText, { parse_mode: 'Markdown' });

    } catch (e) {
        console.error("Failed to generate weekly digest:", e);
        bot.sendMessage(adminId, "Sorry, I couldn't generate the weekly report this time.");
    }
};

export const generateActorProfile = async (actorName: string): Promise<Partial<Actor> | null> => {
    try {
        const systemInstruction = `You are an AI data specialist. Find a concise one-paragraph biography and a direct URL to a high-quality, public-domain portrait image for the specified Yoruba movie actor.
Respond ONLY with a valid JSON object. If no good image URL is found, the imageUrl should be null.
Example response: { "bio": "...", "imageUrl": "https://..." }`;
        const userPrompt = `Find bio and image URL for actor: ${actorName}`;

        let responseText = await invokeAzureAI(systemInstruction, userPrompt);

        // Remove markdown code blocks if present
        if (responseText.startsWith('```json')) {
            responseText = responseText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
        } else if (responseText.startsWith('```')) {
            responseText = responseText.replace(/^```\s*/, '').replace(/\s*```$/, '');
        }
        const profile = JSON.parse(responseText);

        return profile;
    } catch (error) {
        console.error(`AI failed to generate profile for ${actorName}:`, error);
        return null;
    }
};