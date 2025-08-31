import { Search, SearchResult, SearchExecution, NotificationLog } from '../types';

export interface IPersistenceAdapter {
  // Search Management
  createSearch(search: Omit<Search, 'id' | 'createdAt' | 'updatedAt'>): Promise<string>;
  getSearch(searchId: string): Promise<Search | null>;
  getAllSearches(enabled?: boolean): Promise<Search[]>;
  updateSearch(searchId: string, updates: Partial<Search>): Promise<void>;
  deleteSearch(searchId: string): Promise<void>;
  updateSearchSchedule(searchId: string, lastRun: Date, nextRun: Date): Promise<void>;
  getSearchesDueForExecution(): Promise<Search[]>;

  // Search Results
  saveSearchResult(result: SearchResult): Promise<string>;
  getSearchResults(searchId: string, limit?: number): Promise<SearchResult[]>;
  getLatestSearchResult(searchId: string): Promise<SearchResult | null>;
  updateSearchResult(resultId: string, updates: Partial<SearchResult>): Promise<void>;

  // Execution Tracking
  createExecution(execution: Omit<SearchExecution, 'id'>): Promise<string>;
  updateExecution(executionId: string, updates: Partial<SearchExecution>): Promise<void>;
  getExecution(executionId: string): Promise<SearchExecution | null>;

  // Notification Logs
  logNotification(log: Omit<NotificationLog, 'id'>): Promise<string>;
  getNotificationLogs(searchId: string, limit?: number): Promise<NotificationLog[]>;

  // Lifecycle
  initialize?(): Promise<void>;
  close?(): Promise<void>;
}