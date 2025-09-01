import { Request, Response, NextFunction } from 'express';
import { admin, isFirebaseInitialized } from '../config/firebase-admin';
import { logger } from '../utils/logger';

// Whitelisted users - must match web app whitelist
const ALLOWED_USERS = [
  'fkalinski@gmail.com'
  // Add more emails here as needed
];

// Extend Express Request type
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: {
        uid: string;
        email: string;
        emailVerified: boolean;
      };
    }
  }
}

const isUserAllowed = (email: string | undefined): boolean => {
  if (!email) return false;
  return ALLOWED_USERS.includes(email.toLowerCase());
};

/**
 * Firebase Authentication middleware
 * Verifies Firebase ID tokens and enforces whitelist
 */
export const authMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    // Skip auth for health check and scheduler endpoints
    if (req.path === '/health' || req.path === '/api/webhooks/scheduler') {
      return next();
    }

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      logger.warn('Missing or invalid authorization header', {
        path: req.path,
        ip: req.ip
      });
      return res.status(401).json({ 
        success: false,
        error: 'Unauthorized: Missing or invalid token' 
      });
    }

    const token = authHeader.split('Bearer ')[1];
    
    // Check if Firebase is initialized
    if (!isFirebaseInitialized) {
      logger.error('Firebase Admin not initialized - cannot verify tokens');
      return res.status(503).json({ 
        success: false,
        error: 'Authentication service unavailable' 
      });
    }
    
    try {
      // Verify the Firebase ID token
      const decodedToken = await admin.auth().verifyIdToken(token);
      
      // Check if user is whitelisted
      if (!isUserAllowed(decodedToken.email)) {
        logger.warn('Access denied for non-whitelisted user', {
          email: decodedToken.email,
          uid: decodedToken.uid
        });
        return res.status(403).json({ 
          success: false,
          error: 'Access denied: User not authorized',
          email: decodedToken.email 
        });
      }

      // Attach user info to request
      req.user = {
        uid: decodedToken.uid,
        email: decodedToken.email!,
        emailVerified: decodedToken.email_verified || false
      };

      logger.info('User authenticated successfully', {
        email: req.user.email,
        uid: req.user.uid
      });

      next();
    } catch (error: any) {
      logger.error('Token verification failed:', {
        error: error.message,
        code: error.code
      });
      return res.status(401).json({ 
        success: false,
        error: 'Unauthorized: Invalid token' 
      });
    }
  } catch (error) {
    logger.error('Auth middleware error:', error);
    return res.status(500).json({ 
      success: false,
      error: 'Internal server error' 
    });
  }
};

/**
 * Require authentication middleware
 * Use this on routes that require authentication
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
 * Optional authentication middleware
 * Validates token if present but doesn't require it
 */
export const optionalAuth = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(); // No token provided, continue without auth
  }

  const token = authHeader.split('Bearer ')[1];
  
  try {
    const decodedToken = await admin.auth().verifyIdToken(token);
    
    // Check if user is whitelisted
    if (isUserAllowed(decodedToken.email)) {
      req.user = {
        uid: decodedToken.uid,
        email: decodedToken.email!,
        emailVerified: decodedToken.email_verified || false
      };
    }
  } catch (error) {
    logger.warn('Optional auth: Invalid token provided', error);
    // Continue without auth for optional routes
  }
  
  next();
};

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
    emailVerified: req.user?.emailVerified,
    ip: req.ip,
    userAgent: req.headers['user-agent']
  };
}