const RETRYABLE_PATTERNS = ['SQLITE_BUSY', 'SQLITE_IOERR'];

export type RetryOptions = {
  maxRetries: number;
  baseDelayMs: number;
};

export type Sleeper = {
  sleep(ms: number): Promise<void>;
};

const defaultSleeper: Sleeper = {
  sleep: (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
};

export class SqliteRetryExecutor {
  public constructor(
    private readonly options: RetryOptions,
    private readonly sleeper: Sleeper = defaultSleeper
  ) {}

  public async run<T>(work: () => Promise<T>): Promise<T> {
    let attempt = 0;

    while (true) {
      try {
        return await work();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const retryable = RETRYABLE_PATTERNS.some((pattern) => message.includes(pattern));

        if (!retryable || attempt >= this.options.maxRetries) {
          throw error;
        }

        const delay = this.options.baseDelayMs * 2 ** attempt;
        await this.sleeper.sleep(delay);
        attempt += 1;
      }
    }
  }
}
