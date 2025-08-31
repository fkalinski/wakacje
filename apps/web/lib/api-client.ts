import axios from 'axios';
import { Search, SearchResult, ApiResponse } from '@holiday-park/shared/client';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

const apiClient = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const api = {
  // Searches
  async getSearches(): Promise<Search[]> {
    const response = await apiClient.get<ApiResponse<Search[]>>('/api/searches');
    if (!response.data.success) {
      throw new Error(response.data.error);
    }
    return response.data.data || [];
  },

  async getSearch(id: string): Promise<Search> {
    const response = await apiClient.get<ApiResponse<Search>>(`/api/searches/${id}`);
    if (!response.data.success || !response.data.data) {
      throw new Error(response.data.error);
    }
    return response.data.data;
  },

  async createSearch(search: Omit<Search, 'id' | 'createdAt' | 'updatedAt'>): Promise<Search> {
    const response = await apiClient.post<ApiResponse<Search>>('/api/searches', search);
    if (!response.data.success || !response.data.data) {
      throw new Error(response.data.error);
    }
    return response.data.data;
  },

  async updateSearch(id: string, updates: Partial<Search>): Promise<void> {
    const response = await apiClient.put<ApiResponse<null>>(`/api/searches/${id}`, updates);
    if (!response.data.success) {
      throw new Error(response.data.error);
    }
  },

  async deleteSearch(id: string): Promise<void> {
    const response = await apiClient.delete<ApiResponse<null>>(`/api/searches/${id}`);
    if (!response.data.success) {
      throw new Error(response.data.error);
    }
  },

  // Search Results
  async getSearchResults(searchId: string, limit = 10): Promise<SearchResult[]> {
    const response = await apiClient.get<ApiResponse<SearchResult[]>>(
      `/api/searches/${searchId}/results`,
      { params: { limit } }
    );
    if (!response.data.success) {
      throw new Error(response.data.error);
    }
    return response.data.data || [];
  },

  // Execute
  async executeSearch(searchId: string): Promise<void> {
    const response = await apiClient.post<ApiResponse<{ message: string }>>(
      `/api/execute/${searchId}`
    );
    if (!response.data.success) {
      throw new Error(response.data.error);
    }
  },

  async executeAllDueSearches(): Promise<void> {
    const response = await apiClient.post<ApiResponse<{ message: string }>>('/api/execute');
    if (!response.data.success) {
      throw new Error(response.data.error);
    }
  },
};