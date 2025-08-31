import { Search, Availability, SearchResult, SearchExecution } from '@holiday-park/shared';
import { HolidayParkClient } from './holiday-park-client';
import { firebaseService } from './firebase-admin';
import { NotificationService } from './notification-service';
import { 
  globalRateLimiter, 
  globalConcurrencyLimiter, 
  retryWithBackoff,
  ConcurrencyLimiter 
} from './rate-limiter';
import { logger } from '../utils/logger';

export class SearchExecutor {
  private holidayParkClient: HolidayParkClient;
  private notificationService: NotificationService;
  private searchConcurrencyLimiter: ConcurrencyLimiter;

  constructor() {
    this.holidayParkClient = new HolidayParkClient();
    this.notificationService = new NotificationService();
    // Limit concurrent searches
    this.searchConcurrencyLimiter = new ConcurrencyLimiter(
      parseInt(process.env.MAX_CONCURRENT_SEARCHES || '2')
    );
  }

  async executeSearch(searchId: string): Promise<SearchResult> {
    // Use search concurrency limiter to prevent too many searches at once
    return this.searchConcurrencyLimiter.execute(async () => {
      const search = await firebaseService.getSearch(searchId);
      if (!search) {
        throw new Error(`Search ${searchId} not found`);
      }

      logger.info(`Starting execution for search: ${search.name} (${searchId})`);
      const searchStartTime = Date.now();

      // Create execution record
      const executionId = await firebaseService.createExecution({
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

      await firebaseService.updateExecution(executionId, { totalChecks });

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
              // Apply rate limiting before each request
              await globalRateLimiter.throttle();
              
              // Execute request with concurrency control and retry logic
              const requestStartTime = Date.now();
              
              const availabilities = await globalConcurrencyLimiter.execute(async () => {
                return retryWithBackoff(async () => {
                  return await this.holidayParkClient.checkAvailability(
                    checkIn,
                    checkOut,
                    search.resorts.length > 0 ? search.resorts : undefined,
                    search.accommodationTypes.length > 0 ? search.accommodationTypes : undefined
                  );
                }, {
                  maxAttempts: 3,
                  initialDelay: 2000,
                  maxDelay: 10000
                });
              });

              // Record response time for adaptive delay
              const requestDuration = Date.now() - requestStartTime;
              globalRateLimiter.recordResponseTime(requestDuration);

              allAvailabilities.push(...availabilities);
              completedChecks++;

              // Update progress
              await firebaseService.updateExecution(executionId, {
                completedChecks,
                foundAvailabilities: allAvailabilities.length
              });

              // Log progress every 10 checks
              if (completedChecks % 10 === 0) {
                logger.info(`Progress: ${completedChecks}/${totalChecks} checks completed, ${allAvailabilities.length} availabilities found`);
              }
            } catch (error) {
              logger.error(`Failed to check availability for ${checkIn} to ${checkOut} after retries:`, error);
              // Continue with next date range instead of failing entire search
            }
          }
        }
      }

      // Get previous result for comparison
      const previousResult = await firebaseService.getLatestSearchResult(searchId);
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

      const resultId = await firebaseService.saveSearchResult(result);
      result.id = resultId;

      // Update execution status
      await firebaseService.updateExecution(executionId, {
        status: 'completed',
        completedAt: new Date(),
        foundAvailabilities: allAvailabilities.length
      });

      // Send notification if needed
      if (search.notifications.email) {
        const shouldNotify = !search.notifications.onlyChanges || 
                           (changes && (changes.new.length > 0 || changes.removed.length > 0));
        
        if (shouldNotify) {
          try {
            await this.notificationService.sendSearchResultEmail(search, result);
            await firebaseService.updateSearchResult(resultId, { notificationSent: true });
          } catch (error) {
            logger.error('Failed to send notification:', error);
          }
        }
      }

      // Update search schedule
      const nextRun = this.calculateNextRun(search.schedule.frequency);
      await firebaseService.updateSearchSchedule(searchId, new Date(), nextRun);

      const searchDuration = Date.now() - searchStartTime;
      logger.info(`Completed execution for search: ${search.name}. Found ${allAvailabilities.length} availabilities in ${searchDuration}ms`);
      logger.info(`Request rate: ${globalRateLimiter.getRequestRate()} req/min, Avg response time: ${globalRateLimiter.getAverageResponseTime()}ms`);
      
      return result;

      } catch (error) {
        logger.error(`Failed to execute search ${searchId}:`, error);
        
        await firebaseService.updateExecution(executionId, {
          status: 'failed',
          completedAt: new Date(),
          error: error instanceof Error ? error.message : 'Unknown error'
        });

        throw error;
      }
    });
  }

  async executeAllDueSearches(): Promise<void> {
    const searches = await firebaseService.getSearchesDueForExecution();
    logger.info(`Found ${searches.length} searches due for execution`);

    for (const search of searches) {
      if (!search.id) continue;
      
      try {
        await this.executeSearch(search.id);
      } catch (error) {
        logger.error(`Failed to execute search ${search.id}:`, error);
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

}

export const searchExecutor = new SearchExecutor();