#!/usr/bin/env node

import { Command } from 'commander';
import { searchCommand } from './commands/search.js';
import { monitorCommand } from './commands/monitor.js';
import { listCommand } from './commands/list.js';
import chalk from 'chalk';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const envPath = join(__dirname, '..', '.env');

if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

const program = new Command();

program
  .name('holiday-park')
  .description('CLI tool for searching and monitoring Holiday Park vacation availabilities')
  .version('1.0.0');

// ASCII Art Banner
console.log(chalk.cyan(`
╔═══════════════════════════════════════╗
║     🏖  Holiday Park CLI Monitor 🏖     ║
╚═══════════════════════════════════════╝
`));

// Add commands
program.addCommand(searchCommand);
program.addCommand(monitorCommand);
program.addCommand(listCommand);

// Add quick examples
program.on('--help', () => {
  console.log('');
  console.log('Examples:');
  console.log('');
  console.log('  # Interactive search');
  console.log('  $ holiday-park search --interactive');
  console.log('');
  console.log('  # Quick search for next 3 months');
  console.log('  $ holiday-park search -d 2024-01-01:2024-03-31 -s 7');
  console.log('');
  console.log('  # List all saved searches');
  console.log('  $ holiday-park list');
  console.log('');
  console.log('  # Run monitoring once');
  console.log('  $ holiday-park monitor --once');
  console.log('');
  console.log('  # Continuous monitoring every 30 minutes');
  console.log('  $ holiday-park monitor -i 30');
});

// Parse command line arguments
program.parse(process.argv);

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
}