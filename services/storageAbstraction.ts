// Storage abstraction layer for Azure deployment compatibility
import fs from 'fs';
import path from 'path';
import { Movie, Actor } from '../bot/types';

// Interface defining storage operations
export interface IStorageService {
    // Movie operations
    getMovies(): Promise<Movie[]>;
    saveMovies(movies: Movie[]): Promise<void>;
    
    // Actor operations
    getActors(): Promise<Actor[]>;
    saveActors(actors: Actor[]): Promise<void>;
    
    // User and site data operations
    getUserData(): Promise<any>;
    saveUserData(data: any): Promise<void>;
    
    getComments(): Promise<any>;
    saveComments(comments: any): Promise<void>;
    
    getSiteConfig(): Promise<any>;
    saveSiteConfig(config: any): Promise<void>;
    
    getAnnouncement(): Promise<any>;
    saveAnnouncement(announcement: any): Promise<void>;
    
    getCollections(): Promise<any>;
    saveCollections(collections: any): Promise<void>;
    
    // Analytics and logs
    getAnalyticsLog(): Promise<any>;
    saveAnalyticsLog(log: any): Promise<void>;
    
    getViewingHistory(): Promise<any>;
    saveViewingHistory(history: any): Promise<void>;
    
    getWatchlists(): Promise<any>;
    saveWatchlists(watchlists: any): Promise<void>;
    
    // Poster and media file operations
    savePosterStream(stream: NodeJS.ReadableStream, filename: string): Promise<string>;
    savePosterBuffer(buffer: Buffer, filename: string): Promise<string>;
    deletePoster(relativePath: string): Promise<void>;
    resolvePublicPath(relativePath: string): string;
}

// JSON file-based storage implementation (current approach)
export class JsonFileStorage implements IStorageService {
    private basePath: string;
    
    constructor(basePath?: string) {
        // Use Azure App Service compatible path (/home/data) or fallback to local development
        this.basePath = basePath || (process.env.NODE_ENV === 'production' ? '/home' : process.cwd());
    }
    
    private getDataPath(filename: string): string {
        return path.join(this.basePath, 'data', filename);
    }
    
    private getPublicPath(filename: string): string {
        return path.join(this.basePath, 'public', filename);
    }
    
    private async readJsonFile<T>(filename: string, defaultValue: T): Promise<T> {
        try {
            const filePath = this.getDataPath(filename);
            if (!fs.existsSync(filePath)) {
                console.warn(`File ${filename} not found, returning default value`);
                return defaultValue;
            }
            const data = fs.readFileSync(filePath, 'utf-8');
            return JSON.parse(data);
        } catch (error) {
            console.error(`Error reading ${filename}:`, error);
            return defaultValue;
        }
    }
    
    private async writeJsonFile(filename: string, data: any): Promise<void> {
        try {
            const filePath = this.getDataPath(filename);
            const dirPath = path.dirname(filePath);
            
            // Ensure directory exists
            if (!fs.existsSync(dirPath)) {
                fs.mkdirSync(dirPath, { recursive: true });
            }
            
            // Atomic write - write to temp file first, then rename
            const tempPath = `${filePath}.tmp`;
            fs.writeFileSync(tempPath, JSON.stringify(data, null, 2));
            fs.renameSync(tempPath, filePath);
        } catch (error) {
            console.error(`Error writing ${filename}:`, error);
            throw error;
        }
    }
    
    async getMovies(): Promise<Movie[]> {
        return this.readJsonFile<Movie[]>('movies.json', []);
    }
    
    async saveMovies(movies: Movie[]): Promise<void> {
        await this.writeJsonFile('movies.json', movies);
    }
    
    async getActors(): Promise<Actor[]> {
        return this.readJsonFile<Actor[]>('actors.json', []);
    }
    
    async saveActors(actors: Actor[]): Promise<void> {
        await this.writeJsonFile('actors.json', actors);
    }
    
    async getUserData(): Promise<any> {
        return this.readJsonFile('users.json', []);
    }
    
    async saveUserData(data: any): Promise<void> {
        await this.writeJsonFile('users.json', data);
    }
    
    async getComments(): Promise<any> {
        return this.readJsonFile('comments.json', []);
    }
    
