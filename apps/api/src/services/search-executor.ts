import { 
  SearchExecutor as SharedSearchExecutor,
  HolidayParkClient,
  IProgressReporter
} from '@holiday-park/shared';
import { persistenceAdapter } from './persistence';
import { notificationAdapter } from './notification';
import { logger } from '../utils/logger';
import { 
  globalRateLimiter, 
  globalConcurrencyLimiter,
  ConcurrencyLimiter 
} from './rate-limiter';

// Progress reporter implementation for API
class APIProgressReporter implements IProgressReporter {
  constructor(private searchName: string) {}

  start(message: string): void {
    logger.info(`[${this.searchName}] Starting: ${message}`);
  }

  update(message: string): void {
    logger.debug(`[${this.searchName}] Progress: ${message}`);
  }

  succeed(message: string): void {
    logger.info(`[${this.searchName}] Success: ${message}`);
  }

  fail(message: string): void {
    logger.error(`[${this.searchName}] Failed: ${message}`);
  }

  info(message: string): void {
    logger.info(`[${this.searchName}] ${message}`);
  }

  warn(message: string): void {
    logger.warn(`[${this.searchName}] ${message}`);
  }

  stop(): void {
    // No-op for API
  }
}

export class SearchExecutorService {
  private searchConcurrencyLimiter: ConcurrencyLimiter;

  constructor() {
    // Limit concurrent searches
    this.searchConcurrencyLimiter = new ConcurrencyLimiter(
      parseInt(process.env.MAX_CONCURRENT_SEARCHES || '2')
    );
  }

  async executeSearch(searchId: string): Promise<any> {
    // Use search concurrency limiter to prevent too many searches at once
    return this.searchConcurrencyLimiter.execute(async () => {
      // Get search details for progress reporter
      const search = await persistenceAdapter.getSearch(searchId);
      if (!search) {
        throw new Error(`Search ${searchId} not found`);
      }

      const progressReporter = new APIProgressReporter(search.name);
      
      // Create Holiday Park client with rate limiting
      const holidayParkClient = new HolidayParkClient({
        logger: {
          debug: (msg: string, ...args: any[]) => logger.debug(msg, ...args),
          info: (msg: string, ...args: any[]) => logger.info(msg, ...args),
          warn: (msg: string, ...args: any[]) => logger.warn(msg, ...args),
          error: (msg: string, ...args: any[]) => logger.error(msg, ...args),
        },
        progressReporter
      });

      // Create shared executor with all dependencies
      const sharedExecutor = new SharedSearchExecutor({
        holidayParkClient,
        persistence: persistenceAdapter,
        notification: notificationAdapter,
        rateLimiter: globalRateLimiter,
        concurrencyLimiter: globalConcurrencyLimiter,
        progressReporter,
        logger: {
          debug: (msg: string, ...args: any[]) => logger.debug(msg, ...args),
          info: (msg: string, ...args: any[]) => logger.info(msg, ...args),
          warn: (msg: string, ...args: any[]) => logger.warn(msg, ...args),
          error: (msg: string, ...args: any[]) => logger.error(msg, ...args),
        }
      });

      // Execute the search
      const result = await sharedExecutor.executeSearch(searchId);
      
      logger.info(`Search ${searchId} completed successfully`, {
        availabilities: result.availabilities.length,
        newAvailabilities: result.changes?.new.length || 0,
        removedAvailabilities: result.changes?.removed.length || 0
      });

      return result;
    });
  }

  async executeAllDueSearches(): Promise<void> {
    try {
      const dueSearches = await persistenceAdapter.getSearchesDueForExecution();
      logger.info(`Found ${dueSearches.length} searches due for execution`);

      // Execute searches in parallel with concurrency limit
      const results = await Promise.allSettled(
        dueSearches.map((search: any) => this.executeSearch(search.id!))
      );

      // Log results
      const successful = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;

      logger.info(`Execution complete: ${successful} successful, ${failed} failed`);

      // Log failures
      results.forEach((result, index) => {
        if (result.status === 'rejected') {
          logger.error(`Failed to execute search ${dueSearches[index].id}:`, result.reason);
        }
      });
    } catch (error) {
      logger.error('Failed to execute due searches:', error);
      throw error;
    }
  }
}

export const searchExecutorService = new SearchExecutorService();