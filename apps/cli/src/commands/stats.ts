import { Command } from 'commander';
import chalk from 'chalk';
import Table from 'cli-table3';
import { SQLitePersistenceAdapter, IQueryOptions } from '@holiday-park/shared';
import path from 'path';
import { homedir } from 'os';
import ora from 'ora';

const program = new Command();

program
  .name('stats')
  .description('View statistics for search results')
  .option('-s, --search <id>', 'Get stats for specific search')
  .option('-a, --all', 'Get stats for all searches')
  .option('-f, --from <date>', 'Start date for stats (YYYY-MM-DD)')
  .option('-t, --to <date>', 'End date for stats (YYYY-MM-DD)')
  .option('--format <type>', 'Output format: table, json', 'table')
  .action(async (options) => {
    const spinner = ora('Loading statistics...').start();
    
    try {
      // Initialize persistence adapter
      const configDir = path.join(homedir(), '.holiday-park-cli');
      const dbPath = path.join(configDir, 'searches.db');
      const persistence = new SQLitePersistenceAdapter({ dbPath });
      await persistence.initialize();
      
      // Build query options
      const queryOptions: IQueryOptions = {};
      
      if (options.search && !options.all) {
        queryOptions.searchId = options.search;
      }
      
      if (options.from || options.to) {
        queryOptions.dateRange = {
          from: options.from || '2024-01-01',
          to: options.to || '2025-12-31'
        };
      }
      
      // Get statistics
      const stats = await persistence.getResultsStatistics(queryOptions);
      spinner.succeed('Statistics loaded');
      
      if (options.format === 'json') {
        console.log(JSON.stringify(stats, null, 2));
      } else {
        // Display overview
        console.log(chalk.cyan('\n📊 Overview'));
        console.log(chalk.gray('─'.repeat(50)));
        
        const overviewTable = new Table({
          chars: { 'top': '', 'top-mid': '', 'top-left': '', 'top-right': '',
                   'bottom': '', 'bottom-mid': '', 'bottom-left': '', 'bottom-right': '',
                   'left': '', 'left-mid': '', 'mid': '', 'mid-mid': '',
                   'right': '', 'right-mid': '', 'middle': ' ' },
          style: { 'padding-left': 0, 'padding-right': 2 }
        });
        
        overviewTable.push(
          [chalk.gray('Total Searches:'), chalk.white(stats.totalSearches.toString())],
          [chalk.gray('Total Results:'), chalk.white(stats.totalResults.toString())],
          [chalk.gray('Total Availabilities:'), chalk.white(stats.totalAvailabilities.toString())],
          [chalk.gray('Unique Availabilities:'), chalk.white(stats.uniqueAvailabilities.toString())],
          [chalk.gray('Date Range:'), chalk.white(`${stats.dateRange.earliest || 'N/A'} to ${stats.dateRange.latest || 'N/A'}`)]
        );
        
        console.log(overviewTable.toString());
        
        // Display price statistics
        console.log(chalk.cyan('\n💰 Price Statistics'));
        console.log(chalk.gray('─'.repeat(50)));
        
        const priceTable = new Table({
          chars: { 'top': '', 'top-mid': '', 'top-left': '', 'top-right': '',
                   'bottom': '', 'bottom-mid': '', 'bottom-left': '', 'bottom-right': '',
                   'left': '', 'left-mid': '', 'mid': '', 'mid-mid': '',
                   'right': '', 'right-mid': '', 'middle': ' ' },
          style: { 'padding-left': 0, 'padding-right': 2 }
        });
        
        priceTable.push(
          [chalk.gray('Average Price:'), chalk.green(`€${stats.averagePrice.toFixed(2)}`)],
          [chalk.gray('Median Price:'), chalk.green(`€${stats.medianPrice.toFixed(2)}`)],
          [chalk.gray('Min Price:'), chalk.green(`€${stats.priceRange.min.toFixed(2)}`)],
          [chalk.gray('Max Price:'), chalk.green(`€${stats.priceRange.max.toFixed(2)}`)]
        );
        
        console.log(priceTable.toString());
        
        // Display resort distribution
        if (stats.resortDistribution.length > 0) {
          console.log(chalk.cyan('\n🏖  Resort Distribution'));
          console.log(chalk.gray('─'.repeat(50)));
          
          const resortTable = new Table({
            head: [chalk.cyan('Resort'), chalk.cyan('Count'), chalk.cyan('Percentage')],
            style: { head: [], border: [] }
          });
          
          stats.resortDistribution.forEach(resort => {
            resortTable.push([
              resort.resortName,
              resort.count.toString(),
              `${resort.percentage.toFixed(1)}%`
            ]);
          });
          
          console.log(resortTable.toString());
        }
        
        // Display accommodation type distribution
        if (stats.accommodationDistribution.length > 0) {
          console.log(chalk.cyan('\n🏠 Accommodation Type Distribution'));
          console.log(chalk.gray('─'.repeat(50)));
          
          const accommodationTable = new Table({
            head: [chalk.cyan('Type'), chalk.cyan('Count'), chalk.cyan('Percentage')],
            style: { head: [], border: [] }
          });
          
          stats.accommodationDistribution.forEach(type => {
            accommodationTable.push([
              type.typeName,
              type.count.toString(),
              `${type.percentage.toFixed(1)}%`
            ]);
          });
          
          console.log(accommodationTable.toString());
        }
        
        // Display nights distribution
        if (stats.nightsDistribution.length > 0) {
          console.log(chalk.cyan('\n🌙 Stay Length Distribution'));
          console.log(chalk.gray('─'.repeat(50)));
          
          const nightsTable = new Table({
            head: [chalk.cyan('Nights'), chalk.cyan('Count'), chalk.cyan('Percentage')],
            style: { head: [], border: [] }
          });
          
          stats.nightsDistribution.forEach(nights => {
            nightsTable.push([
              `${nights.nights} nights`,
              nights.count.toString(),
              `${nights.percentage.toFixed(1)}%`
            ]);
          });
          
          console.log(nightsTable.toString());
        }
        
        // Display last updated
        console.log(chalk.gray(`\nLast updated: ${stats.lastUpdated.toLocaleString()}`));
      }
      
      // Show available searches if no specific search selected
      if (!options.search && !options.all) {
        const searches = await persistence.getAllSearches();
        if (searches.length > 0) {
          console.log(chalk.gray('\nTip: Use --search <id> for specific search stats'));
          console.log(chalk.gray('Available searches:'));
          searches.forEach(search => {
            console.log(chalk.gray(`  - ${search.id}: ${search.name}`));
          });
        }
      }
      
      await persistence.close();
    } catch (error) {
      spinner.fail('Failed to load statistics');
      console.error(chalk.red('Error:'), error);
      process.exit(1);
    }
  });

export const statsCommand = program;