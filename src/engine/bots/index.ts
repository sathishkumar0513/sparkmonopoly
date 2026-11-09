import { getAvailableActions, gameReducer, validateTrade } from "../gameReducer";
import { nextRandom } from "../random";
import type { GameAction, GameEvent, GameState, Player, TradeOffer } from "../types";

export type BotDifficulty = "easy" | "medium";
export type BotRandom = () => number;

export interface BotGameResult {
  state: GameState;
  outcome: "winner" | "draw";
  turns: number;
  reason: string;
}

export function createBotRandom(seed: number): BotRandom {
  let state = (seed >>> 0) || 0x6d2b79f5;
  return () => {
    const result = nextRandom(state);
    state = result.state;
    return result.value;
  };
}

export function getBotActor(state: GameState): Player | null {
  const playerId =
    state.phase === "auction"
      ? state.auction?.activePlayerId
      : state.phase === "debt"
        ? state.pendingDebt?.debtorId
        : state.phase === "trade"
          ? state.pendingTrade?.offer.toPlayerId
          : state.players[state.currentPlayerIndex]?.id;
  const player = state.players.find((candidate) => candidate.id === playerId);
  return player && player.isBot && !player.bankrupt ? player : null;
}

export function isBotActionLegal(state: GameState, action: GameAction): boolean {
  if (action.type === "PROPOSE_TRADE") {
    return (state.phase === "roll" || state.phase === "endTurn") &&
      state.players[state.currentPlayerIndex]?.id === action.offer.fromPlayerId &&
      validateTrade(state, action.offer).length === 0;
  }
  if (action.type === "COUNTER_TRADE") {
    const pending = state.pendingTrade?.offer;
    return state.phase === "trade" &&
      pending?.toPlayerId === action.offer.fromPlayerId &&
      pending.fromPlayerId === action.offer.toPlayerId &&
      validateTrade(state, action.offer).length === 0;
  }
  return getAvailableActions(state).some((candidate) =>
    candidate.type === action.type &&
    (!("tileId" in action) || ("tileId" in candidate && candidate.tileId === action.tileId)) &&
    (!("amount" in action) || ("amount" in candidate && candidate.amount === action.amount)),
  );
}

