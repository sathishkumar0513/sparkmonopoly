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
});
