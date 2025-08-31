import fs from 'fs/promises';
import path from 'path';
import { homedir } from 'os';
import chalk from 'chalk';

export type AdapterType = 'sqlite' | 'firebase';

export interface FirebaseConfig {
  projectId: string;
  authMode: 'oauth2' | 'service-account';
  apiKey?: string;
  authDomain?: string;
  serviceAccountPath?: string;
}

export interface AppConfig {
  adapter: AdapterType;
  firebase?: FirebaseConfig;
  defaultAdapter?: AdapterType;
}

export class ConfigService {
  private configPath: string;
  private config?: AppConfig;

  constructor() {
    const configDir = path.join(homedir(), '.holiday-park-cli');
    this.configPath = path.join(configDir, 'config.json');
  }

  async initialize(): Promise<void> {
    this.config = await this.load();
    
    // Set default config if none exists
    if (!this.config) {
      this.config = {
        adapter: 'sqlite',
        defaultAdapter: 'sqlite',
      };
      await this.save();
    }
  }

  async load(): Promise<AppConfig | undefined> {
    try {
      const data = await fs.readFile(this.configPath, 'utf-8');
      return JSON.parse(data);
    } catch {
      return undefined;
    }
  }

  async save(): Promise<void> {
    if (!this.config) {
      throw new Error('Configuration not initialized');
    }

    const configDir = path.dirname(this.configPath);
    await fs.mkdir(configDir, { recursive: true });
    await fs.writeFile(this.configPath, JSON.stringify(this.config, null, 2));
  }

  get(key?: keyof AppConfig): any {
    if (!this.config) {
      throw new Error('Configuration not initialized. Call initialize() first.');
    }

    if (!key) {
      return this.config;
    }

    return this.config[key];
  }

  async set(key: keyof AppConfig, value: any): Promise<void> {
    if (!this.config) {
      await this.initialize();
    }

    this.config![key] = value;
    await this.save();
  }

  async setAdapter(adapter: AdapterType): Promise<void> {
    await this.set('adapter', adapter);
    console.log(chalk.green(`✓ Default adapter set to: ${adapter}`));
  }

  async setFirebaseConfig(config: FirebaseConfig): Promise<void> {
    await this.set('firebase', config);
    console.log(chalk.green('✓ Firebase configuration saved'));
  }

  getAdapter(): AdapterType {
    return this.get('adapter') || 'sqlite';
  }

  getFirebaseConfig(): FirebaseConfig | undefined {
    return this.get('firebase');
  }

  async reset(): Promise<void> {
    try {
      await fs.unlink(this.configPath);
      this.config = undefined;
      console.log(chalk.green('✓ Configuration reset to defaults'));
    } catch {
      // File doesn't exist, that's fine
    }
  }

  async show(): Promise<void> {
    if (!this.config) {
      await this.initialize();
    }

    console.log(chalk.blue('\nCurrent Configuration:'));
    console.log(chalk.gray('─'.repeat(40)));
    console.log(chalk.white('Default Adapter:'), this.config!.adapter);
    
    if (this.config!.firebase) {
      console.log(chalk.white('\nFirebase Configuration:'));
      console.log(chalk.gray('  Project ID:'), this.config!.firebase.projectId);
      console.log(chalk.gray('  Auth Mode:'), this.config!.firebase.authMode);
      
      if (this.config!.firebase.authMode === 'oauth2') {
        console.log(chalk.gray('  API Key:'), this.config!.firebase.apiKey ? '***' : 'Not set');
        console.log(chalk.gray('  Auth Domain:'), this.config!.firebase.authDomain || 'Not set');
      } else {
        console.log(chalk.gray('  Service Account:'), this.config!.firebase.serviceAccountPath || 'Not set');
      }
    } else {
      console.log(chalk.yellow('\nFirebase not configured'));
    }
    
    console.log(chalk.gray('─'.repeat(40)));
  }
}

export const configService = new ConfigService();