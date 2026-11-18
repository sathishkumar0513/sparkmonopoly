import { describe, expect, it } from "vitest";
import { AnimationQueue } from "./animationQueue";

describe("animation queue", () => {
  it("plays jobs in insertion order, including jobs enqueued during playback", async () => {
    const queue = new AnimationQueue();
    const played: string[] = [];
    queue.enqueue(async () => {
      played.push("move");
      queue.enqueue(async () => {
        played.push("landing");
      });
    });
    queue.enqueue(async () => {
      played.push("modal");
    });
    await queue.drain();
    expect(played).toEqual(["move", "modal", "landing"]);
    expect(queue.size).toBe(0);
    expect(queue.isRunning).toBe(false);
  });

  it("continues after a job is stuck beyond the watchdog timeout", async () => {
    let watchdogCalls = 0;
    const played: string[] = [];
    const queue = new AnimationQueue({
      watchdogMs: 10,
      onWatchdog: () => { watchdogCalls += 1; },
    });
    queue.enqueue(
      () => new Promise<void>(() => undefined),
      async () => { played.push("next"); },
    );

    await queue.drain();

    expect(watchdogCalls).toBe(1);
    expect(played).toEqual(["next"]);
    expect(queue.size).toBe(0);
    expect(queue.isRunning).toBe(false);
  });
});
