import axios from 'axios';
import { Search, SearchResult, ApiResponse, SearchExecution } from '@holiday-park/shared/client';
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
    console.log('Current user:', user?.email);
    if (user) {
      const token = await user.getIdToken();
      config.headers.Authorization = `Bearer ${token}`;
      console.log('Added auth token to request:', config.url);
    } else {
      console.log('No user logged in, sending request without auth');
    }
  } catch (error) {
    console.error('Error getting ID token:', error);
  }
  console.log('Request config:', { url: config.url, baseURL: config.baseURL });
  return config;
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

  // Executions
  async getExecutions(searchId?: string, status?: string, limit = 50): Promise<SearchExecution[]> {
    const params: any = { limit };
    if (searchId) params.searchId = searchId;
    if (status) params.status = status;
    
    const response = await apiClient.get<ApiResponse<SearchExecution[]>>('/api/executions', { params });
    if (!response.data.success) {
      throw new Error(response.data.error);
    }
    return response.data.data || [];
  },

  async getExecution(id: string): Promise<SearchExecution> {
    const response = await apiClient.get<ApiResponse<SearchExecution>>(`/api/executions/${id}`);
    if (!response.data.success || !response.data.data) {
      throw new Error(response.data.error);
    }
    return response.data.data;
  },

  async cancelExecution(id: string): Promise<void> {
    const response = await apiClient.delete<ApiResponse<{ message: string }>>(`/api/executions/${id}`);
    if (!response.data.success) {
      throw new Error(response.data.error);
    }
  },

  async getSearchExecutions(searchId: string, limit = 10): Promise<SearchExecution[]> {
    const response = await apiClient.get<ApiResponse<SearchExecution[]>>(
      `/api/executions/search/${searchId}`,
      { params: { limit } }
    );
    if (!response.data.success) {
      throw new Error(response.data.error);
    }
    return response.data.data || [];
  },

  // Create SSE connection for execution updates
  createExecutionStream(executionId: string): EventSource {
    // Note: EventSource doesn't support custom headers directly
    // The auth token will need to be passed as a query parameter or handled differently
    // For now, we'll rely on cookies for authentication
    const url = `${API_URL}/api/executions/${executionId}/stream`;
    return new EventSource(url, { withCredentials: true });
  },
};