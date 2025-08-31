'use client';

import { useState } from 'react';
import { Search, RESORT_NAMES, ACCOMMODATION_TYPE_NAMES } from '@holiday-park/shared';
import { api } from '@/lib/api-client';
import toast from 'react-hot-toast';

interface CreateSearchDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSearchCreated: () => void;
}

export function CreateSearchDialog({ isOpen, onClose, onSearchCreated }: CreateSearchDialogProps) {
  const [formData, setFormData] = useState<Partial<Search>>({
    name: '',
    enabled: true,
    dateRanges: [{ from: '', to: '' }],
    stayLengths: [7],
    resorts: [],
    accommodationTypes: [],
    schedule: {
      frequency: 'every_2_hours',
      lastRun: null,
      nextRun: null,
    },
    notifications: {
      email: '',
      onlyChanges: true,
    },
  });

  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name || !formData.notifications?.email) {
      toast.error('Please fill in all required fields');
      return;
    }

    if (formData.dateRanges?.some(r => !r.from || !r.to)) {
      toast.error('Please fill in all date ranges');
      return;
    }

    try {
      setLoading(true);
      await api.createSearch(formData as any);
      toast.success('Search created successfully');
      onSearchCreated();
    } catch (error) {
      toast.error('Failed to create search');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const addDateRange = () => {
    setFormData(prev => ({
      ...prev,
      dateRanges: [...(prev.dateRanges || []), { from: '', to: '' }],
    }));
  };

  const removeDateRange = (index: number) => {
    setFormData(prev => ({
      ...prev,
      dateRanges: prev.dateRanges?.filter((_, i) => i !== index) || [],
    }));
  };

  const updateDateRange = (index: number, field: 'from' | 'to', value: string) => {
    setFormData(prev => ({
      ...prev,
      dateRanges: prev.dateRanges?.map((range, i) =>
        i === index ? { ...range, [field]: value } : range
      ) || [],
    }));
  };

  const toggleResort = (resortId: number) => {
    setFormData(prev => ({
      ...prev,
      resorts: prev.resorts?.includes(resortId)
        ? prev.resorts.filter(id => id !== resortId)
        : [...(prev.resorts || []), resortId],
    }));
  };

  const toggleAccommodationType = (typeId: number) => {
    setFormData(prev => ({
      ...prev,
      accommodationTypes: prev.accommodationTypes?.includes(typeId)
        ? prev.accommodationTypes.filter(id => id !== typeId)
        : [...(prev.accommodationTypes || []), typeId],
    }));
  };

  const toggleStayLength = (length: number) => {
    setFormData(prev => ({
      ...prev,
      stayLengths: prev.stayLengths?.includes(length)
        ? prev.stayLengths.filter(l => l !== length)
        : [...(prev.stayLengths || []), length].sort((a, b) => a - b),
    }));
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <h2 className="text-2xl font-bold mb-6">Create New Search</h2>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Search Name *
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                placeholder="e.g., Summer Vacation 2025"
              />
            </div>

            {/* Date Ranges */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Date Ranges *
              </label>
              {formData.dateRanges?.map((range, index) => (
                <div key={index} className="flex gap-2 mb-2">
                  <input
                    type="date"
                    value={range.from}
                    onChange={(e) => updateDateRange(index, 'from', e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                  <span className="self-center">to</span>
                  <input
                    type="date"
                    value={range.to}
                    onChange={(e) => updateDateRange(index, 'to', e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                  {formData.dateRanges.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeDateRange(index)}
                      className="px-3 py-2 text-red-600 hover:bg-red-50 rounded-md"
                    >
                      Remove
                    </button>
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={addDateRange}
                className="text-primary-600 hover:text-primary-700 text-sm"
              >
                + Add another date range
              </button>
            </div>

            {/* Stay Lengths */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Stay Lengths (nights) *
              </label>
              <div className="flex flex-wrap gap-2">
                {[2, 3, 4, 5, 6, 7, 10, 14].map(length => (
                  <button
                    key={length}
                    type="button"
                    onClick={() => toggleStayLength(length)}
                    className={`px-3 py-1 rounded-md border ${
                      formData.stayLengths?.includes(length)
                        ? 'bg-primary-600 text-white border-primary-600'
                        : 'border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    {length}
                  </button>
                ))}
              </div>
            </div>

            {/* Resorts */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Resorts (leave empty for all)
              </label>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(RESORT_NAMES).map(([id, name]) => (
                  <label key={id} className="flex items-center">
                    <input
                      type="checkbox"
                      checked={formData.resorts?.includes(Number(id)) || false}
                      onChange={() => toggleResort(Number(id))}
                      className="mr-2"
                    />
                    <span className="text-sm">{name}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Accommodation Types */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Accommodation Types (leave empty for all)
              </label>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(ACCOMMODATION_TYPE_NAMES).map(([id, name]) => (
                  <label key={id} className="flex items-center">
                    <input
                      type="checkbox"
                      checked={formData.accommodationTypes?.includes(Number(id)) || false}
                      onChange={() => toggleAccommodationType(Number(id))}
                      className="mr-2"
                    />
                    <span className="text-sm">{name}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Schedule */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Check Frequency *
              </label>
              <select
                value={formData.schedule?.frequency}
                onChange={(e) => setFormData(prev => ({
                  ...prev,
                  schedule: { ...prev.schedule!, frequency: e.target.value as any },
                }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="every_30_min">Every 30 minutes</option>
                <option value="hourly">Every hour</option>
                <option value="every_2_hours">Every 2 hours</option>
                <option value="every_4_hours">Every 4 hours</option>
                <option value="daily">Daily</option>
              </select>
            </div>

            {/* Notifications */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email for Notifications *
              </label>
              <input
                type="email"
                value={formData.notifications?.email}
                onChange={(e) => setFormData(prev => ({
                  ...prev,
                  notifications: { ...prev.notifications!, email: e.target.value },
                }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                placeholder="your-email@example.com"
              />
              <label className="flex items-center mt-2">
                <input
                  type="checkbox"
                  checked={formData.notifications?.onlyChanges}
                  onChange={(e) => setFormData(prev => ({
                    ...prev,
                    notifications: { ...prev.notifications!, onlyChanges: e.target.checked },
                  }))}
                  className="mr-2"
                />
                <span className="text-sm">Only notify when there are changes</span>
              </label>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-4 border-t">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50"
              >
                {loading ? 'Creating...' : 'Create Search'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}