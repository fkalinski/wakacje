'use client';

import { useEffect, useState } from 'react';
import { Search } from '@holiday-park/shared/client';
import { api } from '@/lib/api-client';
import { SearchList } from '@/components/SearchList';
import { CreateSearchButton } from '@/components/CreateSearchButton';
import toast from 'react-hot-toast';

export default function HomePage() {
  const [searches, setSearches] = useState<Search[]>([]);
  const [loading, setLoading] = useState(true);

  const loadSearches = async () => {
    try {
      setLoading(true);
      const data = await api.getSearches();
      setSearches(data);
    } catch (error) {
      toast.error('Failed to load searches');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSearches();
  }, []);

  const handleSearchCreated = () => {
    loadSearches();
  };

  const handleSearchDeleted = (id: string) => {
    setSearches(searches.filter(s => s.id !== id));
  };

  const handleSearchUpdated = () => {
    loadSearches();
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-3xl font-bold text-gray-900">Your Searches</h2>
        <CreateSearchButton onSearchCreated={handleSearchCreated} />
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
        </div>
      ) : searches.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
          <p className="text-gray-500">No searches yet. Create your first search to get started.</p>
        </div>
      ) : (
        <SearchList
          searches={searches}
          onDelete={handleSearchDeleted}
          onUpdate={handleSearchUpdated}
        />
      )}
    </div>
  );
}