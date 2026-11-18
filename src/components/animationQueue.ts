import { MOTION_MS } from "../ui/motion";

export type AnimationJob = () => Promise<void>;

interface AnimationQueueOptions {
  watchdogMs?: number;
  onWatchdog?: () => void;
  onError?: (error: unknown) => void;
}

export class AnimationQueue {
  private readonly jobs: AnimationJob[] = [];
  private running = false;
  private readonly watchdogMs: number;
  private readonly onWatchdog: () => void;
  private readonly onError: (error: unknown) => void;

  constructor(options: AnimationQueueOptions = {}) {
    this.watchdogMs = options.watchdogMs ?? MOTION_MS.watchdog;
    this.onWatchdog = options.onWatchdog ?? (() => {
      console.warn("An animation exceeded its watchdog timeout; continuing the queue.");
    });
    this.onError = options.onError ?? ((error) => {
      console.error("An animation job failed; continuing the queue.", error);
    });
  }

  get isRunning(): boolean {
    return this.running;
  }

  get size(): number {
    return this.jobs.length;
  }

  enqueue(...jobs: AnimationJob[]): void {
    this.jobs.push(...jobs);
  }

  async drain(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      while (this.jobs.length > 0) {
        const job = this.jobs.shift();
        if (job) await this.run(job);
      }
    } finally {
      this.running = false;
    }
  }

  private async run(job: AnimationJob): Promise<void> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const watchdog = new Promise<void>((resolve) => {
      timer = setTimeout(() => {
        this.onWatchdog();
        resolve();
      }, this.watchdogMs);
    });
    try {
      await Promise.race([Promise.resolve().then(job), watchdog]);
    } catch (error) {
      this.onError(error);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }
}
