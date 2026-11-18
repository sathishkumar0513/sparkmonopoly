import { create } from "zustand";
import { gameReducer } from "../engine/gameReducer";
import type { GameAction, GameState, Player } from "../engine/types";
import type { Tile } from "../themes/themeSchema";
import {
  createNetWorthPoint,
  appendNetWorthPoint,
  discardSavedGame,
  writeSavedGame,
  type NetWorthPoint,
  type SavedSetup,
} from "../game/saveGame";

interface GameStore {
  state: GameState | null;
  history: NetWorthPoint[];
  setup: SavedSetup | null;
  startGame: (state: GameState, setup?: SavedSetup | null) => void;
  loadGame: (state: GameState, history?: NetWorthPoint[], setup?: SavedSetup | null) => void;
  clearGame: () => void;
  dispatch: (action: GameAction) => void;
}

export const useGameStore = create<GameStore>((set) => ({
  state: null,
  history: [],
  setup: null,
  startGame: (state, setup = null) => {
    const history = [createNetWorthPoint(state)];
    set({ state, history, setup });
    writeSavedGame({ version: 1, state, history, setup });
  },
  loadGame: (state, history = [createNetWorthPoint(state)], setup = null) => {
    const savedHistory = (history.length ? history : [createNetWorthPoint(state)]).slice(-500);
    set({ state, history: savedHistory, setup });
    if (state.phase === "gameOver") discardSavedGame();
    else writeSavedGame({ version: 1, state, history: savedHistory, setup });
  },
  clearGame: () => {
    discardSavedGame();
    set({ state: null, history: [], setup: null });
  },
  dispatch: (action) =>
    set((store) => {
      if (!store.state) throw new Error("Start a game before dispatching actions.");
      const state = gameReducer(store.state, action);
      let history = store.history;
      if (
        state.turnNumber !== store.state.turnNumber ||
        state.phase === "gameOver"
      ) {
        history = appendNetWorthPoint(history, state);
      }
      if (state.phase === "gameOver") {
        discardSavedGame();
      } else {
        writeSavedGame({ version: 1, state, history, setup: store.setup });
      }
      return { state, history };
    }),
}));

export const selectCurrentPlayer = (
  state: GameState | null,
): Player | null => {
  if (!state) return null;
  return state.players[state.currentPlayerIndex] ?? null;
};

export const selectTileOwner = (
  state: GameState,
  tileId: string,
): Player | null =>
  state.players.find((player) =>
    Object.prototype.hasOwnProperty.call(player.properties, tileId),
  ) ?? null;

export const selectTile = (state: GameState, tileId: string): Tile | null =>
  state.theme.tiles.find((tile) => tile.id === tileId) ?? null;
