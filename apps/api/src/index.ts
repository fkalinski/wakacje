import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables FIRST before importing any modules that use them
const envPath = path.resolve(__dirname, '../.env');
const result = dotenv.config({ path: envPath });

if (result.error) {
  console.error('Failed to load .env file:', result.error);
  console.error('Looking for .env at:', envPath);
} else {
  console.log('Loaded environment variables from:', envPath);
  console.log('FIREBASE_PROJECT_ID:', process.env.FIREBASE_PROJECT_ID ? 'Set' : 'Not set');
  console.log('FIREBASE_CLIENT_EMAIL:', process.env.FIREBASE_CLIENT_EMAIL ? 'Set' : 'Not set');
  console.log('FIREBASE_PRIVATE_KEY:', process.env.FIREBASE_PRIVATE_KEY ? 'Set (length: ' + process.env.FIREBASE_PRIVATE_KEY.length + ')' : 'Not set');
}

// Fix Firebase private key format immediately after loading env
if (process.env.FIREBASE_PRIVATE_KEY) {
  process.env.FIREBASE_PRIVATE_KEY = process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n');
}

// Initialize Firebase Admin SDK after env vars are loaded
import { initializeFirebaseAdmin } from './config/firebase-admin';
initializeFirebaseAdmin();

// Initialize persistence adapter after env vars are loaded
import { initializePersistence } from './services/persistence';
initializePersistence();

import { logger } from './utils/logger';
import searchesRouter from './routes/searches';
import executeRouter from './routes/execute';
import executionsRouter from './routes/executions';
import webhooksRouter from './routes/webhooks';
import monitoringRouter from './routes/monitoring';
import resultsRouter from './routes/results';
import healthRouter from './routes/health';

// Security middleware
import { security } from './middleware/security';
import { authMiddleware } from './middleware/auth';
import { adaptiveLimiter, requestTracker } from './middleware/rateLimiter';

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

// Global rate limiting (adaptive based on auth status)
app.use('/api', adaptiveLimiter);

// Health check routes (no auth required)
app.use('/health', healthRouter);

// API Routes with authentication
// Protected routes (require Firebase authentication)
app.use('/api/searches', authMiddleware, searchesRouter);
app.use('/api/results', authMiddleware, resultsRouter);
app.use('/api/execute', authMiddleware, executeRouter);
app.use('/api/executions', authMiddleware, executionsRouter);
app.use('/api/monitoring', authMiddleware, monitoringRouter);

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