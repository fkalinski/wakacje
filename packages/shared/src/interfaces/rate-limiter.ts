export interface IRateLimiter {
  throttle(): Promise<void>;
  recordResponseTime?(responseTime: number): void;
  getRequestRate?(): number;
  getAverageResponseTime?(): number;
  reset?(): void;
}

export interface IConcurrencyLimiter {
  execute<T>(fn: () => Promise<T>): Promise<T>;
  getActiveCount?(): number;
  getQueueSize?(): number;
}

export interface IRetryStrategy {
  execute<T>(
    fn: () => Promise<T>,
    options?: {
      maxAttempts?: number;
      initialDelay?: number;
      maxDelay?: number;
      backoffMultiplier?: number;
    }
  ): Promise<T>;
}