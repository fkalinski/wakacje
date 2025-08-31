import { Command } from 'commander';
import { configService } from '../services/config.js';
import chalk from 'chalk';
import inquirer from 'inquirer';

export function registerConfigCommands(program: Command) {
  const config = program
    .command('config')
    .description('Manage CLI configuration');

  // Show configuration
  config
    .command('show')
    .description('Show current configuration')
    .action(async () => {
      try {
        await configService.show();
      } catch (error) {
        console.error(chalk.red('Failed to show configuration:'), error);
        process.exit(1);
      }
    });

  // Set adapter
  config
    .command('set-adapter [adapter]')
    .description('Set the default storage adapter (sqlite or firebase)')
    .action(async (adapter?: string) => {
      try {
        if (adapter && ['sqlite', 'firebase'].includes(adapter)) {
          await configService.setAdapter(adapter as 'sqlite' | 'firebase');
        } else {
          const { selectedAdapter } = await inquirer.prompt([
            {
              type: 'list',
              name: 'selectedAdapter',
              message: 'Select default storage adapter:',
              choices: [
                { name: 'SQLite (Local)', value: 'sqlite' },
                { name: 'Firebase (Remote)', value: 'firebase' },
              ],
            },
          ]);
          
          await configService.setAdapter(selectedAdapter);
        }
      } catch (error) {
        console.error(chalk.red('Failed to set adapter:'), error);
        process.exit(1);
      }
    });

  // Reset configuration
  config
    .command('reset')
    .description('Reset configuration to defaults')
    .action(async () => {
      try {
        const { confirm } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'confirm',
            message: 'Are you sure you want to reset all configuration?',
            default: false,
          },
        ]);

        if (confirm) {
          await configService.reset();
        } else {
          console.log(chalk.gray('Reset cancelled'));
        }
      } catch (error) {
        console.error(chalk.red('Failed to reset configuration:'), error);
        process.exit(1);
      }
    });
}