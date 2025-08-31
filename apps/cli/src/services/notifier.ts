import { Search, SearchResult, Availability } from '@holiday-park/shared';
import notifier from 'node-notifier';
import chalk from 'chalk';
import Table from 'cli-table3';

export class NotificationService {
  async sendNotification(search: Search, result: SearchResult): Promise<void> {
    const hasChanges = result.changes && 
                      (result.changes.new.length > 0 || result.changes.removed.length > 0);

    // Console notification
    this.displayConsoleNotification(search, result);

    // System notification for important changes
    if (hasChanges) {
      const newCount = result.changes?.new.length || 0;
      const removedCount = result.changes?.removed.length || 0;
      
      let message = '';
      if (newCount > 0 && removedCount > 0) {
        message = `${newCount} new, ${removedCount} removed`;
      } else if (newCount > 0) {
        message = `${newCount} new availabilities found!`;
      } else {
        message = `${removedCount} availabilities removed`;
      }

      notifier.notify({
        title: `Holiday Park - ${search.name}`,
        message: message,
        sound: newCount > 0,
        wait: false
      });
    }
  }

  private displayConsoleNotification(search: Search, result: SearchResult): void {
    const hasNewAvailabilities = result.changes?.new && result.changes.new.length > 0;
    const hasRemovedAvailabilities = result.changes?.removed && result.changes.removed.length > 0;

    console.log(chalk.cyan('\n' + '='.repeat(80)));
    console.log(chalk.cyan.bold(`📧 Search Results: ${search.name}`));
    console.log(chalk.cyan('='.repeat(80)));

    console.log(chalk.white(`\n📊 Summary:`));
    console.log(`  Total availabilities: ${chalk.yellow(result.availabilities.length)}`);
    if (hasNewAvailabilities) {
      console.log(`  ✅ New: ${chalk.green(result.changes!.new.length)}`);
    }
    if (hasRemovedAvailabilities) {
      console.log(`  ❌ Removed: ${chalk.red(result.changes!.removed.length)}`);
    }
    console.log(`  Checked at: ${chalk.gray(new Date(result.timestamp).toLocaleString())}`);

    // Display new availabilities
    if (hasNewAvailabilities) {
      console.log(chalk.green.bold('\n✅ New Availabilities:'));
      this.displayAvailabilityTable(result.changes!.new, 'green');
    }

    // Display removed availabilities
    if (hasRemovedAvailabilities) {
      console.log(chalk.red.bold('\n❌ Removed Availabilities:'));
      this.displayAvailabilityTable(result.changes!.removed, 'red');
    }

    // Display current availabilities (limited to 10)
    if (result.availabilities.length > 0) {
      console.log(chalk.white.bold('\n📋 Current Availabilities:'));
      const displayCount = Math.min(result.availabilities.length, 10);
      this.displayAvailabilityTable(result.availabilities.slice(0, displayCount));
      
      if (result.availabilities.length > displayCount) {
        console.log(chalk.gray(`\n... and ${result.availabilities.length - displayCount} more`));
      }
    } else {
      console.log(chalk.yellow('\n⚠️  No availabilities found matching your criteria'));
    }

    console.log(chalk.cyan('\n' + '='.repeat(80) + '\n'));
  }

  private displayAvailabilityTable(availabilities: Availability[], color?: string): void {
    const table = new Table({
      head: ['Resort', 'Type', 'Dates', 'Nights', 'Total Price', 'Per Night'],
      style: {
        head: color ? [color] : ['cyan']
      }
    });

    for (const availability of availabilities) {
      const fromDate = new Date(availability.dateFrom).toLocaleDateString();
      const toDate = new Date(availability.dateTo).toLocaleDateString();
      
      table.push([
        availability.resortName,
        availability.accommodationTypeName,
        `${fromDate} - ${toDate}`,
        availability.nights.toString(),
        `${availability.priceTotal.toFixed(2)} zł`,
        `${availability.pricePerNight.toFixed(2)} zł`
      ]);
    }

    console.log(table.toString());
  }
}

export const notificationService = new NotificationService();