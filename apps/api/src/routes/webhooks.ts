import { Router } from 'express';
import { searchExecutor } from '../services/search-executor';
import { ApiResponse } from '@holiday-park/shared';
import { logger } from '../utils/logger';

const router = Router();

// Cloud Scheduler webhook
router.post('/scheduler', async (req, res) => {
  try {
    // Verify the request is from Cloud Scheduler
    const token = req.headers['x-scheduler-token'];
    if (token !== process.env.SCHEDULER_SECRET) {
      logger.warn('Unauthorized scheduler webhook attempt');
      const response: ApiResponse<null> = {
        success: false,
        error: 'Unauthorized'
      };
      return res.status(401).json(response);
    }
    
    // Check if specific search ID is provided
    const searchId = req.body.searchId || req.query.searchId;
    
    if (searchId) {
      // Execute specific search
      searchExecutor.executeSearch(searchId as string)
        .then(result => {
          logger.info(`Scheduled search ${searchId} executed successfully`);
        })
        .catch(error => {
          logger.error(`Scheduled search ${searchId} execution failed:`, error);
        });
    } else {
      // Execute all due searches
      searchExecutor.executeAllDueSearches()
        .then(() => {
          logger.info('All scheduled searches executed successfully');
        })
        .catch(error => {
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
router.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

export default router;