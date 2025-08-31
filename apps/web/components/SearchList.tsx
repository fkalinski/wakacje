'use client';

import { Search, RESORT_NAMES, ACCOMMODATION_TYPE_NAMES } from '@holiday-park/shared';
import { api } from '@/lib/api-client';
import toast from 'react-hot-toast';
import { useState } from 'react';

interface SearchListProps {
  searches: Search[];
  onDelete: (id: string) => void;
  onUpdate: () => void;
}

export function SearchList({ searches, onDelete, onUpdate }: SearchListProps) {
  const [executingIds, setExecutingIds] = useState<Set<string>>(new Set());

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this search?')) return;

    try {
      await api.deleteSearch(id);
      toast.success('Search deleted');
      onDelete(id);
    } catch (error) {
      toast.error('Failed to delete search');
      console.error(error);
    }
  };

  const handleExecute = async (id: string) => {
    try {
      setExecutingIds(prev => new Set([...prev, id]));
      await api.executeSearch(id);
      toast.success('Search execution started');
    } catch (error) {
      toast.error('Failed to execute search');
      console.error(error);
    } finally {
      setExecutingIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const handleToggle = async (search: Search) => {
    if (!search.id) return;

    try {
      await api.updateSearch(search.id, { enabled: !search.enabled });
      toast.success(`Search ${search.enabled ? 'disabled' : 'enabled'}`);
      onUpdate();
    } catch (error) {
      toast.error('Failed to update search');
      console.error(error);
    }
  };

  const getFrequencyLabel = (frequency: string) => {
    const labels: Record<string, string> = {
      every_30_min: 'Every 30 minutes',
      hourly: 'Every hour',
      every_2_hours: 'Every 2 hours',
      every_4_hours: 'Every 4 hours',
      daily: 'Daily',
    };
    return labels[frequency] || frequency;
  };

  return (
    <div className="space-y-4">
      {searches.map((search) => (
        <div
          key={search.id}
          className="bg-white rounded-lg shadow-sm border border-gray-200 p-6"
        >
          <div className="flex justify-between items-start mb-4">
            <div>
              <h3 className="text-xl font-semibold text-gray-900">{search.name}</h3>
              <p className="text-sm text-gray-500 mt-1">
                {search.enabled ? '✅ Active' : '⏸️ Paused'} • {getFrequencyLabel(search.schedule.frequency)}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => handleToggle(search)}
                className="px-3 py-1 text-sm rounded-md border border-gray-300 hover:bg-gray-50"
              >
                {search.enabled ? 'Pause' : 'Resume'}
              </button>
              <button
                onClick={() => search.id && handleExecute(search.id)}
                disabled={executingIds.has(search.id || '')}
                className="px-3 py-1 text-sm rounded-md bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50"
              >
                {executingIds.has(search.id || '') ? 'Running...' : 'Run Now'}
              </button>
              <button
                onClick={() => search.id && handleDelete(search.id)}
                className="px-3 py-1 text-sm rounded-md border border-red-300 text-red-600 hover:bg-red-50"
              >
                Delete
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <p className="font-medium text-gray-700">Date Ranges:</p>
              <ul className="mt-1 space-y-1">
                {search.dateRanges.map((range, i) => (
                  <li key={i} className="text-gray-600">
                    {range.from} to {range.to}
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <p className="font-medium text-gray-700">Stay Lengths:</p>
              <p className="mt-1 text-gray-600">
                {search.stayLengths.join(', ')} nights
              </p>
            </div>

            <div>
              <p className="font-medium text-gray-700">Resorts:</p>
              <p className="mt-1 text-gray-600">
                {search.resorts.length === 0
                  ? 'All resorts'
                  : search.resorts.map(id => RESORT_NAMES[id] || `Resort ${id}`).join(', ')}
              </p>
            </div>

            <div>
              <p className="font-medium text-gray-700">Accommodation Types:</p>
              <p className="mt-1 text-gray-600">
                {search.accommodationTypes.length === 0
                  ? 'All types'
                  : search.accommodationTypes.map(id => ACCOMMODATION_TYPE_NAMES[id] || `Type ${id}`).join(', ')}
              </p>
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-gray-200">
            <p className="text-sm text-gray-600">
              📧 Notifications to: {search.notifications.email}
              {search.notifications.onlyChanges && ' (only changes)'}
            </p>
            {search.schedule.lastRun && (
              <p className="text-sm text-gray-500 mt-1">
                Last run: {new Date(search.schedule.lastRun).toLocaleString('pl-PL')}
              </p>
            )}
            {search.schedule.nextRun && (
              <p className="text-sm text-gray-500">
                Next run: {new Date(search.schedule.nextRun).toLocaleString('pl-PL')}
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}