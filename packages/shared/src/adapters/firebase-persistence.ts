import * as admin from 'firebase-admin';
import { IPersistenceAdapter } from '../interfaces/persistence';
import { Search, SearchResult, SearchExecution, NotificationLog, Availability } from '../types';
import { ILogger } from '../interfaces/logger';
import { IQueryOptions, IResultStats, IPaginatedResults } from '../types/query';

export type AuthMode = 'service-account' | 'oauth2';

export interface ServiceAccountCredentials {
  projectId: string;
  privateKey?: string;
  clientEmail?: string;
}

export interface OAuth2Credentials {
  projectId: string;
  apiKey: string;
  authDomain: string;
  accessToken?: string;
  refreshToken?: string;
}

export interface FirebasePersistenceOptions {
  authMode?: AuthMode;
  serviceAccount?: ServiceAccountCredentials;
  oauth2?: OAuth2Credentials;
  logger?: ILogger;
  
  // Legacy support - will be deprecated
  projectId?: string;
  privateKey?: string;
  clientEmail?: string;
}

export class FirebasePersistenceAdapter implements IPersistenceAdapter {
  private db: admin.firestore.Firestore;
  private initialized = false;
  private logger?: ILogger;
  private authMode: AuthMode;

  constructor(private options: FirebasePersistenceOptions) {
    this.logger = options.logger;
    this.authMode = this.determineAuthMode();
    this.initializeFirebase();
    this.db = admin.firestore();
  }

  private determineAuthMode(): AuthMode {
    // If authMode is explicitly set, use it
    if (this.options.authMode) {
      return this.options.authMode;
    }
    
    // Check for legacy service account credentials
    if (this.options.privateKey && this.options.clientEmail && this.options.projectId) {
      return 'service-account';
    }
    
    // Check for new style service account
    if (this.options.serviceAccount) {
      return 'service-account';
    }
    
    // Check for OAuth2
    if (this.options.oauth2) {
      return 'oauth2';
    }
    
    throw new Error('No valid authentication credentials provided');
  }

  private initializeFirebase() {
    if (this.initialized) return;

    try {
      if (this.authMode === 'service-account') {
        this.initializeWithServiceAccount();
      } else if (this.authMode === 'oauth2') {
        this.initializeWithOAuth2();
      } else {
        throw new Error(`Unsupported auth mode: ${this.authMode}`);
      }

      this.initialized = true;
      this.logger?.info(`Firebase initialized with ${this.authMode} authentication`);
    } catch (error) {
      this.logger?.error('Failed to initialize Firebase:', error);
      throw error;
    }
  }

