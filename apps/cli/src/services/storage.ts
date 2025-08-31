import { 
  SQLitePersistenceAdapter, 
  FirebasePersistenceAdapter,
  IPersistenceAdapter,
  Search, 
  SearchResult 
} from '@holiday-park/shared';
import path from 'path';
import { homedir } from 'os';
import { configService, AdapterType } from './config.js';
import { authService } from './auth.js';
import chalk from 'chalk';

export { AdapterType };

/**
 * Storage service wrapper for the CLI application.
 * Supports both SQLite (local) and Firebase (remote) persistence adapters.
 */
export class StorageService {
  private adapter?: IPersistenceAdapter;
  private adapterType: AdapterType = 'sqlite';

  constructor(adapterType?: AdapterType) {
    if (adapterType) {
      this.adapterType = adapterType;
    }
  }

  async initialize(forceAdapter?: AdapterType): Promise<void> {
    // Initialize config service if not already done
    await configService.initialize();
    
    // Determine which adapter to use
    const adapterType = forceAdapter || this.adapterType || configService.getAdapter();
    this.adapterType = adapterType;
    
    if (adapterType === 'firebase') {
      this.adapter = await this.createFirebaseAdapter();
    } else {
      this.adapter = await this.createSQLiteAdapter();
    }
    
    // Initialize the adapter if it has an initialize method
    if ('initialize' in this.adapter && typeof this.adapter.initialize === 'function') {
      await this.adapter.initialize();
    }
    
    console.log(chalk.gray(`Using ${adapterType} adapter`));
  }
  
  private async createSQLiteAdapter(): Promise<IPersistenceAdapter> {
    const configDir = path.join(homedir(), '.holiday-park-cli');
    const dbPath = path.join(configDir, 'searches.db');
    return new SQLitePersistenceAdapter({ dbPath });
  }
  
  private async createFirebaseAdapter(): Promise<IPersistenceAdapter> {
    const firebaseConfig = configService.getFirebaseConfig();
    
    if (!firebaseConfig) {
      throw new Error('Firebase configuration not found. Please run "hp auth configure" first.');
    }
    
    if (firebaseConfig.authMode === 'oauth2') {
      // Get OAuth2 tokens
      const tokens = await authService.getTokens();
      
      if (!tokens) {
        throw new Error('Not authenticated. Please run "hp auth login" first.');
      }
      
      return new FirebasePersistenceAdapter({
        authMode: 'oauth2',
        oauth2: {
          projectId: firebaseConfig.projectId,
          apiKey: firebaseConfig.apiKey!,
          authDomain: firebaseConfig.authDomain!,
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
        },
      });
    } else {
      // Service account mode
      if (!firebaseConfig.serviceAccountPath) {
        throw new Error('Service account path not configured.');
      }
      
      // Load service account credentials from file
      const fs = await import('fs/promises');
      const serviceAccountData = await fs.readFile(firebaseConfig.serviceAccountPath, 'utf-8');
      const serviceAccount = JSON.parse(serviceAccountData);
      
      return new FirebasePersistenceAdapter({
        authMode: 'service-account',
        serviceAccount: {
          projectId: serviceAccount.project_id,
          privateKey: serviceAccount.private_key,
          clientEmail: serviceAccount.client_email,
        },
      });
    }
  }
  
  getAdapterType(): AdapterType {
    return this.adapterType;
  }
  
  isRemote(): boolean {
    return this.adapterType === 'firebase';
  }

  async saveSearch(search: Search): Promise<string> {
    if (!this.adapter) {
      throw new Error('Storage service not initialized. Call initialize() first.');
    }
    
    // Remove properties that will be set by the adapter
    const searchToSave = { ...search };
    delete searchToSave.id;
    delete searchToSave.createdAt;
    delete searchToSave.updatedAt;
    
    return await this.adapter.createSearch(searchToSave);
  }

  async getSearch(id: string): Promise<Search | null> {
    if (!this.adapter) {
      throw new Error('Storage service not initialized. Call initialize() first.');
    }
    return await this.adapter.getSearch(id);
  }

  async getAllSearches(): Promise<Search[]> {
    if (!this.adapter) {
      throw new Error('Storage service not initialized. Call initialize() first.');
    }
    return await this.adapter.getAllSearches();
  }

  async getEnabledSearches(): Promise<Search[]> {
    if (!this.adapter) {
      throw new Error('Storage service not initialized. Call initialize() first.');
    }
    return await this.adapter.getAllSearches(true);
  }

  async updateSearch(searchId: string, updates: Partial<Search>): Promise<void> {
    if (!this.adapter) {
      throw new Error('Storage service not initialized. Call initialize() first.');
    }
    await this.adapter.updateSearch(searchId, updates);
  }

  async deleteSearch(id: string): Promise<void> {
    if (!this.adapter) {
      throw new Error('Storage service not initialized. Call initialize() first.');
    }
    await this.adapter.deleteSearch(id);
  }

  async saveSearchResult(result: SearchResult): Promise<string> {
    if (!this.adapter) {
      throw new Error('Storage service not initialized. Call initialize() first.');
    }
    return await this.adapter.saveSearchResult(result);
  }

  async getLatestSearchResult(searchId: string): Promise<SearchResult | null> {
    if (!this.adapter) {
      throw new Error('Storage service not initialized. Call initialize() first.');
    }
    return await this.adapter.getLatestSearchResult(searchId);
  }

  async getSearchResults(searchId: string, limit: number = 10): Promise<SearchResult[]> {
    if (!this.adapter) {
      throw new Error('Storage service not initialized. Call initialize() first.');
    }
    return await this.adapter.getSearchResults(searchId, limit);
  }

  async updateSearchSchedule(searchId: string, lastRun: Date, nextRun: Date): Promise<void> {
    if (!this.adapter) {
      throw new Error('Storage service not initialized. Call initialize() first.');
    }
    await this.adapter.updateSearchSchedule(searchId, lastRun, nextRun);
  }

  async close(): Promise<void> {
    if (this.adapter && 'close' in this.adapter && typeof this.adapter.close === 'function') {
      await this.adapter.close();
    }
  }
}

// Create a default storage service instance with SQLite adapter
export const storageService = new StorageService();

// Factory function to create storage service with specific adapter
export async function createStorageService(adapterType?: AdapterType): Promise<StorageService> {
  const service = new StorageService(adapterType);
  await service.initialize();
  return service;
}