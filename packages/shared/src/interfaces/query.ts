import { Availability, SearchResult } from '../types';
import { IQueryOptions, IResultStats, IPaginatedResults } from '../types/query';

export interface IQueryableAdapter {
  // Query availabilities across all searches or specific searches
  queryAvailabilities(options: IQueryOptions): Promise<IPaginatedResults<Availability>>;
  
  // Get search results with filters
  getResultsWithFilters(options: IQueryOptions): Promise<IPaginatedResults<SearchResult>>;
  
  // Get aggregated statistics
  getResultsStatistics(options?: IQueryOptions): Promise<IResultStats>;
  
  // Export results in different formats
  exportResults(format: 'csv' | 'json', options: IQueryOptions): Promise<string>;
  
  // Get unique values for filtering
  getUniqueResorts(searchId?: string): Promise<Array<{ id: number; name: string; count: number }>>;
  getUniqueAccommodationTypes(searchId?: string): Promise<Array<{ id: number; name: string; count: number }>>;
  getUniqueStayLengths(searchId?: string): Promise<Array<{ nights: number; count: number }>>;
  getDateRange(searchId?: string): Promise<{ earliest: string; latest: string }>;
}