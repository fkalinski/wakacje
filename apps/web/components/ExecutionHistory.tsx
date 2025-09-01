'use client';

import { useEffect, useState } from 'react';
import { SearchExecution } from '@holiday-park/shared/client';
import { api } from '@/lib/api-client';

interface ExecutionHistoryProps {
  searchId: string;
  limit?: number;
}

export function ExecutionHistory({ searchId, limit = 10 }: ExecutionHistoryProps) {
  const [executions, setExecutions] = useState<SearchExecution[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    loadExecutionHistory();
  }, [searchId, limit]);

  const loadExecutionHistory = async () => {
    try {
      setLoading(true);
      const data = await api.getSearchExecutions(searchId, limit);
      setExecutions(data);
    } catch (error) {
      console.error('Failed to load execution history:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'running': return 'bg-blue-100 text-blue-800';
      case 'completed': return 'bg-green-100 text-green-800';
      case 'failed': return 'bg-red-100 text-red-800';
      case 'cancelled': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-600';
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

  const calculateDuration = (start: Date, end?: Date) => {
    const startTime = new Date(start).getTime();
    const endTime = end ? new Date(end).getTime() : Date.now();
    const duration = endTime - startTime;
    
    const seconds = Math.floor(duration / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-4">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (executions.length === 0) {
    return (
      <div className="text-sm text-gray-500 py-2">
        No execution history available
      </div>
    );
  }

  const displayExecutions = expanded ? executions : executions.slice(0, 3);

  return (
    <div className="mt-4">
      <div className="flex justify-between items-center mb-2">
        <h4 className="text-sm font-medium text-gray-700">Execution History</h4>
        {executions.length > 3 && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-sm text-primary-600 hover:text-primary-700"
          >
            {expanded ? 'Show Less' : `Show All (${executions.length})`}
          </button>
        )}
      </div>
      
      <div className="space-y-2">
        {displayExecutions.map((execution, index) => (
          <div
            key={execution.id || `${execution.searchId}-${index}`}
            className="bg-gray-50 rounded-md p-3 text-sm"
          >
            <div className="flex justify-between items-start">
              <div className="flex items-center gap-2">
                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${getStatusColor(execution.status)}`}>
                  {getStatusIcon(execution.status)} {execution.status}
                </span>
                <span className="text-gray-600">
                  {new Date(execution.startedAt).toLocaleString()}
                </span>
              </div>
              <span className="text-gray-500">
                {calculateDuration(execution.startedAt, execution.completedAt)}
              </span>
            </div>
            
            <div className="mt-2 grid grid-cols-3 gap-4 text-xs">
              <div>
                <span className="text-gray-500">Checks:</span>{' '}
                <span className="text-gray-900">
                  {execution.completedChecks}/{execution.totalChecks}
                </span>
              </div>
              <div>
                <span className="text-gray-500">Found:</span>{' '}
                <span className="text-gray-900 font-medium">
                  {execution.foundAvailabilities || 0}
                </span>
              </div>
              {execution.error && (
                <div className="col-span-3">
                  <span className="text-gray-500">Error:</span>{' '}
                  <span className="text-red-600">{execution.error}</span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}