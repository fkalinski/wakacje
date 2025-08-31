import { Search, Availability, SearchResult } from './types';
import { HolidayParkClient } from './holiday-park-client';
import { IPersistenceAdapter } from './interfaces/persistence';
import { INotificationAdapter } from './interfaces/notification';
import { IRateLimiter, IConcurrencyLimiter, IRetryStrategy } from './interfaces/rate-limiter';
import { IProgressReporter } from './interfaces/progress-reporter';
import { ILogger } from './interfaces/logger';

export interface SearchExecutorOptions {
  holidayParkClient: HolidayParkClient;
  persistence: IPersistenceAdapter;
  notification?: INotificationAdapter;
  rateLimiter?: IRateLimiter;
  concurrencyLimiter?: IConcurrencyLimiter;
  retryStrategy?: IRetryStrategy;
  progressReporter?: IProgressReporter;
  logger?: ILogger;
}

export class SearchExecutor {
  private holidayParkClient: HolidayParkClient;
  private persistence: IPersistenceAdapter;
  private notification?: INotificationAdapter;
  private rateLimiter?: IRateLimiter;
  private concurrencyLimiter?: IConcurrencyLimiter;
  private retryStrategy?: IRetryStrategy;
  private progressReporter?: IProgressReporter;
  private logger?: ILogger;

  constructor(options: SearchExecutorOptions) {
    this.holidayParkClient = options.holidayParkClient;
    this.persistence = options.persistence;
    this.notification = options.notification;
    this.rateLimiter = options.rateLimiter;
    this.concurrencyLimiter = options.concurrencyLimiter;
    this.retryStrategy = options.retryStrategy;
    this.progressReporter = options.progressReporter;
    this.logger = options.logger;
  }

