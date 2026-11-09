import { describe, expect, it } from "vitest";
import { SOUND_IDS, getSoundSource } from "./soundRegistry";

describe("sound registry", () => {
  it("supplies valid generated audio fallbacks for every sound", () => {
    for (const id of SOUND_IDS) {
      expect(getSoundSource(id)).toMatch(/^data:audio\/wav;base64,/);
    }
  });

  it("prefers an explicitly registered replacement asset", () => {
    expect(getSoundSource("coin", { coin: "/audio/coin.wav" })).toBe(
      "/audio/coin.wav",
    );
  });
});
