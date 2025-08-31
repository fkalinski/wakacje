import { Command } from 'commander';
import chalk from 'chalk';
import Table from 'cli-table3';
import { SQLitePersistenceAdapter, IQueryOptions } from '@holiday-park/shared';
import path from 'path';
import { homedir } from 'os';
import fs from 'fs/promises';
import ora from 'ora';

const program = new Command();

program
  .name('history')
  .description('Browse and filter historical search results')
  .option('-s, --search <id>', 'Filter by search ID')
  .option('-r, --resort <ids>', 'Filter by resort IDs (comma-separated)')
  .option('-a, --accommodation <ids>', 'Filter by accommodation type IDs (comma-separated)')
  .option('-f, --from <date>', 'Start date (YYYY-MM-DD)')
  .option('-t, --to <date>', 'End date (YYYY-MM-DD)')
  .option('--min-price <amount>', 'Minimum price', parseFloat)
  .option('--max-price <amount>', 'Maximum price', parseFloat)
  .option('-n, --nights <lengths>', 'Stay lengths (comma-separated)')
  .option('--sort <field>', 'Sort by: price, date, resort, nights', 'date')
  .option('--order <direction>', 'Sort order: asc, desc', 'asc')
  .option('-l, --limit <number>', 'Number of results to show', parseInt, 50)
  .option('--offset <number>', 'Number of results to skip', parseInt, 0)
  .option('--format <type>', 'Output format: table, json, csv', 'table')
  .option('--export <file>', 'Export results to file')
  .option('--only-new', 'Show only new availabilities')
  .option('--include-removed', 'Include removed availabilities')
  .action(async (options) => {
    const spinner = ora('Loading search history...').start();
    
    try {
      // Initialize persistence adapter
      const configDir = path.join(homedir(), '.holiday-park-cli');
      const dbPath = path.join(configDir, 'searches.db');
      const persistence = new SQLitePersistenceAdapter({ dbPath });
      await persistence.initialize();
      
      // Build query options
      const queryOptions: IQueryOptions = {
        searchId: options.search,
        sortBy: options.sort as any,
        sortOrder: options.order as 'asc' | 'desc',
        limit: options.limit,
        offset: options.offset,
        onlyNew: options.onlyNew,
        includeRemoved: options.includeRemoved
      };
      
      // Parse resort IDs
      if (options.resort) {
        queryOptions.resorts = options.resort.split(',').map((id: string) => parseInt(id.trim()));
      }
      
      // Parse accommodation type IDs
      if (options.accommodation) {
        queryOptions.accommodationTypes = options.accommodation.split(',').map((id: string) => parseInt(id.trim()));
      }
      
      // Parse date range
      if (options.from || options.to) {
        queryOptions.dateRange = {
          from: options.from || '2024-01-01',
          to: options.to || '2025-12-31'
        };
      }
      
      // Parse price range
      if (options.minPrice !== undefined || options.maxPrice !== undefined) {
        queryOptions.priceRange = {
          min: options.minPrice,
          max: options.maxPrice
        };
      }
      
      // Parse stay lengths
      if (options.nights) {
        queryOptions.stayLengths = options.nights.split(',').map((n: string) => parseInt(n.trim()));
      }
      
      spinner.text = 'Querying availabilities...';
      const results = await persistence.queryAvailabilities(queryOptions);
      
      spinner.succeed(`Found ${results.total} availabilities (showing ${results.data.length})`);
      
      // Handle export
      if (options.export) {
        spinner.start('Exporting results...');
        const format = options.export.endsWith('.json') ? 'json' : 'csv';
        const exportData = await persistence.exportResults(format, queryOptions);
        await fs.writeFile(options.export, exportData, 'utf-8');
        spinner.succeed(`Exported to ${options.export}`);
      }
      
      // Display results based on format
      if (options.format === 'json') {
        console.log(JSON.stringify(results.data, null, 2));
      } else if (options.format === 'csv') {
        const csvData = await persistence.exportResults('csv', queryOptions);
        console.log(csvData);
      } else {
        // Table format
        if (results.data.length === 0) {
          console.log(chalk.yellow('\nNo availabilities found matching your criteria.'));
        } else {
          const table = new Table({
            head: [
              chalk.cyan('Resort'),
              chalk.cyan('Type'),
              chalk.cyan('Check-in'),
              chalk.cyan('Check-out'),
              chalk.cyan('Nights'),
              chalk.cyan('Total Price'),
              chalk.cyan('Per Night')
            ],
            style: {
              head: [],
              border: []
            }
          });
          
          results.data.forEach(availability => {
            table.push([
              availability.resortName,
              availability.accommodationTypeName,
              availability.dateFrom,
              availability.dateTo,
              availability.nights.toString(),
              chalk.green(`€${availability.priceTotal.toFixed(2)}`),
              chalk.gray(`€${availability.pricePerNight.toFixed(2)}`)
            ]);
          });
          
          console.log('\n' + table.toString());
          
          // Pagination info
          if (results.total > results.limit) {
            console.log(chalk.gray(`\nShowing ${results.offset + 1}-${Math.min(results.offset + results.limit, results.total)} of ${results.total} results`));
            
            if (results.hasNext) {
              console.log(chalk.gray(`Use --offset ${results.offset + results.limit} to see next page`));
            }
            if (results.hasPrevious) {
              console.log(chalk.gray(`Use --offset ${Math.max(0, results.offset - results.limit)} to see previous page`));
            }
          }
        }
      }
      
      // Show available filters
      if (!options.search) {
        console.log(chalk.gray('\nTip: Use --search <id> to filter by a specific search'));
        const searches = await persistence.getAllSearches();
        if (searches.length > 0) {
          console.log(chalk.gray('Available searches:'));
          searches.forEach(search => {
            console.log(chalk.gray(`  - ${search.id}: ${search.name}`));
          });
        }
      }
      
      await persistence.close();
    } catch (error) {
      spinner.fail('Failed to query history');
      console.error(chalk.red('Error:'), error);
      process.exit(1);
    }
  });

export const historyCommand = program;