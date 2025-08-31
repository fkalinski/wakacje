import sqlite3 from 'sqlite3';
import { promisify } from 'util';
import path from 'path';
import { homedir } from 'os';
import fs from 'fs/promises';
import { IPersistenceAdapter } from '../interfaces/persistence';
import { Search, SearchResult, SearchExecution, NotificationLog, Availability } from '../types';
import { ILogger } from '../interfaces/logger';
import { IQueryOptions, IResultStats, IPaginatedResults } from '../types/query';

export interface SQLitePersistenceOptions {
  dbPath?: string;
  logger?: ILogger;
}

export class SQLitePersistenceAdapter implements IPersistenceAdapter {
  private db!: sqlite3.Database;
  private dbPath: string;
  private run!: (sql: string, params?: any[]) => Promise<void>;
  private get!: (sql: string, params?: any[]) => Promise<any>;
  private all!: (sql: string, params?: any[]) => Promise<any[]>;
  private logger?: ILogger;

  constructor(options: SQLitePersistenceOptions = {}) {
    this.logger = options.logger;
    const configDir = path.join(homedir(), '.holiday-park-cli');
    this.dbPath = options.dbPath || path.join(configDir, 'searches.db');
  }

  async initialize(): Promise<void> {
    // Ensure config directory exists
    const configDir = path.dirname(this.dbPath);
    await fs.mkdir(configDir, { recursive: true });

    // Open database
    this.db = new sqlite3.Database(this.dbPath);
    
    // Promisify database methods
    this.run = promisify(this.db.run.bind(this.db));
    this.get = promisify(this.db.get.bind(this.db));
    this.all = promisify(this.db.all.bind(this.db));

    // Create tables
    await this.createTables();
    this.logger?.info('SQLite database initialized');
  }

