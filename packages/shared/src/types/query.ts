export interface IQueryOptions {
  // Date filtering
  dateRange?: {
    from: Date | string;
    to: Date | string;
  };
  
  // Location filtering
  resorts?: number[];
  accommodationTypes?: number[];
  
  // Price filtering
  priceRange?: {
    min?: number;
    max?: number;
  };
  
  // Stay length filtering
  stayLengths?: number[];
  
  // Sorting
  sortBy?: 'price' | 'date' | 'resort' | 'nights' | 'created';
  sortOrder?: 'asc' | 'desc';
  
  // Pagination
  limit?: number;
  offset?: number;
  
  // Search-specific filtering
  searchId?: string;
  searchIds?: string[];
  
  // Result filtering
  onlyNew?: boolean;
  onlyRemoved?: boolean;
  includeRemoved?: boolean;
}

export interface IResultStats {
  totalSearches: number;
  totalResults: number;
  totalAvailabilities: number;
  uniqueAvailabilities: number;
  averagePrice: number;
  medianPrice: number;
  priceRange: {
    min: number;
    max: number;
  };
  resortDistribution: Array<{
    resortId: number;
    resortName: string;
    count: number;
    percentage: number;
  }>;
  accommodationDistribution: Array<{
    typeId: number;
    typeName: string;
    count: number;
    percentage: number;
  }>;
  nightsDistribution: Array<{
    nights: number;
    count: number;
    percentage: number;
  }>;
  dateRange: {
    earliest: string;
    latest: string;
  };
  lastUpdated: Date;
}

export interface IExportOptions extends IQueryOptions {
  format: 'csv' | 'json';
  includeHeaders?: boolean;
  fields?: string[];
}

export interface IPaginatedResults<T> {
  data: T[];
  total: number;
  limit: number;
  offset: number;
  hasNext: boolean;
  hasPrevious: boolean;
}