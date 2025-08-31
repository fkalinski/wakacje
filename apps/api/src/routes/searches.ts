import { Router } from 'express';
import { z } from 'zod';
import { firebaseService } from '../services/firebase-admin';
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
    const enabled = req.query.enabled === 'true' ? true : 
                   req.query.enabled === 'false' ? false : undefined;
    
    const searches = await firebaseService.getAllSearches(enabled);
    
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
    const search = await firebaseService.getSearch(req.params.id);
    
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
    logger.error(`Failed to get search ${req.params.id}:`, error);
    const response: ApiResponse<null> = {
      success: false,
      error: 'Failed to get search'
    };
    res.status(500).json(response);
  }
});

// Create search
router.post('/', async (req, res) => {
  try {
    const validatedData = createSearchSchema.parse(req.body);
    
    // Calculate initial next run
    const nextRun = calculateInitialNextRun(validatedData.schedule.frequency);
    
    const searchId = await firebaseService.createSearch({
      ...validatedData,
      schedule: {
        ...validatedData.schedule,
        lastRun: null,
        nextRun
      }
    });
    
    const response: ApiResponse<{ id: string }> = {
      success: true,
      data: { id: searchId }
    };
    
    res.status(201).json(response);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const response: ApiResponse<null> = {
        success: false,
        error: `Validation error: ${error.errors.map(e => e.message).join(', ')}`
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
    
    // If schedule frequency changed, recalculate next run
    if (validatedData.schedule?.frequency) {
      validatedData.schedule.nextRun = calculateInitialNextRun(validatedData.schedule.frequency);
    }
    
    await firebaseService.updateSearch(req.params.id, validatedData);
    
    const response: ApiResponse<null> = {
      success: true
    };
    
    res.json(response);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const response: ApiResponse<null> = {
        success: false,
        error: `Validation error: ${error.errors.map(e => e.message).join(', ')}`
      };
      return res.status(400).json(response);
    }
    
    logger.error(`Failed to update search ${req.params.id}:`, error);
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
    await firebaseService.deleteSearch(req.params.id);
    
    const response: ApiResponse<null> = {
      success: true
    };
    
    res.json(response);
  } catch (error) {
    logger.error(`Failed to delete search ${req.params.id}:`, error);
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
    const results = await firebaseService.getSearchResults(req.params.id, limit);
    
    const response: ApiResponse<any> = {
      success: true,
      data: results
    };
    
    res.json(response);
  } catch (error) {
    logger.error(`Failed to get results for search ${req.params.id}:`, error);
    const response: ApiResponse<null> = {
      success: false,
      error: 'Failed to get search results'
    };
    res.status(500).json(response);
  }
});

function calculateInitialNextRun(frequency: string): Date {
  const now = new Date();
  const next = new Date(now);
  
  // Start immediately for first run
  switch (frequency) {
    case 'every_30_min':
      next.setMinutes(next.getMinutes() + 1);
      break;
    case 'hourly':
      next.setMinutes(next.getMinutes() + 1);
      break;
    case 'every_2_hours':
      next.setMinutes(next.getMinutes() + 1);
      break;
    case 'every_4_hours':
      next.setMinutes(next.getMinutes() + 1);
      break;
    case 'daily':
      next.setMinutes(next.getMinutes() + 1);
      break;
    default:
      next.setMinutes(next.getMinutes() + 1);
  }
  
  return next;
}

export default router;