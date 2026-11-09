import { create } from "zustand";
import { gameReducer } from "../engine/gameReducer";
import type { GameAction, GameState, Player } from "../engine/types";
import type { Tile } from "../themes/themeSchema";

interface GameStore {
  state: GameState | null;
  startGame: (state: GameState) => void;
  dispatch: (action: GameAction) => void;
}

export const useGameStore = create<GameStore>((set) => ({
  state: null,
  startGame: (state) => set({ state }),
  dispatch: (action) =>
    set((store) => {
      if (!store.state) throw new Error("Start a game before dispatching actions.");
      return { state: gameReducer(store.state, action) };
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
