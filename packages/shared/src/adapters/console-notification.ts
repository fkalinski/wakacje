import { INotificationAdapter } from '../interfaces/notification';
import { Search, SearchResult, Availability } from '../types';

export interface ConsoleNotificationOptions {
  useSystemNotifications?: boolean;
  useColors?: boolean;
}

export class ConsoleNotificationAdapter implements INotificationAdapter {
  private useSystemNotifications: boolean;

  constructor(options: ConsoleNotificationOptions = {}) {
    this.useSystemNotifications = options.useSystemNotifications ?? false;
  }

  async sendNotification(search: Search, result: SearchResult): Promise<void> {
    const hasNewAvailabilities = result.changes?.new && result.changes.new.length > 0;
    const hasRemovedAvailabilities = result.changes?.removed && result.changes.removed.length > 0;

    // Console notification
    console.log('\n' + '='.repeat(80));
    console.log(`📧 Search Results: ${search.name}`);
    console.log('='.repeat(80));

    console.log(`\n📊 Summary:`);
    console.log(`  Total availabilities: ${result.availabilities.length}`);
    if (hasNewAvailabilities) {
      console.log(`  ✅ New: ${result.changes!.new.length}`);
    }
    if (hasRemovedAvailabilities) {
      console.log(`  ❌ Removed: ${result.changes!.removed.length}`);
    }
    console.log(`  Checked at: ${new Date(result.timestamp).toLocaleString()}`);

    // Display new availabilities
    if (hasNewAvailabilities) {
      console.log('\n✅ New Availabilities:');
      this.displayAvailabilityTable(result.changes!.new.slice(0, 5));
      if (result.changes!.new.length > 5) {
        console.log(`... and ${result.changes!.new.length - 5} more`);
      }
    }

    // Display removed availabilities
    if (hasRemovedAvailabilities) {
      console.log('\n❌ Removed Availabilities:');
      this.displayAvailabilityTable(result.changes!.removed.slice(0, 5));
      if (result.changes!.removed.length > 5) {
        console.log(`... and ${result.changes!.removed.length - 5} more`);
      }
    }

    // Display current availabilities (limited to 10)
    if (result.availabilities.length > 0) {
      console.log('\n📋 Current Availabilities:');
      const displayCount = Math.min(result.availabilities.length, 10);
      this.displayAvailabilityTable(result.availabilities.slice(0, displayCount));
      
      if (result.availabilities.length > displayCount) {
        console.log(`\n... and ${result.availabilities.length - displayCount} more`);
      }
    } else {
      console.log('\n⚠️  No availabilities found matching your criteria');
    }

    console.log('\n' + '='.repeat(80) + '\n');

    // System notification for important changes
    if (this.useSystemNotifications && (hasNewAvailabilities || hasRemovedAvailabilities)) {
      await this.sendSystemNotification(search, result);
    }
  }

  async sendError(search: Search, error: Error): Promise<void> {
    console.error('\n' + '='.repeat(80));
    console.error(`❌ Error executing search: ${search.name}`);
    console.error('='.repeat(80));
    console.error(`Error: ${error.message}`);
    console.error('The search will be retried on the next scheduled run.');
    console.error('='.repeat(80) + '\n');

    if (this.useSystemNotifications) {
      await this.sendSystemNotification(search, null, error);
    }
  }

  private displayAvailabilityTable(availabilities: Availability[]): void {
    if (availabilities.length === 0) return;

    // Simple table format for console
    const headers = ['Resort', 'Type', 'Dates', 'Nights', 'Total Price'];
    const colWidths = [20, 20, 25, 8, 12];

    // Print headers
    console.log('-'.repeat(87));
    console.log(
      headers.map((h, i) => h.padEnd(colWidths[i])).join(' | ')
    );
    console.log('-'.repeat(87));

    // Print rows
    for (const availability of availabilities) {
      const fromDate = new Date(availability.dateFrom).toLocaleDateString();
      const toDate = new Date(availability.dateTo).toLocaleDateString();
      const dates = `${fromDate} - ${toDate}`;
      
      const row = [
        this.truncate(availability.resortName, colWidths[0]),
        this.truncate(availability.accommodationTypeName, colWidths[1]),
        this.truncate(dates, colWidths[2]),
        availability.nights.toString().padEnd(colWidths[3]),
        `${availability.priceTotal.toFixed(0)} zł`.padEnd(colWidths[4])
      ];
      
      console.log(row.join(' | '));
    }
    console.log('-'.repeat(87));
  }

  private truncate(str: string, maxLength: number): string {
    if (str.length <= maxLength) {
      return str.padEnd(maxLength);
    }
    return str.substring(0, maxLength - 3) + '...';
  }

  private async sendSystemNotification(
    search: Search, 
    result: SearchResult | null, 
    error?: Error
  ): Promise<void> {
    // This would require node-notifier or similar package
    // For now, we'll just log that we would send a system notification
    if (error) {
      console.log(`[SYSTEM NOTIFICATION] Error in search "${search.name}": ${error.message}`);
    } else if (result) {
      const newCount = result.changes?.new.length || 0;
      const removedCount = result.changes?.removed.length || 0;
      
      let message = '';
      if (newCount > 0 && removedCount > 0) {
        message = `${newCount} new, ${removedCount} removed`;
      } else if (newCount > 0) {
        message = `${newCount} new availabilities found!`;
      } else if (removedCount > 0) {
        message = `${removedCount} availabilities removed`;
      }
      
      if (message) {
        console.log(`[SYSTEM NOTIFICATION] Holiday Park - ${search.name}: ${message}`);
      }
    }
  }
}