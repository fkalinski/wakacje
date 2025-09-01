import { Search, SearchResult, SearchExecution, NotificationLog, Availability } from '../types';
import { IQueryOptions, IResultStats, IPaginatedResults } from '../types/query';

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

  // Query and Filter Methods
  queryAvailabilities(options: IQueryOptions): Promise<IPaginatedResults<Availability>>;
  getResultsWithFilters(options?: IQueryOptions): Promise<IPaginatedResults<SearchResult>>;
  getResultsStatistics(options?: IQueryOptions): Promise<IResultStats>;
  exportResults(format: 'csv' | 'json', options?: IQueryOptions): Promise<string>;
  
  // Filter Options Methods
  getUniqueResorts(searchId?: string): Promise<Array<{ id: number; name: string; count: number }>>;
  getUniqueAccommodationTypes(searchId?: string): Promise<Array<{ id: number; name: string; count: number }>>;
  getUniqueStayLengths(searchId?: string): Promise<Array<{ nights: number; count: number }>>;
  getDateRange(searchId?: string): Promise<{ earliest: string; latest: string }>;

  // Lifecycle
  initialize?(): Promise<void>;
  close?(): Promise<void>;
}