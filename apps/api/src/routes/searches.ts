import { Router } from 'express';
import { z } from 'zod';
import { persistenceAdapter } from '../services/persistence';
import { Search, ApiResponse } from '@holiday-park/shared';
import { logger } from '../utils/logger';

const router = Router();

// Validation schemas
const createSearchSchema = z.object({
  name: z.string().min(1).max(100),
  enabled: z.boolean().default(true),
  dateRanges: z.array(z.object({
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
  })).min(1),
  stayLengths: z.array(z.number().min(1).max(21)).min(1),
  resorts: z.array(z.number()).default([]),
  accommodationTypes: z.array(z.number()).default([]),
  schedule: z.object({
    frequency: z.enum(['every_30_min', 'hourly', 'every_2_hours', 'every_4_hours', 'daily']),
    customCron: z.string().optional()
  }),
  notifications: z.object({
    email: z.string().email(),
    onlyChanges: z.boolean().default(true)
  })
});

const updateSearchSchema = createSearchSchema.partial();

// Get all searches
router.get('/', async (req, res) => {
  try {
    if (!persistenceAdapter) {
      return res.status(503).json({
        success: false,
        error: 'Persistence layer not available'
      });
    }
    
    const enabled = req.query.enabled === 'true' ? true : 
                   req.query.enabled === 'false' ? false : undefined;
    
    const searches = await persistenceAdapter.getAllSearches(enabled);
    
    const response: ApiResponse<Search[]> = {
      success: true,
      data: searches
    };
    
    res.json(response);
  } catch (error) {
    logger.error('Failed to get searches:', error);
    const response: ApiResponse<null> = {
      success: false,
      error: 'Failed to get searches'
    };
    res.status(500).json(response);
  }
});

// Get single search
router.get('/:id', async (req, res) => {
  try {
    const search = await persistenceAdapter.getSearch(req.params.id);
    
    if (!search) {
      const response: ApiResponse<null> = {
        success: false,
        error: 'Search not found'
      };
      return res.status(404).json(response);
    }
    
    const response: ApiResponse<Search> = {
      success: true,
      data: search
    };
    
    res.json(response);
  } catch (error) {
    logger.error('Failed to get search:', error);
    const response: ApiResponse<null> = {
      success: false,
      error: 'Failed to get search'
    };
    res.status(500).json(response);
  }
});

// Create new search
router.post('/', async (req, res) => {
  try {
    const validatedData = createSearchSchema.parse(req.body);
    
    // Calculate next run time based on frequency
    const nextRun = calculateNextRun(validatedData.schedule.frequency);
    
    const searchData = {
      ...validatedData,
      schedule: {
        ...validatedData.schedule,
        lastRun: null,
        nextRun
      }
    };
    
    const searchId = await persistenceAdapter.createSearch(searchData);
    const search = await persistenceAdapter.getSearch(searchId);
    
    const response: ApiResponse<Search> = {
      success: true,
      data: search!
    };
    
    res.status(201).json(response);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const response: ApiResponse<null> = {
        success: false,
        error: 'Invalid request data',
        details: error.errors
      };
      return res.status(400).json(response);
    }
    
    logger.error('Failed to create search:', error);
    const response: ApiResponse<null> = {
      success: false,
      error: 'Failed to create search'
    };
    res.status(500).json(response);
  }
});

// Update search
router.put('/:id', async (req, res) => {
  try {
    const validatedData = updateSearchSchema.parse(req.body);
    
    const existing = await persistenceAdapter.getSearch(req.params.id);
    if (!existing) {
      const response: ApiResponse<null> = {
        success: false,
        error: 'Search not found'
      };
      return res.status(404).json(response);
    }
    
    // If schedule frequency changed, update next run
    const updates: any = { ...validatedData };
    if (validatedData.schedule?.frequency) {
      updates.schedule = {
        ...existing.schedule,
        ...validatedData.schedule,
        nextRun: calculateNextRun(validatedData.schedule.frequency)
      };
    }
    
    await persistenceAdapter.updateSearch(req.params.id, updates);
    const updated = await persistenceAdapter.getSearch(req.params.id);
    
    const response: ApiResponse<Search> = {
      success: true,
      data: updated!
    };
    
    res.json(response);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const response: ApiResponse<null> = {
        success: false,
        error: 'Invalid request data',
        details: error.errors
      };
      return res.status(400).json(response);
    }
    
    logger.error('Failed to update search:', error);
    const response: ApiResponse<null> = {
      success: false,
      error: 'Failed to update search'
    };
    res.status(500).json(response);
  }
});

// Delete search
router.delete('/:id', async (req, res) => {
  try {
    const existing = await persistenceAdapter.getSearch(req.params.id);
    if (!existing) {
      const response: ApiResponse<null> = {
        success: false,
        error: 'Search not found'
      };
      return res.status(404).json(response);
    }
    
    await persistenceAdapter.deleteSearch(req.params.id);
    
    const response: ApiResponse<{ message: string }> = {
      success: true,
      data: { message: 'Search deleted successfully' }
    };
    
    res.json(response);
  } catch (error) {
    logger.error('Failed to delete search:', error);
    const response: ApiResponse<null> = {
      success: false,
      error: 'Failed to delete search'
    };
    res.status(500).json(response);
  }
});

// Get search results
router.get('/:id/results', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 10;
    const results = await persistenceAdapter.getSearchResults(req.params.id, limit);
    
    const response: ApiResponse<any[]> = {
      success: true,
      data: results
    };
    
    res.json(response);
  } catch (error) {
    logger.error('Failed to get search results:', error);
    const response: ApiResponse<null> = {
      success: false,
      error: 'Failed to get search results'
    };
    res.status(500).json(response);
  }
});

// Helper function to calculate next run time
function calculateNextRun(frequency: string): Date {
  const now = new Date();
  const next = new Date(now);

  switch (frequency) {
    case 'every_30_min':
      next.setMinutes(next.getMinutes() + 30);
      break;
    case 'hourly':
      next.setHours(next.getHours() + 1);
      next.setMinutes(0);
      break;
    case 'every_2_hours':
      next.setHours(next.getHours() + 2);
      next.setMinutes(0);
      break;
    case 'every_4_hours':
      next.setHours(next.getHours() + 4);
      next.setMinutes(0);
      break;
    case 'daily':
      next.setDate(next.getDate() + 1);
      next.setHours(9, 0, 0, 0);
      break;
    default:
      next.setHours(next.getHours() + 1);
  }

  return next;
}

export default router;