import { Command } from 'commander';
import { searchExecutor } from '../services/search-executor.js';
import { storageService } from '../services/storage.js';
import chalk from 'chalk';

export const monitorCommand = new Command('monitor')
  .description('Run continuous monitoring of saved searches')
  .option('-i, --interval <minutes>', 'Check interval in minutes', '30')
  .option('-o, --once', 'Run all searches once and exit')
  .option('-s, --search <id>', 'Monitor specific search by ID')
  .action(async (options) => {
    try {
      await storageService.initialize();

      if (options.once) {
        // Run once and exit
        console.log(chalk.cyan('\n🔄 Running all enabled searches once...\n'));
        
        if (options.search) {
          const search = await storageService.getSearch(options.search);
          if (!search) {
            console.error(chalk.red(`Search ${options.search} not found`));
            process.exit(1);
          }
          await searchExecutor.executeSearch(search);
        } else {
          await searchExecutor.executeAllEnabledSearches();
        }
        
        console.log(chalk.green('\n✅ All searches completed\n'));
        process.exit(0);
      }

      // Continuous monitoring
      const intervalMinutes = parseInt(options.interval) || 30;
      const intervalMs = intervalMinutes * 60 * 1000;

      console.log(chalk.cyan(`\n🔄 Starting continuous monitoring`));
      console.log(chalk.gray(`Check interval: ${intervalMinutes} minutes`));
      console.log(chalk.gray(`Press Ctrl+C to stop\n`));

      // Run immediately
      await runMonitoringCycle(options.search);

      // Schedule periodic runs
      setInterval(async () => {
        await runMonitoringCycle(options.search);
      }, intervalMs);

      // Keep process alive
      process.on('SIGINT', () => {
        console.log(chalk.yellow('\n\n👋 Monitoring stopped'));
        process.exit(0);
      });

    } catch (error) {
      console.error(chalk.red('Error in monitoring:'), error);
      process.exit(1);
    }
  });

async function runMonitoringCycle(searchId?: string): Promise<void> {
  const timestamp = new Date().toLocaleString();
  console.log(chalk.gray(`\n[${timestamp}] Starting monitoring cycle...`));

  try {
    if (searchId) {
      const search = await storageService.getSearch(searchId);
      if (!search) {
        console.error(chalk.red(`Search ${searchId} not found`));
        return;
      }
      
      // Check if it's time to run based on schedule
      if (shouldRunSearch(search)) {
        await searchExecutor.executeSearch(search);
      } else {
        const nextRun = search.schedule.nextRun;
        console.log(chalk.gray(`Search "${search.name}" scheduled for ${nextRun?.toLocaleString()}`));
      }
    } else {
      // Get all enabled searches
      const searches = await storageService.getEnabledSearches();
      
      if (searches.length === 0) {
        console.log(chalk.yellow('No enabled searches found'));
        return;
      }

      console.log(chalk.cyan(`Found ${searches.length} enabled searches`));

      for (const search of searches) {
        if (!search.id) continue;
        
        // Check if it's time to run based on schedule
        if (shouldRunSearch(search)) {
          try {
            console.log(chalk.blue(`\n▶ Running: ${search.name}`));
            await searchExecutor.executeSearch(search, false);
          } catch (error) {
            console.error(chalk.red(`Failed to execute search ${search.name}:`), error);
          }
        } else {
          const nextRun = search.schedule.nextRun;
          console.log(chalk.gray(`⏭  Skipping "${search.name}" - next run: ${nextRun?.toLocaleString()}`));
        }
      }
    }

    console.log(chalk.green(`\n✓ Monitoring cycle completed`));
  } catch (error) {
    console.error(chalk.red('Error in monitoring cycle:'), error);
  }
}

function shouldRunSearch(search: any): boolean {
  if (!search.schedule.nextRun) {
    return true; // Never run before
  }

  const now = new Date();
  const nextRun = new Date(search.schedule.nextRun);
  
  return now >= nextRun;
}