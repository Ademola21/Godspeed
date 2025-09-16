// Standalone bot entry point for Azure deployment
// This allows the bot to run independently from the web server

import { runBot } from './bot/run';

// Environment validation
const requiredEnvVars = [
    'TELEGRAM_BOT_TOKEN'
];

const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
if (missingVars.length > 0) {
    console.error('❌ Missing required environment variables:', missingVars.join(', '));
    process.exit(1);
}

// Optional Azure OpenAI configuration
const azureOpenAIVars = [
    'AZURE_OPENAI_ENDPOINT',
    'AZURE_OPENAI_API_KEY', 
    'AZURE_OPENAI_DEPLOYMENT_NAME'
];

const missingAzureVars = azureOpenAIVars.filter(varName => !process.env[varName]);
if (missingAzureVars.length > 0) {
    console.warn('⚠️ Missing Azure OpenAI environment variables:', missingAzureVars.join(', '));
    console.warn('Bot AI features will be disabled');
}

console.log('🤖 Starting Yoruba Cinemax Telegram Bot...');
console.log('Environment:', process.env.NODE_ENV || 'development');

// Start the bot
runBot()
    .then(() => {
        console.log('✅ Telegram bot started successfully');
    })
    .catch((error) => {
        console.error('❌ Failed to start Telegram bot:', error);
        process.exit(1);
    });

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('📱 Shutting down bot gracefully...');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('📱 Shutting down bot gracefully...');
    process.exit(0);
});