'use client';

import { useState, useEffect } from 'react';
import { IQueryOptions } from '@/lib/api-client-extended';
import { apiExtended } from '@/lib/api-client-extended';

interface ResultsFilterProps {
  onFilterChange: (filters: IQueryOptions) => void;
  searchId?: string;
}

export function ResultsFilter({ onFilterChange, searchId }: ResultsFilterProps) {
  const [filters, setFilters] = useState<IQueryOptions>({});
  const [filterOptions, setFilterOptions] = useState<{
    resorts: Array<{ id: number; name: string; count: number }>;
    accommodationTypes: Array<{ id: number; name: string; count: number }>;
    stayLengths: Array<{ nights: number; count: number }>;
    dateRange: { earliest: string; latest: string };
  }>({
    resorts: [],
    accommodationTypes: [],
    stayLengths: [],
    dateRange: { earliest: '', latest: '' }
  });

  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [priceMin, setPriceMin] = useState('');
  const [priceMax, setPriceMax] = useState('');
  const [selectedResorts, setSelectedResorts] = useState<number[]>([]);
  const [selectedTypes, setSelectedTypes] = useState<number[]>([]);
  const [selectedNights, setSelectedNights] = useState<number[]>([]);

  useEffect(() => {
    loadFilterOptions();
  }, [searchId]);

  const loadFilterOptions = async () => {
    try {
      const options = await apiExtended.getFilterOptions(searchId);
      setFilterOptions(options);
      
      // Set default date range
      if (options.dateRange.earliest && options.dateRange.latest) {
        setDateFrom(options.dateRange.earliest);
        setDateTo(options.dateRange.latest);
      }
    } catch (error) {
      console.error('Failed to load filter options:', error);
    }
  };

  const handleApplyFilters = () => {
    const newFilters: IQueryOptions = {};
    
    if (searchId) {
      newFilters.searchId = searchId;
    }
    
    if (dateFrom && dateTo) {
      newFilters.dateRange = { from: dateFrom, to: dateTo };
    }
    
    if (selectedResorts.length > 0) {
      newFilters.resorts = selectedResorts;
    }
    
    if (selectedTypes.length > 0) {
      newFilters.accommodationTypes = selectedTypes;
    }
    
    if (selectedNights.length > 0) {
      newFilters.stayLengths = selectedNights;
    }
    
    if (priceMin || priceMax) {
      newFilters.priceRange = {};
      if (priceMin) newFilters.priceRange.min = parseFloat(priceMin);
      if (priceMax) newFilters.priceRange.max = parseFloat(priceMax);
    }
    
    setFilters(newFilters);
    onFilterChange(newFilters);
  };

  const handleResetFilters = () => {
    setDateFrom(filterOptions.dateRange.earliest || '');
    setDateTo(filterOptions.dateRange.latest || '');
    setPriceMin('');
    setPriceMax('');
    setSelectedResorts([]);
    setSelectedTypes([]);
    setSelectedNights([]);
    
    const resetFilters: IQueryOptions = searchId ? { searchId } : {};
    setFilters(resetFilters);
    onFilterChange(resetFilters);
  };

  const toggleResort = (resortId: number) => {
    setSelectedResorts(prev => 
      prev.includes(resortId) 
        ? prev.filter(id => id !== resortId)
        : [...prev, resortId]
    );
  };

  const toggleType = (typeId: number) => {
    setSelectedTypes(prev => 
      prev.includes(typeId) 
        ? prev.filter(id => id !== typeId)
        : [...prev, typeId]
    );
  };

  const toggleNights = (nights: number) => {
    setSelectedNights(prev => 
      prev.includes(nights) 
        ? prev.filter(n => n !== nights)
        : [...prev, nights]
    );
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Filters</h3>
      
      {/* Date Range */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">Date Range</label>
        <div className="grid grid-cols-2 gap-2">
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
      </div>

      {/* Price Range */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">Price Range (€)</label>
        <div className="grid grid-cols-2 gap-2">
          <input
            type="number"
            placeholder="Min"
            value={priceMin}
            onChange={(e) => setPriceMin(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
          <input
            type="number"
            placeholder="Max"
            value={priceMax}
            onChange={(e) => setPriceMax(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
      </div>

      {/* Resorts */}
      {filterOptions.resorts.length > 0 && (
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">Resorts</label>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {filterOptions.resorts.map(resort => (
              <label key={resort.id} className="flex items-center">
                <input
                  type="checkbox"
                  checked={selectedResorts.includes(resort.id)}
                  onChange={() => toggleResort(resort.id)}
                  className="mr-2 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
                <span className="text-sm text-gray-700">
                  {resort.name} ({resort.count})
                </span>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Accommodation Types */}
      {filterOptions.accommodationTypes.length > 0 && (
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">Accommodation Types</label>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {filterOptions.accommodationTypes.map(type => (
              <label key={type.id} className="flex items-center">
                <input
                  type="checkbox"
                  checked={selectedTypes.includes(type.id)}
                  onChange={() => toggleType(type.id)}
                  className="mr-2 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
                <span className="text-sm text-gray-700">
                  {type.name} ({type.count})
                </span>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Stay Lengths */}
      {filterOptions.stayLengths.length > 0 && (
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">Stay Length</label>
          <div className="grid grid-cols-3 gap-2">
            {filterOptions.stayLengths.map(item => (
              <label key={item.nights} className="flex items-center">
                <input
                  type="checkbox"
                  checked={selectedNights.includes(item.nights)}
                  onChange={() => toggleNights(item.nights)}
                  className="mr-2 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
                <span className="text-sm text-gray-700">
                  {item.nights} nights ({item.count})
                </span>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-2">
        <button
          onClick={handleApplyFilters}
          className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500"
        >
          Apply Filters
        </button>
        <button
          onClick={handleResetFilters}
          className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-500"
        >
          Reset
        </button>
      </div>
    </div>
  );
}