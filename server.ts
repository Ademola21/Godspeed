// FIX: Changed import style to use `express.Request` and `express.Response` to resolve type conflicts.
import express from 'express';
import path from 'path';
import { runBot } from './bot/run';
import OpenAI from 'openai';
import { validateSession } from './api/auth'; // Imported centralized auth validation
import usersRouter from './api/users';
import commentsRouter from './api/comments';
import { storageService } from './services/storageAbstraction';

// --- SERVER SETUP ---
const app = express();
// FIX: Explicitly parse the port to a number to satisfy the listen() function's type requirement.
// Use Azure's PORT environment variable if available, otherwise fallback to 5000
const PORT = parseInt(process.env.PORT || process.env.WEBSITES_PORT || process.env.WEBSITE_PORT || '8080', 10);

// @FIX: The type errors in route handlers were causing this `app.use` call to fail type checking. Fixing the handlers resolves this.
app.use(express.json({ limit: '10mb' })); // Increase limit for profile pics

// --- SECURITY & HELPERS ---
const userRequests = new Map<string, number[]>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 20;

const checkRateLimit = (userId: string) => {
    const now = Date.now();
    const timestamps = userRequests.get(userId) || [];
    const recentTimestamps = timestamps.filter(t => now - t < RATE_LIMIT_WINDOW_MS);
    if (recentTimestamps.length >= MAX_REQUESTS_PER_WINDOW) return { limited: true };
    recentTimestamps.push(now);
    userRequests.set(userId, recentTimestamps);
    return { limited: false };
};

// Removed local validateSession as it's now imported from ./api/auth

// --- AZURE AI CLIENT SETUP ---
const azureEndpoint = process.env.AZURE_OPENAI_ENDPOINT;
const azureApiKey = process.env.AZURE_OPENAI_API_KEY;
const azureDeploymentName = process.env.AZURE_OPENAI_DEPLOYMENT_NAME;

let azureClient: OpenAI | null = null;
if (azureEndpoint && azureApiKey && azureDeploymentName) {
    try {
        // Normalize endpoint and create baseURL
        const baseEndpoint = azureEndpoint.replace(/\/+$/, '');
        const baseURL = `${baseEndpoint}/openai/deployments/${azureDeploymentName}`;
        
        azureClient = new OpenAI({
            apiKey: azureApiKey,
            baseURL: baseURL,
            defaultQuery: { 'api-version': '2024-08-01-preview' },
            defaultHeaders: {
                'api-key': azureApiKey,
            },
        });
        console.log('✅ Azure OpenAI client initialized');
        console.log('Endpoint:', azureEndpoint);
        console.log('Deployment:', azureDeploymentName);
    } catch (error) {
        console.error('❌ Failed to initialize Azure OpenAI client:', error);
    }
} else {
    console.log('❌ Missing Azure OpenAI configuration:');
    console.log('Endpoint:', azureEndpoint ? '✓' : '✗');
    console.log('API Key:', azureApiKey ? '✓' : '✗');
    console.log('Deployment:', azureDeploymentName ? '✓' : '✗');
}


// --- API ROUTES (MIGRATED FROM /api) ---

// Azure OpenAI Proxy
// @FIX: Use express.Request and express.Response for proper type inference.
app.post('/api/azure-ai', async (req: express.Request, res: express.Response) => {
    if (!azureClient || !azureDeploymentName) {
        return res.status(500).json({ error: 'Azure AI service not configured on the server.' });
    }
    try {
        const { params, session } = req.body;
        // Use the imported validateSession function
        if (!validateSession(session)) {
            return res.status(401).json({ error: 'Unauthorized: Invalid session.' });
        }
        if (checkRateLimit(session.user.id).limited) {
            return res.status(429).json({ error: 'Too Many Requests.' });
        }

        // Extract data from the Gemini-style request format
        const systemInstruction = params.config?.systemInstruction || '';
        const userPrompt = params.contents || '';
        const max_tokens = params.max_tokens || 2048;
        const json_mode = params.json_mode || false;

        const messages = [
            { role: "system" as const, content: systemInstruction },
            { role: "user" as const, content: userPrompt },
        ];

        console.log('Azure config - Endpoint:', azureEndpoint);
        console.log('Azure config - Deployment:', azureDeploymentName);
        console.log('Calling chat.completions.create...');

        const result = await azureClient.chat.completions.create({
            model: azureDeploymentName,
            messages: messages,
            max_tokens: max_tokens || 2048,
            ...(json_mode && { response_format: { type: "json_object" } })
        });

        const responseContent = result.choices[0].message?.content || '{}';
        res.status(200).json({ text: responseContent });

    } catch (error: any) {
        console.error('Error in Azure AI proxy:', error);
        res.status(500).json({ error: 'Internal AI error: ' + error.message });
    }
});

