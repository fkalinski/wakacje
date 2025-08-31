import helmet from 'helmet';
import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { body, validationResult } from 'express-validator';
import { logger } from '../utils/logger';

/**
 * Configure Helmet security headers
 */
export const helmetConfig = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: true,
  crossOriginOpenerPolicy: true,
  crossOriginResourcePolicy: { policy: "cross-origin" },
  dnsPrefetchControl: true,
  frameguard: { action: 'deny' },
  hidePoweredBy: true,
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  },
  ieNoOpen: true,
  noSniff: true,
  originAgentCluster: true,
  permittedCrossDomainPolicies: false,
  referrerPolicy: { policy: "no-referrer" },
  xssFilter: true,
});

/**
 * Add correlation ID to requests for tracing
 */
export function correlationId(req: Request, res: Response, next: NextFunction) {
  const correlationId = req.headers['x-correlation-id'] as string || uuidv4();
  req.headers['x-correlation-id'] = correlationId;
  res.setHeader('x-correlation-id', correlationId);
  
  // Add to logger context
  (req as any).correlationId = correlationId;
  
  next();
}

/**
 * Sanitize user input middleware
 */
export function sanitizeInput(req: Request, res: Response, next: NextFunction) {
  // Recursively sanitize object properties
  const sanitize = (obj: any): any => {
    if (typeof obj === 'string') {
      // Remove any script tags and dangerous HTML
      return obj
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
        .replace(/javascript:/gi, '')
        .replace(/on\w+\s*=/gi, '')
        .trim();
    } else if (Array.isArray(obj)) {
      return obj.map(sanitize);
    } else if (obj && typeof obj === 'object') {
      const sanitized: any = {};
      for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
          sanitized[key] = sanitize(obj[key]);
        }
      }
      return sanitized;
    }
    return obj;
  };
  
  // Sanitize body, query, and params
  if (req.body) {
    req.body = sanitize(req.body);
  }
  if (req.query) {
    req.query = sanitize(req.query) as any;
  }
  if (req.params) {
    req.params = sanitize(req.params) as any;
  }
  
  next();
}

/**
 * Validate request data middleware
 */
export function validateRequest(req: Request, res: Response, next: NextFunction) {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    logger.warn('Validation error', {
      errors: errors.array(),
      path: req.path,
      method: req.method,
      ip: req.ip
    });
    
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors.array()
    });
  }
  
  next();
}

/**
 * Common validation rules
 */
export const validationRules = {
  // Email validation
  email: body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Invalid email address'),
  
  // Password validation
  password: body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Password must contain at least one uppercase letter, one lowercase letter, and one number'),
  
  // UUID validation
  uuid: (field: string) => body(field)
    .isUUID()
    .withMessage(`${field} must be a valid UUID`),
  
  // Date validation
  date: (field: string) => body(field)
    .isISO8601()
    .withMessage(`${field} must be a valid ISO 8601 date`),
  
  // Number validation
  number: (field: string, min?: number, max?: number) => {
    let validation = body(field).isNumeric();
    if (min !== undefined) {
      validation = validation.custom(value => value >= min)
        .withMessage(`${field} must be at least ${min}`);
    }
    if (max !== undefined) {
      validation = validation.custom(value => value <= max)
        .withMessage(`${field} must be at most ${max}`);
    }
    return validation;
  },
  
  // String validation
  string: (field: string, minLength?: number, maxLength?: number) => {
    let validation = body(field).isString();
    if (minLength !== undefined) {
      validation = validation.isLength({ min: minLength })
        .withMessage(`${field} must be at least ${minLength} characters long`);
    }
    if (maxLength !== undefined) {
      validation = validation.isLength({ max: maxLength })
        .withMessage(`${field} must be at most ${maxLength} characters long`);
    }
    return validation.trim().escape();
  },
  
  // Array validation
  array: (field: string, minLength?: number, maxLength?: number) => {
    let validation = body(field).isArray();
    if (minLength !== undefined) {
      validation = validation.custom((value: any[]) => value.length >= minLength)
        .withMessage(`${field} must contain at least ${minLength} items`);
    }
    if (maxLength !== undefined) {
      validation = validation.custom((value: any[]) => value.length <= maxLength)
        .withMessage(`${field} must contain at most ${maxLength} items`);
    }
    return validation;
  }
};

/**
 * Security headers middleware
 */
export function securityHeaders(req: Request, res: Response, next: NextFunction) {
  // Additional security headers not covered by Helmet
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Feature-Policy', "geolocation 'none'; microphone 'none'; camera 'none'");
  
  // Remove fingerprinting headers
  res.removeHeader('X-Powered-By');
  res.removeHeader('Server');
  
  next();
}

/**
 * Prevent parameter pollution
 */
export function preventParameterPollution(req: Request, res: Response, next: NextFunction) {
  // Check for duplicate parameters
  for (const key in req.query) {
    if (Array.isArray(req.query[key])) {
      // Take only the first value
      req.query[key] = (req.query[key] as string[])[0] as any;
      logger.warn('Parameter pollution attempt detected', {
        parameter: key,
        ip: req.ip,
        path: req.path
      });
    }
  }
  
  next();
}

/**
 * Request size limiter
 */
export function requestSizeLimiter(maxSize: string = '10mb') {
  return (req: Request, res: Response, next: NextFunction) => {
    const contentLength = req.headers['content-length'];
    if (contentLength) {
      const bytes = parseInt(contentLength);
      const maxBytes = parseSize(maxSize);
      
      if (bytes > maxBytes) {
        logger.warn('Request size limit exceeded', {
          size: bytes,
          maxSize: maxBytes,
          ip: req.ip,
          path: req.path
        });
        
        return res.status(413).json({
          success: false,
          error: 'Request entity too large'
        });
      }
    }
    
    next();
  };
}

/**
 * Parse size string to bytes
 */
function parseSize(size: string): number {
  const units: { [key: string]: number } = {
    b: 1,
    kb: 1024,
    mb: 1024 * 1024,
    gb: 1024 * 1024 * 1024
  };
  
  const match = size.toLowerCase().match(/^(\d+(?:\.\d+)?)\s*([a-z]+)?$/);
  if (!match) {
    throw new Error(`Invalid size format: ${size}`);
  }
  
  const value = parseFloat(match[1]);
  const unit = match[2] || 'b';
  
  if (!units[unit]) {
    throw new Error(`Invalid size unit: ${unit}`);
  }
  
  return value * units[unit];
}

/**
 * IP whitelist/blacklist middleware
 */
export function ipFilter(options: {
  whitelist?: string[];
  blacklist?: string[];
}) {
  return (req: Request, res: Response, next: NextFunction) => {
    const clientIp = req.ip || req.socket.remoteAddress || '';
    
    // Check blacklist first
    if (options.blacklist && options.blacklist.includes(clientIp)) {
      logger.warn('Blacklisted IP attempted access', {
        ip: clientIp,
        path: req.path
      });
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }
    
    // Check whitelist if provided
    if (options.whitelist && !options.whitelist.includes(clientIp)) {
      logger.warn('Non-whitelisted IP attempted access', {
        ip: clientIp,
        path: req.path
      });
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }
    
    next();
  };
}

/**
 * Combined security middleware
 */
export function security() {
  return [
    helmetConfig,
    correlationId,
    securityHeaders,
    preventParameterPollution,
    sanitizeInput,
    requestSizeLimiter('10mb')
  ];
}