import { FirebasePersistenceAdapter } from '@holiday-park/shared';
import { logger } from '../utils/logger';

// Check if Firebase credentials are available
const hasFirebaseCredentials = 
  process.env.FIREBASE_PROJECT_ID && 
  process.env.FIREBASE_PRIVATE_KEY && 
  process.env.FIREBASE_CLIENT_EMAIL;

if (!hasFirebaseCredentials) {
  logger.warn('Firebase credentials not found in environment variables');
  logger.warn('API will not be able to persist data. Please configure Firebase credentials.');
  logger.warn('Missing credentials:', {
    projectId: !!process.env.FIREBASE_PROJECT_ID,
    privateKey: !!process.env.FIREBASE_PRIVATE_KEY,
    clientEmail: !!process.env.FIREBASE_CLIENT_EMAIL
  });
} else {
  logger.info('Firebase credentials found:', {
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKeyLength: process.env.FIREBASE_PRIVATE_KEY?.length
  });
}

// Create and export a singleton instance of the Firebase persistence adapter
export const persistenceAdapter = hasFirebaseCredentials 
  ? new FirebasePersistenceAdapter({
      projectId: process.env.FIREBASE_PROJECT_ID!,
      privateKey: process.env.FIREBASE_PRIVATE_KEY!,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL!,
      logger: {
        debug: (msg: string, ...args: any[]) => logger.debug(msg, ...args),
        info: (msg: string, ...args: any[]) => logger.info(msg, ...args),
        warn: (msg: string, ...args: any[]) => logger.warn(msg, ...args),
        error: (msg: string, ...args: any[]) => logger.error(msg, ...args),
      }
    })
  : null as any; // Temporary null adapter for testing