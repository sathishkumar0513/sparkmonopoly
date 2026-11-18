import type { GameState, PlayerSetup, GameOptions } from "../engine/types";
import { readStorageItem, removeStorageItem, writeStorageItem } from "./safeStorage";

export const SAVE_KEY = "business-tycoon-save";
export const SAVE_VERSION = 1;
export const MAX_NET_WORTH_POINTS = 500;

export interface NetWorthPoint {
  turn: number;
  values: Record<string, number>;
}

export interface SavedSetup {
  themeId: string;
  players: PlayerSetup[];
  options: GameOptions;
  turnTimerSeconds?: 0 | 30 | 60 | 90;
  botSpeed?: "normal" | "fast" | "instant";
}

export interface SavedGame {
  version: number;
  state: GameState;
  history: NetWorthPoint[];
  setup: SavedSetup | null;
}

export type SaveReadResult =
  | { status: "empty" }
  | { status: "ok"; save: SavedGame; migrated: boolean }
  | { status: "corrupt"; reason: string };

export function calculateNetWorth(state: GameState, playerId: string): number {
  const player = state.players.find((candidate) => candidate.id === playerId);
  if (!player) return 0;
  return player.cash + Object.entries(player.properties).reduce((total, [tileId, holding]) => {
    const tile = state.theme.tiles.find((candidate) => candidate.id === tileId);
    if (!tile || !("price" in tile)) return total;
    const improvementValue = tile.type === "property"
      ? holding.level * Math.floor(tile.houseCost / 2)
      : 0;
    return total + (holding.mortgaged ? tile.mortgageValue : tile.price) + improvementValue;
  }, 0);
}

export function createNetWorthPoint(state: GameState): NetWorthPoint {
  return {
    turn: state.turnNumber,
    values: Object.fromEntries(
      state.players.map((player) => [player.id, calculateNetWorth(state, player.id)]),
    ),
  };
}

export function appendNetWorthPoint(
  history: NetWorthPoint[],
  state: GameState,
): NetWorthPoint[] {
  const point = createNetWorthPoint(state);
  if (history.at(-1)?.turn === point.turn && state.phase !== "gameOver") {
    return history;
  }
  return [...history, point].slice(-MAX_NET_WORTH_POINTS);
}

function isGameState(value: unknown): value is GameState {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<GameState>;
  return Boolean(
    candidate.theme &&
    Array.isArray(candidate.players) &&
    Number.isInteger(candidate.currentPlayerIndex) &&
    Number.isInteger(candidate.rngState) &&
    Array.isArray(candidate.eventLog) &&
    typeof candidate.phase === "string",
  );
}

export function migrateSave(value: unknown): SavedGame {
  if (!value || typeof value !== "object") throw new Error("Save data is not an object.");
  const record = value as Record<string, unknown>;
  if (record.version === SAVE_VERSION && isGameState(record.state)) {
    return {
      version: SAVE_VERSION,
      state: record.state,
      history: Array.isArray(record.history)
        ? (record.history as NetWorthPoint[]).slice(-MAX_NET_WORTH_POINTS)
        : [createNetWorthPoint(record.state)],
      setup: record.setup && typeof record.setup === "object"
        ? record.setup as SavedSetup
        : null,
    };
  }
  if ((record.version === 0 || record.version === undefined) && isGameState(record.state)) {
    return {
      version: SAVE_VERSION,
      state: record.state,
      history: [createNetWorthPoint(record.state)],
      setup: null,
    };
  }
  throw new Error("Save data has an unsupported version or invalid game state.");
}

export function readSaveText(text: string | null): SaveReadResult {
  if (text === null) return { status: "empty" };
  try {
    const parsed: unknown = JSON.parse(text);
    const migrated = Boolean(
      !parsed || typeof parsed !== "object" ||
      (parsed as Record<string, unknown>).version !== SAVE_VERSION,
    );
    return { status: "ok", save: migrateSave(parsed), migrated };
  } catch (error) {
    return {
      status: "corrupt",
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

export function readSavedGame(storage?: Pick<Storage, "getItem">): SaveReadResult {
  return readSaveText(storage ? storage.getItem(SAVE_KEY) : readStorageItem(SAVE_KEY));
}

export function writeSavedGame(
  save: SavedGame,
  storage?: Pick<Storage, "setItem">,
): void {
  const value = JSON.stringify({
    ...save,
    history: save.history.slice(-MAX_NET_WORTH_POINTS),
    version: SAVE_VERSION,
  });
  if (storage) storage.setItem(SAVE_KEY, value);
  else writeStorageItem(SAVE_KEY, value);
}

export function discardSavedGame(storage?: Pick<Storage, "removeItem">): void {
  if (storage) storage.removeItem(SAVE_KEY);
  else removeStorageItem(SAVE_KEY);
}
