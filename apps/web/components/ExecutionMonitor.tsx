'use client';

import { useEffect, useState } from 'react';
import { SearchExecution } from '@holiday-park/shared/client';
import { api } from '@/lib/api-client';

interface ExecutionMonitorProps {
  searchId?: string;
  onExecutionComplete?: (execution: SearchExecution) => void;
}

export function ExecutionMonitor({ searchId, onExecutionComplete }: ExecutionMonitorProps) {
  const [executions, setExecutions] = useState<SearchExecution[]>([]);
  const [loading, setLoading] = useState(true);
  const [eventSources, setEventSources] = useState<Map<string, EventSource>>(new Map());

  useEffect(() => {
    loadExecutions();
    
    return () => {
      // Clean up event sources on unmount
      eventSources.forEach(source => source.close());
    };
  }, [searchId]);

  const loadExecutions = async () => {
    try {
      setLoading(true);
      const data = await api.getExecutions(searchId, 'running');
      setExecutions(data);
      
      // Connect to SSE for running executions
      data.forEach(execution => {
        if (execution.status === 'running' && execution.id) {
          connectToExecutionStream(execution.id);
        }
      });
    } catch (error) {
      console.error('Failed to load executions:', error);
    } finally {
      setLoading(false);
    }
  };

  const connectToExecutionStream = (executionId: string) => {
    if (eventSources.has(executionId)) {
      return; // Already connected
    }

    const eventSource = api.createExecutionStream(executionId);
    
    eventSource.addEventListener('execution-update', (event) => {
      const update = JSON.parse(event.data);
      updateExecution(executionId, update);
    });

    eventSource.addEventListener('execution-status', (event) => {
      const status = JSON.parse(event.data);
      updateExecution(executionId, status);
    });

    eventSource.onerror = (error) => {
      console.error(`SSE error for execution ${executionId}:`, error);
      eventSource.close();
      eventSources.delete(executionId);
      setEventSources(new Map(eventSources));
    };

    eventSources.set(executionId, eventSource);
    setEventSources(new Map(eventSources));
  };

  const updateExecution = (executionId: string, update: Partial<SearchExecution>) => {
    setExecutions(prev => prev.map(exec => 
      exec.id === executionId 
        ? { ...exec, ...update }
        : exec
    ));

    // If execution completed, notify parent and close SSE
    if (update.status && update.status !== 'running') {
      const eventSource = eventSources.get(executionId);
      if (eventSource) {
        eventSource.close();
        eventSources.delete(executionId);
        setEventSources(new Map(eventSources));
      }
      
      if (onExecutionComplete) {
        const execution = executions.find(e => e.id === executionId);
        if (execution) {
          onExecutionComplete({ ...execution, ...update });
        }
      }
    }
  };

  const handleCancel = async (executionId: string) => {
    try {
      await api.cancelExecution(executionId);
      updateExecution(executionId, { 
        status: 'cancelled',
        error: 'Cancelled by user'
      });
    } catch (error) {
      console.error(`Failed to cancel execution ${executionId}:`, error);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'running': return 'text-blue-600';
      case 'completed': return 'text-green-600';
      case 'failed': return 'text-red-600';
      case 'cancelled': return 'text-gray-600';
      default: return 'text-gray-500';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'running': return '⏳';
      case 'completed': return '✅';
      case 'failed': return '❌';
      case 'cancelled': return '⏹️';
      default: return '⏸️';
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-4">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (executions.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-gray-900">Active Executions</h3>
      {executions.map((execution) => (
        <div
          key={execution.id || execution.searchId}
          className="bg-white rounded-lg shadow-sm border border-gray-200 p-4"
        >
          <div className="flex justify-between items-start mb-2">
            <div className="flex items-center gap-2">
              <span className={`text-lg ${getStatusColor(execution.status)}`}>
                {getStatusIcon(execution.status)}
              </span>
              <span className={`font-medium ${getStatusColor(execution.status)}`}>
                {execution.status.charAt(0).toUpperCase() + execution.status.slice(1)}
              </span>
            </div>
            {execution.status === 'running' && (
              <button
                onClick={() => execution.id && handleCancel(execution.id)}
                className="px-3 py-1 text-sm rounded-md border border-red-300 text-red-600 hover:bg-red-50"
              >
                Cancel
              </button>
            )}
          </div>

          {execution.status === 'running' && execution.totalChecks > 0 && (
            <div className="mt-3">
              <div className="flex justify-between text-sm text-gray-600 mb-1">
                <span>Progress: {execution.completedChecks} / {execution.totalChecks}</span>
                <span>{Math.round((execution.completedChecks / execution.totalChecks) * 100)}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-primary-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${(execution.completedChecks / execution.totalChecks) * 100}%` }}
                />
              </div>
            </div>
          )}

          <div className="mt-3 grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-500">Started:</span>{' '}
              <span className="text-gray-900">
                {new Date(execution.startedAt).toLocaleTimeString()}
              </span>
            </div>
            {execution.completedAt && (
              <div>
                <span className="text-gray-500">Completed:</span>{' '}
                <span className="text-gray-900">
                  {new Date(execution.completedAt).toLocaleTimeString()}
                </span>
              </div>
            )}
            {execution.foundAvailabilities > 0 && (
              <div>
                <span className="text-gray-500">Found:</span>{' '}
                <span className="text-gray-900 font-medium">
                  {execution.foundAvailabilities} availabilities
                </span>
              </div>
            )}
            {execution.error && (
              <div className="col-span-2">
                <span className="text-gray-500">Error:</span>{' '}
                <span className="text-red-600">{execution.error}</span>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}