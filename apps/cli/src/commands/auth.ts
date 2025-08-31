import { Command } from 'commander';
import { authService } from '../services/auth.js';
import { configService } from '../services/config.js';
import chalk from 'chalk';
import inquirer from 'inquirer';

export function registerAuthCommands(program: Command) {
  const auth = program
    .command('auth')
    .description('Manage authentication for remote Firebase access');

  // Configure Firebase project
  auth
    .command('configure')
    .description('Configure Firebase project settings')
    .action(async () => {
      try {
        await configService.initialize();
        console.log(chalk.blue('\n🔧 Firebase Configuration Setup\n'));
        
        const answers = await inquirer.prompt([
          {
            type: 'input',
            name: 'projectId',
            message: 'Firebase Project ID:',
            validate: (input) => input.length > 0 || 'Project ID is required',
          },
          {
            type: 'list',
            name: 'authMode',
            message: 'Authentication mode:',
            choices: [
              { name: 'OAuth2 (Interactive login)', value: 'oauth2' },
              { name: 'Service Account (CI/CD)', value: 'service-account' },
            ],
          },
        ]);

        let firebaseConfig: any = {
          projectId: answers.projectId,
          authMode: answers.authMode,
        };

        if (answers.authMode === 'oauth2') {
          const oauth2Answers = await inquirer.prompt([
            {
              type: 'input',
              name: 'apiKey',
              message: 'Firebase API Key:',
              validate: (input) => input.length > 0 || 'API Key is required',
            },
            {
              type: 'input',
              name: 'authDomain',
              message: 'Firebase Auth Domain:',
              default: `${answers.projectId}.firebaseapp.com`,
            },
          ]);
          
          firebaseConfig = {
            ...firebaseConfig,
            ...oauth2Answers,
          };

          // Save to auth service config as well
          await authService.configure({
            projectId: answers.projectId,
            apiKey: oauth2Answers.apiKey,
            authDomain: oauth2Answers.authDomain,
          });
        } else {
          const saAnswers = await inquirer.prompt([
            {
              type: 'input',
              name: 'serviceAccountPath',
              message: 'Path to service account JSON file:',
              validate: (input) => input.length > 0 || 'Service account path is required',
            },
          ]);
          
          firebaseConfig.serviceAccountPath = saAnswers.serviceAccountPath;
        }

        await configService.setFirebaseConfig(firebaseConfig);
        
        // Ask if they want to set Firebase as default
        const { setDefault } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'setDefault',
            message: 'Set Firebase as the default adapter?',
            default: false,
          },
        ]);

        if (setDefault) {
          await configService.setAdapter('firebase');
        }

        console.log(chalk.green('\n✓ Firebase configuration saved successfully!'));
        
        if (answers.authMode === 'oauth2') {
          console.log(chalk.gray('\nNext step: Run "hp auth login" to authenticate'));
        }
      } catch (error) {
        console.error(chalk.red('Failed to configure Firebase:'), error);
        process.exit(1);
      }
    });

  // Login command
  auth
    .command('login')
    .description('Login to Firebase using OAuth2')
    .action(async () => {
      try {
        await configService.initialize();
        const firebaseConfig = configService.getFirebaseConfig();
        
        if (!firebaseConfig) {
          console.error(chalk.yellow('Firebase not configured. Please run "hp auth configure" first.'));
          process.exit(1);
        }

        if (firebaseConfig.authMode !== 'oauth2') {
          console.error(chalk.yellow('Login is only available for OAuth2 authentication mode.'));
          console.error(chalk.gray('Current mode: ' + firebaseConfig.authMode));
          process.exit(1);
        }

        await authService.login();
      } catch (error) {
        console.error(chalk.red('Login failed:'), error);
        process.exit(1);
      }
    });

  // Logout command
  auth
    .command('logout')
    .description('Logout from Firebase')
    .action(async () => {
      try {
        await authService.logout();
      } catch (error) {
        console.error(chalk.red('Logout failed:'), error);
        process.exit(1);
      }
    });

  // Status command
  auth
    .command('status')
    .description('Check authentication status')
    .action(async () => {
      try {
        await configService.initialize();
        const status = await authService.getStatus();
        const firebaseConfig = configService.getFirebaseConfig();
        
        console.log(chalk.blue('\n🔐 Authentication Status\n'));
        console.log(chalk.gray('─'.repeat(40)));
        
        if (firebaseConfig) {
          console.log(chalk.white('Firebase Project:'), firebaseConfig.projectId);
          console.log(chalk.white('Auth Mode:'), firebaseConfig.authMode);
          
          if (firebaseConfig.authMode === 'oauth2') {
            if (status.authenticated) {
              console.log(chalk.green('Status: Authenticated'));
              console.log(chalk.white('User:'), status.user?.email || 'Unknown');
              console.log(chalk.white('User ID:'), status.user?.uid || 'Unknown');
            } else {
              console.log(chalk.yellow('Status: Not authenticated'));
              console.log(chalk.gray('Run "hp auth login" to authenticate'));
            }
          } else {
            console.log(chalk.green('Status: Service account configured'));
            console.log(chalk.white('Path:'), firebaseConfig.serviceAccountPath);
          }
        } else {
          console.log(chalk.yellow('Firebase not configured'));
          console.log(chalk.gray('Run "hp auth configure" to set up Firebase'));
        }
        
        console.log(chalk.gray('─'.repeat(40)));
        console.log(chalk.white('\nCurrent Adapter:'), configService.getAdapter());
      } catch (error) {
        console.error(chalk.red('Failed to get status:'), error);
        process.exit(1);
      }
    });
}