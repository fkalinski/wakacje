import { Router } from 'express';
import { persistenceAdapter } from '../services/persistence';
import { ApiResponse, IQueryOptions } from '@holiday-park/shared';
import { logger } from '../utils/logger';

const router = Router();

// Parse query parameters to IQueryOptions
function parseQueryOptions(query: any): IQueryOptions {
  const options: IQueryOptions = {};
  
  if (query.searchId) options.searchId = query.searchId;
  if (query.searchIds) options.searchIds = Array.isArray(query.searchIds) ? query.searchIds : [query.searchIds];
  
  if (query.dateFrom && query.dateTo) {
    options.dateRange = {
      from: query.dateFrom,
      to: query.dateTo
    };
  }
  
  if (query.resorts) {
    options.resorts = (Array.isArray(query.resorts) ? query.resorts : query.resorts.split(','))
      .map((r: string) => parseInt(r));
  }
  
  if (query.accommodationTypes) {
    options.accommodationTypes = (Array.isArray(query.accommodationTypes) ? query.accommodationTypes : query.accommodationTypes.split(','))
      .map((t: string) => parseInt(t));
  }
  
  if (query.priceMin !== undefined || query.priceMax !== undefined) {
    options.priceRange = {};
    if (query.priceMin !== undefined) options.priceRange.min = parseFloat(query.priceMin);
    if (query.priceMax !== undefined) options.priceRange.max = parseFloat(query.priceMax);
  }
  
  if (query.stayLengths) {
    options.stayLengths = (Array.isArray(query.stayLengths) ? query.stayLengths : query.stayLengths.split(','))
      .map((n: string) => parseInt(n));
  }
  
  if (query.sortBy) options.sortBy = query.sortBy;
  if (query.sortOrder) options.sortOrder = query.sortOrder;
  if (query.limit !== undefined) options.limit = parseInt(query.limit);
  if (query.offset !== undefined) options.offset = parseInt(query.offset);
  if (query.onlyNew !== undefined) options.onlyNew = query.onlyNew === 'true';
  if (query.onlyRemoved !== undefined) options.onlyRemoved = query.onlyRemoved === 'true';
  if (query.includeRemoved !== undefined) options.includeRemoved = query.includeRemoved === 'true';
  
  return options;
}

// Query all results with filters
router.get('/', async (req, res) => {
  try {
    if (!persistenceAdapter) {
      return res.status(503).json({
        success: false,
        error: 'Persistence layer not available'
      });
    }
    
    const options = parseQueryOptions(req.query);
    const results = await persistenceAdapter.getResultsWithFilters(options);
    
    const response: ApiResponse<typeof results> = {
      success: true,
      data: results
    };
    
    res.json(response);
  } catch (error) {
    logger.error('Failed to get results:', error);
    const response: ApiResponse<null> = {
      success: false,
      error: 'Failed to get results'
    };
    res.status(500).json(response);
  }
});

// Query availabilities
router.get('/availabilities', async (req, res) => {
  try {
    if (!persistenceAdapter) {
      return res.status(503).json({
        success: false,
        error: 'Persistence layer not available'
      });
    }
    
    const options = parseQueryOptions(req.query);
    const availabilities = await persistenceAdapter.queryAvailabilities(options);
    
    const response: ApiResponse<typeof availabilities> = {
      success: true,
      data: availabilities
    };
    
    res.json(response);
  } catch (error) {
    logger.error('Failed to query availabilities:', error);
    const response: ApiResponse<null> = {
      success: false,
      error: 'Failed to query availabilities'
    };
    res.status(500).json(response);
  }
});

// Get statistics
router.get('/stats', async (req, res) => {
  try {
    if (!persistenceAdapter) {
      return res.status(503).json({
        success: false,
        error: 'Persistence layer not available'
      });
    }
    
    const options = req.query.searchId || req.query.dateFrom || req.query.dateTo
      ? parseQueryOptions(req.query)
      : undefined;
    
    const stats = await persistenceAdapter.getResultsStatistics(options);
    
    const response: ApiResponse<typeof stats> = {
      success: true,
      data: stats
    };
    
    res.json(response);
  } catch (error) {
    logger.error('Failed to get statistics:', error);
    const response: ApiResponse<null> = {
      success: false,
      error: 'Failed to get statistics'
    };
    res.status(500).json(response);
  }
});

// Export results
router.get('/export', async (req, res) => {
  try {
    if (!persistenceAdapter) {
      return res.status(503).json({
        success: false,
        error: 'Persistence layer not available'
      });
    }
    
    const format = (req.query.format as string) || 'csv';
    if (!['csv', 'json'].includes(format)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid format. Use csv or json'
      });
    }
    
    const options = parseQueryOptions(req.query);
    const exportData = await persistenceAdapter.exportResults(format as 'csv' | 'json', options);
    
    // Set appropriate headers for download
    const contentType = format === 'csv' ? 'text/csv' : 'application/json';
    const fileName = `holiday-park-results-${new Date().toISOString().split('T')[0]}.${format}`;
    
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(exportData);
  } catch (error) {
    logger.error('Failed to export results:', error);
    const response: ApiResponse<null> = {
      success: false,
      error: 'Failed to export results'
    };
    res.status(500).json(response);
  }
});

// Get filter options
router.get('/filters', async (req, res) => {
  try {
    if (!persistenceAdapter) {
      return res.status(503).json({
        success: false,
        error: 'Persistence layer not available'
      });
    }
    
    const searchId = req.query.searchId as string | undefined;
    
    const [resorts, accommodationTypes, stayLengths, dateRange] = await Promise.all([
      persistenceAdapter.getUniqueResorts(searchId),
      persistenceAdapter.getUniqueAccommodationTypes(searchId),
      persistenceAdapter.getUniqueStayLengths(searchId),
      persistenceAdapter.getDateRange(searchId)
    ]);
    
    const response: ApiResponse<{
      resorts: typeof resorts;
      accommodationTypes: typeof accommodationTypes;
      stayLengths: typeof stayLengths;
      dateRange: typeof dateRange;
    }> = {
      success: true,
      data: {
        resorts,
        accommodationTypes,
        stayLengths,
        dateRange
      }
    };
    
    res.json(response);
  } catch (error) {
    logger.error('Failed to get filter options:', error);
    const response: ApiResponse<null> = {
      success: false,
      error: 'Failed to get filter options'
    };
    res.status(500).json(response);
  }
});

// Get results for a specific search
router.get('/search/:searchId', async (req, res) => {
  try {
    if (!persistenceAdapter) {
      return res.status(503).json({
        success: false,
        error: 'Persistence layer not available'
      });
    }
    
    const options = parseQueryOptions({ ...req.query, searchId: req.params.searchId });
    const results = await persistenceAdapter.getResultsWithFilters(options);
    
    const response: ApiResponse<typeof results> = {
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

// Get availabilities for a specific search
router.get('/search/:searchId/availabilities', async (req, res) => {
  try {
    if (!persistenceAdapter) {
      return res.status(503).json({
        success: false,
        error: 'Persistence layer not available'
      });
    }
    
    const options = parseQueryOptions({ ...req.query, searchId: req.params.searchId });
    const availabilities = await persistenceAdapter.queryAvailabilities(options);
    
    const response: ApiResponse<typeof availabilities> = {
      success: true,
      data: availabilities
    };
    
    res.json(response);
  } catch (error) {
    logger.error('Failed to get search availabilities:', error);
    const response: ApiResponse<null> = {
      success: false,
      error: 'Failed to get search availabilities'
    };
    res.status(500).json(response);
  }
});

export default router;