    async saveComments(comments: any): Promise<void> {
        await this.writeJsonFile('comments.json', comments);
    }
    
    async getSiteConfig(): Promise<any> {
        return this.readJsonFile('siteConfig.json', {});
    }
    
    async saveSiteConfig(config: any): Promise<void> {
        await this.writeJsonFile('siteConfig.json', config);
    }
    
    async getAnnouncement(): Promise<any> {
        return this.readJsonFile('announcement.json', {});
    }
    
    async saveAnnouncement(announcement: any): Promise<void> {
        await this.writeJsonFile('announcement.json', announcement);
    }
    
    async getCollections(): Promise<any> {
        return this.readJsonFile('collections.json', []);
    }
    
    async saveCollections(collections: any): Promise<void> {
        await this.writeJsonFile('collections.json', collections);
    }
    
    async getAnalyticsLog(): Promise<any> {
        return this.readJsonFile('analyticsLog.json', []);
    }
    
    async saveAnalyticsLog(log: any): Promise<void> {
        await this.writeJsonFile('analyticsLog.json', log);
    }
    
    async getViewingHistory(): Promise<any> {
        return this.readJsonFile('viewingHistory.json', []);
    }
    
    async saveViewingHistory(history: any): Promise<void> {
        await this.writeJsonFile('viewingHistory.json', history);
    }
    
    async getWatchlists(): Promise<any> {
        return this.readJsonFile('watchlists.json', []);
    }
    
    async saveWatchlists(watchlists: any): Promise<void> {
        await this.writeJsonFile('watchlists.json', watchlists);
    }
    
    // Poster and media file operations for bot
    private getPosterPath(filename: string): string {
        return path.join(this.basePath, 'public', 'posters', filename);
    }
    
    async savePosterStream(stream: NodeJS.ReadableStream, filename: string): Promise<string> {
        try {
            const posterPath = this.getPosterPath(filename);
            const dirPath = path.dirname(posterPath);
            
            // Ensure directory exists
            if (!fs.existsSync(dirPath)) {
                fs.mkdirSync(dirPath, { recursive: true });
            }
            
            // Write stream to file
            const writeStream = fs.createWriteStream(posterPath);
            stream.pipe(writeStream);
            
            return new Promise((resolve, reject) => {
                writeStream.on('finish', () => resolve(`/posters/${filename}`));
                writeStream.on('error', reject);
            });
        } catch (error) {
            console.error(`Error saving poster stream ${filename}:`, error);
            throw error;
        }
    }
    
    async savePosterBuffer(buffer: Buffer, filename: string): Promise<string> {
        try {
            const posterPath = this.getPosterPath(filename);
            const dirPath = path.dirname(posterPath);
            
            // Ensure directory exists
            if (!fs.existsSync(dirPath)) {
                fs.mkdirSync(dirPath, { recursive: true });
            }
            
            fs.writeFileSync(posterPath, buffer);
            return `/posters/${filename}`;
        } catch (error) {
            console.error(`Error saving poster buffer ${filename}:`, error);
            throw error;
        }
    }
    
    async deletePoster(relativePath: string): Promise<void> {
        try {
            if (relativePath.startsWith('/posters/')) {
                const fullPath = path.join(this.basePath, 'public', relativePath);
                if (fs.existsSync(fullPath)) {
                    fs.unlinkSync(fullPath);
                }
            }
        } catch (error) {
            console.error(`Error deleting poster ${relativePath}:`, error);
            // Don't throw - poster deletion shouldn't break the app
        }
    }
    
    resolvePublicPath(relativePath: string): string {
        return path.join(this.basePath, 'public', relativePath);
    }
    
    // Storage readiness check for Azure App Service
    async checkWriteAccess(): Promise<{ canWrite: boolean; error?: string }> {
        try {
            const testFile = path.join(this.basePath, 'data', '.writetest');
            const testData = { test: true, timestamp: new Date().toISOString() };
            
            await this.writeJsonFile('.writetest', testData);
            
            // Try to read it back
            const readData = await this.readJsonFile('.writetest', null);
            
            // Clean up
            if (fs.existsSync(testFile)) {
                fs.unlinkSync(testFile);
            }
            
            return { canWrite: readData !== null };
        } catch (error: any) {
            return { canWrite: false, error: error.message };
        }
    }
}

