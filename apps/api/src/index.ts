import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { logger } from './utils/logger';
import searchesRouter from './routes/searches';
import executeRouter from './routes/execute';
import webhooksRouter from './routes/webhooks';
import monitoringRouter from './routes/monitoring';
import resultsRouter from './routes/results';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 8080;

// Middleware
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? ['https://your-app.vercel.app'] // Replace with your Vercel URL
    : ['http://localhost:3000'],
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, _res, next) => {
  logger.info(`${req.method} ${req.path}`, {
    query: req.query,
    body: req.body,
    headers: req.headers
  });
  next();
});

// Routes
app.use('/api/searches', searchesRouter);
app.use('/api/execute', executeRouter);
app.use('/api/webhooks', webhooksRouter);
app.use('/api/monitoring', monitoringRouter);
app.use('/api/results', resultsRouter);

// Health check
app.get('/health', (_req, res) => {
  res.json({ 
    status: 'healthy',
    service: 'holiday-park-api',
    timestamp: new Date().toISOString()
  });
});

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