export function chooseBotAction(
  state: GameState,
  playerId: string,
  difficulty: BotDifficulty,
  rng: BotRandom,
): GameAction | null {
  const player = state.players.find((candidate) => candidate.id === playerId);
  if (!player || player.bankrupt) return null;
  const actions = getAvailableActions(state);
  const available = (type: GameAction["type"]) =>
    actions.find((action) => action.type === type);

  if (state.phase === "trade") {
    const offer = state.pendingTrade?.offer;
    if (!offer || offer.toPlayerId !== playerId) return null;
    const gained = offer.propertiesFrom.reduce(
      (total, tileId) => total + propertyValue(state, player, tileId, true),
      offer.cashFrom,
    );
    const given = offer.propertiesTo.reduce(
      (total, tileId) => total + propertyValue(state, player, tileId, false),
      offer.cashTo,
    );
    return available(gained >= given ? "ACCEPT_TRADE" : "REJECT_TRADE") ?? null;
  }

  if (state.phase === "auction" && state.auction) {
    if (state.auction.highBidderId === playerId) return available("AUCTION_PASS") ?? null;
    const tile = state.theme.tiles.find((candidate) => candidate.id === state.auction?.tileId);
    if (!tile || !("price" in tile)) return available("AUCTION_PASS") ?? null;
    const completionBonus = difficulty === "medium"
      ? colorSetCompletionBonus(state, player, tile.id)
      : 0;
    const ceiling = Math.min(
      player.cash,
      Math.round(tile.price * (difficulty === "medium" ? 1 + completionBonus : 1)),
    );
    const bid = actions
      .filter((action): action is Extract<GameAction, { type: "AUCTION_BID" }> =>
        action.type === "AUCTION_BID" && action.amount <= ceiling,
      )
      .sort((left, right) => right.amount - left.amount)[0];
    return bid ?? available("AUCTION_PASS") ?? null;
  }

  if (state.phase === "purchase" && state.pendingPurchase) {
    const tile = state.theme.tiles.find((candidate) => candidate.id === state.pendingPurchase);
    if (!tile || !("price" in tile)) return available("DECLINE_PURCHASE") ?? null;
    const salary = state.theme.tiles.find((candidate) => candidate.type === "go")?.salary ?? 0;
    const reserve = salary * (difficulty === "easy" ? 1.25 : 0.25);
    const completion = tile.type === "property"
      ? colorSetCompletionBonus(state, player, tile.id)
      : 0;
    if (
      available("BUY_PROPERTY") &&
      (player.cash - tile.price >= reserve || completion >= 0.75)
    ) {
      return available("BUY_PROPERTY") ?? null;
    }
    return available("DECLINE_PURCHASE") ?? null;
  }

  if (state.phase === "debt") {
    const debt = state.pendingDebt;
    if (!debt || debt.debtorId !== playerId) return null;
    if (available("PAY_DEBT")) return available("PAY_DEBT") ?? null;
    const liquidation = actions.filter(
      (action): action is Extract<GameAction, { type: "MORTGAGE" | "SELL_BUILDING" }> =>
        action.type === "MORTGAGE" || action.type === "SELL_BUILDING",
    );
    const useful = liquidation.find((action) => {
      const tile = state.theme.tiles.find((candidate) => candidate.id === action.tileId);
      const amount = action.type === "MORTGAGE"
        ? (tile && "mortgageValue" in tile ? tile.mortgageValue : 0)
        : (tile && "houseCost" in tile ? Math.floor(tile.houseCost / 2) : 0);
      return player.cash + amount >= debt.amount;
    });
    if (useful) return useful;
    if (liquidation.length > 0) return liquidation[0] ?? null;
    return available("DECLARE_BANKRUPTCY") ?? null;
  }

  if (state.phase === "jail") {
    if (difficulty === "easy") return available("PAY_JAIL_FINE") ?? available("ROLL_DICE") ?? null;
    const opponentsHaveBuilt = state.players.some(
      (candidate) => candidate.id !== playerId &&
        Object.values(candidate.properties).some((holding) => holding.level >= 2),
    );
    if (
      available("USE_JAIL_CARD") &&
      (player.jailTurns >= state.settings.maxJailTurns - 1 || !opponentsHaveBuilt)
    ) {
      return available("USE_JAIL_CARD") ?? null;
    }
    return available("ROLL_DICE") ?? available("PAY_JAIL_FINE") ?? null;
  }

  if (state.phase === "card") return available("RESOLVE_CARD") ?? null;
  if (state.phase === "gameOver") return null;

  if (difficulty === "medium") {
    const builds = actions.filter(
      (action): action is Extract<GameAction, { type: "BUILD_HOUSE" | "BUILD_HOTEL" }> =>
        action.type === "BUILD_HOUSE" || action.type === "BUILD_HOTEL",
    );
    const salary = state.theme.tiles.find((tile) => tile.type === "go")?.salary ?? 0;
    const cashReserve = Math.floor(salary * 0.25);
    const affordableBuild = builds
      .filter((action) => {
      const tile = state.theme.tiles.find((candidate) => candidate.id === action.tileId);
        return tile && "houseCost" in tile && player.cash - tile.houseCost >= cashReserve;
      })
      .sort((left, right) =>
        buildPriority(state, player, right) - buildPriority(state, player, left),
      )[0];
    if (affordableBuild) return affordableBuild;
    if (
      (state.phase === "roll" || state.phase === "endTurn") &&
      rng() < 0.12
    ) {
      const offer = createSetCompletionOffer(state, player);
      if (offer && validateTrade(state, offer).length === 0) {
        return { type: "PROPOSE_TRADE", offer };
      }
    }
  }

  if (state.phase === "roll") return available("ROLL_DICE") ?? null;
  if (state.phase === "endTurn") return available("END_TURN") ?? null;
  return null;
}

export function runBotGame(
  initialState: GameState,
  options: {
    turnCap?: number;
    actionCapPerTurn?: number;
    retainEventLog?: boolean;
    onEvents?: (events: GameEvent[]) => void;
  } = {},
): BotGameResult {
  const turnCap = options.turnCap ?? 1000;
  const actionCapPerTurn = options.actionCapPerTurn ?? 80;
  const retainEventLog = options.retainEventLog ?? true;
  let state = initialState;
  let rng = createBotRandom(state.rngState ^ 0x9e3779b9);
  let actionsThisTurn = 0;
  let previousActorId: string | null = null;

  while (state.phase !== "gameOver" && state.turnNumber <= turnCap) {
    const actor = getBotActor(state);
    if (!actor) {
      return {
        state,
        outcome: "draw",
        turns: state.turnNumber,
        reason: `No bot can act during the ${state.phase} phase.`,
      };
    }
    if (actor.id !== previousActorId) {
      previousActorId = actor.id;
      actionsThisTurn = 0;
    }
    if (actionsThisTurn >= actionCapPerTurn) {
      return {
        state,
        outcome: "draw",
        turns: state.turnNumber,
        reason: `Turn action cap (${actionCapPerTurn}) reached.`,
      };
    }
    const action = chooseBotAction(state, actor.id, actor.botDifficulty, rng);
    if (!action || !isBotActionLegal(state, action)) {
      return {
        state,
        outcome: "draw",
        turns: state.turnNumber,
        reason: `Bot ${actor.name} has no legal action during ${state.phase}.`,
      };
    }
    const actionState = retainEventLog ? state : { ...state, eventLog: [] };
    state = gameReducer(actionState, action);
    if (!retainEventLog) {
      options.onEvents?.(state.eventLog);
      state = { ...state, eventLog: [] };
    }
    if (action.type === "END_TURN") {
      actionsThisTurn = 0;
      previousActorId = null;
    } else {
      actionsThisTurn += 1;
    }
    rng = createBotRandom(state.rngState ^ (state.nextEventId * 0x45d9f3b));
  }
  return {
    state,
    outcome: state.phase === "gameOver" ? "winner" : "draw",
    turns: Math.min(state.turnNumber, turnCap),
    reason: state.winnerId
      ? `${state.players.find((player) => player.id === state.winnerId)?.name} won.`
      : `Reached the ${turnCap}-turn simulation cap; recorded as a draw.`,
  };
}

