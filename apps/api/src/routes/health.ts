import { Router, Request, Response } from 'express';
import { logger } from '../utils/logger';
import { persistenceAdapter } from '../services/persistence';
import { healthCheckLimiter } from '../middleware/rateLimiter';
import os from 'os';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const router = Router();

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number;
  service: string;
  version: string;
  environment: string;
  dependencies: {
    firebase: {
      status: 'connected' | 'disconnected' | 'error';
      latency?: number;
      error?: string;
    };
    memory: {
      used: number;
      total: number;
      percentage: number;
    };
    cpu: {
      load: number[];
      cores: number;
    };
  };
  metrics?: {
    requestsPerMinute?: number;
    averageResponseTime?: number;
    errorRate?: number;
  };
}

/**
 * Simple health check endpoint
 */
router.get('/', healthCheckLimiter, (_req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    service: 'holiday-park-api',
    timestamp: new Date().toISOString()
  });
});

/**
 * Detailed health check endpoint with dependency checks
 */
router.get('/detailed', healthCheckLimiter, async (req: Request, res: Response) => {
  const startTime = Date.now();
  
  try {
    const health: HealthStatus = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      service: 'holiday-park-api',
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      dependencies: {
        firebase: {
          status: 'disconnected'
        },
        memory: getMemoryStatus(),
        cpu: getCpuStatus()
      }
    };
    
    // Check Firebase/Firestore connectivity
    try {
      const firebaseStart = Date.now();
      
      if (persistenceAdapter) {
        // Try a simple read operation
        const testCollection = getFirestore().collection('_health_check');
        await testCollection.doc('test').get();
        
        health.dependencies.firebase = {
          status: 'connected',
          latency: Date.now() - firebaseStart
        };
      }
    } catch (error: any) {
      health.dependencies.firebase = {
        status: 'error',
        error: error.message
      };
      health.status = 'degraded';
      logger.error('Firebase health check failed:', error);
    }
    
    // Add metrics if available
    if (req.query.includeMetrics === 'true') {
      health.metrics = await getMetrics();
    }
    
    // Determine overall health status
    if (health.dependencies.firebase.status === 'error') {
      health.status = 'degraded';
    }
    
    // Check memory usage
    if (health.dependencies.memory.percentage > 90) {
      health.status = 'unhealthy';
      logger.warn('High memory usage detected', health.dependencies.memory);
    } else if (health.dependencies.memory.percentage > 75) {
      health.status = 'degraded';
    }
    
    // Set appropriate status code
    const statusCode = health.status === 'healthy' ? 200 :
                       health.status === 'degraded' ? 200 : // Still return 200 for degraded
                       503; // Service unavailable for unhealthy
    
    res.status(statusCode).json(health);
    
  } catch (error) {
    logger.error('Health check failed:', error);
    res.status(503).json({
      status: 'unhealthy',
      error: 'Health check failed',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Liveness probe for Kubernetes/Cloud Run
 */
router.get('/live', healthCheckLimiter, (_req: Request, res: Response) => {
  // Simple check that the service is running
  res.status(200).json({
    alive: true,
    timestamp: new Date().toISOString()
  });
});

/**
 * Readiness probe for Kubernetes/Cloud Run
 */
router.get('/ready', healthCheckLimiter, async (_req: Request, res: Response) => {
  try {
    // Check if critical dependencies are ready
    let isReady = true;
    const checks: any = {
      timestamp: new Date().toISOString()
    };
    
    // Check Firebase connection
    try {
      if (persistenceAdapter) {
        const testCollection = getFirestore().collection('_health_check');
        await testCollection.doc('test').get();
        checks.firebase = 'ready';
      } else {
        checks.firebase = 'not initialized';
        isReady = false;
      }
    } catch (error) {
      checks.firebase = 'not ready';
      isReady = false;
    }
    
    // Check if the service has been up for at least 10 seconds
    // This prevents the service from being marked as ready too quickly
    if (process.uptime() < 10) {
      checks.uptime = 'warming up';
      isReady = false;
    } else {
      checks.uptime = 'ready';
    }
    
    if (isReady) {
      res.status(200).json({
        ready: true,
        ...checks
      });
    } else {
      res.status(503).json({
        ready: false,
        ...checks
      });
    }
  } catch (error) {
    logger.error('Readiness check failed:', error);
    res.status(503).json({
      ready: false,
      error: 'Readiness check failed',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Metrics endpoint for monitoring
 */
router.get('/metrics', healthCheckLimiter, async (_req: Request, res: Response) => {
  try {
    const metrics = {
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: getMemoryStatus(),
      cpu: getCpuStatus(),
      process: {
        pid: process.pid,
        version: process.version,
        platform: process.platform,
        arch: process.arch
      },
      system: {
        hostname: os.hostname(),
        type: os.type(),
        release: os.release(),
        totalMemory: os.totalmem(),
        freeMemory: os.freemem(),
        loadAverage: os.loadavg()
      },
      custom: await getMetrics()
    };
    
    res.json(metrics);
  } catch (error) {
    logger.error('Failed to get metrics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve metrics'
    });
  }
});

/**
 * Get memory status
 */
function getMemoryStatus() {
  const used = process.memoryUsage();
  const total = os.totalmem();
  const free = os.freemem();
  const usedPercentage = ((total - free) / total) * 100;
  
  return {
    used: used.heapUsed,
    total: used.heapTotal,
    percentage: Math.round((used.heapUsed / used.heapTotal) * 100),
    system: {
      total,
      free,
      used: total - free,
      percentage: Math.round(usedPercentage)
    }
  };
}

/**
 * Get CPU status
 */
function getCpuStatus() {
  return {
    load: os.loadavg(),
    cores: os.cpus().length,
    model: os.cpus()[0]?.model || 'unknown'
  };
}

/**
 * Get application metrics
 */
async function getMetrics() {
  // This would typically connect to a metrics service
  // For now, return placeholder metrics
  return {
    requestsPerMinute: 0,
    averageResponseTime: 0,
    errorRate: 0,
    activeConnections: 0,
    queuedRequests: 0
  };
}

export default router;