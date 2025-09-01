import axios from 'axios';
import { Availability, SearchResult } from '@holiday-park/shared/client';
import { api } from './api-client';
import { auth } from '@/lib/firebase';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

const apiClient = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add Firebase ID token to all requests
apiClient.interceptors.request.use(async (config) => {
  try {
    const user = auth.currentUser;
    if (user) {
      const token = await user.getIdToken();
      config.headers.Authorization = `Bearer ${token}`;
    }
  } catch (error) {
    console.error('Error getting ID token:', error);
  }
  return config;
});

// Type definitions for extended API
export interface IQueryOptions {
  searchId?: string;
  dateRange?: {
    from: string;
    to: string;
  };
  resorts?: number[];
  accommodationTypes?: number[];
  priceRange?: {
    min?: number;
    max?: number;
  };
  stayLengths?: number[];
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
  onlyNew?: boolean;
  includeRemoved?: boolean;
}

export interface IPaginatedResults<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export interface IResultStats {
  totalResults: number;
  totalAvailabilities: number;
  averagePrice: number;
  minPrice: number;
  maxPrice: number;
  byResort: Record<string, number>;
  byAccommodationType: Record<string, number>;
  byStayLength: Record<number, number>;
  dateRange: {
    earliest: string;
    latest: string;
  };
}

// Extended API client with query methods
export const apiExtended = {
  ...api,

  // Results and Availabilities
  async queryAvailabilities(options?: IQueryOptions): Promise<IPaginatedResults<Availability>> {
    const params: any = {};
    
    if (options) {
      if (options.searchId) params.searchId = options.searchId;
      if (options.dateRange) {
        params.dateFrom = options.dateRange.from;
        params.dateTo = options.dateRange.to;
      }
      if (options.resorts) params.resorts = options.resorts.join(',');
      if (options.accommodationTypes) params.accommodationTypes = options.accommodationTypes.join(',');
      if (options.priceRange) {
        if (options.priceRange.min !== undefined) params.priceMin = options.priceRange.min;
        if (options.priceRange.max !== undefined) params.priceMax = options.priceRange.max;
      }
      if (options.stayLengths) params.stayLengths = options.stayLengths.join(',');
      if (options.sortBy) params.sortBy = options.sortBy;
      if (options.sortOrder) params.sortOrder = options.sortOrder;
      if (options.limit) params.limit = options.limit;
      if (options.offset) params.offset = options.offset;
      if (options.onlyNew !== undefined) params.onlyNew = options.onlyNew;
      if (options.includeRemoved !== undefined) params.includeRemoved = options.includeRemoved;
    }
    
    const response = await apiClient.get<any>(
      '/api/results/availabilities',
      { params }
    );
    
    if (!response.data.success || !response.data.data) {
      throw new Error(response.data.error);
    }
    return response.data.data;
  },

  async getResultsWithFilters(options?: IQueryOptions): Promise<IPaginatedResults<SearchResult>> {
    const params: any = {};
    
    if (options) {
      if (options.searchId) params.searchId = options.searchId;
      if (options.dateRange) {
        params.dateFrom = options.dateRange.from;
        params.dateTo = options.dateRange.to;
      }
      if (options.sortBy) params.sortBy = options.sortBy;
      if (options.sortOrder) params.sortOrder = options.sortOrder;
      if (options.limit) params.limit = options.limit;
      if (options.offset) params.offset = options.offset;
    }
    
    const response = await apiClient.get<any>(
      '/api/results',
      { params }
    );
    
    if (!response.data.success || !response.data.data) {
      throw new Error(response.data.error);
    }
    return response.data.data;
  },

  async getStatistics(options?: IQueryOptions): Promise<IResultStats> {
    const params: any = {};
    
    if (options) {
      if (options.searchId) params.searchId = options.searchId;
      if (options.dateRange) {
        params.dateFrom = options.dateRange.from;
        params.dateTo = options.dateRange.to;
      }
    }
    
    const response = await apiClient.get<any>(
      '/api/results/stats',
      { params }
    );
    
    if (!response.data.success || !response.data.data) {
      throw new Error(response.data.error);
    }
    return response.data.data;
  },

  async exportResults(format: 'csv' | 'json', options?: IQueryOptions): Promise<Blob> {
    const params: any = { format };
    
    if (options) {
      if (options.searchId) params.searchId = options.searchId;
      if (options.dateRange) {
        params.dateFrom = options.dateRange.from;
        params.dateTo = options.dateRange.to;
      }
      if (options.resorts) params.resorts = options.resorts.join(',');
      if (options.accommodationTypes) params.accommodationTypes = options.accommodationTypes.join(',');
      if (options.priceRange) {
        if (options.priceRange.min !== undefined) params.priceMin = options.priceRange.min;
        if (options.priceRange.max !== undefined) params.priceMax = options.priceRange.max;
      }
      if (options.stayLengths) params.stayLengths = options.stayLengths.join(',');
    }
    
    const response = await apiClient.get('/api/results/export', {
      params,
      responseType: 'blob'
    });
    
    return response.data;
  },

  async getFilterOptions(searchId?: string): Promise<{
    resorts: Array<{ id: number; name: string; count: number }>;
    accommodationTypes: Array<{ id: number; name: string; count: number }>;
    stayLengths: Array<{ nights: number; count: number }>;
    dateRange: { earliest: string; latest: string };
  }> {
    const params = searchId ? { searchId } : {};
    const response = await apiClient.get<any>('/api/results/filters', { params });
    
    if (!response.data.success || !response.data.data) {
      throw new Error(response.data.error);
    }
    return response.data.data;
  },
};