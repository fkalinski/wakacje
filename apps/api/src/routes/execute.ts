import { Router } from 'express';
import { searchExecutorService } from '../services/search-executor';
import { ApiResponse } from '@holiday-park/shared';
import { logger } from '../utils/logger';

const router = Router();

// Execute single search
router.post('/:id', async (req, res) => {
  try {
    // Start execution in background and return immediately
    searchExecutorService.executeSearch(req.params.id)
      .then(() => {
        logger.info(`Search ${req.params.id} executed successfully`);
      })
      .catch(error => {
        logger.error(`Search ${req.params.id} execution failed:`, error);
      });
    
    const response: ApiResponse<{ message: string }> = {
      success: true,
      data: { message: 'Search execution started' }
    };
    
    res.json(response);
  } catch (error) {
    logger.error(`Failed to start search execution ${req.params.id}:`, error);
    const response: ApiResponse<null> = {
      success: false,
      error: 'Failed to start search execution'
    };
    res.status(500).json(response);
  }
});

// Execute all due searches (for manual trigger)
router.post('/', async (_req, res) => {
  try {
    // Start execution in background
    searchExecutorService.executeAllDueSearches()
      .then(() => {
        logger.info('All due searches executed successfully');
      })
      .catch(error => {
        logger.error('Failed to execute all due searches:', error);
      });
    
    const response: ApiResponse<{ message: string }> = {
      success: true,
      data: { message: 'Execution of all due searches started' }
    };
    
    res.json(response);
  } catch (error) {
    logger.error('Failed to start execution of all due searches:', error);
    const response: ApiResponse<null> = {
      success: false,
      error: 'Failed to start execution'
    };
    res.status(500).json(response);
  }
});

export default router;