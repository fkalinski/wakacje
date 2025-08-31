import { Command } from 'commander';
import { Search, DateRange, RESORT_NAMES, ACCOMMODATION_TYPE_NAMES } from '@holiday-park/shared';
import { searchExecutor } from '../services/search-executor.js';
import { storageService } from '../services/storage.js';
import chalk from 'chalk';
import inquirer from 'inquirer';
import Table from 'cli-table3';

export const searchCommand = new Command('search')
  .description('Execute a vacation search')
  .option('-d, --dates <ranges...>', 'Date ranges in format YYYY-MM-DD:YYYY-MM-DD')
  .option('-s, --stay <lengths...>', 'Stay lengths in days', '7')
  .option('-r, --resorts <ids...>', 'Resort IDs to search')
  .option('-t, --types <ids...>', 'Accommodation type IDs')
  .option('-n, --name <name>', 'Name for the search')
  .option('--save', 'Save this search for future use')
  .option('--interactive', 'Interactive mode to configure search')
  .action(async (options) => {
    try {
      await storageService.initialize();

      let search: Search;

      if (options.interactive) {
        search = await createInteractiveSearch();
      } else {
        search = createSearchFromOptions(options);
      }

      // Validate search
      if (search.dateRanges.length === 0) {
        console.error(chalk.red('Error: At least one date range is required'));
        process.exit(1);
      }

      console.log(chalk.cyan('\n🔍 Search Configuration:'));
      displaySearchConfig(search);

      // Save search if requested
      if (options.save || options.interactive) {
        const saveAnswer = options.save || await inquirer.prompt([{
          type: 'confirm',
          name: 'save',
          message: 'Save this search for future use?',
          default: true
        }]).then(a => a.save);

        if (saveAnswer) {
          search.id = await storageService.saveSearch(search);
          console.log(chalk.green(`✓ Search saved with ID: ${search.id}`));
        }
      }

      // Execute search
      console.log('');
      const result = await searchExecutor.executeSearch(search);

      // Display results summary
      if (result.availabilities.length > 0) {
        console.log(chalk.green(`\n✅ Found ${result.availabilities.length} available options\n`));
        
        // Group by resort and type
        const grouped = groupAvailabilities(result.availabilities);
        displayGroupedResults(grouped);
      } else {
        console.log(chalk.yellow('\n⚠️  No availabilities found for your criteria\n'));
      }

    } catch (error) {
      console.error(chalk.red('Error executing search:'), error);
      process.exit(1);
    }
  });

function createSearchFromOptions(options: any): Search {
  const dateRanges: DateRange[] = [];
  
  if (options.dates) {
    for (const range of options.dates) {
      const [from, to] = range.split(':');
      if (from && to) {
        dateRanges.push({ from, to });
      }
    }
  } else {
    // Default: next 3 months
    const today = new Date();
    const in3Months = new Date();
    in3Months.setMonth(in3Months.getMonth() + 3);
    dateRanges.push({
      from: formatDate(today),
      to: formatDate(in3Months)
    });
  }

  const stayLengths = options.stay ? 
    (Array.isArray(options.stay) ? options.stay : [options.stay]).map(Number) : 
    [7];

  const resorts = options.resorts ? 
    (Array.isArray(options.resorts) ? options.resorts : [options.resorts]).map(Number) : 
    [];

  const types = options.types ? 
    (Array.isArray(options.types) ? options.types : [options.types]).map(Number) : 
    [];

  return {
    name: options.name || `Search ${new Date().toISOString()}`,
    enabled: true,
    dateRanges,
    stayLengths,
    resorts,
    accommodationTypes: types,
    schedule: {
      frequency: 'hourly',
      lastRun: null,
      nextRun: null
    },
    notifications: {
      email: '',
      onlyChanges: true
    }
  };
}