  private async createTables(): Promise<void> {
    // Searches table
    await this.run(`
      CREATE TABLE IF NOT EXISTS searches (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        enabled INTEGER DEFAULT 1,
        date_ranges TEXT NOT NULL,
        stay_lengths TEXT NOT NULL,
        resorts TEXT,
        accommodation_types TEXT,
        schedule_frequency TEXT NOT NULL,
        schedule_custom_cron TEXT,
        last_run TEXT,
        next_run TEXT,
        notification_email TEXT,
        notification_only_changes INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Search results table
    await this.run(`
      CREATE TABLE IF NOT EXISTS search_results (
        id TEXT PRIMARY KEY,
        search_id TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        availabilities_count INTEGER DEFAULT 0,
        new_count INTEGER DEFAULT 0,
        removed_count INTEGER DEFAULT 0,
        notification_sent INTEGER DEFAULT 0,
        error TEXT,
        FOREIGN KEY (search_id) REFERENCES searches(id)
      )
    `);

    // Availabilities table
    await this.run(`
      CREATE TABLE IF NOT EXISTS availabilities (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        result_id TEXT NOT NULL,
        resort_id INTEGER NOT NULL,
        resort_name TEXT NOT NULL,
        accommodation_type_id INTEGER NOT NULL,
        accommodation_type_name TEXT NOT NULL,
        date_from TEXT NOT NULL,
        date_to TEXT NOT NULL,
        nights INTEGER NOT NULL,
        price_total REAL NOT NULL,
        price_per_night REAL NOT NULL,
        available INTEGER DEFAULT 1,
        link TEXT NOT NULL,
        is_new INTEGER DEFAULT 0,
        is_removed INTEGER DEFAULT 0,
        FOREIGN KEY (result_id) REFERENCES search_results(id)
      )
    `);

    // Executions table
    await this.run(`
      CREATE TABLE IF NOT EXISTS executions (
        id TEXT PRIMARY KEY,
        search_id TEXT NOT NULL,
        status TEXT NOT NULL,
        started_at TEXT NOT NULL,
        completed_at TEXT,
        total_checks INTEGER DEFAULT 0,
        completed_checks INTEGER DEFAULT 0,
        found_availabilities INTEGER DEFAULT 0,
        error TEXT,
        FOREIGN KEY (search_id) REFERENCES searches(id)
      )
    `);

    // Notification logs table
    await this.run(`
      CREATE TABLE IF NOT EXISTS notification_logs (
        id TEXT PRIMARY KEY,
        search_id TEXT NOT NULL,
        result_id TEXT NOT NULL,
        sent_at TEXT NOT NULL,
        recipient TEXT NOT NULL,
        subject TEXT NOT NULL,
        new_availabilities INTEGER DEFAULT 0,
        removed_availabilities INTEGER DEFAULT 0,
        success INTEGER DEFAULT 1,
        error TEXT,
        FOREIGN KEY (search_id) REFERENCES searches(id),
        FOREIGN KEY (result_id) REFERENCES search_results(id)
      )
    `);

    // Create indexes
    await this.run(`CREATE INDEX IF NOT EXISTS idx_search_results_search_id ON search_results(search_id)`);
    await this.run(`CREATE INDEX IF NOT EXISTS idx_search_results_timestamp ON search_results(timestamp)`);
    await this.run(`CREATE INDEX IF NOT EXISTS idx_availabilities_result_id ON availabilities(result_id)`);
    await this.run(`CREATE INDEX IF NOT EXISTS idx_executions_search_id ON executions(search_id)`);
    await this.run(`CREATE INDEX IF NOT EXISTS idx_notification_logs_search_id ON notification_logs(search_id)`);
  }

  // Search Management
  async createSearch(search: Omit<Search, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    const id = this.generateId();
    const now = new Date().toISOString();
    
    await this.run(`
      INSERT INTO searches (
        id, name, enabled, date_ranges, stay_lengths, resorts, 
        accommodation_types, schedule_frequency, schedule_custom_cron,
        last_run, next_run, notification_email, notification_only_changes,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      id,
      search.name,
      search.enabled ? 1 : 0,
      JSON.stringify(search.dateRanges),
      JSON.stringify(search.stayLengths),
      JSON.stringify(search.resorts),
      JSON.stringify(search.accommodationTypes),
      search.schedule.frequency,
      search.schedule.customCron || null,
      search.schedule.lastRun?.toISOString() || null,
      search.schedule.nextRun?.toISOString() || null,
      search.notifications.email,
      search.notifications.onlyChanges ? 1 : 0,
      now,
      now
    ]);
    
    this.logger?.info(`Created search: ${id}`);
    return id;
  }

  async getSearch(searchId: string): Promise<Search | null> {
    const row = await this.get('SELECT * FROM searches WHERE id = ?', [searchId]);
    if (!row) return null;
    
    return this.rowToSearch(row);
  }

  async getAllSearches(enabled?: boolean): Promise<Search[]> {
    let query = 'SELECT * FROM searches';
    const params: any[] = [];
    
    if (enabled !== undefined) {
      query += ' WHERE enabled = ?';
      params.push(enabled ? 1 : 0);
    }
    
    query += ' ORDER BY created_at DESC';
    
    const rows = await this.all(query, params);
    return rows.map((row: any) => this.rowToSearch(row));
  }

  async updateSearch(searchId: string, updates: Partial<Search>): Promise<void> {
    const updateFields: string[] = [];
    const values: any[] = [];
    
    if (updates.name !== undefined) {
      updateFields.push('name = ?');
      values.push(updates.name);
    }
    
    if (updates.enabled !== undefined) {
      updateFields.push('enabled = ?');
      values.push(updates.enabled ? 1 : 0);
    }
    
    // Add other fields as needed...
    
    updateFields.push('updated_at = ?');
    values.push(new Date().toISOString());
    
    values.push(searchId);
    
    await this.run(`UPDATE searches SET ${updateFields.join(', ')} WHERE id = ?`, values);
    this.logger?.info(`Updated search: ${searchId}`);
  }