  async executeSearch(searchId: string): Promise<SearchResult> {
    const executeFunction = async () => {
      const search = await this.persistence.getSearch(searchId);
      if (!search) {
        throw new Error(`Search ${searchId} not found`);
      }

      this.logger?.info(`Starting execution for search: ${search.name} (${searchId})`);
      this.progressReporter?.start(`Executing search: ${search.name}`);

      // Create execution record
      const executionId = await this.persistence.createExecution({
        searchId,
        status: 'running',
        startedAt: new Date(),
        totalChecks: 0,
        completedChecks: 0,
        foundAvailabilities: 0
      });

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

        await this.persistence.updateExecution(executionId, { totalChecks });

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
                // Apply rate limiting if available
                if (this.rateLimiter) {
                  await this.rateLimiter.throttle();
                }

                // Execute with retry strategy if available
                const executeCheck = async () => {
                  return await this.holidayParkClient.checkAvailability(
                    checkIn,
                    checkOut,
                    search.resorts.length > 0 ? search.resorts : undefined,
                    search.accommodationTypes.length > 0 ? search.accommodationTypes : undefined
                  );
                };

                let availabilities: Availability[];
                
                if (this.retryStrategy) {
                  availabilities = await this.retryStrategy.execute(executeCheck, {
                    maxAttempts: 3,
                    initialDelay: 2000,
                    maxDelay: 10000
                  });
                } else {
                  availabilities = await executeCheck();
                }

                allAvailabilities.push(...availabilities);
                completedChecks++;

                // Update progress
                await this.persistence.updateExecution(executionId, {
                  completedChecks,
                  foundAvailabilities: allAvailabilities.length
                });

                // Report progress
                this.progressReporter?.update(
                  `Checking dates: ${completedChecks}/${totalChecks} - Found ${allAvailabilities.length} availabilities`,
                  completedChecks,
                  totalChecks
                );

                // Log progress every 10 checks
                if (completedChecks % 10 === 0) {
                  this.logger?.info(`Progress: ${completedChecks}/${totalChecks} checks completed, ${allAvailabilities.length} availabilities found`);
                }
              } catch (error) {
                this.logger?.error(`Failed to check availability for ${checkIn} to ${checkOut}:`, error);
                // Continue with next date range instead of failing entire search
              }
            }
          }
        }

        // Get previous result for comparison
        const previousResult = await this.persistence.getLatestSearchResult(searchId);
        const changes = this.compareResults(
          allAvailabilities,
          previousResult?.availabilities || []
        );

        // Save new result
        const result: SearchResult = {
          searchId,
          timestamp: new Date(),
          availabilities: allAvailabilities,
          changes,
          notificationSent: false
        };

        const resultId = await this.persistence.saveSearchResult(result);
        result.id = resultId;

        // Update execution status
        await this.persistence.updateExecution(executionId, {
          status: 'completed',
          completedAt: new Date(),
          foundAvailabilities: allAvailabilities.length
        });

        // Send notification if needed
        if (this.notification && search.notifications.email) {
          const shouldNotify = !search.notifications.onlyChanges || 
                             (changes && (changes.new.length > 0 || changes.removed.length > 0));
          
          if (shouldNotify) {
            try {
              await this.notification.sendNotification(search, result);
              await this.persistence.updateSearchResult(resultId, { notificationSent: true });
              
              // Log notification
              await this.persistence.logNotification({
                searchId,
                resultId,
                sentAt: new Date(),
                recipient: search.notifications.email,
                subject: this.generateNotificationSubject(search, result),
                newAvailabilities: changes?.new.length || 0,
                removedAvailabilities: changes?.removed.length || 0,
                success: true
              });
            } catch (error) {
              this.logger?.error('Failed to send notification:', error);
              
              // Log failed notification
              await this.persistence.logNotification({
                searchId,
                resultId,
                sentAt: new Date(),
                recipient: search.notifications.email,
                subject: this.generateNotificationSubject(search, result),
                newAvailabilities: changes?.new.length || 0,
                removedAvailabilities: changes?.removed.length || 0,
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error'
              });
            }
          }
        }

        // Update search schedule
        const nextRun = this.calculateNextRun(search.schedule.frequency);
        await this.persistence.updateSearchSchedule(searchId, new Date(), nextRun);

        this.logger?.info(`Completed execution for search: ${search.name}. Found ${allAvailabilities.length} availabilities`);
        this.progressReporter?.succeed(`Search completed: Found ${allAvailabilities.length} availabilities`);
        
        return result;

      } catch (error) {
        this.logger?.error(`Failed to execute search ${searchId}:`, error);
        this.progressReporter?.fail(`Search failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        
        await this.persistence.updateExecution(executionId, {
          status: 'failed',
          completedAt: new Date(),
          error: error instanceof Error ? error.message : 'Unknown error'
        });

        throw error;
      }
    };

    // Execute with concurrency limiter if available
    if (this.concurrencyLimiter) {
      return await this.concurrencyLimiter.execute(executeFunction);
    } else {
      return await executeFunction();
    }
  }

  async executeAllDueSearches(): Promise<void> {
    const searches = await this.persistence.getSearchesDueForExecution();
    this.logger?.info(`Found ${searches.length} searches due for execution`);

    for (const search of searches) {
      if (!search.id) continue;
      
      try {
        await this.executeSearch(search.id);
      } catch (error) {
        this.logger?.error(`Failed to execute search ${search.id}:`, error);
      }
    }
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

  private generateNotificationSubject(search: Search, result: SearchResult): string {
    const hasChanges = result.changes && 
                      (result.changes.new.length > 0 || result.changes.removed.length > 0);
    
    if (!hasChanges) {
      return `Holiday Park - ${search.name} - ${result.availabilities.length} available`;
    }

    const newCount = result.changes?.new.length || 0;
    const removedCount = result.changes?.removed.length || 0;

    if (newCount > 0 && removedCount > 0) {
      return `Holiday Park - ${search.name} - ${newCount} new, ${removedCount} removed`;
    } else if (newCount > 0) {
      return `Holiday Park - ${search.name} - ${newCount} new availabilities!`;
    } else {
      return `Holiday Park - ${search.name} - ${removedCount} no longer available`;
    }
  }
}