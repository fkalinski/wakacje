import rateLimit from 'express-rate-limit';
import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

/**
 * Create rate limiter with custom configuration
 */
export function createRateLimiter(options?: {
  windowMs?: number;
  max?: number;
  message?: string;
  skipSuccessfulRequests?: boolean;
}) {
  return rateLimit({
    windowMs: options?.windowMs || 15 * 60 * 1000, // 15 minutes default
    max: options?.max || 100, // 100 requests per window default
    message: options?.message || 'Too many requests from this IP, please try again later.',
    standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
    legacyHeaders: false, // Disable `X-RateLimit-*` headers
    skipSuccessfulRequests: options?.skipSuccessfulRequests || false,
    // Remove custom keyGenerator to use default IP-based key that handles IPv6 properly
    handler: (req: Request, res: Response) => {
      logger.warn('Rate limit exceeded', {
        ip: req.ip,
        path: req.path,
        method: req.method,
        userAgent: req.headers['user-agent']
      });
      res.status(429).json({
        success: false,
        error: options?.message || 'Too many requests from this IP, please try again later.',
        retryAfter: res.getHeader('Retry-After')
      });
    }
  });
}

/**
 * General API rate limiter
 */
export const apiLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // 100 requests per 15 minutes
});

/**
 * Strict rate limiter for sensitive endpoints
 */
export const strictLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // 20 requests per 15 minutes
  message: 'Too many requests to this endpoint, please try again later.'
});

/**
 * Auth endpoints rate limiter
 */
export const authLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 requests per 15 minutes
  message: 'Too many authentication attempts, please try again later.',
  skipSuccessfulRequests: true // Don't count successful auth attempts
});

/**
 * Search execution rate limiter
 */
export const searchLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 30, // 30 search executions per hour
  message: 'Search execution rate limit exceeded. Please wait before executing more searches.'
});

/**
 * Create operation rate limiter
 */
export const createLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour  
  max: 50, // 50 create operations per hour
  message: 'Too many create operations. Please wait before creating more resources.'
});

/**
 * Public endpoints rate limiter (more lenient)
 */
export const publicLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200 // 200 requests per 15 minutes
});

/**
 * Health check rate limiter (very lenient)
 */
export const healthCheckLimiter = createRateLimiter({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 60 // 60 requests per minute
});

/**
 * Dynamic rate limiter based on user authentication
 */
export const dynamicLimiter = (req: Request, res: Response, next: NextFunction) => {
  // Authenticated users get higher limits
  const limiter = req.user 
    ? createRateLimiter({
        windowMs: 15 * 60 * 1000,
        max: 200, // Double the limit for authenticated users
        keyGenerator: (req) => req.user?.uid || req.ip || 'unknown'
      })
    : apiLimiter;
  
  limiter(req, res, next);
};

/**
 * API key rate limiter (much higher limits)
 */
export const apiKeyLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // 1000 requests per 15 minutes for API keys
  keyGenerator: (req) => {
    // Use API key as the rate limit key if present
    const apiKey = req.headers['x-api-key'] as string;
    if (apiKey) {
      return `api-key:${apiKey}`;
    }
    return req.ip || 'unknown';
  }
});

/**
 * Combined rate limiter that chooses based on auth type
 */
export const adaptiveLimiter = (req: Request, res: Response, next: NextFunction) => {
  // Check if request has API key
  if (req.headers['x-api-key']) {
    return apiKeyLimiter(req, res, next);
  }
  
  // Check if user is authenticated
  if (req.user) {
    return dynamicLimiter(req, res, next);
  }
  
  // Default to standard API limiter
  return apiLimiter(req, res, next);
};

/**
 * Rate limiter with custom storage (for distributed systems)
 * This is a placeholder for Redis-based rate limiting
 */
export function createDistributedRateLimiter(options: {
  windowMs: number;
  max: number;
  redisClient?: any; // Would be Redis client in production
}) {
  // In production, this would use Redis for distributed rate limiting
  // For now, we'll use the in-memory rate limiter
  return createRateLimiter(options);
}

/**
 * Request tracking middleware for analytics
 */
export function requestTracker(req: Request, res: Response, next: NextFunction) {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    const statusCode = res.statusCode;
    
    logger.info('Request completed', {
      method: req.method,
      path: req.path,
      statusCode,
      duration,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      userId: req.user?.uid,
      isApiKey: !!req.headers['x-api-key']
    });
    
    // Track slow requests
    if (duration > 3000) {
      logger.warn('Slow request detected', {
        method: req.method,
        path: req.path,
        duration,
        statusCode
      });
    }
  });
  
  next();
}