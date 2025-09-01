import { Router } from 'express';
import { searchExecutorService } from '../services/search-executor';
import { persistenceAdapter } from '../services/persistence';
import { ApiResponse } from '@holiday-park/shared';
import { logger } from '../utils/logger';

const router = Router();

// Execute single search
router.post('/:id', async (req, res) => {
  try {
    const searchId = req.params.id;
    
    // Check if search exists
    const search = await persistenceAdapter.getSearch(searchId);
    if (!search) {
      const response: ApiResponse<null> = {
        success: false,
        error: 'Search not found'
      };
      return res.status(404).json(response);
    }
    
    // If auth is provided, validate ownership (optional for now during testing)
    // In production, you might want to make this required
    if (req.user && search.userId && search.userId !== req.user.uid) {
      const response: ApiResponse<null> = {
        success: false,
        error: 'Unauthorized to execute this search'
      };
      return res.status(403).json(response);
    }
    
    // Start execution in background and return immediately
    searchExecutorService.executeSearch(searchId)
      .then(() => {
        logger.info(`Search ${searchId} executed successfully`);
      })
      .catch(error => {
        logger.error(`Search ${searchId} execution failed:`, error);
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