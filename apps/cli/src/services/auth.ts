import { initializeApp, FirebaseApp } from 'firebase/app';
import { 
  getAuth, 
  Auth,
  signOut
} from 'firebase/auth';
import open from 'open';
import http from 'http';
import { URL } from 'url';
import fs from 'fs/promises';
import path from 'path';
import { homedir } from 'os';
import chalk from 'chalk';
import ora from 'ora';

export interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  user?: {
    uid: string;
    email: string;
    displayName?: string;
  };
}

export class AuthService {
  private app?: FirebaseApp;
  private auth?: Auth;
  private config?: FirebaseConfig;
  private tokenPath: string;
  private configPath: string;

  constructor() {
    const configDir = path.join(homedir(), '.holiday-park-cli');
    this.tokenPath = path.join(configDir, 'auth.json');
    this.configPath = path.join(configDir, 'firebase-config.json');
  }

  async initialize(config?: FirebaseConfig): Promise<void> {
    if (config) {
      this.config = config;
      await this.saveConfig(config);
    } else {
      this.config = await this.loadConfig();
    }

    if (!this.config) {
      throw new Error('Firebase configuration not found. Please run "hp auth configure" first.');
    }

    this.app = initializeApp(this.config);
    this.auth = getAuth(this.app);
  }

  private async saveConfig(config: FirebaseConfig): Promise<void> {
    const configDir = path.dirname(this.configPath);
    await fs.mkdir(configDir, { recursive: true });
    await fs.writeFile(this.configPath, JSON.stringify(config, null, 2));
  }

  private async loadConfig(): Promise<FirebaseConfig | undefined> {
    try {
      const data = await fs.readFile(this.configPath, 'utf-8');
      return JSON.parse(data);
    } catch {
      return undefined;
    }
  }

  async login(): Promise<AuthTokens> {
    const spinner = ora('Starting authentication flow...').start();
    
    try {
      if (!this.auth) {
        await this.initialize();
      }

      const tokens = await this.performOAuth2Flow();
      await this.saveTokens(tokens);
      
      spinner.succeed(chalk.green('Authentication successful!'));
      console.log(chalk.gray(`Logged in as: ${tokens.user?.email}`));
      
      return tokens;
    } catch (error) {
      spinner.fail(chalk.red('Authentication failed'));
      throw error;
    }
  }

  private async performOAuth2Flow(): Promise<AuthTokens> {
    return new Promise((resolve, reject) => {
      const port = 8585;
      const redirectUri = `http://localhost:${port}/callback`;
      
      // Create a local server to handle the OAuth callback
      const server = http.createServer(async (req, res) => {
        const url = new URL(req.url!, `http://localhost:${port}`);
        
        if (url.pathname === '/callback') {
          const code = url.searchParams.get('code');
          
          if (code) {
            try {
              // Exchange code for tokens
              const tokens = await this.exchangeCodeForTokens(code, redirectUri);
              
              res.writeHead(200, { 'Content-Type': 'text/html' });
              res.end(`
                <html>
                  <body style="font-family: system-ui, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0;">
                    <div style="text-align: center;">
                      <h2 style="color: #22c55e;">✓ Authentication Successful!</h2>
                      <p>You can close this window and return to the terminal.</p>
                    </div>
                  </body>
                </html>
              `);
              
              server.close();
              resolve(tokens);
            } catch (error) {
              res.writeHead(500, { 'Content-Type': 'text/html' });
              res.end(`
                <html>
                  <body style="font-family: system-ui, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0;">
                    <div style="text-align: center;">
                      <h2 style="color: #ef4444;">✗ Authentication Failed</h2>
                      <p>Please try again.</p>
                    </div>
                  </body>
                </html>
              `);
              
              server.close();
              reject(error);
            }
          } else {
            res.writeHead(400);
            res.end('Missing authorization code');
            server.close();
            reject(new Error('Missing authorization code'));
          }
        } else {
          res.writeHead(404);
          res.end('Not found');
        }
      });

      server.listen(port, async () => {
        // Generate OAuth URL
        const authUrl = this.generateAuthUrl(redirectUri);
        
        console.log(chalk.blue('\nOpening browser for authentication...'));
        console.log(chalk.gray(`If the browser doesn't open, visit: ${authUrl}`));
        
        // Open browser
        await open(authUrl);
      });

      // Timeout after 5 minutes
      setTimeout(() => {
        server.close();
        reject(new Error('Authentication timeout'));
      }, 5 * 60 * 1000);
    });
  }

