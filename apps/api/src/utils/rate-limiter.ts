export type RateLimitedTask<T> = () => Promise<T>;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class SlidingWindowRateLimiter {
  private readonly timestamps: number[] = [];
  private queue: Promise<unknown> = Promise.resolve();
  private cooldownUntil = 0;

  constructor(
    private readonly maxRequests: number,
    private readonly windowMs: number
  ) {}

  private async acquireSlot(): Promise<void> {
    while (true) {
      const now = Date.now();

      if (now < this.cooldownUntil) {
        await sleep(this.cooldownUntil - now);
        continue;
      }

      while (this.timestamps.length && now - this.timestamps[0] >= this.windowMs) {
        this.timestamps.shift();
      }

      if (this.timestamps.length < this.maxRequests) {
        this.timestamps.push(now);
        return;
      }

      const waitMs = this.windowMs - (now - this.timestamps[0]) + 5;
      await sleep(Math.max(waitMs, 5));
    }
  }

  setCooldown(ms: number): void {
    this.cooldownUntil = Math.max(this.cooldownUntil, Date.now() + ms);
  }

  schedule<T>(task: RateLimitedTask<T>): Promise<T> {
    const run = async () => {
      await this.acquireSlot();
      return task();
    };

    const resultPromise = this.queue.then(run, run) as Promise<T>;

    this.queue = resultPromise.catch(() => undefined);
    return resultPromise;
  }
}