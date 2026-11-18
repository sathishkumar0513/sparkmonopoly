import { getAvailableActions } from "../engine/gameReducer";
import type { GameAction, GameState } from "../engine/types";

export function getTimeoutActions(state: GameState): GameAction[] {
  const available = getAvailableActions(state);
  if (state.phase === "purchase") {
    return available.some((action) => action.type === "DECLINE_PURCHASE")
      ? [{ type: "DECLINE_PURCHASE" }]
      : [];
  }
  if (state.phase === "jail") {
    if (available.some((action) => action.type === "PAY_JAIL_FINE")) {
      return [{ type: "PAY_JAIL_FINE" }];
    }
    return available.some((action) => action.type === "USE_JAIL_CARD")
      ? [{ type: "USE_JAIL_CARD" }]
      : [];
  }
  if (state.phase === "roll" || state.phase === "endTurn") {
    if (state.phase === "roll" && available.some((action) => action.type === "ROLL_DICE")) {
      return [{ type: "ROLL_DICE" }];
    }
    return available.some((action) => action.type === "END_TURN")
      ? [{ type: "END_TURN" }]
      : [];
  }
  if (state.phase === "card") {
    return available.some((action) => action.type === "RESOLVE_CARD")
      ? [{ type: "RESOLVE_CARD" }]
      : [];
  }
  if (state.phase === "auction") {
    return available.some((action) => action.type === "AUCTION_PASS")
      ? [{ type: "AUCTION_PASS" }]
      : [];
  }
  if (state.phase === "trade") {
    return available.some((action) => action.type === "REJECT_TRADE")
      ? [{ type: "REJECT_TRADE" }]
      : [];
  }
  if (state.phase === "debt") {
    if (available.some((action) => action.type === "PAY_DEBT")) return [{ type: "PAY_DEBT" }];
    return available.some((action) => action.type === "DECLARE_BANKRUPTCY")
      ? [{ type: "DECLARE_BANKRUPTCY" }]
      : [];
  }
  return [];
}