function propertyValue(
  state: GameState,
  player: Player,
  tileId: string,
  receiving: boolean,
): number {
  const tile = state.theme.tiles.find((candidate) => candidate.id === tileId);
  if (!tile || !("price" in tile)) return 0;
  const holding = state.players
    .map((candidate) => candidate.properties[tileId])
    .find(Boolean);
  let value = holding?.mortgaged ? Math.floor(tile.price * 0.6) : tile.price;
  if (tile.type === "property") {
    const group = state.theme.tiles.filter(
      (candidate) => candidate.type === "property" && candidate.colorGroup === tile.colorGroup,
    );
    const have = group.filter((member) => player.properties[member.id]).length;
    if (receiving && !player.properties[tileId]) {
      if (have === group.length - 1) value += tile.price;
      else if (have > 0) value += tile.price * 0.15;
    } else if (!receiving && player.properties[tileId]) {
      if (have === group.length) value += tile.price * 2;
      else if (have === group.length - 1) value += tile.price;
      else if (have > 1) value += tile.price * 0.15;
    }
  }
  return value;
}

function colorSetCompletionBonus(state: GameState, player: Player, tileId: string): number {
  const tile = state.theme.tiles.find((candidate) => candidate.id === tileId);
  if (!tile || tile.type !== "property") return 0;
  const group = state.theme.tiles.filter(
    (candidate) => candidate.type === "property" && candidate.colorGroup === tile.colorGroup,
  );
  const owned = group.filter((member) => player.properties[member.id]).length;
  return owned === group.length - 1 ? 1 : owned > 0 ? 0.35 : 0;
}

function buildPriority(
  state: GameState,
  player: Player,
  action: Extract<GameAction, { type: "BUILD_HOUSE" | "BUILD_HOTEL" }>,
): number {
  const tile = state.theme.tiles.find((candidate) => candidate.id === action.tileId);
  if (!tile || tile.type !== "property") return 0;
  const holding = player.properties[tile.id];
  if (!holding || holding.level >= 5) return 0;
  const currentRent = holding.level === 0
    ? tile.rent.colorSetDouble
    : tile.rent.houses[holding.level - 1] ?? 0;
  const nextRent = holding.level === 4
    ? tile.rent.hotel
    : tile.rent.houses[holding.level] ?? 0;
  return (nextRent - currentRent) / tile.houseCost;
}

function createSetCompletionOffer(state: GameState, player: Player): TradeOffer | null {
  let best: { offer: TradeOffer; score: number } | null = null;
  for (const tile of state.theme.tiles) {
    if (tile.type !== "property" || player.properties[tile.id]) continue;
    const group = state.theme.tiles.filter(
      (candidate) => candidate.type === "property" && candidate.colorGroup === tile.colorGroup,
    );
    const ownedInGroup = group.filter((member) => player.properties[member.id]).length;
    if (ownedInGroup !== group.length - 1) continue;
    const partner = state.players.find(
      (candidate) => !candidate.bankrupt && candidate.id !== player.id &&
        candidate.properties[tile.id],
    );
    if (!partner) continue;
    for (const ownAsset of Object.keys(player.properties)) {
      const candidate = state.theme.tiles.find((entry) => entry.id === ownAsset);
      if (!candidate || !("price" in candidate) || player.properties[ownAsset]?.level !== 0) continue;
      const senderDelta =
        propertyValue(state, player, tile.id, true) -
        propertyValue(state, player, ownAsset, false);
      const partnerDelta =
        propertyValue(state, partner, ownAsset, true) -
        propertyValue(state, partner, tile.id, false);
      const surplus = senderDelta + partnerDelta;
      if (surplus <= 0) continue;

      const cashTransfer = Math.round((senderDelta - partnerDelta) / 2);
      const offer: TradeOffer = {
        fromPlayerId: player.id,
        toPlayerId: partner.id,
        cashFrom: Math.max(0, cashTransfer),
        cashTo: Math.max(0, -cashTransfer),
        propertiesFrom: [ownAsset],
        propertiesTo: [tile.id],
        jailCardsFrom: [],
        jailCardsTo: [],
      };
      if (validateTrade(state, offer).length > 0) continue;
      const score = Math.min(senderDelta - cashTransfer, partnerDelta + cashTransfer);
      if (!best || score > best.score) best = { offer, score };
    }
  }
  return best?.offer ?? null;
}
