import { Search, Availability, SearchResult } from '@holiday-park/shared';
import { HolidayParkClient } from './holiday-park-client.js';
import { storageService } from './storage.js';
import { notificationService } from './notifier.js';
import chalk from 'chalk';
import ora from 'ora';

export class SearchExecutor {
  private holidayParkClient: HolidayParkClient;
  private requestDelay: number = 2000; // Base delay between requests
  private lastRequestTime: number = 0;

  constructor() {
    this.holidayParkClient = new HolidayParkClient();
  }

  async executeSearch(search: Search, showProgress: boolean = true): Promise<SearchResult> {
    const spinner = showProgress ? ora(`Executing search: ${search.name}`).start() : null;
    
    try {
      const allAvailabilities: Availability[] = [];
      let totalChecks = 0;
      let completedChecks = 0;

      // Calculate total number of checks
      for (const dateRange of search.dateRanges) {
        for (const stayLength of search.stayLengths) {
          const possibleDates = this.generatePossibleDates(
            dateRange.from,
            dateRange.to,
            stayLength
          );
          totalChecks += possibleDates.length;
        }
      }

      if (spinner) {
        spinner.text = `Executing search: ${search.name} (0/${totalChecks} checks)`;
      }

      // Execute searches for each combination
      for (const dateRange of search.dateRanges) {
        for (const stayLength of search.stayLengths) {
          const possibleDates = this.generatePossibleDates(
            dateRange.from,
            dateRange.to,
            stayLength
          );

          for (const { checkIn, checkOut } of possibleDates) {
            try {
              // Apply rate limiting
              await this.applyRateLimit();
              
              const availabilities = await this.holidayParkClient.checkAvailability(
                checkIn,
                checkOut,
                search.resorts.length > 0 ? search.resorts : undefined,
                search.accommodationTypes.length > 0 ? search.accommodationTypes : undefined
              );

              allAvailabilities.push(...availabilities);
              completedChecks++;

              if (spinner) {
                spinner.text = `Executing search: ${search.name} (${completedChecks}/${totalChecks} checks) - Found ${allAvailabilities.length} availabilities`;
              }
            } catch (error) {
              console.error(chalk.red(`Failed to check ${checkIn} to ${checkOut}:`), error);
              // Continue with next date range
            }
          }
        }
      }

      // Get previous result for comparison
      const previousResult = search.id ? await storageService.getLatestSearchResult(search.id) : null;
      const changes = this.compareResults(
        allAvailabilities,
        previousResult?.availabilities || []
      );

      // Save new result
      const result: SearchResult = {
        searchId: search.id!,
        timestamp: new Date(),
        availabilities: allAvailabilities,
        changes,
        notificationSent: false
      };

      if (search.id) {
        const resultId = await storageService.saveSearchResult(result);
        result.id = resultId;
      }

      if (spinner) {
        spinner.succeed(`Search completed: Found ${allAvailabilities.length} availabilities`);
      }

      // Show changes if any
      if (changes && (changes.new.length > 0 || changes.removed.length > 0)) {
        console.log(chalk.yellow('\n📊 Changes detected:'));
        if (changes.new.length > 0) {
          console.log(chalk.green(`  ✅ ${changes.new.length} new availabilities`));
        }
        if (changes.removed.length > 0) {
          console.log(chalk.red(`  ❌ ${changes.removed.length} removed availabilities`));
        }
      }

      // Send notification if needed
      if (search.notifications.email) {
        const shouldNotify = !search.notifications.onlyChanges || 
                           (changes && (changes.new.length > 0 || changes.removed.length > 0));
        
        if (shouldNotify) {
          await notificationService.sendNotification(search, result);
        }
      }

      // Update search schedule
      if (search.id) {
        const nextRun = this.calculateNextRun(search.schedule.frequency);
        await storageService.updateSearchSchedule(search.id, new Date(), nextRun);
      }

      return result;
    } catch (error) {
      if (spinner) {
        spinner.fail(`Search failed: ${error}`);
      }
      throw error;
    }
  }

  async executeAllEnabledSearches(): Promise<void> {
    const searches = await storageService.getEnabledSearches();
    console.log(chalk.cyan(`\nFound ${searches.length} enabled searches\n`));

    for (const search of searches) {
      if (!search.id) continue;
      
      try {
        await this.executeSearch(search);
        console.log(''); // Add spacing between searches
      } catch (error) {
        console.error(chalk.red(`Failed to execute search ${search.id}:`), error);
      }
    }
  }

  private async applyRateLimit(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    
    if (timeSinceLastRequest < this.requestDelay) {
      const waitTime = this.requestDelay - timeSinceLastRequest;
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    this.lastRequestTime = Date.now();
  }

  private generatePossibleDates(
    rangeFrom: string,
    rangeTo: string,
    stayLength: number
  ): Array<{ checkIn: string; checkOut: string }> {
    const dates: Array<{ checkIn: string; checkOut: string }> = [];
    const startDate = new Date(rangeFrom);
    const endDate = new Date(rangeTo);

    const currentDate = new Date(startDate);
    while (currentDate <= endDate) {
      const checkOutDate = new Date(currentDate);
      checkOutDate.setDate(checkOutDate.getDate() + stayLength);

      if (checkOutDate <= endDate) {
        dates.push({
          checkIn: this.formatDate(currentDate),
          checkOut: this.formatDate(checkOutDate)
        });
      }

      currentDate.setDate(currentDate.getDate() + 1);
    }

    return dates;
  }

  private compareResults(
    current: Availability[],
    previous: Availability[]
  ): { new: Availability[]; removed: Availability[] } {
    const currentKeys = new Set(
      current.map(a => this.getAvailabilityKey(a))
    );
    const previousKeys = new Set(
      previous.map(a => this.getAvailabilityKey(a))
    );

    const newAvailabilities = current.filter(
      a => !previousKeys.has(this.getAvailabilityKey(a))
    );
    const removedAvailabilities = previous.filter(
      a => !currentKeys.has(this.getAvailabilityKey(a))
    );

    return {
      new: newAvailabilities,
      removed: removedAvailabilities
    };
  }

  private getAvailabilityKey(availability: Availability): string {
    return `${availability.resortId}-${availability.accommodationTypeId}-${availability.dateFrom}-${availability.dateTo}`;
  }

  private formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private calculateNextRun(frequency: string): Date {
    const now = new Date();
    const next = new Date(now);

    switch (frequency) {
      case 'every_30_min':
        next.setMinutes(next.getMinutes() + 30);
        break;
      case 'hourly':
        next.setHours(next.getHours() + 1);
        break;
      case 'every_2_hours':
        next.setHours(next.getHours() + 2);
        break;
      case 'every_4_hours':
        next.setHours(next.getHours() + 4);
        break;
      case 'daily':
        next.setDate(next.getDate() + 1);
        next.setHours(9, 0, 0, 0);
        break;
      default:
        next.setHours(next.getHours() + 1);
    }

    return next;
  }
}

export const searchExecutor = new SearchExecutor();