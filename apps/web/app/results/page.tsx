'use client';

import { Suspense } from 'react';
import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { Availability } from '@holiday-park/shared/client';
import { IQueryOptions, IPaginatedResults } from '@/lib/api-client-extended';
import { apiExtended } from '@/lib/api-client-extended';
import { ResultsTable } from '@/components/ResultsTable';
import { ResultsFilter } from '@/components/ResultsFilter';
import toast from 'react-hot-toast';

function ResultsContent() {
  const searchParams = useSearchParams();
  const searchId = searchParams.get('searchId');
  
  const [results, setResults] = useState<IPaginatedResults<Availability> | null>(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<IQueryOptions>({});
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 50;

  useEffect(() => {
    loadResults();
  }, [filters, currentPage]);

  const loadResults = async () => {
    try {
      setLoading(true);
      
      const queryOptions: IQueryOptions = {
        ...filters,
        searchId: searchId || undefined,
        limit: pageSize,
        offset: (currentPage - 1) * pageSize,
      };
      
      const data = await apiExtended.queryAvailabilities(queryOptions);
      setResults(data);
    } catch (error) {
      console.error('Failed to load results:', error);
      toast.error('Failed to load results');
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (newFilters: IQueryOptions) => {
    setFilters(newFilters);
    setCurrentPage(1); // Reset to first page when filters change
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  const handleExport = async (format: 'csv' | 'json') => {
    try {
      const queryOptions: IQueryOptions = {
        ...filters,
        searchId: searchId || undefined,
      };
      
      const blob = await apiExtended.exportResults(format, queryOptions);
      
      // Create download link
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `availabilities-${new Date().toISOString()}.${format}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      toast.success(`Exported as ${format.toUpperCase()}`);
    } catch (error) {
      console.error('Export failed:', error);
      toast.error('Export failed');
    }
  };

  const totalPages = results ? Math.ceil(results.total / pageSize) : 0;

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6 flex justify-between items-center">
        <h1 className="text-3xl font-bold">Search Results</h1>
        
        <div className="flex gap-2">
          <button
            onClick={() => handleExport('csv')}
            className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
          >
            Export CSV
          </button>
          <button
            onClick={() => handleExport('json')}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Export JSON
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-1">
          <ResultsFilter 
            onFilterChange={handleFilterChange}
            searchId={searchId || undefined}
          />
        </div>
        
        <div className="lg:col-span-3">
          <ResultsTable
            availabilities={results?.items || []}
            loading={loading}
            onPageChange={handlePageChange}
            currentPage={currentPage}
            totalPages={totalPages}
            total={results?.total || 0}
          />
        </div>
      </div>
    </div>
  );
}

export default function ResultsPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <ResultsContent />
    </Suspense>
  );
}