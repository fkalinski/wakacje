import { 
  Search, 
  SearchResult,
  SearchExecutor as SharedSearchExecutor,
  HolidayParkClient,
  SQLitePersistenceAdapter,
  ConsoleNotificationAdapter,
  ILogger,
  IProgressReporter
} from '@holiday-park/shared';
import chalk from 'chalk';
import ora from 'ora';
import path from 'path';
import { homedir } from 'os';

// Progress reporter implementation
class CLIProgressReporter implements IProgressReporter {
  private spinner: any;

  constructor(private showProgress: boolean = true) {}

  start(message: string): void {
    if (this.showProgress) {
      this.spinner = ora(message).start();
    }
  }

  update(message: string): void {
    if (this.spinner) {
      this.spinner.text = message;
    }
  }

  succeed(message: string): void {
    if (this.spinner) {
      this.spinner.succeed(message);
    }
  }

  fail(message: string): void {
    if (this.spinner) {
      this.spinner.fail(message);
    }
  }

  info(message: string): void {
    if (this.spinner) {
      this.spinner.info(message);
    } else {
      console.log(chalk.blue(`[INFO] ${message}`));
    }
  }

  warn(message: string): void {
    if (this.spinner) {
      this.spinner.warn(message);
    } else {
      console.log(chalk.yellow(`[WARN] ${message}`));
    }
  }

  stop(): void {
    if (this.spinner) {
      this.spinner.stop();
    }
  }
}

// Logger implementation
class CLILogger implements ILogger {
  debug(message: string, ...args: any[]): void {
    if (process.env.DEBUG) {
      console.log(chalk.gray(`[DEBUG] ${message}`), ...args);
    }
  }

  info(message: string, ...args: any[]): void {
    console.log(chalk.blue(`[INFO] ${message}`), ...args);
  }

  warn(message: string, ...args: any[]): void {
    console.log(chalk.yellow(`[WARN] ${message}`), ...args);
  }

  error(message: string, ...args: any[]): void {
    console.error(chalk.red(`[ERROR] ${message}`), ...args);
  }
}

export class SearchExecutor {
  private persistenceAdapter: SQLitePersistenceAdapter;
  private notificationAdapter: ConsoleNotificationAdapter;
  private logger: CLILogger;

  constructor() {
    const configDir = path.join(homedir(), '.holiday-park-cli');
    const dbPath = path.join(configDir, 'searches.db');
    
    this.logger = new CLILogger();
    
    this.persistenceAdapter = new SQLitePersistenceAdapter({ 
      dbPath,
      logger: this.logger 
    });
    
    this.notificationAdapter = new ConsoleNotificationAdapter({
      useSystemNotifications: true,
      useColors: true
    });
  }

  async initialize(): Promise<void> {
    await this.persistenceAdapter.initialize();
  }

  async executeSearch(search: Search, showProgress: boolean = true): Promise<SearchResult> {
    // Ensure persistence is initialized
    await this.initialize();
    
    // Save search if it doesn't have an ID
    if (!search.id) {
      search.id = await this.persistenceAdapter.createSearch(search);
    }
    
    const progressReporter = new CLIProgressReporter(showProgress);
    const holidayParkClient = new HolidayParkClient({
      logger: this.logger,
      progressReporter
    });
    
    const sharedExecutor = new SharedSearchExecutor({
      holidayParkClient,
      persistence: this.persistenceAdapter,
      notification: this.notificationAdapter,
      progressReporter,
      logger: this.logger
    });
    
    const result = await sharedExecutor.executeSearch(search.id);
    
    // Show changes if any (this is CLI-specific output)
    if (result.changes && (result.changes.new.length > 0 || result.changes.removed.length > 0)) {
      console.log(chalk.yellow('\n📊 Changes detected:'));
      if (result.changes.new.length > 0) {
        console.log(chalk.green(`  ✅ ${result.changes.new.length} new availabilities`));
      }
      if (result.changes.removed.length > 0) {
        console.log(chalk.red(`  ❌ ${result.changes.removed.length} removed availabilities`));
      }
    }
    
    return result;
  }

  async executeAllEnabledSearches(): Promise<void> {
    const searches = await this.persistenceAdapter.getAllSearches(true);
    console.log(chalk.cyan(`\nFound ${searches.length} enabled searches\n`));

    for (const search of searches) {
      if (!search.id) continue;
      
      try {
        await this.executeSearch(search);
        console.log(''); // Add spacing between searches
      } catch (error) {
        console.error(chalk.red(`Failed to execute search ${search.id}:`), error);
      }
    }
  }
}

export const searchExecutor = new SearchExecutor();