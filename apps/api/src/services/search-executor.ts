import { 
  SearchExecutor as SharedSearchExecutor,
  HolidayParkClient,
  IProgressReporter
} from '@holiday-park/shared';
import { getPersistenceAdapter } from './persistence';
import { notificationAdapter } from './notification';
import { logger } from '../utils/logger';
import { 
  globalRateLimiter, 
  globalConcurrencyLimiter,
  ConcurrencyLimiter 
} from './rate-limiter';
import { 
  broadcastExecutionUpdate, 
  registerActiveExecution, 
  unregisterActiveExecution,
  storeExecutionInHistory
} from '../routes/executions';

// Progress reporter implementation for API with SSE support
class APIProgressReporter implements IProgressReporter {
  constructor(
    private searchName: string,
    private executionId?: string
  ) {}

  start(message: string): void {
    logger.info(`[${this.searchName}] Starting: ${message}`);
    this.broadcastProgress(message, 'start');
  }

  update(message: string, current?: number, total?: number): void {
    logger.debug(`[${this.searchName}] Progress: ${message}`);
    this.broadcastProgress(message, 'update', current, total);
  }

  succeed(message: string): void {
    logger.info(`[${this.searchName}] Success: ${message}`);
    this.broadcastProgress(message, 'success');
  }

  fail(message: string): void {
    logger.error(`[${this.searchName}] Failed: ${message}`);
    this.broadcastProgress(message, 'error');
  }

  info(message: string): void {
    logger.info(`[${this.searchName}] ${message}`);
    this.broadcastProgress(message, 'info');
  }

  warn(message: string): void {
    logger.warn(`[${this.searchName}] ${message}`);
    this.broadcastProgress(message, 'warning');
  }

  stop(): void {
    // No-op for API
  }

  private broadcastProgress(message: string, type: string, current?: number, total?: number) {
    if (this.executionId) {
      // Broadcast SSE update
      const progressData = {
        executionId: this.executionId,
        message,
        type,
        current,
        total,
        timestamp: new Date()
      };
      
      // This will be picked up by SSE clients
      broadcastExecutionUpdate(this.executionId, progressData as any);
    }
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

  async executeSearch(searchId: string, abortSignal?: AbortSignal): Promise<any> {
    // Use search concurrency limiter to prevent too many searches at once
    return this.searchConcurrencyLimiter.execute(async () => {
      // Get search details for progress reporter
      const persistenceAdapter = getPersistenceAdapter();
      if (!persistenceAdapter) {
        throw new Error('Persistence layer not available');
      }
      const search = await persistenceAdapter.getSearch(searchId);
      if (!search) {
        throw new Error(`Search ${searchId} not found`);
      }

      // Create execution record
      const executionId = await persistenceAdapter.createExecution({
        searchId,
        status: 'running',
        startedAt: new Date(),
        totalChecks: 0,
        completedChecks: 0,
        foundAvailabilities: 0
      });

      // Create abort controller if not provided
      const controller = new AbortController();
      if (abortSignal) {
        abortSignal.addEventListener('abort', () => controller.abort());
      }

      // Register active execution for cancellation
      registerActiveExecution(executionId, controller);

      // Store initial execution in history
      storeExecutionInHistory({
        id: executionId,
        searchId,
        status: 'running',
        startedAt: new Date(),
        totalChecks: 0,
        completedChecks: 0,
        foundAvailabilities: 0
      });

      const progressReporter = new APIProgressReporter(search.name, executionId);
      
      try {
        // Check for cancellation
        if (controller.signal.aborted) {
          throw new Error('Execution cancelled');
        }

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

        // Update execution status to completed
        await persistenceAdapter.updateExecution(executionId, {
          status: 'completed',
          completedAt: new Date(),
          foundAvailabilities: result.availabilities.length
        });

        // Store completed execution in history
        storeExecutionInHistory({
          id: executionId,
          searchId,
          status: 'completed',
          startedAt: new Date(),
          completedAt: new Date(),
          totalChecks: result.availabilities.length,
          completedChecks: result.availabilities.length,
          foundAvailabilities: result.availabilities.length
        });

        return result;
      } catch (error) {
        const status = controller.signal.aborted ? 'cancelled' as const : 'failed' as const;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        
        // Update execution status on error
        await persistenceAdapter.updateExecution(executionId, {
          status,
          completedAt: new Date(),
          error: errorMessage
        });

        // Store failed/cancelled execution in history
        storeExecutionInHistory({
          id: executionId,
          searchId,
          status,
          startedAt: new Date(),
          completedAt: new Date(),
          totalChecks: 0,
          completedChecks: 0,
          foundAvailabilities: 0,
          error: errorMessage
        });
        
        throw error;
      } finally {
        // Unregister execution
        unregisterActiveExecution(executionId);
      }
    });
  }

  async executeAllDueSearches(): Promise<void> {
    try {
      const persistenceAdapter = getPersistenceAdapter();
      if (!persistenceAdapter) {
        throw new Error('Persistence layer not available');
      }
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