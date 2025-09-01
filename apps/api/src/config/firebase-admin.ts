import admin from 'firebase-admin';
import { logger } from '../utils/logger';

let isFirebaseInitialized = false;

// Initialize Firebase Admin SDK
export function initializeFirebaseAdmin() {
  // Check if Firebase Admin should be initialized
  const isCloudRun = !!process.env.K_SERVICE;
  const hasFirebaseCredentials = 
    process.env.FIREBASE_PROJECT_ID && 
    (isCloudRun || (process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL));

  if (hasFirebaseCredentials) {
    try {
      if (isCloudRun) {
        // In Cloud Run, use Application Default Credentials
        admin.initializeApp({
          projectId: process.env.FIREBASE_PROJECT_ID,
        });
        logger.info('Firebase Admin initialized with Application Default Credentials');
      } else {
        // In local development, use service account credentials
        admin.initializeApp({
          credential: admin.credential.cert({
            projectId: process.env.FIREBASE_PROJECT_ID!,
            privateKey: process.env.FIREBASE_PRIVATE_KEY!,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL!,
          }),
          projectId: process.env.FIREBASE_PROJECT_ID,
        });
        logger.info('Firebase Admin initialized with service account credentials');
      }
      isFirebaseInitialized = true;
    } catch (error) {
      logger.error('Failed to initialize Firebase Admin:', error);
      throw error;
    }
  } else {
    logger.warn('Firebase Admin not initialized - missing credentials');
    logger.warn('Authentication will not work without Firebase configuration');
  }
  
  return isFirebaseInitialized;
}

export { admin, isFirebaseInitialized };