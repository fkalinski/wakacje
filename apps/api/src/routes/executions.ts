import { Router } from 'express';
import { createSession, createChannel, type Session } from 'better-sse';
import { getPersistenceAdapter } from '../services/persistence';
import { ApiResponse, SearchExecution } from '@holiday-park/shared';
import { logger } from '../utils/logger';

const router = Router();

// Channel for broadcasting execution updates
const executionChannel = createChannel();

// Map to track active executions and their abort controllers
const activeExecutions = new Map<string, AbortController>();

// Map to track SSE sessions by execution ID
const executionSessions = new Map<string, Set<Session>>();

// Map to store execution history in memory (temporary solution)
const executionHistory = new Map<string, SearchExecution[]>();

// Get all executions for the current user
router.get('/', async (req, res) => {
  try {
    const { searchId, status, limit = 50 } = req.query;
    const persistenceAdapter = getPersistenceAdapter();
    
    if (!persistenceAdapter) {
      return res.status(503).json({
        success: false,
        error: 'Persistence layer not available'
      });
    }

    // Get user's searches
    const searches = await persistenceAdapter.getAllSearches();
    const userSearches = searches.filter(s => s.userId === req.user?.email);
    
    // Collect all executions for user's searches
    let allExecutions: SearchExecution[] = [];
    for (const search of userSearches) {
      if (search.id) {
        const searchExecutions = executionHistory.get(search.id) || [];
        allExecutions = allExecutions.concat(searchExecutions);
      }
    }

    // Apply filters
    if (searchId) {
      allExecutions = allExecutions.filter(e => e.searchId === searchId);
    }
    if (status) {
      allExecutions = allExecutions.filter(e => e.status === status);
    }

    // Sort by start time (most recent first) and limit
    allExecutions.sort((a, b) => 
      new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
    );
    allExecutions = allExecutions.slice(0, Number(limit));

    const response: ApiResponse<SearchExecution[]> = {
      success: true,
      data: allExecutions
    };

    res.json(response);
  } catch (error) {
    logger.error('Failed to get executions:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get executions'
    });
  }
});

// Get specific execution details
router.get('/:id', async (req, res) => {
  try {
    const executionId = req.params.id;
    const persistenceAdapter = getPersistenceAdapter();
    
    if (!persistenceAdapter) {
      return res.status(503).json({
        success: false,
        error: 'Persistence layer not available'
      });
    }

    // Try to get from persistence adapter
    const execution = await persistenceAdapter.getExecution(executionId);
    
    if (!execution) {
      return res.status(404).json({
        success: false,
        error: 'Execution not found'
      });
    }

    // Verify ownership
    const search = await persistenceAdapter.getSearch(execution.searchId);
    if (search?.userId && search.userId !== req.user?.email) {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized'
      });
    }

    const response: ApiResponse<SearchExecution> = {
      success: true,
      data: execution
    };

    res.json(response);
  } catch (error) {
    logger.error(`Failed to get execution ${req.params.id}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to get execution'
    });
  }
});

// SSE endpoint for real-time execution updates
router.get('/:id/stream', async (req, res) => {
  try {
    const executionId = req.params.id;
    const persistenceAdapter = getPersistenceAdapter();
    
    if (!persistenceAdapter) {
      return res.status(503).json({
        success: false,
        error: 'Persistence layer not available'
      });
    }

    const execution = await persistenceAdapter.getExecution(executionId);
    
    if (!execution) {
      return res.status(404).json({
        success: false,
        error: 'Execution not found'
      });
    }

    // Verify ownership
    const search = await persistenceAdapter.getSearch(execution.searchId);
    if (search?.userId && search.userId !== req.user?.email) {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized'
      });
    }

    // Create SSE session
    const session = await createSession(req, res, {
      keepAlive: 10000 // Send keep-alive every 10 seconds
    });

    // Track session for this execution
    if (!executionSessions.has(executionId)) {
      executionSessions.set(executionId, new Set());
    }
    executionSessions.get(executionId)!.add(session);

    // Send initial execution state
    session.push(execution, 'execution-status');

    // Clean up on disconnect
    session.on('disconnected', () => {
      const sessions = executionSessions.get(executionId);
      if (sessions) {
        sessions.delete(session);
        if (sessions.size === 0) {
          executionSessions.delete(executionId);
        }
      }
    });

    // Register with execution channel for updates
    executionChannel.register(session);
    
  } catch (error) {
    logger.error(`Failed to create SSE stream for execution ${req.params.id}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to create stream'
    });
  }
});

