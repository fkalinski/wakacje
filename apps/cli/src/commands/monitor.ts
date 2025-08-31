import { Command } from 'commander';
import { searchExecutor } from '../services/search-executor.js';
import { createStorageService, AdapterType } from '../services/storage.js';
import chalk from 'chalk';

export const monitorCommand = new Command('monitor')
  .description('Run continuous monitoring of saved searches')
  .option('-i, --interval <minutes>', 'Check interval in minutes', '30')
  .option('-o, --once', 'Run all searches once and exit')
  .option('-s, --search <id>', 'Monitor specific search by ID')
  .option('--remote', 'Use remote Firebase storage')
  .option('--local', 'Use local SQLite storage (default)')
  .action(async (options) => {
    try {
      // Determine which adapter to use
      let adapterType: AdapterType | undefined;
      if (options.remote) {
        adapterType = 'firebase';
      } else if (options.local) {
        adapterType = 'sqlite';
      }
      
      // Create storage service with appropriate adapter
      const storageService = await createStorageService(adapterType);

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

      // Define the monitoring cycle function with access to storageService
      const runCycle = async () => {
        const timestamp = new Date().toLocaleString();
        console.log(chalk.blue(`\n[${timestamp}] Running monitoring cycle...`));
        
        try {
          if (options.search) {
            const search = await storageService.getSearch(options.search);
            if (!search) {
              console.error(chalk.red(`Search ${options.search} not found`));
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
            
            console.log(chalk.gray(`Found ${searches.length} enabled searches`));
            
            for (const search of searches) {
              if (shouldRunSearch(search)) {
                await searchExecutor.executeSearch(search);
              } else {
                const nextRun = search.schedule.nextRun;
                console.log(chalk.gray(`Search "${search.name}" scheduled for ${nextRun?.toLocaleString()}`));
              }
            }
          }
        } catch (error) {
          console.error(chalk.red('Error in monitoring cycle:'), error);
        }
      };

      // Run immediately
      await runCycle();

      // Schedule periodic runs
      setInterval(runCycle, intervalMs);

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


function shouldRunSearch(search: any): boolean {
  if (!search.schedule.nextRun) {
    return true; // Never run before
  }

  const now = new Date();
  const nextRun = new Date(search.schedule.nextRun);
  
  return now >= nextRun;
}