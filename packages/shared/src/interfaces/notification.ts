import { Search, SearchResult } from '../types';

export interface INotificationAdapter {
  sendNotification(search: Search, result: SearchResult): Promise<void>;
  sendError?(search: Search, error: Error): Promise<void>;
  initialize?(): Promise<void>;
}