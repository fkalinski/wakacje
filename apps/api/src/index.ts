import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { logger } from './utils/logger';
import searchesRouter from './routes/searches';
import executeRouter from './routes/execute';
import webhooksRouter from './routes/webhooks';
import monitoringRouter from './routes/monitoring';
import resultsRouter from './routes/results';
import healthRouter from './routes/health';

// Security middleware
import { security } from './middleware/security';
import { jwtMiddleware, validateApiKey, requireAuth, optionalAuth } from './middleware/auth';
import { adaptiveLimiter, requestTracker } from './middleware/rateLimiter';

// Load environment variables
dotenv.config();

// Fix Firebase private key format from Secret Manager
// Secret Manager stores newlines as literal \n, we need actual newlines
if (process.env.FIREBASE_PRIVATE_KEY) {
  process.env.FIREBASE_PRIVATE_KEY = process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n');
}

const app = express();
const PORT = process.env.PORT || 8080;

// Trust proxy (important for rate limiting and IP detection in production)
app.set('trust proxy', true);

// Apply security middleware first
app.use(security());

// CORS configuration
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? process.env.CORS_ORIGIN?.split(',') || ['https://your-app.vercel.app']
    : ['http://localhost:3000', 'http://localhost:3001'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key', 'x-correlation-id', 'x-scheduler-token'],
  exposedHeaders: ['x-correlation-id', 'RateLimit-Limit', 'RateLimit-Remaining', 'RateLimit-Reset']
}));

// Body parsing middleware with size limits
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request tracking and logging
app.use(requestTracker);

// JWT and API key authentication middleware (applied to all routes)
app.use(jwtMiddleware);
app.use(validateApiKey);

// Global rate limiting (adaptive based on auth status)
app.use('/api', adaptiveLimiter);

// Health check routes (no auth required)
app.use('/health', healthRouter);

// API Routes with authentication
// Public routes (optional auth - enhanced features with auth)
app.use('/api/searches', optionalAuth, searchesRouter);
app.use('/api/results', optionalAuth, resultsRouter);

// Protected routes (require authentication)
app.use('/api/execute', optionalAuth, executeRouter);  // Changed to optional auth - will validate ownership in route
app.use('/api/monitoring', requireAuth, monitoringRouter);

// Webhook routes (special authentication - uses scheduler token)
app.use('/api/webhooks', webhooksRouter); // Has its own auth middleware

// Root endpoint
app.get('/', (_req, res) => {
  res.json({
    name: 'Holiday Park Monitor API',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      searches: '/api/searches',
      execute: '/api/execute',
      webhooks: '/api/webhooks'
    }
  });
});

// Error handling
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    error: 'Internal server error'
  });
});

// 404 handler
app.use((_req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found'
  });
});

// Start server
app.listen(PORT, () => {
  logger.info(`Server is running on port ${PORT}`);
  logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
});