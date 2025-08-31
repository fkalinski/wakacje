import sqlite3 from 'sqlite3';
import { promisify } from 'util';
import path from 'path';
import { homedir } from 'os';
import fs from 'fs/promises';
import { Search, SearchResult, Availability } from '@holiday-park/shared';

export class StorageService {
  private db!: sqlite3.Database;
  private dbPath: string;
  private run!: (sql: string, params?: any[]) => Promise<void>;
  private get!: (sql: string, params?: any[]) => Promise<any>;
  private all!: (sql: string, params?: any[]) => Promise<any[]>;

  constructor() {
    const configDir = path.join(homedir(), '.holiday-park-cli');
    this.dbPath = path.join(configDir, 'searches.db');
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

    // Create indexes
    await this.run(`CREATE INDEX IF NOT EXISTS idx_search_results_search_id ON search_results(search_id)`);
    await this.run(`CREATE INDEX IF NOT EXISTS idx_search_results_timestamp ON search_results(timestamp)`);
    await this.run(`CREATE INDEX IF NOT EXISTS idx_availabilities_result_id ON availabilities(result_id)`);
  }

  async saveSearch(search: Search): Promise<string> {
    const id = search.id || this.generateId();
    const now = new Date().toISOString();
    
    const existing = await this.get('SELECT id FROM searches WHERE id = ?', [id]);
    
    if (existing) {
      await this.run(`
        UPDATE searches SET
          name = ?,
          enabled = ?,
          date_ranges = ?,
          stay_lengths = ?,
          resorts = ?,
          accommodation_types = ?,
          schedule_frequency = ?,
          schedule_custom_cron = ?,
          last_run = ?,
          next_run = ?,
          notification_email = ?,
          notification_only_changes = ?,
          updated_at = ?
        WHERE id = ?
      `, [
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
        id
      ]);
    } else {
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
    }
    
    return id;
  }

  async getSearch(id: string): Promise<Search | null> {
    const row = await this.get('SELECT * FROM searches WHERE id = ?', [id]);
    if (!row) return null;
    
    return this.rowToSearch(row);
  }

  async getAllSearches(): Promise<Search[]> {
    const rows = await this.all('SELECT * FROM searches ORDER BY created_at DESC');
    return rows.map(row => this.rowToSearch(row));
  }

  async getEnabledSearches(): Promise<Search[]> {
    const rows = await this.all('SELECT * FROM searches WHERE enabled = 1 ORDER BY created_at DESC');
    return rows.map(row => this.rowToSearch(row));
  }

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
    
    return id;
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
      availabilities: availabilities.map(a => this.rowToAvailability(a)),
      notificationSent: row.notification_sent === 1,
      error: row.error
    };
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

  async deleteSearch(id: string): Promise<void> {
    // Delete availabilities first
    await this.run(`
      DELETE FROM availabilities 
      WHERE result_id IN (SELECT id FROM search_results WHERE search_id = ?)
    `, [id]);
    
    // Delete search results
    await this.run('DELETE FROM search_results WHERE search_id = ?', [id]);
    
    // Delete search
    await this.run('DELETE FROM searches WHERE id = ?', [id]);
  }

  async close(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.close(err => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

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
}

export const storageService = new StorageService();