// Azure storage implementation (placeholder for future implementation)
export class AzureStorageService implements IStorageService {
    // This would be implemented with Azure Cosmos DB and Blob Storage
    // when ready to migrate from JSON files
    
    constructor(
        private cosmosEndpoint: string,
        private cosmosKey: string,
        private blobConnectionString: string
    ) {
        // Initialize Azure clients here
    }
    
    async getMovies(): Promise<Movie[]> {
        throw new Error('Azure storage not yet implemented');
    }
    
    async saveMovies(movies: Movie[]): Promise<void> {
        throw new Error('Azure storage not yet implemented');
    }
    
    async getActors(): Promise<Actor[]> {
        throw new Error('Azure storage not yet implemented');
    }
    
    async saveActors(actors: Actor[]): Promise<void> {
        throw new Error('Azure storage not yet implemented');
    }
    
    async getUserData(): Promise<any> {
        throw new Error('Azure storage not yet implemented');
    }
    
    async saveUserData(data: any): Promise<void> {
        throw new Error('Azure storage not yet implemented');
    }
    
    async getComments(): Promise<any> {
        throw new Error('Azure storage not yet implemented');
    }
    
    async saveComments(comments: any): Promise<void> {
        throw new Error('Azure storage not yet implemented');
    }
    
    async getSiteConfig(): Promise<any> {
        throw new Error('Azure storage not yet implemented');
    }
    
    async saveSiteConfig(config: any): Promise<void> {
        throw new Error('Azure storage not yet implemented');
    }
    
    async getAnnouncement(): Promise<any> {
        throw new Error('Azure storage not yet implemented');
    }
    
    async saveAnnouncement(announcement: any): Promise<void> {
        throw new Error('Azure storage not yet implemented');
    }
    
    async getCollections(): Promise<any> {
        throw new Error('Azure storage not yet implemented');
    }
    
    async saveCollections(collections: any): Promise<void> {
        throw new Error('Azure storage not yet implemented');
    }
    
    async getAnalyticsLog(): Promise<any> {
        throw new Error('Azure storage not yet implemented');
    }
    
    async saveAnalyticsLog(log: any): Promise<void> {
        throw new Error('Azure storage not yet implemented');
    }
    
    async getViewingHistory(): Promise<any> {
        throw new Error('Azure storage not yet implemented');
    }
    
    async saveViewingHistory(history: any): Promise<void> {
        throw new Error('Azure storage not yet implemented');
    }
    
    async getWatchlists(): Promise<any> {
        throw new Error('Azure storage not yet implemented');
    }
    
    async saveWatchlists(watchlists: any): Promise<void> {
        throw new Error('Azure storage not yet implemented');
    }
    
    async savePosterStream(stream: NodeJS.ReadableStream, filename: string): Promise<string> {
        throw new Error('Azure storage not yet implemented');
    }
    
    async savePosterBuffer(buffer: Buffer, filename: string): Promise<string> {
        throw new Error('Azure storage not yet implemented');
    }
    
    async deletePoster(relativePath: string): Promise<void> {
        throw new Error('Azure storage not yet implemented');
    }
    
    resolvePublicPath(relativePath: string): string {
        throw new Error('Azure storage not yet implemented');
    }
}

// Storage factory
export class StorageFactory {
    static createStorage(): IStorageService {
        const storageType = process.env.STORAGE_TYPE || 'json';
        
        switch (storageType.toLowerCase()) {
            case 'azure':
                const cosmosEndpoint = process.env.COSMOS_ENDPOINT;
                const cosmosKey = process.env.COSMOS_KEY;
                const blobConnectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
                
                if (!cosmosEndpoint || !cosmosKey || !blobConnectionString) {
                    console.warn('Azure storage credentials missing, falling back to JSON file storage');
                    return new JsonFileStorage();
                }
                
                return new AzureStorageService(cosmosEndpoint, cosmosKey, blobConnectionString);
                
            case 'json':
            default:
                return new JsonFileStorage();
        }
    }
}

// Singleton instance
export const storageService = StorageFactory.createStorage();