// YouTube Downloader Proxy
// @FIX: Use express.Request and express.Response for proper type inference.
app.post('/api/youtube-downloader', async (req: express.Request, res: express.Response) => {
    const { spawn } = require('child_process');
    const { promisify } = require('util');
    
    try {
        const { url, session } = req.body;
        console.log('YouTube downloader request received with session:', session ? 'present' : 'missing');
        
        // Use the imported validateSession function
        if (!validateSession(session)) {
            console.log('Session validation failed for YouTube downloader');
            return res.status(401).json({ error: 'Unauthorized: You must be logged in to use this feature.' });
        }
        if (checkRateLimit(session.user.id).limited) {
            return res.status(429).json({ error: 'Too Many Requests.' });
        }
        if (!url || !/^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+/.test(url)) {
            return res.status(400).json({ error: 'Invalid YouTube URL.' });
        }

        // Use ytdl-core for cross-platform YouTube downloading
        const ytdl = require('ytdl-core');
        
        try {
            // Get video info using ytdl-core
            const info = await ytdl.getInfo(url);
            const videoDetails = info.videoDetails;
            
            // Extract available formats
            const formats = info.formats
                .filter((format: any) => format.url)
                .map((format: any) => ({
                    url: format.url,
                    quality: format.qualityLabel || format.audioBitrate || 'unknown',
                    format: format.container?.toUpperCase() || 'MP4',
                    audio: format.hasAudio,
                    video: format.hasVideo,
                    type: !format.hasVideo ? 'audio' : (!format.hasAudio ? 'video' : 'video+audio')
                }))
                .slice(0, 20); // Limit to 20 options
            
            // Find the best format (with both audio and video)
            const bestFormat = formats.find((f: any) => f.audio && f.video) || formats[0];
            
            // Get thumbnail
            const thumbnail = videoDetails.thumbnails?.find((t: any) => t.width >= 640) || 
                            videoDetails.thumbnails?.[videoDetails.thumbnails.length - 1];

            const response = {
                status: 'success',
                title: videoDetails.title || 'Unknown Title',
                author: videoDetails.author?.name || videoDetails.ownerChannelName || 'Unknown Channel',
                thumbnail: thumbnail?.url || '',
                url: bestFormat?.url || '',
                picker: formats
            };

            res.status(200).json(response);
            
        } catch (ytdlError: any) {
            console.error('ytdl-core error:', ytdlError);
            
            // Handle common ytdl-core errors
            if (ytdlError.message?.includes('Video unavailable') || ytdlError.message?.includes('private')) {
                return res.status(400).json({ 
                    error: 'This video is unavailable, private, or age-restricted.' 
                });
            } else if (ytdlError.message?.includes('copyright')) {
                return res.status(400).json({ 
                    error: 'This video is not available due to copyright restrictions.' 
                });
            } else {
                return res.status(500).json({ 
                    error: 'Failed to process this video. Please try again later.' 
                });
            }
        }

    } catch (error: any) {
        console.error('Error in YouTube Downloader proxy:', error);
        res.status(500).json({ 
            error: 'An error occurred while processing your request. Please try again later.' 
        });
    }
});

// Users API (logic from api/users.ts)
// FIX: Explicitly typing handlers resolves incorrect overload selection for `app.use`.
app.use('/api/users', usersRouter);

// Comments API (logic from api/comments.ts)
// FIX: Explicitly typing handlers resolves incorrect overload selection for `app.use`.
app.use('/api/comments', commentsRouter);

