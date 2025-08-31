import { Router } from 'express';
import { searchExecutorService } from '../services/search-executor';
import { ApiResponse } from '@holiday-park/shared';
import { logger } from '../utils/logger';
import { requireSchedulerToken } from '../middleware/auth';
import { strictLimiter } from '../middleware/rateLimiter';

const router = Router();

// Cloud Scheduler webhook with authentication and rate limiting
router.post('/scheduler', strictLimiter, requireSchedulerToken, async (req, res) => {
  try {
    
    // Check if specific search ID is provided
    const searchId = req.body.searchId || req.query.searchId;
    
    if (searchId) {
      // Execute specific search
      searchExecutorService.executeSearch(searchId as string)
        .then(() => {
          logger.info(`Scheduled search ${searchId} executed successfully`);
        })
        .catch((error: any) => {
          logger.error(`Scheduled search ${searchId} execution failed:`, error);
        });
    } else {
      // Execute all due searches
      searchExecutorService.executeAllDueSearches()
        .then(() => {
          logger.info('All scheduled searches executed successfully');
        })
        .catch((error: any) => {
          logger.error('Failed to execute scheduled searches:', error);
        });
    }
    
    const response: ApiResponse<{ message: string }> = {
      success: true,
      data: { message: 'Scheduled execution started' }
    };
    
    res.json(response);
  } catch (error) {
    logger.error('Failed to handle scheduler webhook:', error);
    const response: ApiResponse<null> = {
      success: false,
      error: 'Failed to process webhook'
    };
    res.status(500).json(response);
  }
});

// Health check for Cloud Run
router.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

export default router;