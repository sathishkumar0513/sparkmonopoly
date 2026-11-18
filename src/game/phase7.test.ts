import { describe, expect, it } from "vitest";
import internationalData from "../themes/international.json";
import { createGame, gameReducer } from "../engine/gameReducer";
import type { GameState } from "../engine/types";
import {
  calculateNetWorth,
  appendNetWorthPoint,
  createNetWorthPoint,
  MAX_NET_WORTH_POINTS,
  readSaveText,
  SAVE_KEY,
  SAVE_VERSION,
  writeSavedGame,
} from "./saveGame";
import { getTimeoutActions } from "./turnTimeout";
import { validateSetupSeats } from "./setupValidation";

function makeGame(): GameState {
  return createGame(internationalData, [
    { id: "p1", name: "Avery", token: "🚗", color: "#54b7a6" },
    { id: "p2", name: "Blake", token: "🎩", color: "#f0a441" },
  ], { seed: 725, freeParkingJackpot: true, doubleSalaryOnGo: true });
}

describe("versioned game saves", () => {
  it("migrates a version-zero fixture and preserves deterministic engine state", () => {
    const state = makeGame();
    const result = readSaveText(JSON.stringify({ version: 0, state }));
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.migrated).toBe(true);
    expect(result.save.version).toBe(SAVE_VERSION);
    expect(result.save.state.rngState).toBe(state.rngState);
  });

  it("reports corrupted saves without silently discarding their contents", () => {
    expect(readSaveText("{invalid").status).toBe("corrupt");
  });

  it("writes and reloads an exact state, including RNG position", () => {
    const state = makeGame();
    const data = new Map<string, string>();
    const storage = {
      setItem: (key: string, value: string) => data.set(key, value),
      getItem: (key: string) => data.get(key) ?? null,
    };
    const save = {
      version: SAVE_VERSION,
      state,
      history: [createNetWorthPoint(state)],
      setup: null,
    };
    writeSavedGame(save, storage);
    const result = readSaveText(storage.getItem(SAVE_KEY) ?? null);
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.save.state).toEqual(state);
      expect(result.save.state.rngState).toBe(state.rngState);
    }
  });

  it("tracks player net worth values for the end-game chart", () => {
    const state = makeGame();
    const first = createNetWorthPoint(state);
    expect(first.values.p1).toBe(calculateNetWorth(state, "p1"));
    const withProperty: GameState = {
      ...state,
      players: state.players.map((player) => player.id === "p1"
        ? { ...player, properties: { "harbor-labs": { level: 0, mortgaged: false } } }
        : player),
    };
    expect(createNetWorthPoint(withProperty).values.p1).toBe(
      (first.values.p1 ?? 0) + 60,
    );
  });

  it("bounds saved net-worth history while retaining the latest point", () => {
    const state = makeGame();
    const history = Array.from({ length: MAX_NET_WORTH_POINTS + 20 }, (_, index) => ({
      turn: index,
      values: {},
    }));
    const bounded = appendNetWorthPoint(history, { ...state, turnNumber: 999 });

    expect(bounded).toHaveLength(MAX_NET_WORTH_POINTS);
    expect(bounded.at(-1)?.turn).toBe(999);
    expect(bounded[0]?.turn).toBe(21);
  });
});

describe("turn timeout actions", () => {
  it("chooses only a legal action for the current phase", () => {
    const state = makeGame();
    expect(getTimeoutActions(state)).toEqual([{ type: "ROLL_DICE" }]);
    expect(getTimeoutActions({ ...state, phase: "endTurn" })).toEqual([{ type: "END_TURN" }]);
    expect(getTimeoutActions({
      ...state,
      phase: "purchase",
      pendingPurchase: "harbor-labs",
    })).toEqual([{ type: "DECLINE_PURCHASE" }]);
    expect(getTimeoutActions({ ...state, phase: "gameOver" })).toEqual([]);
  });
});

describe("game setup validation and rule options", () => {
  it("requires a human and unique names, tokens, and colours", () => {
    expect(validateSetupSeats([
      { name: "Bot", kind: "bot", token: "🚗", color: "red" },
      { name: "bot", kind: "bot", token: "🚗", color: "red" },
    ])).toEqual(["human", "nameUnique", "tokenUnique", "colorUnique"]);
    expect(validateSetupSeats([
      { name: "Avery", kind: "human", token: "🚗", color: "red" },
      { name: "Blake", kind: "bot", token: "🎩", color: "blue" },
    ])).toEqual([]);
  });

  it("passes Free Parking jackpot and double salary options into engine state", () => {
    const state = makeGame();
    expect(state.settings.freeParkingJackpot).toBe(true);
    expect(state.settings.doubleSalaryOnGo).toBe(true);
  });

  it("pays double salary when the enabled rule lands exactly on Go", () => {
    const go = makeGame().theme.tiles.find((tile) => tile.type === "go");
    if (go?.type !== "go") throw new Error("Missing Go tile.");
    for (let seed = 1; seed <= 500; seed += 1) {
      const state = createGame(internationalData, [
        { id: "p1", name: "Avery" },
        { id: "p2", name: "Blake" },
      ], { seed, doubleSalaryOnGo: true });
      const positioned = {
        ...state,
        players: state.players.map((player) => player.id === "p1"
          ? { ...player, position: 38 }
          : player),
      };
      const moved = gameReducer(positioned, { type: "ROLL_DICE" });
      const salary = [...moved.eventLog].reverse().find((event) => event.type === "SALARY_COLLECTED");
      if (salary) {
        expect(salary.details.amount).toBe(go.salary * 2);
        return;
      }
    }
    throw new Error("No seeded double-one roll was found for the exact-Go test.");
  });

  it("routes resignation through engine bankruptcy and winner detection", () => {
    const state = makeGame();
    const resigned = gameReducer(state, { type: "RESIGN" });
    expect(resigned.phase).toBe("gameOver");
    expect(resigned.winnerId).toBe("p2");
    expect(resigned.players[0]?.bankrupt).toBe(true);
    expect(resigned.eventLog.some((event) => event.type === "BANKRUPTCY")).toBe(true);
    expect(resigned.eventLog.at(-1)?.type).toBe("RESIGN");
  });
});
