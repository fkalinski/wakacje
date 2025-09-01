import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { expressjwt } from 'express-jwt';
import { logger } from '../utils/logger';
// import { persistenceAdapter } from '../services/persistence';

// Extend Express Request type
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: {
        uid: string;
        email?: string;
        role?: string;
        apiKey?: boolean;
      };
      apiKey?: string;
    }
  }
}

// JWT configuration
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_ISSUER = process.env.JWT_ISSUER || 'holiday-park-api';
const JWT_AUDIENCE = process.env.JWT_AUDIENCE || 'holiday-park-client';

// API Key header name
const API_KEY_HEADER = 'x-api-key';

/**
 * Generate JWT token for a user
 */
export function generateToken(userId: string, email?: string, role: string = 'user'): string {
  const payload = {
    uid: userId,
    email,
    role
  };
  
  const options: jwt.SignOptions = {
    expiresIn: '7d',
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
    subject: userId
  };
  
  return jwt.sign(payload, JWT_SECRET, options);
}

/**
 * Generate API key token
 */
export function generateApiKeyToken(apiKeyId: string, name: string): string {
  const payload = {
    uid: apiKeyId,
    apiKey: true,
    name
  };
  
  const options: jwt.SignOptions = {
    expiresIn: '365d', // API keys have longer expiry
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
    subject: apiKeyId
  };
  
  return jwt.sign(payload, JWT_SECRET, options);
}

/**
 * JWT middleware using express-jwt
 */
export const jwtMiddleware = expressjwt({
  secret: JWT_SECRET,
  algorithms: ['HS256'],
  issuer: JWT_ISSUER,
  audience: JWT_AUDIENCE,
  credentialsRequired: false, // Don't require auth for all routes
  getToken: (req: Request) => {
    // Check Authorization header
    if (req.headers.authorization?.startsWith('Bearer ')) {
      return req.headers.authorization.substring(7);
    }
    
    // Check for API key
    const apiKey = req.headers[API_KEY_HEADER] as string;
    if (apiKey) {
      req.apiKey = apiKey;
      return apiKey;
    }
    
    return undefined;
  }
});

/**
 * Validate API key from database
 */
export async function validateApiKey(req: Request, res: Response, next: NextFunction) {
  try {
    const apiKey = req.headers[API_KEY_HEADER] as string;
    
    if (!apiKey) {
      return next();
    }
    
    // Verify it's a valid JWT
    try {
      const decoded = jwt.verify(apiKey, JWT_SECRET, {
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE
      }) as any;
      
      if (decoded.apiKey) {
        // Check if API key is still valid in database
        // This would require a Firestore query to validate
        req.user = {
          uid: decoded.uid,
          apiKey: true,
          role: 'api'
        };
      }
    } catch (err) {
      logger.warn('Invalid API key provided', { error: err });
    }
    
    next();
  } catch (error) {
    logger.error('Error validating API key:', error);
    next();
  }
}

/**
 * Require authentication middleware
 */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required'
    });
  }
  next();
}

/**
 * Require specific role middleware
 */
export function requireRole(role: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }
    
    if (req.user.role !== role && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Insufficient permissions'
      });
    }
    
    next();
  };
}

/**
 * Require admin role middleware
 */
export const requireAdmin = requireRole('admin');

/**
 * Optional authentication middleware
 * Validates token if present but doesn't require it
 */
export function optionalAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  const apiKey = req.headers[API_KEY_HEADER] as string;
  
  if (!token && !apiKey) {
    return next();
  }
  
  try {
    if (token) {
      const decoded = jwt.verify(token, JWT_SECRET, {
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE
      }) as any;
      
      req.user = {
        uid: decoded.uid,
        email: decoded.email,
        role: decoded.role
      };
    } else if (apiKey) {
      // Handle API key validation
      validateApiKey(req, res, next);
      return;
    }
  } catch (error) {
    logger.warn('Invalid token provided:', error);
  }
  
  next();
}

/**
 * Cloud Scheduler authentication middleware
 */
export function requireSchedulerToken(req: Request, res: Response, next: NextFunction) {
  const token = req.headers['x-scheduler-token'];
  const expectedToken = process.env.SCHEDULER_TOKEN;
  
  if (!expectedToken) {
    logger.error('SCHEDULER_TOKEN not configured');
    return res.status(500).json({
      success: false,
      error: 'Server configuration error'
    });
  }
  
  if (token !== expectedToken) {
    logger.warn('Unauthorized scheduler webhook attempt', {
      ip: req.ip,
      headers: req.headers
    });
    return res.status(401).json({
      success: false,
      error: 'Unauthorized'
    });
  }
  
  next();
}

/**
 * Extract user context from request
 */
export function getUserContext(req: Request) {
  return {
    userId: req.user?.uid,
    email: req.user?.email,
    role: req.user?.role,
    isApiKey: req.user?.apiKey === true,
    ip: req.ip,
    userAgent: req.headers['user-agent']
  };
}