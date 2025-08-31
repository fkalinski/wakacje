export interface IProgressReporter {
  start(message: string): void;
  update(message: string, current?: number, total?: number): void;
  succeed(message: string): void;
  fail(message: string): void;
  info(message: string): void;
  warn(message: string): void;
  stop(): void;
}