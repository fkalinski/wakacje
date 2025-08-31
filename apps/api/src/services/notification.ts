import { EmailNotificationAdapter } from '@holiday-park/shared';
import { logger } from '../utils/logger';

// Create and export a singleton instance of the email notification adapter
export const notificationAdapter = new EmailNotificationAdapter({
  smtp: {
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER!,
      pass: process.env.SMTP_PASS!,
    }
  },
  from: process.env.SMTP_FROM || process.env.SMTP_USER!,
  logger: {
    debug: (msg: string, ...args: any[]) => logger.debug(msg, ...args),
    info: (msg: string, ...args: any[]) => logger.info(msg, ...args),
    warn: (msg: string, ...args: any[]) => logger.warn(msg, ...args),
    error: (msg: string, ...args: any[]) => logger.error(msg, ...args),
  }
});