  private initializeWithServiceAccount() {
    // Check if app is already initialized
    if (admin.apps.length > 0) {
      this.logger?.info('Firebase already initialized, skipping');
      return;
    }

    // In Cloud Run, use Application Default Credentials if available
    // This is automatic when the service account is attached to the Cloud Run service
    if (process.env.K_SERVICE) {
      this.logger?.info('Running in Cloud Run, using Application Default Credentials');
      admin.initializeApp({
        projectId: this.options.serviceAccount?.projectId || this.options.projectId,
      });
      return;
    }
    
    // Otherwise use explicit credentials
    const credentials = this.options.serviceAccount || {
      projectId: this.options.projectId!,
      privateKey: this.options.privateKey!,
      clientEmail: this.options.clientEmail!,
    };
    
    if (!credentials.privateKey || !credentials.clientEmail) {
      throw new Error('Private key and client email are required for service account authentication outside Cloud Run');
    }
    
    const privateKey = credentials.privateKey.replace(/\\n/g, '\n');
    
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: credentials.projectId,
        privateKey,
        clientEmail: credentials.clientEmail,
      }),
    });
  }

  private initializeWithOAuth2() {
    if (!this.options.oauth2) {
      throw new Error('OAuth2 credentials not provided');
    }
    
    // For OAuth2, we'll use the Firebase client SDK approach
    // But since we're using admin SDK methods, we need to use a custom token approach
    // This requires the access token to be passed from the client
    if (!this.options.oauth2.accessToken) {
      throw new Error('OAuth2 access token is required for client authentication');
    }
    
    // Initialize admin SDK with custom token authentication
    // Note: This requires setting up a service to exchange OAuth2 tokens for custom tokens
    // For now, we'll use the access token directly with Firestore REST API fallback
    admin.initializeApp({
      projectId: this.options.oauth2.projectId,
    });
    
    // Store the access token for use in REST API calls if needed
    (this as any).accessToken = this.options.oauth2.accessToken;
  }

  // Search Management
  async createSearch(search: Omit<Search, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    try {
      const docRef = await this.db.collection('searches').add({
        ...search,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      this.logger?.info(`Created search: ${docRef.id}`);
      return docRef.id;
    } catch (error) {
      this.logger?.error('Failed to create search:', error);
      throw error;
    }
  }

  async getSearch(searchId: string): Promise<Search | null> {
    try {
      const doc = await this.db.collection('searches').doc(searchId).get();
      if (!doc.exists) return null;
      
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        createdAt: data?.createdAt?.toDate(),
        updatedAt: data?.updatedAt?.toDate(),
        schedule: {
          ...data?.schedule,
          lastRun: data?.schedule?.lastRun?.toDate() || null,
          nextRun: data?.schedule?.nextRun?.toDate() || null,
        }
      } as Search;
    } catch (error) {
      this.logger?.error(`Failed to get search ${searchId}:`, error);
      throw error;
    }
  }

  async getAllSearches(enabled?: boolean): Promise<Search[]> {
    try {
      let query = this.db.collection('searches') as any;
      
      if (enabled !== undefined) {
        query = query.where('enabled', '==', enabled);
      }
      
      const snapshot = await query.get();
      return snapshot.docs.map((doc: any) => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          createdAt: data?.createdAt?.toDate(),
          updatedAt: data?.updatedAt?.toDate(),
          schedule: {
            ...data?.schedule,
            lastRun: data?.schedule?.lastRun?.toDate() || null,
            nextRun: data?.schedule?.nextRun?.toDate() || null,
          }
        } as Search;
      });
    } catch (error) {
      this.logger?.error('Failed to get searches:', error);
      throw error;
    }
  }

  async updateSearch(searchId: string, updates: Partial<Search>): Promise<void> {
    try {
      await this.db.collection('searches').doc(searchId).update({
        ...updates,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      this.logger?.info(`Updated search: ${searchId}`);
    } catch (error) {
      this.logger?.error(`Failed to update search ${searchId}:`, error);
      throw error;
    }
  }

  async deleteSearch(searchId: string): Promise<void> {
    try {
      await this.db.collection('searches').doc(searchId).delete();
      this.logger?.info(`Deleted search: ${searchId}`);
    } catch (error) {
      this.logger?.error(`Failed to delete search ${searchId}:`, error);
      throw error;
    }
  }

  async updateSearchSchedule(searchId: string, lastRun: Date, nextRun: Date): Promise<void> {
    try {
      await this.db.collection('searches').doc(searchId).update({
        'schedule.lastRun': admin.firestore.Timestamp.fromDate(lastRun),
        'schedule.nextRun': admin.firestore.Timestamp.fromDate(nextRun),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    } catch (error) {
      this.logger?.error(`Failed to update schedule for search ${searchId}:`, error);
      throw error;
    }
  }

  async getSearchesDueForExecution(): Promise<Search[]> {
    try {
      const now = new Date();
      const snapshot = await this.db.collection('searches')
        .where('enabled', '==', true)
        .where('schedule.nextRun', '<=', admin.firestore.Timestamp.fromDate(now))
        .get();

      return snapshot.docs.map((doc: any) => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          createdAt: data?.createdAt?.toDate(),
          updatedAt: data?.updatedAt?.toDate(),
          schedule: {
            ...data?.schedule,
            lastRun: data?.schedule?.lastRun?.toDate() || null,
            nextRun: data?.schedule?.nextRun?.toDate() || null,
          }
        } as Search;
      });
    } catch (error) {
      this.logger?.error('Failed to get searches due for execution:', error);
      throw error;
    }
  }

  // Search Results
  async saveSearchResult(result: SearchResult): Promise<string> {
    try {
      const docRef = await this.db.collection('results').add({
        ...result,
        timestamp: admin.firestore.Timestamp.fromDate(result.timestamp),
      });
      this.logger?.info(`Saved search result: ${docRef.id}`);
      return docRef.id;
    } catch (error) {
      this.logger?.error('Failed to save search result:', error);
      throw error;
    }
  }

  async getSearchResults(searchId: string, limit: number = 10): Promise<SearchResult[]> {
    try {
      const snapshot = await this.db.collection('results')
        .where('searchId', '==', searchId)
        .orderBy('timestamp', 'desc')
        .limit(limit)
        .get();

      return snapshot.docs.map((doc: any) => ({
        id: doc.id,
        ...doc.data(),
        timestamp: doc.data().timestamp?.toDate(),
      })) as SearchResult[];
    } catch (error) {
      this.logger?.error(`Failed to get results for search ${searchId}:`, error);
      throw error;
    }
  }

  async getLatestSearchResult(searchId: string): Promise<SearchResult | null> {
    try {
      const snapshot = await this.db.collection('results')
        .where('searchId', '==', searchId)
        .orderBy('timestamp', 'desc')
        .limit(1)
        .get();

      if (snapshot.empty) return null;

      const doc = snapshot.docs[0];
      return {
        id: doc.id,
        ...doc.data(),
        timestamp: doc.data().timestamp?.toDate(),
      } as SearchResult;
    } catch (error) {
      this.logger?.error(`Failed to get latest result for search ${searchId}:`, error);
      throw error;
    }
  }

  async updateSearchResult(resultId: string, updates: Partial<SearchResult>): Promise<void> {
    try {
      await this.db.collection('results').doc(resultId).update(updates);
    } catch (error) {
      this.logger?.error(`Failed to update result ${resultId}:`, error);
      throw error;
    }
  }

  // Execution Tracking
  async createExecution(execution: Omit<SearchExecution, 'id'>): Promise<string> {
    try {
      const docRef = await this.db.collection('executions').add({
        ...execution,
        startedAt: admin.firestore.Timestamp.fromDate(execution.startedAt),
        completedAt: execution.completedAt ? admin.firestore.Timestamp.fromDate(execution.completedAt) : null,
      });
      this.logger?.info(`Created execution: ${docRef.id}`);
      return docRef.id;
    } catch (error) {
      this.logger?.error('Failed to create execution:', error);
      throw error;
    }
  }

  async updateExecution(executionId: string, updates: Partial<SearchExecution>): Promise<void> {
    try {
      const updateData: any = { ...updates };
      if (updates.completedAt) {
        updateData.completedAt = admin.firestore.Timestamp.fromDate(updates.completedAt);
      }
      await this.db.collection('executions').doc(executionId).update(updateData);
    } catch (error) {
      this.logger?.error(`Failed to update execution ${executionId}:`, error);
      throw error;
    }
  }

  async getExecution(executionId: string): Promise<SearchExecution | null> {
    try {
      const doc = await this.db.collection('executions').doc(executionId).get();
      if (!doc.exists) return null;
      
      const data = doc.data();
      return {
        searchId: data?.searchId,
        status: data?.status,
        startedAt: data?.startedAt?.toDate(),
        completedAt: data?.completedAt?.toDate(),
        totalChecks: data?.totalChecks,
        completedChecks: data?.completedChecks,
        foundAvailabilities: data?.foundAvailabilities,
        error: data?.error
      } as SearchExecution;
    } catch (error) {
      this.logger?.error(`Failed to get execution ${executionId}:`, error);
      throw error;
    }
  }

  // Notification Logs
  async logNotification(log: Omit<NotificationLog, 'id'>): Promise<string> {
    try {
      const docRef = await this.db.collection('notifications').add({
        ...log,
        sentAt: admin.firestore.Timestamp.fromDate(log.sentAt),
      });
      this.logger?.info(`Logged notification: ${docRef.id}`);
      return docRef.id;
    } catch (error) {
      this.logger?.error('Failed to log notification:', error);
      throw error;
    }
  }

  async getNotificationLogs(searchId: string, limit: number = 10): Promise<NotificationLog[]> {
    try {
      const snapshot = await this.db.collection('notifications')
        .where('searchId', '==', searchId)
        .orderBy('sentAt', 'desc')
        .limit(limit)
        .get();

      return snapshot.docs.map((doc: any) => ({
        id: doc.id,
        ...doc.data(),
        sentAt: doc.data().sentAt?.toDate(),
      })) as NotificationLog[];
    } catch (error) {
      this.logger?.error(`Failed to get notification logs for search ${searchId}:`, error);
      throw error;
    }
  }

  // Query Implementation
  async queryAvailabilities(options: IQueryOptions): Promise<IPaginatedResults<Availability>> {
    try {
      let query: admin.firestore.Query = this.db.collectionGroup('availabilities');
      
      // Apply filters
      if (options.searchId) {
        const results = await this.db.collection('results')
          .where('searchId', '==', options.searchId)
          .get();
        const resultIds = results.docs.map(doc => doc.id);
        if (resultIds.length === 0) {
          return { data: [], total: 0, limit: options.limit || 50, offset: 0, hasNext: false, hasPrevious: false };
        }
        // Firestore doesn't support IN queries with more than 10 items
        if (resultIds.length <= 10) {
          query = query.where('resultId', 'in', resultIds);
        }
      }
      
      if (options.dateRange) {
        const from = typeof options.dateRange.from === 'string' 
          ? options.dateRange.from 
          : options.dateRange.from.toISOString().split('T')[0];
        const to = typeof options.dateRange.to === 'string'
          ? options.dateRange.to
          : options.dateRange.to.toISOString().split('T')[0];
        
        query = query.where('dateFrom', '>=', from).where('dateTo', '<=', to);
      }
      
      if (options.resorts && options.resorts.length > 0) {
        // Firestore limitation: can't use array-contains-any with other inequality filters
        if (options.resorts.length <= 10) {
          query = query.where('resortId', 'in', options.resorts);
        }
      }
      
      if (options.accommodationTypes && options.accommodationTypes.length > 0 && options.accommodationTypes.length <= 10) {
        query = query.where('accommodationTypeId', 'in', options.accommodationTypes);
      }
      
      if (options.priceRange) {
        if (options.priceRange.min !== undefined) {
          query = query.where('priceTotal', '>=', options.priceRange.min);
        }
        if (options.priceRange.max !== undefined) {
          query = query.where('priceTotal', '<=', options.priceRange.max);
        }
      }
      
      if (options.stayLengths && options.stayLengths.length > 0 && options.stayLengths.length <= 10) {
        query = query.where('nights', 'in', options.stayLengths);
      }
      
      if (!options.includeRemoved) {
        // Note: Removed isRemoved filter - will filter in memory due to Firestore limitations with != in collection groups
      }
      
      if (options.onlyNew) {
        query = query.where('isNew', '==', true);
      }
      
      // Apply sorting
      const sortBy = options.sortBy || 'date';
      const sortOrder = options.sortOrder || 'asc';
      
      switch (sortBy) {
        case 'price':
          query = query.orderBy('priceTotal', sortOrder);
          break;
        case 'date':
          query = query.orderBy('dateFrom', sortOrder);
          break;
        case 'resort':
          query = query.orderBy('resortName', sortOrder);
          break;
        case 'nights':
          query = query.orderBy('nights', sortOrder);
          break;
        default:
          query = query.orderBy('dateFrom', sortOrder);
      }
      
      // Get total count (expensive operation in Firestore)
      const countSnapshot = await query.get();
      const total = countSnapshot.size;
      
      // Apply pagination
      const limit = options.limit || 50;
      const offset = options.offset || 0;
      
      let paginatedQuery = query.limit(limit);
      if (offset > 0) {
        // Get the document at the offset position
        const offsetSnapshot = await query.limit(offset).get();
        if (!offsetSnapshot.empty) {
          const lastDoc = offsetSnapshot.docs[offsetSnapshot.docs.length - 1];
          paginatedQuery = paginatedQuery.startAfter(lastDoc);
        }
      }
      
      const snapshot = await paginatedQuery.get();
      const availabilities: Availability[] = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          resortId: data.resortId,
          resortName: data.resortName,
          accommodationTypeId: data.accommodationTypeId,
          accommodationTypeName: data.accommodationTypeName,
          dateFrom: data.dateFrom,
          dateTo: data.dateTo,
          nights: data.nights,
          priceTotal: data.priceTotal,
          pricePerNight: data.pricePerNight,
          available: data.available,
          link: data.link
        };
      });
      
      return {
        data: availabilities,
        total,
        limit,
        offset,
        hasNext: offset + limit < total,
        hasPrevious: offset > 0
      };
    } catch (error) {
      this.logger?.error('Failed to query availabilities:', error);
      throw error;
    }
  }

  async getResultsWithFilters(options: IQueryOptions): Promise<IPaginatedResults<SearchResult>> {
    try {
      let query: admin.firestore.Query = this.db.collection('results');
      
      if (options.searchId) {
        query = query.where('searchId', '==', options.searchId);
      }
      
      if (options.searchIds && options.searchIds.length > 0 && options.searchIds.length <= 10) {
        query = query.where('searchId', 'in', options.searchIds);
      }
      
      if (options.dateRange) {
        const from = typeof options.dateRange.from === 'string'
          ? admin.firestore.Timestamp.fromDate(new Date(options.dateRange.from))
          : admin.firestore.Timestamp.fromDate(options.dateRange.from);
        const to = typeof options.dateRange.to === 'string'
          ? admin.firestore.Timestamp.fromDate(new Date(options.dateRange.to))
          : admin.firestore.Timestamp.fromDate(options.dateRange.to);
        
        query = query.where('timestamp', '>=', from).where('timestamp', '<=', to);
      }
      
      // Get total count
      const countSnapshot = await query.get();
      const total = countSnapshot.size;
      
      // Apply sorting and pagination
      query = query.orderBy('timestamp', 'desc');
      const limit = options.limit || 50;
      const offset = options.offset || 0;
      
      if (offset > 0) {
        const offsetSnapshot = await query.limit(offset).get();
        if (!offsetSnapshot.empty) {
          const lastDoc = offsetSnapshot.docs[offsetSnapshot.docs.length - 1];
          query = query.startAfter(lastDoc);
        }
      }
      
      query = query.limit(limit);
      const snapshot = await query.get();
      
      const results: SearchResult[] = await Promise.all(
        snapshot.docs.map(async (doc) => {
          const data = doc.data();
          
          // Get availabilities subcollection
          const availabilitiesSnapshot = await this.db
            .collection('results')
            .doc(doc.id)
            .collection('availabilities')
            .where('isRemoved', '!=', true)
            .get();
          
          const availabilities = availabilitiesSnapshot.docs.map(availDoc => availDoc.data() as Availability);
          
          return {
            id: doc.id,
            searchId: data.searchId,
            timestamp: data.timestamp?.toDate(),
            availabilities,
            notificationSent: data.notificationSent,
            error: data.error
          } as SearchResult;
        })
      );
      
      return {
        data: results,
        total,
        limit,
        offset,
        hasNext: offset + limit < total,
        hasPrevious: offset > 0
      };
    } catch (error) {
      this.logger?.error('Failed to get results with filters:', error);
      throw error;
    }
  }

  async getResultsStatistics(options?: IQueryOptions): Promise<IResultStats> {
    try {
      // Build base query
      let query: admin.firestore.Query = this.db.collectionGroup('availabilities');
      
      if (options?.searchId) {
        const results = await this.db.collection('results')
          .where('searchId', '==', options.searchId)
          .get();
        const resultIds = results.docs.map(doc => doc.id);
        if (resultIds.length > 0 && resultIds.length <= 10) {
          query = query.where('resultId', 'in', resultIds);
        }
      }
      
      if (options?.dateRange) {
        const from = typeof options.dateRange.from === 'string'
          ? options.dateRange.from
          : options.dateRange.from.toISOString().split('T')[0];
        const to = typeof options.dateRange.to === 'string'
          ? options.dateRange.to
          : options.dateRange.to.toISOString().split('T')[0];
        
        query = query.where('dateFrom', '>=', from).where('dateTo', '<=', to);
      }
      
      // Note: Removed isRemoved filter - will filter in memory due to Firestore limitations with != in collection groups
      
      // Get all matching documents for statistics
      const snapshot = await query.get();
      const availabilities = snapshot.docs.map(doc => doc.data());
      
      // Calculate statistics
      const totalAvailabilities = availabilities.length;
      const uniqueKeys = new Set(availabilities.map(a => 
        `${a.resortId}-${a.accommodationTypeId}-${a.dateFrom}-${a.dateTo}`
      ));
      
      const prices = availabilities.map(a => a.priceTotal).filter(p => p > 0);
      const avgPrice = prices.length > 0 ? prices.reduce((a, b) => a + b, 0) / prices.length : 0;
      const sortedPrices = prices.sort((a, b) => a - b);
      const medianPrice = sortedPrices.length > 0 
        ? sortedPrices[Math.floor(sortedPrices.length / 2)]
        : 0;
      
      // Resort distribution
      const resortCounts = new Map<number, { name: string; count: number }>();
      availabilities.forEach(a => {
        const current = resortCounts.get(a.resortId) || { name: a.resortName, count: 0 };
        current.count++;
        resortCounts.set(a.resortId, current);
      });
      
      // Accommodation distribution
      const accommodationCounts = new Map<number, { name: string; count: number }>();
      availabilities.forEach(a => {
        const current = accommodationCounts.get(a.accommodationTypeId) || { name: a.accommodationTypeName, count: 0 };
        current.count++;
        accommodationCounts.set(a.accommodationTypeId, current);
      });
      
      // Nights distribution
      const nightsCounts = new Map<number, number>();
      availabilities.forEach(a => {
        nightsCounts.set(a.nights, (nightsCounts.get(a.nights) || 0) + 1);
      });
      
      // Get date range
      const dates = availabilities.map(a => a.dateFrom).filter(d => d);
      const dateRange = {
        earliest: dates.length > 0 ? dates.sort()[0] : '',
        latest: dates.length > 0 ? dates.sort()[dates.length - 1] : ''
      };
      
      // Get search and result counts
      const searchIds = new Set(availabilities.map(a => a.searchId).filter(id => id));
      const resultIds = new Set(availabilities.map(a => a.resultId).filter(id => id));
      
      return {
        totalSearches: searchIds.size,
        totalResults: resultIds.size,
        totalAvailabilities,
        uniqueAvailabilities: uniqueKeys.size,
        averagePrice: avgPrice,
        medianPrice,
        priceRange: {
          min: Math.min(...prices, 0),
          max: Math.max(...prices, 0)
        },
        resortDistribution: Array.from(resortCounts.entries()).map(([id, data]) => ({
          resortId: id,
          resortName: data.name,
          count: data.count,
          percentage: totalAvailabilities > 0 ? (data.count / totalAvailabilities) * 100 : 0
        })).sort((a, b) => b.count - a.count),
        accommodationDistribution: Array.from(accommodationCounts.entries()).map(([id, data]) => ({
          typeId: id,
          typeName: data.name,
          count: data.count,
          percentage: totalAvailabilities > 0 ? (data.count / totalAvailabilities) * 100 : 0
        })).sort((a, b) => b.count - a.count),
        nightsDistribution: Array.from(nightsCounts.entries()).map(([nights, count]) => ({
          nights,
          count,
          percentage: totalAvailabilities > 0 ? (count / totalAvailabilities) * 100 : 0
        })).sort((a, b) => a.nights - b.nights),
        dateRange,
        lastUpdated: new Date()
      };
    } catch (error) {
      this.logger?.error('Failed to get results statistics:', error);
      throw error;
    }
  }

  async exportResults(format: 'csv' | 'json', options: IQueryOptions): Promise<string> {
    try {
      const results = await this.queryAvailabilities(options);
      
      if (format === 'json') {
        return JSON.stringify(results.data, null, 2);
      }
      
      // CSV format
      if (results.data.length === 0) {
        return '';
      }
      
      const headers = [
        'Resort',
        'Accommodation Type',
        'Check-in',
        'Check-out',
        'Nights',
        'Total Price',
        'Price per Night',
        'Available',
        'Link'
      ];
      
      const rows = results.data.map(a => [
        a.resortName,
        a.accommodationTypeName,
        a.dateFrom,
        a.dateTo,
        a.nights.toString(),
        a.priceTotal.toFixed(2),
        a.pricePerNight.toFixed(2),
        a.available ? 'Yes' : 'No',
        a.link
      ]);
      
      const csvContent = [
        headers.join(','),
        ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
      ].join('\n');
      
      return csvContent;
    } catch (error) {
      this.logger?.error('Failed to export results:', error);
      throw error;
    }
  }

  async getUniqueResorts(searchId?: string): Promise<Array<{ id: number; name: string; count: number }>> {
    try {
      let query: admin.firestore.Query = this.db.collectionGroup('availabilities');
      
      if (searchId) {
        const results = await this.db.collection('results')
          .where('searchId', '==', searchId)
          .get();
        const resultIds = results.docs.map(doc => doc.id);
        if (resultIds.length > 0 && resultIds.length <= 10) {
          query = query.where('resultId', 'in', resultIds);
        }
      }
      
      // Note: Removed isRemoved filter - will filter in memory due to Firestore limitations with != in collection groups
      
      const snapshot = await query.get();
      const resortMap = new Map<number, { name: string; count: number }>();
      
      snapshot.docs.forEach(doc => {
        const data = doc.data();
        // Filter out removed items
        if (data.isRemoved === true) return;
        const current = resortMap.get(data.resortId) || { name: data.resortName, count: 0 };
        current.count++;
        resortMap.set(data.resortId, current);
      });
      
      return Array.from(resortMap.entries())
        .map(([id, data]) => ({ id, name: data.name, count: data.count }))
        .sort((a, b) => a.name.localeCompare(b.name));
    } catch (error) {
      this.logger?.error('Failed to get unique resorts:', error);
      throw error;
    }
  }

  async getUniqueAccommodationTypes(searchId?: string): Promise<Array<{ id: number; name: string; count: number }>> {
    try {
      let query: admin.firestore.Query = this.db.collectionGroup('availabilities');
      
      if (searchId) {
        const results = await this.db.collection('results')
          .where('searchId', '==', searchId)
          .get();
        const resultIds = results.docs.map(doc => doc.id);
        if (resultIds.length > 0 && resultIds.length <= 10) {
          query = query.where('resultId', 'in', resultIds);
        }
      }
      
      // Note: Removed isRemoved filter - will filter in memory due to Firestore limitations with != in collection groups
      
      const snapshot = await query.get();
      const typeMap = new Map<number, { name: string; count: number }>();
      
      snapshot.docs.forEach(doc => {
        const data = doc.data();
        // Filter out removed items
        if (data.isRemoved === true) return;
        const current = typeMap.get(data.accommodationTypeId) || { name: data.accommodationTypeName, count: 0 };
        current.count++;
        typeMap.set(data.accommodationTypeId, current);
      });
      
      return Array.from(typeMap.entries())
        .map(([id, data]) => ({ id, name: data.name, count: data.count }))
        .sort((a, b) => a.name.localeCompare(b.name));
    } catch (error) {
      this.logger?.error('Failed to get unique accommodation types:', error);
      throw error;
    }
  }

  async getUniqueStayLengths(searchId?: string): Promise<Array<{ nights: number; count: number }>> {
    try {
      let query: admin.firestore.Query = this.db.collectionGroup('availabilities');
      
      if (searchId) {
        const results = await this.db.collection('results')
          .where('searchId', '==', searchId)
          .get();
        const resultIds = results.docs.map(doc => doc.id);
        if (resultIds.length > 0 && resultIds.length <= 10) {
          query = query.where('resultId', 'in', resultIds);
        }
      }
      
      // Note: Removed isRemoved filter - will filter in memory due to Firestore limitations with != in collection groups
      
      const snapshot = await query.get();
      const nightsMap = new Map<number, number>();
      
      snapshot.docs.forEach(doc => {
        const data = doc.data();
        // Filter out removed items
        if (data.isRemoved === true) return;
        nightsMap.set(data.nights, (nightsMap.get(data.nights) || 0) + 1);
      });
      
      return Array.from(nightsMap.entries())
        .map(([nights, count]) => ({ nights, count }))
        .sort((a, b) => a.nights - b.nights);
    } catch (error) {
      this.logger?.error('Failed to get unique stay lengths:', error);
      throw error;
    }
  }

  async getDateRange(searchId?: string): Promise<{ earliest: string; latest: string }> {
    try {
      let query: admin.firestore.Query = this.db.collectionGroup('availabilities');
      
      if (searchId) {
        const results = await this.db.collection('results')
          .where('searchId', '==', searchId)
          .get();
        const resultIds = results.docs.map(doc => doc.id);
        if (resultIds.length > 0 && resultIds.length <= 10) {
          query = query.where('resultId', 'in', resultIds);
        }
      }
      
      // Note: Removed isRemoved filter - will filter in memory due to Firestore limitations with != in collection groups
      
      const snapshot = await query.get();
      const dates = snapshot.docs
        .map(doc => doc.data())
        .filter(data => data.isRemoved !== true && data.dateFrom)
        .map(data => data.dateFrom);
      
      return {
        earliest: dates.length > 0 ? dates.sort()[0] : '',
        latest: dates.length > 0 ? dates.sort()[dates.length - 1] : ''
      };
    } catch (error) {
      this.logger?.error('Failed to get date range:', error);
      throw error;
    }
  }
}