async function createInteractiveSearch(): Promise<Search> {
  console.log(chalk.cyan('\n🔍 Interactive Search Configuration\n'));

  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'name',
      message: 'Search name:',
      default: `Search ${new Date().toLocaleDateString()}`
    },
    {
      type: 'input',
      name: 'dateFrom',
      message: 'Start date (YYYY-MM-DD):',
      default: formatDate(new Date()),
      validate: (input) => /^\d{4}-\d{2}-\d{2}$/.test(input) || 'Invalid date format'
    },
    {
      type: 'input',
      name: 'dateTo',
      message: 'End date (YYYY-MM-DD):',
      default: formatDate(new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)),
      validate: (input) => /^\d{4}-\d{2}-\d{2}$/.test(input) || 'Invalid date format'
    },
    {
      type: 'checkbox',
      name: 'stayLengths',
      message: 'Stay lengths (days):',
      choices: [
        { name: '3 days', value: 3 },
        { name: '4 days', value: 4 },
        { name: '5 days', value: 5 },
        { name: '7 days (week)', value: 7, checked: true },
        { name: '10 days', value: 10 },
        { name: '14 days (2 weeks)', value: 14 }
      ]
    },
    {
      type: 'checkbox',
      name: 'resorts',
      message: 'Select resorts (leave empty for all):',
      choices: Object.entries(RESORT_NAMES).map(([id, name]) => ({
        name: name,
        value: Number(id)
      }))
    },
    {
      type: 'checkbox',
      name: 'types',
      message: 'Select accommodation types (leave empty for all):',
      choices: Object.entries(ACCOMMODATION_TYPE_NAMES).map(([id, name]) => ({
        name: name,
        value: Number(id)
      }))
    },
    {
      type: 'list',
      name: 'frequency',
      message: 'How often to check (for monitoring):',
      choices: [
        { name: 'Every 30 minutes', value: 'every_30_min' },
        { name: 'Every hour', value: 'hourly' },
        { name: 'Every 2 hours', value: 'every_2_hours' },
        { name: 'Every 4 hours', value: 'every_4_hours' },
        { name: 'Daily', value: 'daily' }
      ],
      default: 'hourly'
    }
  ]);

  return {
    name: answers.name,
    enabled: true,
    dateRanges: [{
      from: answers.dateFrom,
      to: answers.dateTo
    }],
    stayLengths: answers.stayLengths.length > 0 ? answers.stayLengths : [7],
    resorts: answers.resorts,
    accommodationTypes: answers.types,
    schedule: {
      frequency: answers.frequency,
      lastRun: null,
      nextRun: null
    },
    notifications: {
      email: '',
      onlyChanges: true
    }
  };
}

function displaySearchConfig(search: Search): void {
  const table = new Table({
    style: { head: ['cyan'] }
  });

  table.push(
    ['Name', search.name],
    ['Date Ranges', search.dateRanges.map((r: any) => `${r.from} to ${r.to}`).join(', ')],
    ['Stay Lengths', search.stayLengths.join(', ') + ' days'],
    ['Resorts', search.resorts.length > 0 ? 
      search.resorts.map((id: any) => RESORT_NAMES[id] || `ID: ${id}`).join(', ') : 
      'All resorts'],
    ['Types', search.accommodationTypes.length > 0 ? 
      search.accommodationTypes.map((id: any) => ACCOMMODATION_TYPE_NAMES[id] || `ID: ${id}`).join(', ') : 
      'All types']
  );

  console.log(table.toString());
}

function groupAvailabilities(availabilities: any[]): Map<string, any[]> {
  const grouped = new Map<string, any[]>();
  
  for (const availability of availabilities) {
    const key = `${availability.resortName} - ${availability.accommodationTypeName}`;
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key)!.push(availability);
  }
  
  return grouped;
}

function displayGroupedResults(grouped: Map<string, any[]>): void {
  for (const [key, availabilities] of grouped) {
    console.log(chalk.bold(`\n${key}:`));
    
    const table = new Table({
      head: ['Check-in', 'Check-out', 'Nights', 'Total', 'Per Night'],
      style: { head: ['cyan'] }
    });
    
    // Sort by date and limit to 5 per group
    availabilities
      .sort((a, b) => a.dateFrom.localeCompare(b.dateFrom))
      .slice(0, 5)
      .forEach(a => {
        table.push([
          new Date(a.dateFrom).toLocaleDateString(),
          new Date(a.dateTo).toLocaleDateString(),
          a.nights.toString(),
          `${a.priceTotal.toFixed(0)} zł`,
          `${a.pricePerNight.toFixed(0)} zł`
        ]);
      });
    
    console.log(table.toString());
    
    if (availabilities.length > 5) {
      console.log(chalk.gray(`  ... and ${availabilities.length - 5} more options`));
    }
  }
}

function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}