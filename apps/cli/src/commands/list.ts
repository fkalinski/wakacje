import { Command } from 'commander';
import { storageService } from '../services/storage.js';
import chalk from 'chalk';
import Table from 'cli-table3';
import inquirer from 'inquirer';

export const listCommand = new Command('list')
  .description('List saved searches and results')
  .option('-r, --results <searchId>', 'Show results for specific search')
  .option('-d, --delete <searchId>', 'Delete a saved search')
  .option('-e, --enable <searchId>', 'Enable a search')
  .option('--disable <searchId>', 'Disable a search')
  .action(async (options) => {
    try {
      await storageService.initialize();

      if (options.delete) {
        await deleteSearch(options.delete);
        return;
      }

      if (options.enable) {
        await toggleSearch(options.enable, true);
        return;
      }

      if (options.disable) {
        await toggleSearch(options.disable, false);
        return;
      }

      if (options.results) {
        await showSearchResults(options.results);
        return;
      }

      // List all searches
      await listAllSearches();

    } catch (error) {
      console.error(chalk.red('Error:'), error);
      process.exit(1);
    }
  });

async function listAllSearches(): Promise<void> {
  const searches = await storageService.getAllSearches();

  if (searches.length === 0) {
    console.log(chalk.yellow('\n⚠️  No saved searches found'));
    console.log(chalk.gray('Run "holiday-park search --interactive" to create one\n'));
    return;
  }

  console.log(chalk.cyan('\n📋 Saved Searches:\n'));

  const table = new Table({
    head: ['ID', 'Name', 'Status', 'Schedule', 'Last Run', 'Next Run'],
    style: { head: ['cyan'] }
  });

  for (const search of searches) {
    const status = search.enabled ? 
      chalk.green('✓ Enabled') : 
      chalk.gray('✗ Disabled');
    
    const lastRun = search.schedule.lastRun ? 
      new Date(search.schedule.lastRun).toLocaleString() : 
      'Never';
    
    const nextRun = search.schedule.nextRun ? 
      new Date(search.schedule.nextRun).toLocaleString() : 
      'Not scheduled';

    table.push([
      search.id || '',
      search.name,
      status,
      search.schedule.frequency,
      lastRun,
      nextRun
    ]);
  }

  console.log(table.toString());
  console.log(chalk.gray(`\nTotal: ${searches.length} searches`));
  console.log(chalk.gray('Use "holiday-park list -r <id>" to see results for a search'));
}

async function showSearchResults(searchId: string): Promise<void> {
  const search = await storageService.getSearch(searchId);
  
  if (!search) {
    console.error(chalk.red(`Search ${searchId} not found`));
    return;
  }

  console.log(chalk.cyan(`\n📊 Results for: ${search.name}\n`));

  // Show search configuration
  const configTable = new Table({
    style: { head: ['cyan'] }
  });

  configTable.push(
    ['Status', search.enabled ? chalk.green('Enabled') : chalk.gray('Disabled')],
    ['Date Ranges', search.dateRanges.map((r: any) => `${r.from} to ${r.to}`).join(', ')],
    ['Stay Lengths', search.stayLengths.join(', ') + ' days'],
    ['Schedule', search.schedule.frequency]
  );

  console.log(configTable.toString());

  // Get recent results
  const results = await storageService.getSearchResults(searchId, 5);

  if (results.length === 0) {
    console.log(chalk.yellow('\n⚠️  No results yet for this search'));
    return;
  }

  console.log(chalk.white(`\n📈 Recent Results (last ${results.length}):\n`));

  const resultsTable = new Table({
    head: ['Date', 'Available', 'New', 'Removed', 'Status'],
    style: { head: ['cyan'] }
  });

  for (const result of results) {
    const date = new Date(result.timestamp).toLocaleString();
    const newCount = result.changes?.new.length || 0;
    const removedCount = result.changes?.removed.length || 0;
    
    let status = '';
    if (result.error) {
      status = chalk.red('Error');
    } else if (newCount > 0) {
      status = chalk.green('New found!');
    } else if (removedCount > 0) {
      status = chalk.yellow('Some removed');
    } else {
      status = chalk.gray('No changes');
    }

    resultsTable.push([
      date,
      result.availabilities.length.toString(),
      newCount > 0 ? chalk.green(`+${newCount}`) : '0',
      removedCount > 0 ? chalk.red(`-${removedCount}`) : '0',
      status
    ]);
  }

  console.log(resultsTable.toString());

  // Show latest availabilities
  const latestResult = results[0];
  if (latestResult && latestResult.availabilities.length > 0) {
    console.log(chalk.white(`\n🏖  Latest Available Options (showing first 5):\n`));

    const availTable = new Table({
      head: ['Resort', 'Type', 'Dates', 'Price'],
      style: { head: ['cyan'] }
    });

    latestResult.availabilities.slice(0, 5).forEach((a: any) => {
      availTable.push([
        a.resortName,
        a.accommodationTypeName,
        `${new Date(a.dateFrom).toLocaleDateString()} - ${new Date(a.dateTo).toLocaleDateString()}`,
        `${a.priceTotal.toFixed(0)} zł`
      ]);
    });

    console.log(availTable.toString());

    if (latestResult.availabilities.length > 5) {
      console.log(chalk.gray(`\n... and ${latestResult.availabilities.length - 5} more options`));
    }
  }
}

async function deleteSearch(searchId: string): Promise<void> {
  const search = await storageService.getSearch(searchId);
  
  if (!search) {
    console.error(chalk.red(`Search ${searchId} not found`));
    return;
  }

  const answer = await inquirer.prompt([{
    type: 'confirm',
    name: 'confirm',
    message: `Are you sure you want to delete "${search.name}"?`,
    default: false
  }]);

  if (answer.confirm) {
    await storageService.deleteSearch(searchId);
    console.log(chalk.green(`✓ Search "${search.name}" deleted`));
  } else {
    console.log(chalk.gray('Deletion cancelled'));
  }
}

async function toggleSearch(searchId: string, enable: boolean): Promise<void> {
  const search = await storageService.getSearch(searchId);
  
  if (!search) {
    console.error(chalk.red(`Search ${searchId} not found`));
    return;
  }

  search.enabled = enable;
  await storageService.saveSearch(search);
  
  const status = enable ? 'enabled' : 'disabled';
  console.log(chalk.green(`✓ Search "${search.name}" ${status}`));
}