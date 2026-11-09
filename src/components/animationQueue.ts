export type AnimationJob = () => Promise<void>;

export class AnimationQueue {
  private readonly jobs: AnimationJob[] = [];
  private running = false;

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
        if (job) await job();
      }
    } finally {
      this.running = false;
    }
  }
}