  async deleteSearch(searchId: string): Promise<void> {
    // Delete related data first
    await this.run(`
      DELETE FROM availabilities 
      WHERE result_id IN (SELECT id FROM search_results WHERE search_id = ?)
    `, [searchId]);
    
    await this.run('DELETE FROM search_results WHERE search_id = ?', [searchId]);
    await this.run('DELETE FROM executions WHERE search_id = ?', [searchId]);
    await this.run('DELETE FROM notification_logs WHERE search_id = ?', [searchId]);
    await this.run('DELETE FROM searches WHERE id = ?', [searchId]);
    
    this.logger?.info(`Deleted search: ${searchId}`);
  }

  async updateSearchSchedule(searchId: string, lastRun: Date, nextRun: Date): Promise<void> {
    await this.run(`
      UPDATE searches 
      SET last_run = ?, next_run = ?, updated_at = ?
      WHERE id = ?
    `, [
      lastRun.toISOString(),
      nextRun.toISOString(),
      new Date().toISOString(),
      searchId
    ]);
  }

  async getSearchesDueForExecution(): Promise<Search[]> {
    const now = new Date().toISOString();
    const rows = await this.all(`
      SELECT * FROM searches 
      WHERE enabled = 1 AND (next_run IS NULL OR next_run <= ?)
      ORDER BY next_run ASC
    `, [now]);
    
    return rows.map((row: any) => this.rowToSearch(row));
  }

  // Search Results
  async saveSearchResult(result: SearchResult): Promise<string> {
    const id = result.id || this.generateId();
    
    await this.run(`
      INSERT INTO search_results (
        id, search_id, timestamp, availabilities_count,
        new_count, removed_count, notification_sent, error
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      id,
      result.searchId,
      result.timestamp.toISOString(),
      result.availabilities.length,
      result.changes?.new.length || 0,
      result.changes?.removed.length || 0,
      result.notificationSent ? 1 : 0,
      result.error || null
    ]);

    // Save availabilities
    for (const availability of result.availabilities) {
      const isNew = result.changes?.new.some(a => this.getAvailabilityKey(a) === this.getAvailabilityKey(availability));
      
      await this.run(`
        INSERT INTO availabilities (
          result_id, resort_id, resort_name, accommodation_type_id,
          accommodation_type_name, date_from, date_to, nights,
          price_total, price_per_night, available, link, is_new, is_removed
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        id,
        availability.resortId,
        availability.resortName,
        availability.accommodationTypeId,
        availability.accommodationTypeName,
        availability.dateFrom,
        availability.dateTo,
        availability.nights,
        availability.priceTotal,
        availability.pricePerNight,
        availability.available ? 1 : 0,
        availability.link,
        isNew ? 1 : 0,
        0
      ]);
    }