// Test endpoint to trigger autonomous finder manually
app.post('/api/test-autonomous-finder', async (req: express.Request, res: express.Response) => {
    try {
        console.log('🧪 Manual test of autonomous finder triggered...');
        
        // Import the function dynamically to avoid circular imports
        const { processNextBatchForChannel } = await import('./bot/movieManager');
        
        // Mock bot for testing  
        const testBot = {
            sendMessage: (userId: string, message: string) => {
                console.log('📨 [TEST BOT]:', message);
                return Promise.resolve();
            }
        };

        // Test with @itelediconstudio channel
        await processNextBatchForChannel('https://youtube.com/@itelediconstudio', testBot as any);
        
        res.json({ 
            success: true, 
            message: 'Autonomous finder test completed. Check server logs for results.' 
        });
    } catch (error: any) {
        console.error('❌ Autonomous finder test failed:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// Site Configuration API - serves siteConfig.json
app.get('/api/site-config', async (req: express.Request, res: express.Response) => {
    try {
        const config = await storageService.getSiteConfig();
        
        // Set CORS headers
        res.header('Access-Control-Allow-Origin', '*');
        res.header('Access-Control-Allow-Methods', 'GET');
        res.header('Access-Control-Allow-Headers', 'Content-Type');
        
        res.status(200).json(config);
    } catch (error: any) {
        console.error('Error reading site config:', error);
        res.status(500).json({ error: 'Failed to load site configuration' });
    }
});

// Announcement API - serves announcement.json
app.get('/api/announcement', async (req: express.Request, res: express.Response) => {
    try {
        const announcement = await storageService.getAnnouncement();
        
        // Set CORS headers
        res.header('Access-Control-Allow-Origin', '*');
        res.header('Access-Control-Allow-Methods', 'GET');
        res.header('Access-Control-Allow-Headers', 'Content-Type');
        
        res.status(200).json(announcement);
    } catch (error: any) {
        console.error('Error reading announcement:', error);
        res.status(500).json({ error: 'Failed to load announcement' });
    }
});

// Movies API - serves movies.json
app.get('/api/movies', async (req: express.Request, res: express.Response) => {
    try {
        const movies = await storageService.getMovies();
        
        res.header('Access-Control-Allow-Origin', '*');
        res.header('Access-Control-Allow-Methods', 'GET');
        res.header('Access-Control-Allow-Headers', 'Content-Type');
        
        res.status(200).json(movies);
    } catch (error: any) {
        console.error('Error reading movies:', error);
        res.status(500).json({ error: 'Failed to load movies' });
    }
});

// Actors API - serves actors.json
app.get('/api/actors', async (req: express.Request, res: express.Response) => {
    try {
        const actors = await storageService.getActors();
        
        res.header('Access-Control-Allow-Origin', '*');
        res.header('Access-Control-Allow-Methods', 'GET');
        res.header('Access-Control-Allow-Headers', 'Content-Type');
        
        res.status(200).json(actors);
    } catch (error: any) {
        console.error('Error reading actors:', error);
        res.status(500).json({ error: 'Failed to load actors' });
    }
});

// Collections API - serves collections.json
app.get('/api/collections', async (req: express.Request, res: express.Response) => {
    try {
        const collections = await storageService.getCollections();
        
        res.header('Access-Control-Allow-Origin', '*');
        res.header('Access-Control-Allow-Methods', 'GET');
        res.header('Access-Control-Allow-Headers', 'Content-Type');
        
        res.status(200).json(collections);
    } catch (error: any) {
        console.error('Error reading collections:', error);
        res.status(500).json({ error: 'Failed to load collections' });
    }
});

// Health check endpoint for Azure App Service
app.get('/health', async (req: express.Request, res: express.Response) => {
    try {
        // Check storage write access
        const storageCheck = await (storageService as any).checkWriteAccess?.() || { canWrite: true };
        
        const healthStatus = {
            status: storageCheck.canWrite ? 'healthy' : 'unhealthy',
            timestamp: new Date().toISOString(),
            service: 'yoruba-cinemax',
            version: '1.0.0',
            uptime: process.uptime(),
            azure: {
                openai: azureClient ? 'configured' : 'not configured',
                port: PORT
            },
            storage: {
                canWrite: storageCheck.canWrite,
                error: storageCheck.error || undefined
            }
        };
        
        const statusCode = healthStatus.status === 'healthy' ? 200 : 503;
        res.status(statusCode).json(healthStatus);
    } catch (error: any) {
        res.status(500).json({
            status: 'unhealthy',
            timestamp: new Date().toISOString(),
            error: error.message,
            storage: {
                canWrite: false,
                error: 'Health check failed'
            }
        });
    }
});


// --- STATIC FILE SERVING ---
// Use process.cwd() for production compatibility - __dirname points to dist/ in production
app.use(express.static(path.join(process.cwd(), 'public'), {
  setHeaders: (res, path) => {
    // Set Cache-Control headers to prevent caching in Replit iframe
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
  }
}));

// SECURITY: Removed '/data' static serving to prevent exposure of sensitive JSON files
// Data files should be accessed through secure API endpoints only

// Serve the main app for any other route
// @FIX: Use express.Request and express.Response for proper type inference.
app.get('*', (_req: express.Request, res: express.Response) => {
    res.sendFile(path.join(process.cwd(), 'public/index.html'));
});

// --- STARTUP ---
app.listen(PORT, '0.0.0.0', async () => {
    console.log(`✅ Web server listening on port ${PORT}. Accessible on all network interfaces.`);

    // Start the Telegram bot
    try {
        await runBot();
    } catch (error) {
        console.error("❌ Failed to start Telegram bot:", error);
    }
});