  private generateAuthUrl(redirectUri: string): string {
    if (!this.config) {
      throw new Error('Firebase config not initialized');
    }

    const params = new URLSearchParams({
      client_id: `${this.config.projectId}.apps.googleusercontent.com`,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid email profile https://www.googleapis.com/auth/datastore',
      access_type: 'offline',
      prompt: 'consent'
    });

    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  private async exchangeCodeForTokens(code: string, redirectUri: string): Promise<AuthTokens> {
    if (!this.config) {
      throw new Error('Firebase config not initialized');
    }

    // Exchange authorization code for tokens using Google OAuth2 token endpoint
    const tokenUrl = 'https://oauth2.googleapis.com/token';
    
    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        code,
        client_id: `${this.config.projectId}.apps.googleusercontent.com`,
        client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to exchange code for tokens: ${error}`);
    }

    const data = await response.json() as any;
    
    // Decode the ID token to get user info
    const idToken = data.id_token;
    const payload = JSON.parse(Buffer.from(idToken.split('.')[1], 'base64').toString());
    
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: Date.now() + (data.expires_in * 1000),
      user: {
        uid: payload.sub,
        email: payload.email,
        displayName: payload.name,
      },
    };
  }

  async logout(): Promise<void> {
    try {
      if (this.auth) {
        await signOut(this.auth);
      }
      
      await fs.unlink(this.tokenPath).catch(() => {});
      console.log(chalk.green('✓ Logged out successfully'));
    } catch (error) {
      console.error(chalk.red('Failed to logout:'), error);
      throw error;
    }
  }

  async getTokens(): Promise<AuthTokens | null> {
    try {
      const data = await fs.readFile(this.tokenPath, 'utf-8');
      const tokens = JSON.parse(data) as AuthTokens;
      
      // Check if token is expired
      if (tokens.expiresAt && tokens.expiresAt < Date.now()) {
        // Try to refresh the token
        if (tokens.refreshToken) {
          return await this.refreshTokens(tokens.refreshToken);
        }
        return null;
      }
      
      return tokens;
    } catch {
      return null;
    }
  }

  private async refreshTokens(refreshToken: string): Promise<AuthTokens> {
    if (!this.config) {
      throw new Error('Firebase config not initialized');
    }

    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id: `${this.config.projectId}.apps.googleusercontent.com`,
        client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
        grant_type: 'refresh_token',
      }),
    });

    if (!response.ok) {
      throw new Error('Failed to refresh tokens');
    }

    const data = await response.json() as any;
    
    // Load existing tokens to preserve user info
    const existingTokens = await this.getTokens();
    
    const tokens: AuthTokens = {
      accessToken: data.access_token,
      refreshToken: refreshToken, // Keep the refresh token
      expiresAt: Date.now() + (data.expires_in * 1000),
      user: existingTokens?.user,
    };
    
    await this.saveTokens(tokens);
    return tokens;
  }

  private async saveTokens(tokens: AuthTokens): Promise<void> {
    const configDir = path.dirname(this.tokenPath);
    await fs.mkdir(configDir, { recursive: true });
    await fs.writeFile(this.tokenPath, JSON.stringify(tokens, null, 2));
  }

  async getStatus(): Promise<{ authenticated: boolean; user?: any }> {
    const tokens = await this.getTokens();
    
    if (!tokens) {
      return { authenticated: false };
    }
    
    return {
      authenticated: true,
      user: tokens.user,
    };
  }

  async configure(config: FirebaseConfig): Promise<void> {
    await this.saveConfig(config);
    console.log(chalk.green('✓ Firebase configuration saved'));
  }
}

export const authService = new AuthService();