// Cancel a running execution
router.delete('/:id', async (req, res) => {
  try {
    const executionId = req.params.id;
    const persistenceAdapter = getPersistenceAdapter();
    
    if (!persistenceAdapter) {
      return res.status(503).json({
        success: false,
        error: 'Persistence layer not available'
      });
    }

    const execution = await persistenceAdapter.getExecution(executionId);
    
    if (!execution) {
      return res.status(404).json({
        success: false,
        error: 'Execution not found'
      });
    }

    // Verify ownership
    const search = await persistenceAdapter.getSearch(execution.searchId);
    if (search?.userId && search.userId !== req.user?.email) {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized'
      });
    }

    // Check if execution is running
    if (execution.status !== 'running') {
      return res.status(400).json({
        success: false,
        error: 'Execution is not running'
      });
    }

    // Cancel the execution
    const controller = activeExecutions.get(executionId);
    if (controller) {
      controller.abort();
      activeExecutions.delete(executionId);
    }

    // Update execution status
    await persistenceAdapter.updateExecution(executionId, {
      status: 'cancelled' as const,
      completedAt: new Date(),
      error: 'Cancelled by user'
    });

    // Notify SSE clients
    broadcastExecutionUpdate(executionId, {
      ...execution,
      status: 'cancelled' as const,
      completedAt: new Date(),
      error: 'Cancelled by user'
    });

    const response: ApiResponse<{ message: string }> = {
      success: true,
      data: { message: 'Execution cancelled' }
    };

    res.json(response);
  } catch (error) {
    logger.error(`Failed to cancel execution ${req.params.id}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to cancel execution'
    });
  }
});

// Get execution history for a specific search
router.get('/search/:searchId', async (req, res) => {
  try {
    const { searchId } = req.params;
    const { limit = 10 } = req.query;
    const persistenceAdapter = getPersistenceAdapter();
    
    if (!persistenceAdapter) {
      return res.status(503).json({
        success: false,
        error: 'Persistence layer not available'
      });
    }

    // Verify search ownership
    const search = await persistenceAdapter.getSearch(searchId);
    if (!search) {
      return res.status(404).json({
        success: false,
        error: 'Search not found'
      });
    }

    if (search.userId && search.userId !== req.user?.email) {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized'
      });
    }

    // Get executions from memory
    const searchExecutions = executionHistory.get(searchId) || [];
    
    // Sort by start time (most recent first) and limit
    const results = searchExecutions
      .sort((a, b) => 
        new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
      )
      .slice(0, Number(limit));

    const response: ApiResponse<SearchExecution[]> = {
      success: true,
      data: results
    };

    res.json(response);
  } catch (error) {
    logger.error(`Failed to get execution history for search ${req.params.searchId}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to get execution history'
    });
  }
});

// Helper function to broadcast execution updates
export function broadcastExecutionUpdate(executionId: string, execution: SearchExecution | any) {
  const sessions = executionSessions.get(executionId);
  if (sessions && sessions.size > 0) {
    sessions.forEach(session => {
      try {
        session.push(execution, 'execution-update');
      } catch (error) {
        logger.error(`Failed to broadcast to session:`, error);
      }
    });
  }
}

// Helper function to store execution in history
export function storeExecutionInHistory(execution: SearchExecution & { id: string }) {
  const { searchId } = execution;
  if (!executionHistory.has(searchId)) {
    executionHistory.set(searchId, []);
  }
  
  const history = executionHistory.get(searchId)!;
  
  // Check if this execution already exists (update case)
  const existingIndex = history.findIndex(e => (e as any).id === execution.id);
  if (existingIndex >= 0) {
    history[existingIndex] = execution;
  } else {
    history.push(execution);
  }
  
  // Keep only last 100 executions per search
  if (history.length > 100) {
    history.splice(0, history.length - 100);
  }
}

// Export functions for use by search executor
export function registerActiveExecution(executionId: string, controller: AbortController) {
  activeExecutions.set(executionId, controller);
}

export function unregisterActiveExecution(executionId: string) {
  activeExecutions.delete(executionId);
}

export default router;