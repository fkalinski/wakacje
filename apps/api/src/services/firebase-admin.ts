import * as admin from 'firebase-admin';
import { Search, SearchResult, SearchExecution, NotificationLog } from '@holiday-park/shared';
import { logger } from '../utils/logger';

export class FirebaseService {
  private db: admin.firestore.Firestore;
  private initialized = false;

  constructor() {
    this.initializeFirebase();
    this.db = admin.firestore();
  }

  private initializeFirebase() {
    if (this.initialized) return;

    try {
      const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
      
      if (!privateKey || !process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL) {
        throw new Error('Missing Firebase configuration');
      }

      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          privateKey,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        }),
      });

      this.initialized = true;
      logger.info('Firebase Admin SDK initialized');
    } catch (error) {
      logger.error('Failed to initialize Firebase:', error);
      throw error;
    }
  }

  // Search Management
  async createSearch(search: Omit<Search, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    try {
      const docRef = await this.db.collection('searches').add({
        ...search,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      logger.info(`Created search: ${docRef.id}`);
      return docRef.id;
    } catch (error) {
      logger.error('Failed to create search:', error);
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
      logger.error(`Failed to get search ${searchId}:`, error);
      throw error;
    }
  }

  async getAllSearches(enabled?: boolean): Promise<Search[]> {
    try {
      let query = this.db.collection('searches').orderBy('createdAt', 'desc');
      
      if (enabled !== undefined) {
        query = query.where('enabled', '==', enabled);
      }

      const snapshot = await query.get();
      return snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          createdAt: data.createdAt?.toDate(),
          updatedAt: data.updatedAt?.toDate(),
          schedule: {
            ...data.schedule,
            lastRun: data.schedule?.lastRun?.toDate() || null,
            nextRun: data.schedule?.nextRun?.toDate() || null,
          }
        } as Search;
      });
    } catch (error) {
      logger.error('Failed to get searches:', error);
      throw error;
    }
  }

  async updateSearch(searchId: string, updates: Partial<Search>): Promise<void> {
    try {
      await this.db.collection('searches').doc(searchId).update({
        ...updates,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      logger.info(`Updated search: ${searchId}`);
    } catch (error) {
      logger.error(`Failed to update search ${searchId}:`, error);
      throw error;
    }
  }

  async deleteSearch(searchId: string): Promise<void> {
    try {
      // Delete all related data
      const batch = this.db.batch();
      
      // Delete search
      batch.delete(this.db.collection('searches').doc(searchId));
      
      // Delete results
      const resultsSnapshot = await this.db.collection('results')
        .where('searchId', '==', searchId)
        .get();
      resultsSnapshot.docs.forEach(doc => batch.delete(doc.ref));
      
      // Delete executions
      const executionsSnapshot = await this.db.collection('executions')
        .where('searchId', '==', searchId)
        .get();
      executionsSnapshot.docs.forEach(doc => batch.delete(doc.ref));
      
      // Delete notifications
      const notificationsSnapshot = await this.db.collection('notifications')
        .where('searchId', '==', searchId)
        .get();
      notificationsSnapshot.docs.forEach(doc => batch.delete(doc.ref));
      
      await batch.commit();
      logger.info(`Deleted search and all related data: ${searchId}`);
    } catch (error) {
      logger.error(`Failed to delete search ${searchId}:`, error);
      throw error;
    }
  }

  // Search Results Management
  async saveSearchResult(result: Omit<SearchResult, 'id'>): Promise<string> {
    try {
      const docRef = await this.db.collection('results').add({
        ...result,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });
      logger.info(`Saved search result: ${docRef.id}`);
      return docRef.id;
    } catch (error) {
      logger.error('Failed to save search result:', error);
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
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        timestamp: data.timestamp?.toDate(),
      } as SearchResult;
    } catch (error) {
      logger.error(`Failed to get latest result for search ${searchId}:`, error);
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

      return snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          timestamp: data.timestamp?.toDate(),
        } as SearchResult;
      });
    } catch (error) {
      logger.error(`Failed to get results for search ${searchId}:`, error);
      throw error;
    }
  }

  // Search Execution Tracking
  async createExecution(execution: Omit<SearchExecution, 'id'>): Promise<string> {
    try {
      const docRef = await this.db.collection('executions').add({
        ...execution,
        startedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      logger.info(`Created execution: ${docRef.id}`);
      return docRef.id;
    } catch (error) {
      logger.error('Failed to create execution:', error);
      throw error;
    }
  }

  async updateExecution(executionId: string, updates: Partial<SearchExecution>): Promise<void> {
    try {
      await this.db.collection('executions').doc(executionId).update({
        ...updates,
        ...(updates.status === 'completed' || updates.status === 'failed' 
          ? { completedAt: admin.firestore.FieldValue.serverTimestamp() }
          : {}),
      });
    } catch (error) {
      logger.error(`Failed to update execution ${executionId}:`, error);
      throw error;
    }
  }

  // Notification Logging
  async logNotification(log: Omit<NotificationLog, 'id'>): Promise<void> {
    try {
      await this.db.collection('notifications').add({
        ...log,
        sentAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      logger.info(`Logged notification for search ${log.searchId}`);
    } catch (error) {
      logger.error('Failed to log notification:', error);
      throw error;
    }
  }

  // Scheduled Searches
  async getSearchesDueForExecution(): Promise<Search[]> {
    try {
      const now = new Date();
      const snapshot = await this.db.collection('searches')
        .where('enabled', '==', true)
        .where('schedule.nextRun', '<=', now)
        .get();

      return snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          createdAt: data.createdAt?.toDate(),
          updatedAt: data.updatedAt?.toDate(),
          schedule: {
            ...data.schedule,
            lastRun: data.schedule?.lastRun?.toDate() || null,
            nextRun: data.schedule?.nextRun?.toDate() || null,
          }
        } as Search;
      });
    } catch (error) {
      logger.error('Failed to get searches due for execution:', error);
      throw error;
    }
  }

  async updateSearchSchedule(searchId: string, lastRun: Date, nextRun: Date): Promise<void> {
    try {
      await this.db.collection('searches').doc(searchId).update({
        'schedule.lastRun': lastRun,
        'schedule.nextRun': nextRun,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    } catch (error) {
      logger.error(`Failed to update search schedule ${searchId}:`, error);
      throw error;
    }
  }
}

export const firebaseService = new FirebaseService();