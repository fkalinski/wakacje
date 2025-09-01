import { FirebasePersistenceAdapter } from '@holiday-park/shared';
import { logger } from '../utils/logger';

// Check if Firebase credentials are available or if running in Cloud Run
const isCloudRun = !!process.env.K_SERVICE;
const hasFirebaseCredentials = 
  process.env.FIREBASE_PROJECT_ID && 
  (isCloudRun || (process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL));

if (!hasFirebaseCredentials) {
  logger.warn('Firebase configuration not found');
  logger.warn('API will not be able to persist data. Please configure Firebase.');
  logger.warn('Configuration status:', {
    projectId: !!process.env.FIREBASE_PROJECT_ID,
    isCloudRun,
    privateKey: !!process.env.FIREBASE_PRIVATE_KEY,
    clientEmail: !!process.env.FIREBASE_CLIENT_EMAIL
  });
} else {
  logger.info('Firebase configuration found:', {
    projectId: process.env.FIREBASE_PROJECT_ID,
    isCloudRun,
    usingApplicationDefaultCredentials: isCloudRun,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL || 'Using Application Default'
  });
}

// Create and export a singleton instance of the Firebase persistence adapter
// API always uses service account authentication (unlike CLI which uses OAuth2)
export const persistenceAdapter = hasFirebaseCredentials 
  ? new FirebasePersistenceAdapter({
      authMode: 'service-account' as const,
      serviceAccount: {
        projectId: process.env.FIREBASE_PROJECT_ID!,
        privateKey: isCloudRun ? undefined : process.env.FIREBASE_PRIVATE_KEY!,
        clientEmail: isCloudRun ? undefined : process.env.FIREBASE_CLIENT_EMAIL!,
      },
      logger: {
        debug: (msg: string, ...args: any[]) => logger.debug(msg, ...args),
        info: (msg: string, ...args: any[]) => logger.info(msg, ...args),
        warn: (msg: string, ...args: any[]) => logger.warn(msg, ...args),
        error: (msg: string, ...args: any[]) => logger.error(msg, ...args),
      }
    })
  : null as any; // Temporary null adapter for testing