    // Save removed availabilities
    if (result.changes?.removed) {
      for (const availability of result.changes.removed) {
        await this.run(`
          INSERT INTO availabilities (
            result_id, resort_id, resort_name, accommodation_type_id,
            accommodation_type_name, date_from, date_to, nights,
            price_total, price_per_night, available, link, is_new, is_removed
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          id,
          availability.resortId,
          availability.resortName,
          availability.accommodationTypeId,
          availability.accommodationTypeName,
          availability.dateFrom,
          availability.dateTo,
          availability.nights,
          availability.priceTotal,
          availability.pricePerNight,
          0,
          availability.link,
          0,
          1
        ]);
      }
    }
    
    this.logger?.info(`Saved search result: ${id}`);
    return id;
  }

  async getSearchResults(searchId: string, limit: number = 10): Promise<SearchResult[]> {
    const rows = await this.all(`
      SELECT * FROM search_results 
      WHERE search_id = ? 
      ORDER BY timestamp DESC 
      LIMIT ?
    `, [searchId, limit]);
    
    const results: SearchResult[] = [];
    
    for (const row of rows) {
      const availabilities = await this.all(`
        SELECT * FROM availabilities 
        WHERE result_id = ?
      `, [row.id]);
      
      const newAvailabilities = availabilities.filter((a: any) => a.is_new === 1);
      const removedAvailabilities = availabilities.filter((a: any) => a.is_removed === 1);
      const currentAvailabilities = availabilities.filter((a: any) => a.is_removed === 0);
      
      results.push({
        id: row.id,
        searchId: row.search_id,
        timestamp: new Date(row.timestamp),
        availabilities: currentAvailabilities.map((a: any) => this.rowToAvailability(a)),
        changes: {
          new: newAvailabilities.map((a: any) => this.rowToAvailability(a)),
          removed: removedAvailabilities.map((a: any) => this.rowToAvailability(a))
        },
        notificationSent: row.notification_sent === 1,
        error: row.error
      });
    }
    
    return results;
  }

  async getLatestSearchResult(searchId: string): Promise<SearchResult | null> {
    const row = await this.get(`
      SELECT * FROM search_results 
      WHERE search_id = ? 
      ORDER BY timestamp DESC 
      LIMIT 1
    `, [searchId]);
    
    if (!row) return null;
    
    const availabilities = await this.all(`
      SELECT * FROM availabilities 
      WHERE result_id = ? AND is_removed = 0
    `, [row.id]);
    
    return {
      id: row.id,
      searchId: row.search_id,
      timestamp: new Date(row.timestamp),
      availabilities: availabilities.map((a: any) => this.rowToAvailability(a)),
      notificationSent: row.notification_sent === 1,
      error: row.error
    };
  }

  async updateSearchResult(resultId: string, updates: Partial<SearchResult>): Promise<void> {
    const updateFields: string[] = [];
    const values: any[] = [];
    
    if (updates.notificationSent !== undefined) {
      updateFields.push('notification_sent = ?');
      values.push(updates.notificationSent ? 1 : 0);
    }
    
    values.push(resultId);
    
    await this.run(`UPDATE search_results SET ${updateFields.join(', ')} WHERE id = ?`, values);
  }

  // Execution Tracking
  async createExecution(execution: Omit<SearchExecution, 'id'>): Promise<string> {
    const id = this.generateId();
    
    await this.run(`
      INSERT INTO executions (
        id, search_id, status, started_at, completed_at,
        total_checks, completed_checks, found_availabilities, error
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      id,
      execution.searchId,
      execution.status,
      execution.startedAt.toISOString(),
      execution.completedAt?.toISOString() || null,
      execution.totalChecks,
      execution.completedChecks,
      execution.foundAvailabilities,
      execution.error || null
    ]);
    
    this.logger?.info(`Created execution: ${id}`);
    return id;
  }

  async updateExecution(executionId: string, updates: Partial<SearchExecution>): Promise<void> {
    const updateFields: string[] = [];
    const values: any[] = [];
    
    if (updates.status !== undefined) {
      updateFields.push('status = ?');
      values.push(updates.status);
    }
    
    if (updates.completedAt !== undefined) {
      updateFields.push('completed_at = ?');
      values.push(updates.completedAt.toISOString());
    }
    
    if (updates.completedChecks !== undefined) {
      updateFields.push('completed_checks = ?');
      values.push(updates.completedChecks);
    }
    
    if (updates.foundAvailabilities !== undefined) {
      updateFields.push('found_availabilities = ?');
      values.push(updates.foundAvailabilities);
    }
    
    if (updates.error !== undefined) {
      updateFields.push('error = ?');
      values.push(updates.error);
    }
    
    // Only run update if there are fields to update
    if (updateFields.length > 0) {
      values.push(executionId);
      await this.run(`UPDATE executions SET ${updateFields.join(', ')} WHERE id = ?`, values);
    }
  }

  async getExecution(executionId: string): Promise<SearchExecution | null> {
    const row = await this.get('SELECT * FROM executions WHERE id = ?', [executionId]);
    if (!row) return null;
    
    return {
      searchId: row.search_id,
      status: row.status,
      startedAt: new Date(row.started_at),
      completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
      totalChecks: row.total_checks,
      completedChecks: row.completed_checks,
      foundAvailabilities: row.found_availabilities,
      error: row.error
    };
  }

  // Notification Logs
  async logNotification(log: Omit<NotificationLog, 'id'>): Promise<string> {
    const id = this.generateId();
    
    await this.run(`
      INSERT INTO notification_logs (
        id, search_id, result_id, sent_at, recipient, subject,
        new_availabilities, removed_availabilities, success, error
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      id,
      log.searchId,
      log.resultId,
      log.sentAt.toISOString(),
      log.recipient,
      log.subject,
      log.newAvailabilities,
      log.removedAvailabilities,
      log.success ? 1 : 0,
      log.error || null
    ]);
    
    this.logger?.info(`Logged notification: ${id}`);
    return id;
  }

  async getNotificationLogs(searchId: string, limit: number = 10): Promise<NotificationLog[]> {
    const rows = await this.all(`
      SELECT * FROM notification_logs 
      WHERE search_id = ? 
      ORDER BY sent_at DESC 
      LIMIT ?
    `, [searchId, limit]);
    
    return rows.map((row: any) => ({
      id: row.id,
      searchId: row.search_id,
      resultId: row.result_id,
      sentAt: new Date(row.sent_at),
      recipient: row.recipient,
      subject: row.subject,
      newAvailabilities: row.new_availabilities,
      removedAvailabilities: row.removed_availabilities,
      success: row.success === 1,
      error: row.error
    }));
  }

  async close(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.close((err: any) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  // Helper methods
  private rowToSearch(row: any): Search {
    return {
      id: row.id,
      name: row.name,
      enabled: row.enabled === 1,
      dateRanges: JSON.parse(row.date_ranges),
      stayLengths: JSON.parse(row.stay_lengths),
      resorts: JSON.parse(row.resorts),
      accommodationTypes: JSON.parse(row.accommodation_types),
      schedule: {
        frequency: row.schedule_frequency,
        customCron: row.schedule_custom_cron,
        lastRun: row.last_run ? new Date(row.last_run) : null,
        nextRun: row.next_run ? new Date(row.next_run) : null
      },
      notifications: {
        email: row.notification_email,
        onlyChanges: row.notification_only_changes === 1
      },
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    };
  }

  private rowToAvailability(row: any): Availability {
    return {
      resortId: row.resort_id,
      resortName: row.resort_name,
      accommodationTypeId: row.accommodation_type_id,
      accommodationTypeName: row.accommodation_type_name,
      dateFrom: row.date_from,
      dateTo: row.date_to,
      nights: row.nights,
      priceTotal: row.price_total,
      pricePerNight: row.price_per_night,
      available: row.available === 1,
      link: row.link
    };
  }

  private getAvailabilityKey(availability: Availability): string {
    return `${availability.resortId}-${availability.accommodationTypeId}-${availability.dateFrom}-${availability.dateTo}`;
  }

  private generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substring(2);
  }

  // Query Implementation
  async queryAvailabilities(options: IQueryOptions): Promise<IPaginatedResults<Availability>> {
    let query = `
      SELECT DISTINCT
        a.resort_id,
        a.resort_name,
        a.accommodation_type_id,
        a.accommodation_type_name,
        a.date_from,
        a.date_to,
        a.nights,
        a.price_total,
        a.price_per_night,
        a.available,
        a.link
      FROM availabilities a
      JOIN search_results sr ON a.result_id = sr.id
      WHERE 1=1
    `;
    
    const params: any[] = [];
    
    // Apply filters
    if (options.searchId) {
      query += ' AND sr.search_id = ?';
      params.push(options.searchId);
    }
    
    if (options.searchIds && options.searchIds.length > 0) {
      query += ` AND sr.search_id IN (${options.searchIds.map(() => '?').join(',')})`;
      params.push(...options.searchIds);
    }
    
    if (options.dateRange) {
      const from = typeof options.dateRange.from === 'string' 
        ? options.dateRange.from 
        : options.dateRange.from.toISOString().split('T')[0];
      const to = typeof options.dateRange.to === 'string'
        ? options.dateRange.to
        : options.dateRange.to.toISOString().split('T')[0];
      
      query += ' AND date(a.date_from) >= date(?) AND date(a.date_to) <= date(?)';
      params.push(from, to);
    }
    
    if (options.resorts && options.resorts.length > 0) {
      query += ` AND a.resort_id IN (${options.resorts.map(() => '?').join(',')})`;
      params.push(...options.resorts);
    }
    
    if (options.accommodationTypes && options.accommodationTypes.length > 0) {
      query += ` AND a.accommodation_type_id IN (${options.accommodationTypes.map(() => '?').join(',')})`;
      params.push(...options.accommodationTypes);
    }
    
    if (options.priceRange) {
      if (options.priceRange.min !== undefined) {
        query += ' AND a.price_total >= ?';
        params.push(options.priceRange.min);
      }
      if (options.priceRange.max !== undefined) {
        query += ' AND a.price_total <= ?';
        params.push(options.priceRange.max);
      }
    }
    
    if (options.stayLengths && options.stayLengths.length > 0) {
      query += ` AND a.nights IN (${options.stayLengths.map(() => '?').join(',')})`;
      params.push(...options.stayLengths);
    }
    
    if (!options.includeRemoved) {
      query += ' AND a.is_removed = 0';
    }
    
    if (options.onlyNew) {
      query += ' AND a.is_new = 1';
    }
    
    if (options.onlyRemoved) {
      query += ' AND a.is_removed = 1';
    }
    
    // Get total count
    const countQuery = query.replace(
      'SELECT DISTINCT a.resort_id, a.resort_name, a.accommodation_type_id, a.accommodation_type_name, a.date_from, a.date_to, a.nights, a.price_total, a.price_per_night, a.available, a.link',
      'SELECT COUNT(DISTINCT a.id) as total'
    );
    const countResult = await this.get(countQuery, params);
    const total = countResult?.total || 0;
    
    // Apply sorting
    const sortBy = options.sortBy || 'date';
    const sortOrder = options.sortOrder || 'asc';
    
    switch (sortBy) {
      case 'price':
        query += ` ORDER BY a.price_total ${sortOrder.toUpperCase()}`;
        break;
      case 'date':
        query += ` ORDER BY a.date_from ${sortOrder.toUpperCase()}`;
        break;
      case 'resort':
        query += ` ORDER BY a.resort_name ${sortOrder.toUpperCase()}, a.date_from ASC`;
        break;
      case 'nights':
        query += ` ORDER BY a.nights ${sortOrder.toUpperCase()}, a.price_total ASC`;
        break;
      case 'created':
        query += ` ORDER BY sr.timestamp ${sortOrder.toUpperCase()}`;
        break;
      default:
        query += ' ORDER BY a.date_from ASC';
    }
    
    // Apply pagination
    const limit = options.limit || 50;
    const offset = options.offset || 0;
    query += ' LIMIT ? OFFSET ?';
    params.push(limit, offset);
    
    const rows = await this.all(query, params);
    const availabilities = rows.map((row: any) => this.rowToAvailability(row));
    
    return {
      data: availabilities,
      total,
      limit,
      offset,
      hasNext: offset + limit < total,
      hasPrevious: offset > 0
    };
  }

  async getResultsWithFilters(options: IQueryOptions): Promise<IPaginatedResults<SearchResult>> {
    let query = `
      SELECT sr.* FROM search_results sr
      WHERE 1=1
    `;
    
    const params: any[] = [];
    
    if (options.searchId) {
      query += ' AND sr.search_id = ?';
      params.push(options.searchId);
    }
    
    if (options.searchIds && options.searchIds.length > 0) {
      query += ` AND sr.search_id IN (${options.searchIds.map(() => '?').join(',')})`;
      params.push(...options.searchIds);
    }
    
    if (options.dateRange) {
      const from = typeof options.dateRange.from === 'string'
        ? options.dateRange.from
        : options.dateRange.from.toISOString();
      const to = typeof options.dateRange.to === 'string'
        ? options.dateRange.to
        : options.dateRange.to.toISOString();
      
      query += ' AND sr.timestamp >= ? AND sr.timestamp <= ?';
      params.push(from, to);
    }
    
    // Get total count
    const countQuery = query.replace('SELECT sr.*', 'SELECT COUNT(*) as total');
    const countResult = await this.get(countQuery, params);
    const total = countResult?.total || 0;
    
    // Apply sorting
    query += ' ORDER BY sr.timestamp DESC';
    
    // Apply pagination
    const limit = options.limit || 50;
    const offset = options.offset || 0;
    query += ' LIMIT ? OFFSET ?';
    params.push(limit, offset);
    
    const rows = await this.all(query, params);
    const results: SearchResult[] = [];
    
    for (const row of rows) {
      const availabilities = await this.all(`
        SELECT * FROM availabilities 
        WHERE result_id = ? AND is_removed = 0
      `, [row.id]);
      
      const newAvailabilities = await this.all(`
        SELECT * FROM availabilities 
        WHERE result_id = ? AND is_new = 1
      `, [row.id]);
      
      const removedAvailabilities = await this.all(`
        SELECT * FROM availabilities 
        WHERE result_id = ? AND is_removed = 1
      `, [row.id]);
      
      results.push({
        id: row.id,
        searchId: row.search_id,
        timestamp: new Date(row.timestamp),
        availabilities: availabilities.map((a: any) => this.rowToAvailability(a)),
        changes: {
          new: newAvailabilities.map((a: any) => this.rowToAvailability(a)),
          removed: removedAvailabilities.map((a: any) => this.rowToAvailability(a))
        },
        notificationSent: row.notification_sent === 1,
        error: row.error
      });
    }
    
    return {
      data: results,
      total,
      limit,
      offset,
      hasNext: offset + limit < total,
      hasPrevious: offset > 0
    };
  }

  async getResultsStatistics(options?: IQueryOptions): Promise<IResultStats> {
    // Base statistics query
    let baseQuery = 'FROM availabilities a JOIN search_results sr ON a.result_id = sr.id WHERE a.is_removed = 0';
    const params: any[] = [];
    
    if (options?.searchId) {
      baseQuery += ' AND sr.search_id = ?';
      params.push(options.searchId);
    }
    
    if (options?.dateRange) {
      const from = typeof options.dateRange.from === 'string'
        ? options.dateRange.from
        : options.dateRange.from.toISOString().split('T')[0];
      const to = typeof options.dateRange.to === 'string'
        ? options.dateRange.to
        : options.dateRange.to.toISOString().split('T')[0];
      
      baseQuery += ' AND date(a.date_from) >= date(?) AND date(a.date_to) <= date(?)';
      params.push(from, to);
    }
    
    // Get basic counts
    const countStats = await this.get(`
      SELECT 
        COUNT(DISTINCT sr.search_id) as total_searches,
        COUNT(DISTINCT sr.id) as total_results,
        COUNT(*) as total_availabilities,
        COUNT(DISTINCT (a.resort_id || '-' || a.accommodation_type_id || '-' || a.date_from || '-' || a.date_to)) as unique_availabilities,
        AVG(a.price_total) as avg_price,
        MIN(a.price_total) as min_price,
        MAX(a.price_total) as max_price,
        MIN(a.date_from) as earliest_date,
        MAX(a.date_to) as latest_date
      ${baseQuery}
    `, params);
    
    // Get median price
    const medianResult = await this.get(`
      SELECT price_total FROM (
        SELECT a.price_total ${baseQuery}
        ORDER BY a.price_total
        LIMIT 1 OFFSET (SELECT COUNT(*) ${baseQuery}) / 2
      )
    `, [...params, ...params]);
    
    // Get resort distribution
    const resortDist = await this.all(`
      SELECT 
        a.resort_id,
        a.resort_name,
        COUNT(*) as count
      ${baseQuery}
      GROUP BY a.resort_id, a.resort_name
      ORDER BY count DESC
    `, params);
    
    // Get accommodation distribution
    const accommodationDist = await this.all(`
      SELECT 
        a.accommodation_type_id as type_id,
        a.accommodation_type_name as type_name,
        COUNT(*) as count
      ${baseQuery}
      GROUP BY a.accommodation_type_id, a.accommodation_type_name
      ORDER BY count DESC
    `, params);
    
    // Get nights distribution
    const nightsDist = await this.all(`
      SELECT 
        a.nights,
        COUNT(*) as count
      ${baseQuery}
      GROUP BY a.nights
      ORDER BY a.nights
    `, params);
    
    const totalAvailabilities = countStats?.total_availabilities || 0;
    
    return {
      totalSearches: countStats?.total_searches || 0,
      totalResults: countStats?.total_results || 0,
      totalAvailabilities,
      uniqueAvailabilities: countStats?.unique_availabilities || 0,
      averagePrice: countStats?.avg_price || 0,
      medianPrice: medianResult?.price_total || 0,
      priceRange: {
        min: countStats?.min_price || 0,
        max: countStats?.max_price || 0
      },
      resortDistribution: resortDist.map((r: any) => ({
        resortId: r.resort_id,
        resortName: r.resort_name,
        count: r.count,
        percentage: totalAvailabilities > 0 ? (r.count / totalAvailabilities) * 100 : 0
      })),
      accommodationDistribution: accommodationDist.map((a: any) => ({
        typeId: a.type_id,
        typeName: a.type_name,
        count: a.count,
        percentage: totalAvailabilities > 0 ? (a.count / totalAvailabilities) * 100 : 0
      })),
      nightsDistribution: nightsDist.map((n: any) => ({
        nights: n.nights,
        count: n.count,
        percentage: totalAvailabilities > 0 ? (n.count / totalAvailabilities) * 100 : 0
      })),
      dateRange: {
        earliest: countStats?.earliest_date || '',
        latest: countStats?.latest_date || ''
      },
      lastUpdated: new Date()
    };
  }

  async exportResults(format: 'csv' | 'json', options: IQueryOptions): Promise<string> {
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
  }

  async getUniqueResorts(searchId?: string): Promise<Array<{ id: number; name: string; count: number }>> {
    let query = `
      SELECT 
        a.resort_id as id,
        a.resort_name as name,
        COUNT(*) as count
      FROM availabilities a
      JOIN search_results sr ON a.result_id = sr.id
      WHERE a.is_removed = 0
    `;
    
    const params: any[] = [];
    
    if (searchId) {
      query += ' AND sr.search_id = ?';
      params.push(searchId);
    }
    
    query += ' GROUP BY a.resort_id, a.resort_name ORDER BY a.resort_name';
    
    return await this.all(query, params);
  }

  async getUniqueAccommodationTypes(searchId?: string): Promise<Array<{ id: number; name: string; count: number }>> {
    let query = `
      SELECT 
        a.accommodation_type_id as id,
        a.accommodation_type_name as name,
        COUNT(*) as count
      FROM availabilities a
      JOIN search_results sr ON a.result_id = sr.id
      WHERE a.is_removed = 0
    `;
    
    const params: any[] = [];
    
    if (searchId) {
      query += ' AND sr.search_id = ?';
      params.push(searchId);
    }
    
    query += ' GROUP BY a.accommodation_type_id, a.accommodation_type_name ORDER BY a.accommodation_type_name';
    
    return await this.all(query, params);
  }

  async getUniqueStayLengths(searchId?: string): Promise<Array<{ nights: number; count: number }>> {
    let query = `
      SELECT 
        a.nights,
        COUNT(*) as count
      FROM availabilities a
      JOIN search_results sr ON a.result_id = sr.id
      WHERE a.is_removed = 0
    `;
    
    const params: any[] = [];
    
    if (searchId) {
      query += ' AND sr.search_id = ?';
      params.push(searchId);
    }
    
    query += ' GROUP BY a.nights ORDER BY a.nights';
    
    return await this.all(query, params);
  }

  async getDateRange(searchId?: string): Promise<{ earliest: string; latest: string }> {
    let query = `
      SELECT 
        MIN(a.date_from) as earliest,
        MAX(a.date_to) as latest
      FROM availabilities a
      JOIN search_results sr ON a.result_id = sr.id
      WHERE a.is_removed = 0
    `;
    
    const params: any[] = [];
    
    if (searchId) {
      query += ' AND sr.search_id = ?';
      params.push(searchId);
    }
    
    const result = await this.get(query, params);
    
    return {
      earliest: result?.earliest || '',
      latest: result?.latest || ''
    };
  }
}