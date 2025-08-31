import { logger } from '../utils/logger';

interface RateLimiterConfig {
  minDelay?: number;
  maxDelay?: number;
  jitterEnabled?: boolean;
  adaptiveEnabled?: boolean;
  windowSize?: number;
}

interface RetryConfig {
  maxAttempts?: number;
  initialDelay?: number;
  maxDelay?: number;
  multiplier?: number;
}

/**
 * Rate limiter to control API request frequency
 */
export class RateLimiter {
  private lastRequestTime = 0;
  private requestTimes: number[] = [];
  private responseTimesMs: number[] = [];
  
  private readonly minDelay: number;
  private readonly maxDelay: number;
  private readonly jitterEnabled: boolean;
  private readonly adaptiveEnabled: boolean;
  private readonly windowSize: number;

  constructor(config: RateLimiterConfig = {}) {
    this.minDelay = config.minDelay || parseInt(process.env.RATE_LIMIT_DELAY_MIN || '1000');
    this.maxDelay = config.maxDelay || parseInt(process.env.RATE_LIMIT_DELAY_MAX || '3000');
    this.jitterEnabled = config.jitterEnabled ?? (process.env.RATE_LIMIT_JITTER !== 'false');
    this.adaptiveEnabled = config.adaptiveEnabled ?? (process.env.RATE_LIMIT_ADAPTIVE === 'true');
    this.windowSize = config.windowSize || 10; // Track last 10 requests for adaptive delay
  }

  /**
   * Calculate delay based on recent request patterns
   */
  private calculateDelay(): number {
    let baseDelay = this.minDelay;

    // Adaptive delay based on response times
    if (this.adaptiveEnabled && this.responseTimesMs.length > 0) {
      const avgResponseTime = this.responseTimesMs.reduce((a, b) => a + b, 0) / this.responseTimesMs.length;
      
      // If responses are slow, increase delay
      if (avgResponseTime > 2000) {
        baseDelay = Math.min(this.maxDelay, baseDelay * 1.5);
      } else if (avgResponseTime < 500) {
        // If responses are fast, we can reduce delay slightly
        baseDelay = Math.max(this.minDelay, baseDelay * 0.8);
      }
    }

    // Random delay between min and max
    const randomDelay = Math.random() * (this.maxDelay - this.minDelay) + this.minDelay;
    baseDelay = Math.max(baseDelay, randomDelay);

    // Add jitter to prevent synchronized bursts
    if (this.jitterEnabled) {
      const jitter = (Math.random() - 0.5) * 1000; // ±500ms jitter
      baseDelay += jitter;
    }

    // Ensure we stay within bounds
    return Math.max(this.minDelay, Math.min(this.maxDelay, baseDelay));
  }

  /**
   * Wait before allowing next request
   */
  async throttle(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    const requiredDelay = this.calculateDelay();

    if (timeSinceLastRequest < requiredDelay) {
      const waitTime = requiredDelay - timeSinceLastRequest;
      logger.debug(`Rate limiting: waiting ${waitTime}ms before next request`);
      await this.sleep(waitTime);
    }

    this.lastRequestTime = Date.now();
    this.requestTimes.push(this.lastRequestTime);
    
    // Keep only recent request times
    if (this.requestTimes.length > this.windowSize) {
      this.requestTimes.shift();
    }
  }

  /**
   * Record response time for adaptive delay calculation
   */
  recordResponseTime(durationMs: number): void {
    this.responseTimesMs.push(durationMs);
    
    // Keep only recent response times
    if (this.responseTimesMs.length > this.windowSize) {
      this.responseTimesMs.shift();
    }

    logger.debug(`Response time: ${durationMs}ms (avg: ${this.getAverageResponseTime()}ms)`);
  }

  /**
   * Get average response time
   */
  getAverageResponseTime(): number {
    if (this.responseTimesMs.length === 0) return 0;
    return Math.round(this.responseTimesMs.reduce((a, b) => a + b, 0) / this.responseTimesMs.length);
  }

  /**
   * Get current request rate (requests per minute)
   */
  getRequestRate(): number {
    if (this.requestTimes.length < 2) return 0;
    
    const oldestTime = this.requestTimes[0];
    const newestTime = this.requestTimes[this.requestTimes.length - 1];
    const durationMinutes = (newestTime - oldestTime) / 60000;
    
    if (durationMinutes === 0) return 0;
    return Math.round(this.requestTimes.length / durationMinutes);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Concurrency limiter to control parallel operations
 */
export class ConcurrencyLimiter {
  private running = 0;
  private readonly queue: Array<() => void> = [];
  private readonly maxConcurrent: number;

  constructor(maxConcurrent?: number) {
    this.maxConcurrent = maxConcurrent || parseInt(process.env.MAX_CONCURRENT_REQUESTS || '1');
  }

  /**
   * Acquire a slot for execution
   */
  async acquire(): Promise<void> {
    if (this.running >= this.maxConcurrent) {
      logger.debug(`Concurrency limit reached (${this.running}/${this.maxConcurrent}), queuing request`);
      await new Promise<void>(resolve => this.queue.push(resolve));
    }
    this.running++;
    logger.debug(`Acquired concurrency slot (${this.running}/${this.maxConcurrent})`);
  }

  /**
   * Release a slot after execution
   */
  release(): void {
    this.running--;
    const next = this.queue.shift();
    if (next) {
      next();
    }
    logger.debug(`Released concurrency slot (${this.running}/${this.maxConcurrent}, queue: ${this.queue.length})`);
  }

  /**
   * Execute a function with concurrency control
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }

  /**
   * Get current status
   */
  getStatus(): { running: number; queued: number; maxConcurrent: number } {
    return {
      running: this.running,
      queued: this.queue.length,
      maxConcurrent: this.maxConcurrent
    };
  }
}

/**
 * Retry a function with exponential backoff
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  config: RetryConfig = {}
): Promise<T> {
  const maxAttempts = config.maxAttempts || parseInt(process.env.RETRY_MAX_ATTEMPTS || '3');
  const initialDelay = config.initialDelay || parseInt(process.env.RETRY_INITIAL_DELAY || '2000');
  const maxDelay = config.maxDelay || parseInt(process.env.RETRY_MAX_DELAY || '30000');
  const multiplier = config.multiplier || 2;

  let lastError: Error = new Error('No attempts made');

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      logger.debug(`Attempt ${attempt}/${maxAttempts}`);
      return await fn();
    } catch (error) {
      lastError = error as Error;
      logger.warn(`Attempt ${attempt} failed: ${lastError.message}`);

      if (attempt < maxAttempts) {
        const delay = Math.min(
          initialDelay * Math.pow(multiplier, attempt - 1),
          maxDelay
        );
        logger.debug(`Retrying in ${delay}ms...`);
        await sleep(delay);
      }
    }
  }

  logger.error(`All ${maxAttempts} attempts failed`);
  throw lastError;
}

/**
 * Sleep for specified milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Global rate limiter instance for Holiday Park API
 */
export const globalRateLimiter = new RateLimiter();

/**
 * Global concurrency limiter for API requests
 */
export const globalConcurrencyLimiter = new ConcurrencyLimiter();