import { Router } from 'express';
import { globalRateLimiter, globalConcurrencyLimiter } from '../services/rate-limiter';
import { ApiResponse } from '@holiday-park/shared';

const router = Router();

// Get rate limiter status
router.get('/rate-limiter', (_req, res) => {
  const status = {
    requestRate: globalRateLimiter.getRequestRate(),
    averageResponseTime: globalRateLimiter.getAverageResponseTime(),
    concurrency: globalConcurrencyLimiter.getStatus(),
    config: {
      minDelay: parseInt(process.env.RATE_LIMIT_DELAY_MIN || '1000'),
      maxDelay: parseInt(process.env.RATE_LIMIT_DELAY_MAX || '3000'),
      jitter: process.env.RATE_LIMIT_JITTER !== 'false',
      adaptive: process.env.RATE_LIMIT_ADAPTIVE === 'true',
      maxConcurrentSearches: parseInt(process.env.MAX_CONCURRENT_SEARCHES || '2'),
      maxConcurrentRequests: parseInt(process.env.MAX_CONCURRENT_REQUESTS || '1'),
    }
  };

  const response: ApiResponse<typeof status> = {
    success: true,
    data: status
  };

  res.json(response);
});

export default router;