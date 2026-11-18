import { validateTheme } from "../themes/themeSchema";
import type { CardEffect, Theme, ThemeCard, Tile } from "../themes/themeSchema";
import { nextRandom, shuffle } from "./random";
import type {
  AuctionState,
  BuyableTile,
  GameAction,
  GameEvent,
  GameOptions,
  GameState,
  PendingCard,
  TradeOffer,
  Player,
  PlayerSetup,
  PropertyHolding,
  UndoFrame,
} from "./types";

export const MAX_EVENT_LOG_ENTRIES = 1000;
const MAX_UNDO_FRAMES = 100;

const DEFAULT_OPTIONS = {
  startingCash: 1500,
  jailFine: 50,
  maxJailTurns: 3,
  houseSupply: 32,
  hotelSupply: 12,
  doubleSalaryOnGo: false,
  freeParkingJackpot: false,
  lateGamePressure: null,
} as const;

function assertRule(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function getTile(state: GameState, tileId: string): Tile {
  const tile = state.theme.tiles.find((candidate) => candidate.id === tileId);
  assertRule(tile, `Unknown tile id: ${tileId}`);
  return tile;
}

function getBuyableTile(state: GameState, tileId: string): BuyableTile {
  const tile = getTile(state, tileId);
  assertRule("price" in tile, `Tile "${tile.name}" cannot be purchased.`);
  return tile;
}

function getPlayer(state: GameState, playerId: string): Player {
  const player = state.players.find((candidate) => candidate.id === playerId);
  assertRule(player, `Unknown player id: ${playerId}`);
  return player;
}

function currentPlayer(state: GameState): Player {
  const player = state.players[state.currentPlayerIndex];
  assertRule(player && !player.bankrupt, "There is no active player.");
  return player;
}

function activePlayers(state: GameState): Player[] {
  return state.players.filter((player) => !player.bankrupt);
}

function snapshot(state: GameState): UndoFrame {
  return {
    players: state.players,
    currentPlayerIndex: state.currentPlayerIndex,
    phase: state.phase,
    dice: state.dice,
    consecutiveDoubles: state.consecutiveDoubles,
    turnNumber: state.turnNumber,
    rngState: state.rngState,
    decks: state.decks,
    discards: state.discards,
    pendingPurchase: state.pendingPurchase,
    auction: state.auction,
    pendingDebt: state.pendingDebt,
    pendingCard: state.pendingCard,
    pendingTrade: state.pendingTrade,
    bankAuctionQueue: state.bankAuctionQueue,
    winnerId: state.winnerId,
    freeParkingPot: state.freeParkingPot,
    afterLandingPhase: state.afterLandingPhase,
    eventLogLastId: state.eventLog.at(-1)?.id ?? 0,
  };
}

function withEvent(
  state: GameState,
  type: string,
  playerId: string | null,
  details: GameEvent["details"] = {},
): GameState {
  const event: GameEvent = {
    id: state.nextEventId,
    type,
    playerId,
    details,
  };
  return {
    ...state,
    eventLog: [...state.eventLog, event].slice(-MAX_EVENT_LOG_ENTRIES),
    nextEventId: state.nextEventId + 1,
  };
}

function updatePlayer(
  state: GameState,
  playerId: string,
  update: (player: Player) => Player,
): GameState {
  return {
    ...state,
    players: state.players.map((player) =>
      player.id === playerId ? update(player) : player,
    ),
  };
}

function shuffleDecks(
  theme: Theme,
  seed: number,
): { decks: GameState["decks"]; rngState: number } {
  const chance = shuffle(
    theme.cards.chance.map((card) => card.id),
    seed,
  );
  const communityChest = shuffle(
    theme.cards.communityChest.map((card) => card.id),
    chance.state,
  );
  return {
    decks: {
      chance: chance.values,
      communityChest: communityChest.values,
    },
    rngState: communityChest.state,
  };
}

export function createGame(
  themeData: unknown,
  playerSetups: readonly PlayerSetup[],
  options: GameOptions,
): GameState {
  const theme = validateTheme(themeData);
  assertRule(
    playerSetups.length >= 2 && playerSetups.length <= 6,
    "A game needs between two and six players.",
  );
  assertRule(new Set(playerSetups.map((player) => player.id)).size === playerSetups.length, "Player ids must be unique.");
  assertRule(
    playerSetups.every((player) => player.id && player.name.trim()),
    "Every player needs an id and name.",
  );
  assertRule(
    Number.isInteger(options.seed),
    "A whole-number seed is required for reproducible games.",
  );

  const settings = { ...DEFAULT_OPTIONS, ...options };
  for (const [key, value] of Object.entries(settings)) {
    if (typeof value === "number") {
      assertRule(Number.isFinite(value) && value >= 0, `${key} must be non-negative.`);
    }
  }
  assertRule(settings.maxJailTurns > 0, "maxJailTurns must be greater than zero.");
  if (settings.lateGamePressure) {
    assertRule(
      Number.isSafeInteger(settings.lateGamePressure.startTurn) &&
        settings.lateGamePressure.startTurn > 0,
      "lateGamePressure.startTurn must be a positive whole number.",
    );
    assertRule(
      Number.isFinite(settings.lateGamePressure.rentMultiplier) &&
        settings.lateGamePressure.rentMultiplier > 1,
      "lateGamePressure.rentMultiplier must be greater than one.",
    );
  }
  const seed = (options.seed >>> 0) || 0x6d2b79f5;
  const shuffled = shuffleDecks(theme, seed);
  const players: Player[] = playerSetups.map((setup) => ({
    id: setup.id,
    name: setup.name.trim(),
    token: setup.token,
    color: setup.color,
    isBot: setup.isBot ?? false,
    botDifficulty: setup.botDifficulty ?? "easy",
    cash: settings.startingCash,
    position: 0,
    properties: {},
    jailTurns: 0,
    jailCards: [],
    bankrupt: false,
    stats: { rentEarned: 0, rentPaid: 0 },
  }));
  const state: GameState = {
    theme,
    settings,
    players,
    currentPlayerIndex: 0,
    phase: "roll",
    dice: null,
    consecutiveDoubles: 0,
    turnNumber: 1,
    rngState: shuffled.rngState,
    decks: shuffled.decks,
    discards: { chance: [], communityChest: [] },
    pendingPurchase: null,
    auction: null,
    pendingDebt: null,
    pendingCard: null,
    pendingTrade: null,
    bankAuctionQueue: [],
    winnerId: null,
    freeParkingPot: 0,
    afterLandingPhase: "endTurn",
    eventLog: [],
    nextEventId: 1,
    undoFrames: [],
  };
  return withEvent(state, "GAME_STARTED", null, {
    themeId: theme.id,
    playerCount: players.length,
    seed,
  });
}

function ownsTile(player: Player, tileId: string): boolean {
  return Object.prototype.hasOwnProperty.call(player.properties, tileId);
}

function propertiesInGroup(state: GameState, colorGroup: string): Extract<Tile, { type: "property" }>[] {
  return state.theme.tiles.filter(
    (tile): tile is Extract<Tile, { type: "property" }> =>
      tile.type === "property" && tile.colorGroup === colorGroup,
  );
}

function ownsFullGroup(
  state: GameState,
  player: Player,
  colorGroup: string,
): boolean {
  const group = propertiesInGroup(state, colorGroup);
  return group.every((tile) => ownsTile(player, tile.id));
}

export function calculateRent(
  state: GameState,
  tileId: string,
  ownerId: string,
  diceTotal = (state.dice?.first ?? 0) + (state.dice?.second ?? 0),
): number {
  const tile = getBuyableTile(state, tileId);
  const owner = getPlayer(state, ownerId);
  const holding = owner.properties[tileId];
  if (!holding || holding.mortgaged) return 0;
  const pressure = (rent: number) => state.settings.lateGamePressure &&
    state.turnNumber >= state.settings.lateGamePressure.startTurn
    ? Math.ceil(rent * state.settings.lateGamePressure.rentMultiplier)
    : rent;

  switch (tile.type) {
    case "property": {
      if (holding.level === 5) return pressure(tile.rent.hotel);
      if (holding.level > 0) return pressure(tile.rent.houses[holding.level - 1]);
      const group = propertiesInGroup(state, tile.colorGroup);
      const completeAndClear = group.every(
        (member) =>
          ownsTile(owner, member.id) &&
          !owner.properties[member.id].mortgaged,
      );
      return pressure(completeAndClear ? tile.rent.colorSetDouble : tile.rent.base);
    }
    case "transport": {
      const count = state.theme.tiles.filter(
        (candidate) =>
          candidate.type === "transport" && ownsTile(owner, candidate.id),
      ).length;
      return pressure(count === 0 ? 0 : tile.rentByCount[count - 1]);
    }
    case "utility": {
      const count = state.theme.tiles.filter(
        (candidate) =>
          candidate.type === "utility" && ownsTile(owner, candidate.id),
      ).length;
      const multiplier = tile.diceMultipliers[count === 2 ? 1 : 0];
      return pressure(diceTotal * multiplier);
    }
    default:
      return 0;
  }
}

function transfer(
  state: GameState,
  payerId: string,
  amount: number,
  creditorId: string | null,
  reason: string,
  addToPot = false,
): GameState {
  assertRule(amount >= 0, "A payment cannot be negative.");
  const payer = getPlayer(state, payerId);
  if (payer.cash < amount) {
    return withEvent({
      ...state,
      phase: "debt",
      pendingDebt: { debtorId: payerId, creditorId, amount, reason },
    }, "PAYMENT_DUE", payerId, { amount, creditorId, reason });
  }

  let next = updatePlayer(state, payerId, (player) => ({
    ...player,
    cash: player.cash - amount,
    stats: {
      ...player.stats,
      ...(creditorId
        ? { rentPaid: player.stats.rentPaid + amount }
        : {}),
    },
  }));
  if (creditorId) {
    next = updatePlayer(next, creditorId, (player) => ({
      ...player,
      cash: player.cash + amount,
      stats: {
        ...player.stats,
        rentEarned: player.stats.rentEarned + amount,
      },
    }));
  } else if (addToPot && next.settings.freeParkingJackpot) {
    next = { ...next, freeParkingPot: next.freeParkingPot + amount };
  }
  next = withEvent(next, creditorId ? "RENT_PAID" : "PAYMENT_MADE", payerId, {
    amount,
    creditorId,
    reason,
  });
  return next;
}

function collectSalary(state: GameState, playerId: string): GameState {
  const go = state.theme.tiles.find((tile) => tile.type === "go");
  assertRule(go?.type === "go", "Theme must contain a Launch Pad tile.");
  const amount = go.salary * (state.settings.doubleSalaryOnGo ? 2 : 1);
  const next = updatePlayer(state, playerId, (player) => ({
    ...player,
    cash: player.cash + amount,
  }));
  return withEvent(next, "SALARY_COLLECTED", playerId, { amount });
}

function sendToJail(state: GameState, playerId: string): GameState {
  const jailIndex = state.theme.tiles.findIndex((tile) => tile.type === "jail");
  assertRule(jailIndex >= 0, "Theme must contain a jail tile.");
  return updatePlayer(
    {
      ...state,
      phase: "jail",
      consecutiveDoubles: 0,
      pendingPurchase: null,
      auction: null,
      pendingCard: null,
      afterLandingPhase: "endTurn",
    },
    playerId,
    (player) => ({ ...player, position: jailIndex, jailTurns: 0 }),
  );
}

function finishLanding(state: GameState): GameState {
  if (state.phase === "purchase" || state.phase === "auction" || state.phase === "card" || state.phase === "debt" || state.phase === "jail" || state.phase === "gameOver") {
    return state;
  }
  return { ...state, phase: state.afterLandingPhase };
}

function drawCard(
  state: GameState,
  playerId: string,
  deckName: "chance" | "communityChest",
  depth = 0,
): GameState {
  assertRule(depth < 8, "Card movement loop exceeded the safety limit.");
  let deck = state.decks[deckName];
  let discards = state.discards[deckName];
  let next = state;
  if (deck.length === 0) {
    const shuffled = shuffle(discards, next.rngState);
    deck = shuffled.values;
    discards = [];
    next = {
      ...next,
      rngState: shuffled.state,
      decks: { ...next.decks, [deckName]: deck },
      discards: { ...next.discards, [deckName]: discards },
    };
  }
  assertRule(deck.length > 0, `The ${deckName} deck is empty.`);
  const [cardId, ...remaining] = deck;
  const card = next.theme.cards[deckName].find((item) => item.id === cardId);
  assertRule(card, `Unknown card id: ${cardId}`);
  next = {
    ...next,
    decks: { ...next.decks, [deckName]: remaining },
    discards: { ...next.discards, [deckName]: [...discards, cardId] },
  };
  next = withEvent(next, "CARD_DRAWN", playerId, {
    deck: deckName,
    cardId,
    text: card.text,
  });
  const pendingCard: PendingCard = {
    deck: deckName,
    cardId,
    playerId,
  };
  return {
    ...next,
    phase: "card",
    pendingCard,
  };
}

export function applyCardEffect(
  state: GameState,
  playerId: string,
  card: ThemeCard,
  depth = 0,
): GameState {
  let next = state;
  const effect: CardEffect = card.effect;
  switch (effect.type) {
    case "collect":
      next = updatePlayer(next, playerId, (player) => ({
        ...player,
        cash: player.cash + effect.amount,
      }));
      break;
    case "pay":
      next = transfer(next, playerId, effect.amount, null, card.id, true);
      break;
    case "payEachPlayer": {
      const total = activePlayers(next).filter((player) => player.id !== playerId).length * effect.amount;
      if (getPlayer(next, playerId).cash < total) {
        next = transfer(next, playerId, total, null, card.id);
      } else {
        for (const other of activePlayers(next)) {
          if (other.id === playerId) continue;
          next = transfer(next, playerId, effect.amount, other.id, card.id);
        }
      }
      break;
    }
    case "move": {
      const player = getPlayer(next, playerId);
      assertRule(effect.destination < next.theme.tiles.length, "Card destination is outside the board.");
      const passedGo =
        effect.destination !== player.position &&
        effect.destination < player.position &&
        effect.collectSalaryOnPass;
      next = updatePlayer(next, playerId, (current) => ({
        ...current,
        position: effect.destination,
      }));
      if (passedGo) next = collectSalary(next, playerId);
      next = resolveLanding(next, playerId, depth + 1);
      break;
    }
    case "moveRelative": {
      const player = getPlayer(next, playerId);
      const boardSize = next.theme.tiles.length;
      const destination =
        ((player.position + effect.steps) % boardSize + boardSize) % boardSize;
      const passedGo =
        effect.steps > 0 &&
        player.position + effect.steps >= boardSize &&
        effect.collectSalaryOnPass;
      next = updatePlayer(next, playerId, (current) => ({
        ...current,
        position: destination,
      }));
      if (passedGo) next = collectSalary(next, playerId);
      next = resolveLanding(next, playerId, depth + 1);
      break;
    }
    case "jail":
      next = sendToJail(next, playerId);
      next = withEvent(next, "JAIL_ENTERED", playerId, {
        reason: "card",
        cardId: card.id,
      });
      break;
    case "getOutOfJailFree":
      next = updatePlayer(next, playerId, (player) => ({
        ...player,
        jailCards: [...player.jailCards, card.id],
      }));
      next = {
        ...next,
        discards: {
          ...next.discards,
          [card.id.startsWith("chance-") ? "chance" : "communityChest"]:
            next.discards[card.id.startsWith("chance-") ? "chance" : "communityChest"].filter(
              (id) => id !== card.id,
            ),
        },
      };
      break;
    case "repair": {
      const owner = getPlayer(next, playerId);
      const amount = Object.values(owner.properties).reduce(
        (total, holding) => {
          if (holding.level === 5) return total + effect.hotelCost;
          return total + holding.level * effect.houseCost;
        },
        0,
      );
      next = transfer(next, playerId, amount, null, card.id, true);
      break;
    }
  }
  return finishLanding(next);
}

function resolveLanding(
  state: GameState,
  playerId: string,
  depth = 0,
): GameState {
  assertRule(depth < 8, "Tile effect loop exceeded the safety limit.");
  const player = getPlayer(state, playerId);
  const tile = state.theme.tiles[player.position];
  assertRule(tile, `No tile at board position ${player.position}.`);
  let next = state;

  if (tile.type === "property" || tile.type === "transport" || tile.type === "utility") {
    const owner = next.players.find((candidate) => ownsTile(candidate, tile.id));
    if (!owner) {
      next = { ...next, phase: "purchase", pendingPurchase: tile.id };
      return next;
    }
    if (owner.id !== playerId) {
      const amount = calculateRent(next, tile.id, owner.id);
      next = withEvent(next, "RENT_DUE", playerId, {
        amount,
        creditorId: owner.id,
        tileId: tile.id,
      });
      next = transfer(next, playerId, amount, owner.id, tile.id);
    }
  } else if (tile.type === "goToJail") {
    next = sendToJail(next, playerId);
    return withEvent(next, "JAIL_ENTERED", playerId, { reason: "go-to-jail" });
  } else if (tile.type === "chance" || tile.type === "communityChest") {
    next = drawCard(next, playerId, tile.type);
  } else if (tile.type === "incomeTax" || tile.type === "luxuryTax") {
    next = withEvent(next, "TAX_DUE", playerId, {
      amount: tile.amount,
      tileId: tile.id,
      name: tile.name,
    });
    next = transfer(next, playerId, tile.amount, null, tile.id, true);
  } else if (tile.type === "freeParking" && next.settings.freeParkingJackpot) {
    const amount = next.freeParkingPot;
    next = updatePlayer(next, playerId, (current) => ({
      ...current,
      cash: current.cash + amount,
    }));
    next = { ...next, freeParkingPot: 0 };
  }
  return finishLanding(next);
}

function moveBy(state: GameState, playerId: string, steps: number): GameState {
  const boardSize = state.theme.tiles.length;
  const player = getPlayer(state, playerId);
  const rawPosition = player.position + steps;
  const passedGo = rawPosition >= boardSize;
  let next = updatePlayer(state, playerId, (current) => ({
    ...current,
    position: ((rawPosition % boardSize) + boardSize) % boardSize,
  }));
  if (passedGo) next = collectSalary(next, playerId);
  return resolveLanding(next, playerId);
}

function roll(state: GameState): GameState {
  const player = currentPlayer(state);
  assertRule(state.phase === "roll" || state.phase === "jail", "Dice can only be rolled during a turn.");
  assertRule(state.phase !== "jail" || player.jailTurns < state.settings.maxJailTurns, "Pay the jail fine or use a card.");

  const firstRandom = nextRandom(state.rngState);
  const secondRandom = nextRandom(firstRandom.state);
  const first = Math.floor(firstRandom.value * 6) + 1;
  const second = Math.floor(secondRandom.value * 6) + 1;
  const isDouble = first === second;
  const dice = { first, second, isDouble };
  let next: GameState = {
    ...state,
    dice,
    rngState: secondRandom.state,
    afterLandingPhase: isDouble && state.phase === "roll" ? "roll" : "endTurn",
  };
  const total = first + second;

  if (state.phase === "jail") {
    if (isDouble) {
      next = updatePlayer(next, player.id, (current) => ({
        ...current,
        jailTurns: 0,
      }));
      next = { ...next, phase: "roll", afterLandingPhase: "endTurn" };
      next = withEvent(next, "JAIL_RELEASED", player.id, { method: "doubles" });
      return moveBy(next, player.id, total);
    }
    const turns = player.jailTurns + 1;
    next = updatePlayer(next, player.id, (current) => ({
      ...current,
      jailTurns: turns,
    }));
    if (turns < state.settings.maxJailTurns) {
      return { ...next, phase: "jail" };
    }
    next = transfer(next, player.id, state.settings.jailFine, null, "jail-fine-roll");
    if (next.phase === "debt") return next;
    next = updatePlayer(next, player.id, (current) => ({
      ...current,
      jailTurns: 0,
    }));
    next = { ...next, phase: "roll", afterLandingPhase: "endTurn" };
    next = withEvent(next, "JAIL_RELEASED", player.id, {
      method: "third-roll-fine",
    });
    return moveBy(next, player.id, total);
  }

  if (isDouble && state.consecutiveDoubles === 2) {
    const jailed = sendToJail(
      { ...next, phase: "jail", consecutiveDoubles: 0 },
      player.id,
    );
    return withEvent(jailed, "SPEEDING", player.id, {
      reason: "three-doubles",
    });
  }
  const doubles = isDouble ? state.consecutiveDoubles + 1 : 0;
  next = { ...next, consecutiveDoubles: doubles };
  return moveBy(next, player.id, total);
}

function assignProperty(
  state: GameState,
  playerId: string,
  tileId: string,
  holding: PropertyHolding = { level: 0, mortgaged: false },
): GameState {
  const tile = getBuyableTile(state, tileId);
  assertRule(!state.players.some((candidate) => ownsTile(candidate, tileId)), "This asset already has an owner.");
  return updatePlayer(state, playerId, (current) => ({
    ...current,
    cash: current.cash - tile.price,
    properties: { ...current.properties, [tileId]: holding },
  }));
}

function buyProperty(state: GameState): GameState {
  const player = currentPlayer(state);
  assertRule(state.phase === "purchase" && state.pendingPurchase, "There is no property to buy.");
  const tile = getBuyableTile(state, state.pendingPurchase);
  assertRule(player.cash >= tile.price, "Not enough cash to buy this asset.");
  let next = assignProperty(state, player.id, tile.id);
  next = {
    ...next,
    phase: state.afterLandingPhase,
    pendingPurchase: null,
  };
  return withEvent(next, "PROPERTY_BOUGHT", player.id, {
    tileId: tile.id,
    price: tile.price,
  });
}

function nextAuctionPlayer(state: GameState, auction: AuctionState): string | null {
  const nonPassed = activePlayers(state).filter(
    (player) => !auction.passedPlayerIds.includes(player.id),
  );
  if (nonPassed.length === 0) return null;
  const currentIndex = state.players.findIndex(
    (player) => player.id === auction.activePlayerId,
  );
  for (let offset = 1; offset <= state.players.length; offset += 1) {
    const candidate = state.players[(currentIndex + offset) % state.players.length];
    if (candidate && nonPassed.some((player) => player.id === candidate.id)) {
      return candidate.id;
    }
  }
  return null;
}

function finishAuction(state: GameState, auction: AuctionState): GameState {
  const tile = getBuyableTile(state, auction.tileId);
  let next: GameState = { ...state, auction: null, pendingPurchase: null };
  if (auction.highBidderId) {
    next = updatePlayer(next, auction.highBidderId, (player) => ({
      ...player,
      cash: player.cash - auction.highBid,
      properties: {
        ...player.properties,
        [tile.id]: { level: 0, mortgaged: false },
      },
    }));
    next = withEvent(next, "AUCTION_WON", auction.highBidderId, {
      tileId: tile.id,
      amount: auction.highBid,
    });
  }
  const queue = [...next.bankAuctionQueue];
  while (queue.length > 0) {
    const tileId = queue.shift();
    if (!tileId || next.players.some((player) => ownsTile(player, tileId))) continue;
    const bidders = activePlayers(next);
    if (bidders.length < 2) break;
    const first = bidders.find(
      (player) => player.id === next.players[next.currentPlayerIndex]?.id,
    ) ?? bidders[0];
    if (!first) break;
    next = {
      ...next,
      phase: "auction",
      bankAuctionQueue: queue,
      auction: {
        tileId,
        highBid: 0,
        highBidderId: null,
        activePlayerId: first.id,
        passedPlayerIds: [],
      },
    };
    return next;
  }
  return {
    ...next,
    bankAuctionQueue: [],
    phase: next.afterLandingPhase,
  };
}

function startAuction(state: GameState): GameState {
  assertRule(state.phase === "purchase" && state.pendingPurchase, "There is no property to auction.");
  const player = currentPlayer(state);
  const active = activePlayers(state);
  const firstBidder = active[(active.indexOf(player) + 1) % active.length] ?? player;
  const auction: AuctionState = {
    tileId: state.pendingPurchase,
    highBid: 0,
    highBidderId: null,
    activePlayerId: firstBidder.id,
    passedPlayerIds: [],
  };
  return { ...state, phase: "auction", auction };
}

function auctionBid(state: GameState, amount: number): GameState {
  const auction = state.auction;
  assertRule(state.phase === "auction" && auction, "There is no active auction.");
  const bidder = getPlayer(state, auction.activePlayerId);
  assertRule(Number.isInteger(amount) && amount > auction.highBid, "A bid must exceed the current high bid.");
  assertRule(amount <= bidder.cash, "The bid exceeds the bidder's available cash.");
  const updated: AuctionState = {
    ...auction,
    highBid: amount,
    highBidderId: bidder.id,
    activePlayerId: bidder.id,
  };
  const remaining = activePlayers(state).filter(
    (player) => !updated.passedPlayerIds.includes(player.id),
  );
  if (remaining.length <= 1) return finishAuction(state, updated);
  const following = nextAuctionPlayer(state, updated);
  assertRule(following, "No other player can continue the auction.");
  return { ...state, auction: { ...updated, activePlayerId: following } };
}

function auctionPass(state: GameState): GameState {
  const auction = state.auction;
  assertRule(state.phase === "auction" && auction, "There is no active auction.");
  const passed = [...auction.passedPlayerIds, auction.activePlayerId];
  const updated = { ...auction, passedPlayerIds: passed };
  const eligible = activePlayers(state).filter(
    (player) => !passed.includes(player.id),
  );
  if (eligible.length === 0) {
    return finishAuction(state, auction);
  }
  if (eligible.length === 1) {
    if (auction.highBidderId) {
      return finishAuction(state, auction);
    }
    const lastPlayer = eligible[0];
    assertRule(lastPlayer, "Auction cannot determine the remaining player.");
    return {
      ...state,
      auction: { ...updated, activePlayerId: lastPlayer.id },
    };
  }
  const following = nextAuctionPlayer(state, updated);
  assertRule(following, "Auction cannot determine the next bidder.");
  return { ...state, auction: { ...updated, activePlayerId: following } };
}

function buildHouse(state: GameState, tileId: string): GameState {
  const player = currentPlayer(state);
  const tile = getTile(state, tileId);
  assertRule(tile.type === "property", "Buildings can only be built on properties.");
  assertRule(ownsFullGroup(state, player, tile.colorGroup), "A complete color group is required to build.");
  const group = propertiesInGroup(state, tile.colorGroup);
  assertRule(
    group.every((member) => !player.properties[member.id].mortgaged),
    "Unmortgage every property in the color group before building.",
  );
  const holding = player.properties[tileId];
  assertRule(holding.level < 4, "Build a hotel after four houses.");
  const minimum = Math.min(...group.map((member) => player.properties[member.id].level));
  assertRule(holding.level === minimum, "Buildings must be distributed evenly.");
  const housesInUse = state.players.reduce(
    (total, owner) =>
      total +
      Object.values(owner.properties).reduce(
        (sum, asset) => sum + (asset.level === 5 ? 0 : asset.level),
        0,
      ),
    0,
  );
  assertRule(housesInUse < state.settings.houseSupply, "The bank has no houses available.");
  assertRule(player.cash >= tile.houseCost, "Not enough cash to build a house.");
  return updatePlayer(state, player.id, (current) => ({
    ...current,
    cash: current.cash - tile.houseCost,
    properties: {
      ...current.properties,
      [tileId]: { ...holding, level: holding.level + 1 },
    },
  }));
}

function buildHotel(state: GameState, tileId: string): GameState {
  const player = currentPlayer(state);
  const tile = getTile(state, tileId);
  assertRule(tile.type === "property", "Hotels can only be built on properties.");
  assertRule(ownsFullGroup(state, player, tile.colorGroup), "A complete color group is required to build.");
  const group = propertiesInGroup(state, tile.colorGroup);
  assertRule(group.every((member) => !player.properties[member.id].mortgaged), "Unmortgage the color group before building.");
  assertRule(
    group.every((member) => player.properties[member.id].level >= 4),
    "Every property in the color group needs four houses before a hotel.",
  );
  const holding = player.properties[tileId];
  assertRule(holding.level === 4, "This property must have four houses before a hotel.");
  const hotelsInUse = state.players.reduce(
    (total, owner) =>
      total +
      Object.values(owner.properties).filter((asset) => asset.level === 5).length,
    0,
  );
  assertRule(hotelsInUse < state.settings.hotelSupply, "The bank has no hotels available.");
  assertRule(player.cash >= tile.houseCost, "Not enough cash to build a hotel.");
  return updatePlayer(state, player.id, (current) => ({
    ...current,
    cash: current.cash - tile.houseCost,
    properties: {
      ...current.properties,
      [tileId]: { ...holding, level: 5 },
    },
  }));
}

function sellBuilding(state: GameState, tileId: string): GameState {
  const player = currentPlayer(state);
  const tile = getTile(state, tileId);
  assertRule(tile.type === "property", "Only property buildings can be sold.");
  const holding = player.properties[tileId];
  assertRule(holding && holding.level > 0, "This property has no buildings to sell.");
  const group = propertiesInGroup(state, tile.colorGroup);
  const maximum = Math.max(...group.map((member) => player.properties[member.id]?.level ?? 0));
  assertRule(holding.level === maximum, "Buildings must be sold evenly.");
  if (holding.level === 5) {
    const housesInUse = state.players.reduce(
      (total, owner) =>
        total +
        Object.values(owner.properties).reduce(
            (sum, asset) => sum + (asset.level === 5 ? 0 : asset.level),
          0,
        ),
      0,
    );
    assertRule(
      state.settings.houseSupply - housesInUse >= 4,
      "The bank needs four houses available before a hotel can be sold.",
    );
  }
  const nextLevel = holding.level === 5 ? 4 : holding.level - 1;
  return updatePlayer(state, player.id, (current) => ({
    ...current,
    cash: current.cash + Math.floor(tile.houseCost / 2),
    properties: {
      ...current.properties,
      [tileId]: { ...holding, level: nextLevel },
    },
  }));
}

function mortgage(state: GameState, tileId: string): GameState {
  const player = currentPlayer(state);
  const tile = getBuyableTile(state, tileId);
  const holding = player.properties[tileId];
  assertRule(holding && !holding.mortgaged, "This asset cannot be mortgaged.");
  if (tile.type === "property") {
    assertRule(
      propertiesInGroup(state, tile.colorGroup).every(
        (member) =>
          !player.properties[member.id] ||
          player.properties[member.id].level === 0,
      ),
      "Sell all buildings in the color group before mortgaging.",
    );
  }
  return updatePlayer(state, player.id, (current) => ({
    ...current,
    cash: current.cash + tile.mortgageValue,
    properties: {
      ...current.properties,
      [tileId]: { ...holding, mortgaged: true },
    },
  }));
}

function unmortgage(state: GameState, tileId: string): GameState {
  const player = currentPlayer(state);
  const tile = getBuyableTile(state, tileId);
  const holding = player.properties[tileId];
  assertRule(holding?.mortgaged, "This asset is not mortgaged.");
  const cost = Math.ceil(tile.mortgageValue * 1.1);
  assertRule(player.cash >= cost, "Not enough cash to unmortgage this asset.");
  return updatePlayer(state, player.id, (current) => ({
    ...current,
    cash: current.cash - cost,
    properties: {
      ...current.properties,
      [tileId]: { ...holding, mortgaged: false },
    },
  }));
}

export function validateTrade(state: GameState, offer: TradeOffer): string[] {
  const errors: string[] = [];
  const from = state.players.find((player) => player.id === offer.fromPlayerId);
  const to = state.players.find((player) => player.id === offer.toPlayerId);
  if (!from || !to) return ["Both trade partners must be in the game."];
  if (from.id === to.id) errors.push("Choose a different trade partner.");
  if (
    offer.cashFrom === 0 && offer.cashTo === 0 &&
    offer.propertiesFrom.length === 0 && offer.propertiesTo.length === 0 &&
    offer.jailCardsFrom.length === 0 && offer.jailCardsTo.length === 0
  ) errors.push("Include cash, property, or a release card in the trade.");
  if (from.bankrupt || to.bankrupt) errors.push("Bankrupt players cannot trade.");
  if (!Number.isInteger(offer.cashFrom) || offer.cashFrom < 0 ||
      !Number.isInteger(offer.cashTo) || offer.cashTo < 0) {
    errors.push("Cash offers must be non-negative whole numbers.");
  }
  if (from.cash < offer.cashFrom) errors.push(`${from.name} does not have enough cash.`);
  if (to.cash < offer.cashTo) errors.push(`${to.name} does not have enough cash.`);
  if (new Set(offer.propertiesFrom).size !== offer.propertiesFrom.length ||
      new Set(offer.propertiesTo).size !== offer.propertiesTo.length) {
    errors.push("A property can only appear once in a trade.");
  }
  if (new Set(offer.jailCardsFrom).size !== offer.jailCardsFrom.length ||
      new Set(offer.jailCardsTo).size !== offer.jailCardsTo.length) {
    errors.push("A release card can only appear once in a trade.");
  }

  const validateAssets = (
    owner: Player,
    propertyIds: string[],
    cardIds: string[],
  ) => {
    for (const tileId of propertyIds) {
      const tile = state.theme.tiles.find((candidate) => candidate.id === tileId);
      if (!tile || !("price" in tile) || !owner.properties[tileId]) {
        errors.push(`${owner.name} does not own ${tile?.name ?? tileId}.`);
        continue;
      }
      if (tile.type === "property") {
        const group = propertiesInGroup(state, tile.colorGroup);
        const hasBuildings = group.some(
          (member) => (owner.properties[member.id]?.level ?? 0) > 0,
        );
        if (hasBuildings) {
          errors.push(`Sell all buildings in ${tile.colorGroup} before trading its properties.`);
        }
      }
    }
    const availableCards = [...owner.jailCards];
    for (const cardId of cardIds) {
      const cardIndex = availableCards.indexOf(cardId);
      if (cardIndex < 0) errors.push(`${owner.name} does not hold that release card.`);
      else availableCards.splice(cardIndex, 1);
    }
  };
  validateAssets(from, offer.propertiesFrom, offer.jailCardsFrom);
  validateAssets(to, offer.propertiesTo, offer.jailCardsTo);
  const interestFor = (owner: Player, propertyIds: string[]) =>
    propertyIds.reduce((total, tileId) => {
      const tile = state.theme.tiles.find((candidate) => candidate.id === tileId);
      return total + (
        tile && "mortgageValue" in tile && owner.properties[tileId]?.mortgaged
          ? Math.ceil(tile.mortgageValue * 0.1)
          : 0
      );
    }, 0);
  const interestFrom = interestFor(to, offer.propertiesTo);
  const interestTo = interestFor(from, offer.propertiesFrom);
  if (from.cash - offer.cashFrom + offer.cashTo < interestFrom) {
    errors.push(`${from.name} needs more cash to accept mortgage interest.`);
  }
  if (to.cash - offer.cashTo + offer.cashFrom < interestTo) {
    errors.push(`${to.name} needs more cash to accept mortgage interest.`);
  }
  return [...new Set(errors)];
}

function proposeTrade(state: GameState, offer: TradeOffer): GameState {
  assertRule(
    state.phase === "roll" || state.phase === "endTurn",
    "Trades can only be proposed between moves.",
  );
  assertRule(
    offer.fromPlayerId === currentPlayer(state).id,
    "The active player must make the trade offer.",
  );
  const errors = validateTrade(state, offer);
  assertRule(errors.length === 0, errors[0] ?? "This trade is invalid.");
  return {
    ...state,
    phase: "trade",
    pendingTrade: { offer, returnPhase: state.phase },
  };
}

function counterTrade(state: GameState, offer: TradeOffer): GameState {
  const pending = state.pendingTrade;
  assertRule(state.phase === "trade" && pending, "There is no trade to counter.");
  const currentOffer = pending.offer;
  assertRule(
    offer.fromPlayerId === currentOffer.toPlayerId &&
      offer.toPlayerId === currentOffer.fromPlayerId,
    "A counter-offer must come from the trade partner.",
  );
  const errors = validateTrade(state, offer);
  assertRule(errors.length === 0, errors[0] ?? "This counter-offer is invalid.");
  return {
    ...state,
    pendingTrade: { offer, returnPhase: pending.returnPhase },
  };
}

function resolveTrade(state: GameState, accept: boolean): GameState {
  const pending = state.pendingTrade;
  const offer = pending?.offer;
  assertRule(state.phase === "trade" && pending && offer, "There is no trade awaiting a response.");
  if (!accept) {
    const rejected: GameState = {
      ...state,
      phase: pending.returnPhase,
      pendingTrade: null,
    };
    return withEvent(rejected, "TRADE_REJECTED", offer.toPlayerId);
  }
  const errors = validateTrade(state, offer);
  assertRule(errors.length === 0, errors[0] ?? "This trade is no longer valid.");
  const from = getPlayer(state, offer.fromPlayerId);
  const to = getPlayer(state, offer.toPlayerId);
  const fromPropertyIds = offer.propertiesFrom;
  const toPropertyIds = offer.propertiesTo;
  const interestTo = fromPropertyIds.reduce((sum, tileId) => {
    const tile = getBuyableTile(state, tileId);
    return sum + (from.properties[tileId]?.mortgaged ? Math.ceil(tile.mortgageValue * 0.1) : 0);
  }, 0);
  const interestFrom = toPropertyIds.reduce((sum, tileId) => {
    const tile = getBuyableTile(state, tileId);
    return sum + (to.properties[tileId]?.mortgaged ? Math.ceil(tile.mortgageValue * 0.1) : 0);
  }, 0);
  let next: GameState = {
    ...state,
    phase: pending.returnPhase,
    pendingTrade: null,
    players: state.players.map((player) => {
      if (player.id !== from.id && player.id !== to.id) return player;
      const isFrom = player.id === from.id;
      const leaving = isFrom ? fromPropertyIds : toPropertyIds;
      const arriving = isFrom ? toPropertyIds : fromPropertyIds;
      const cardsLeaving = isFrom ? offer.jailCardsFrom : offer.jailCardsTo;
      const cardsArriving = isFrom ? offer.jailCardsTo : offer.jailCardsFrom;
      const cashOut = isFrom ? offer.cashFrom : offer.cashTo;
      const cashIn = isFrom ? offer.cashTo : offer.cashFrom;
      const interest = isFrom ? interestFrom : interestTo;
      const properties = { ...player.properties };
      for (const tileId of leaving) delete properties[tileId];
      for (const tileId of arriving) {
        const holding = (isFrom ? to : from).properties[tileId];
        if (holding) properties[tileId] = holding;
      }
      return {
        ...player,
        cash: player.cash - cashOut + cashIn - interest,
        properties,
        jailCards: [
          ...player.jailCards.filter((cardId) => !cardsLeaving.includes(cardId)),
          ...cardsArriving,
        ],
      };
    }),
  };
  next = withEvent(next, "TRADE_ACCEPTED", offer.fromPlayerId, {
    partnerId: offer.toPlayerId,
    cashFrom: offer.cashFrom,
    cashTo: offer.cashTo,
    propertiesFrom: offer.propertiesFrom.join(","),
    propertiesTo: offer.propertiesTo.join(","),
  });
  return next;
}

function payDebt(state: GameState): GameState {
  const debt = state.pendingDebt;
  assertRule(state.phase === "debt" && debt, "There is no outstanding debt.");
  assertRule(getPlayer(state, debt.debtorId).cash >= debt.amount, "There is not enough cash to settle this debt.");
  let next = transfer(state, debt.debtorId, debt.amount, debt.creditorId, debt.reason);
  next = { ...next, pendingDebt: null, phase: state.afterLandingPhase };
  if (debt.reason === "jail-fine-roll") {
    next = updatePlayer(next, debt.debtorId, (player) => ({
      ...player,
      jailTurns: 0,
    }));
    next = { ...next, phase: "roll", afterLandingPhase: "endTurn" };
    next = withEvent(next, "JAIL_RELEASED", debt.debtorId, {
      method: "third-roll-fine",
    });
    const diceTotal = (next.dice?.first ?? 0) + (next.dice?.second ?? 0);
    return moveBy(next, debt.debtorId, diceTotal);
  }
  if (debt.reason === "jail-fine") {
    next = updatePlayer(next, debt.debtorId, (player) => ({
      ...player,
      jailTurns: 0,
    }));
    next = { ...next, phase: "roll", afterLandingPhase: "endTurn" };
    return withEvent(next, "JAIL_RELEASED", debt.debtorId, {
      method: "fine",
    });
  }
  return next;
}

function bankrupt(state: GameState): GameState {
  const debt = state.pendingDebt;
  assertRule(state.phase === "debt" && debt, "Bankruptcy can only settle an outstanding debt.");
  const debtor = getPlayer(state, debt.debtorId);
  const creditor = debt.creditorId ? getPlayer(state, debt.creditorId) : null;
  let next = state;
  const surrenderedProperties = Object.keys(debtor.properties);
  if (creditor) {
    next = updatePlayer(next, creditor.id, (player) => ({
      ...player,
      cash: player.cash + debtor.cash,
      properties: { ...player.properties, ...debtor.properties },
      jailCards: [...player.jailCards, ...debtor.jailCards],
    }));
  }

  const bankAuctionQueue = creditor
    ? state.bankAuctionQueue
    : [
        ...state.bankAuctionQueue,
        ...surrenderedProperties,
      ];
  next = updatePlayer(next, debtor.id, (player) => ({
    ...player,
    cash: 0,
    bankrupt: true,
    properties: {},
    jailCards: [],
    jailTurns: 0,
  }));
  const remaining = activePlayers(next);
  const winnerId = remaining.length === 1 ? remaining[0].id : null;
  next = {
    ...next,
    bankAuctionQueue,
    pendingDebt: null,
    pendingPurchase: null,
    auction: null,
    phase: winnerId ? "gameOver" : state.afterLandingPhase,
    winnerId,
  };
  next = withEvent(next, "BANKRUPTCY", debtor.id, {
    creditorId: creditor?.id ?? null,
    amount: debt.amount,
    properties: surrenderedProperties.join(","),
  });
  if (!winnerId) {
    const nextIndex = next.players.findIndex(
      (player) =>
        player.id ===
        state.players[(state.currentPlayerIndex + 1) % state.players.length]
          ?.id,
    );
    if (nextIndex >= 0 && !next.players[nextIndex].bankrupt) {
      next = { ...next, currentPlayerIndex: nextIndex };
    } else {
      const eligibleIndex = next.players.findIndex((player) => !player.bankrupt);
      if (eligibleIndex >= 0) next = { ...next, currentPlayerIndex: eligibleIndex };
    }
  }
  if (!winnerId && bankAuctionQueue.length > 0) {
    const firstTileId = bankAuctionQueue[0];
    const bidders = activePlayers(next);
    if (bidders.length > 1 && firstTileId) {
      const first = next.players[next.currentPlayerIndex];
      next = {
        ...next,
        phase: "auction",
        bankAuctionQueue: bankAuctionQueue.slice(1),
        auction: {
          tileId: firstTileId,
          highBid: 0,
          highBidderId: null,
          activePlayerId: first?.bankrupt ? bidders[0].id : first.id,
          passedPlayerIds: [],
        },
      };
    } else {
      next = { ...next, bankAuctionQueue: [] };
    }
  }
  return next;
}

function resign(state: GameState): GameState {
  assertRule(
    state.phase === "roll" || state.phase === "endTurn" || state.phase === "jail" || state.phase === "purchase",
    "A player can resign between active moves.",
  );
  const player = currentPlayer(state);
  const debtState: GameState = {
    ...state,
    phase: "debt",
    pendingDebt: {
      debtorId: player.id,
      creditorId: null,
      amount: 0,
      reason: "resignation",
    },
  };
  return bankrupt(debtState);
}

function payJailFine(state: GameState): GameState {
  const player = currentPlayer(state);
  assertRule(state.phase === "jail", "This player is not in jail.");
  let next = transfer(state, player.id, state.settings.jailFine, null, "jail-fine");
  if (next.phase === "debt") return next;
  next = updatePlayer(next, player.id, (current) => ({
    ...current,
    jailTurns: 0,
  }));
  next = { ...next, phase: "roll", afterLandingPhase: "endTurn" };
  return withEvent(next, "JAIL_RELEASED", player.id, { method: "fine" });
}

function useJailCard(state: GameState): GameState {
  const player = currentPlayer(state);
  assertRule(state.phase === "jail", "This player is not in jail.");
  assertRule(player.jailCards.length > 0, "This player has no get-out-of-jail card.");
  const [cardId, ...remainingCards] = player.jailCards;
  const deckName = cardId.startsWith("chance-") ? "chance" : "communityChest";
  let next = updatePlayer(state, player.id, (current) => ({
    ...current,
    jailTurns: 0,
    jailCards: remainingCards,
  }));
  next = {
    ...next,
    phase: "roll",
    afterLandingPhase: "endTurn",
    discards: {
      ...next.discards,
      [deckName]: [...next.discards[deckName], cardId],
    },
  };
  return withEvent(next, "JAIL_RELEASED", player.id, { method: "card" });
}

function endTurn(state: GameState): GameState {
  assertRule(state.phase === "endTurn", "The current turn is not ready to end.");
  let nextIndex = state.currentPlayerIndex;
  for (let offset = 1; offset <= state.players.length; offset += 1) {
    const index = (state.currentPlayerIndex + offset) % state.players.length;
    if (!state.players[index].bankrupt) {
      nextIndex = index;
      break;
    }
  }
  const wrapped = nextIndex <= state.currentPlayerIndex;
  return {
    ...state,
    currentPlayerIndex: nextIndex,
    phase: "roll",
    consecutiveDoubles: 0,
    turnNumber: state.turnNumber + (wrapped ? 1 : 0),
    pendingPurchase: null,
    auction: null,
    undoFrames: [],
  };
}

function managementActions(state: GameState, player: Player): GameAction[] {
  const actions: GameAction[] = [];
  for (const [tileId, holding] of Object.entries(player.properties)) {
    const tile = state.theme.tiles.find((candidate) => candidate.id === tileId);
    if (!tile || tile.type !== "property") {
      if (holding.mortgaged && tile && "mortgageValue" in tile &&
          player.cash >= Math.ceil(tile.mortgageValue * 1.1)) {
        actions.push({ type: "UNMORTGAGE", tileId });
      } else if (tile && !holding.mortgaged) {
        actions.push({ type: "MORTGAGE", tileId });
      }
      continue;
    }
    const group = propertiesInGroup(state, tile.colorGroup);
    const complete = ownsFullGroup(state, player, tile.colorGroup);
    const groupClear = group.every((member) => !player.properties[member.id]?.mortgaged);
    const housesInUse = state.players.reduce(
      (total, owner) => total + Object.values(owner.properties).reduce(
        (sum, asset) => sum + (asset.level === 5 ? 0 : asset.level),
        0,
      ),
      0,
    );
    const hotelsInUse = state.players.reduce(
      (total, owner) => total + Object.values(owner.properties)
        .filter((asset) => asset.level === 5).length,
      0,
    );
    if (
      complete && groupClear && holding.level < 4 &&
      holding.level === Math.min(...group.map((member) => player.properties[member.id].level)) &&
      housesInUse < state.settings.houseSupply && player.cash >= tile.houseCost
    ) {
      actions.push({ type: "BUILD_HOUSE", tileId });
    } else if (
      complete && groupClear && holding.level === 4 &&
      group.every((member) => player.properties[member.id].level >= 4) &&
      hotelsInUse < state.settings.hotelSupply && player.cash >= tile.houseCost
    ) {
      actions.push({ type: "BUILD_HOTEL", tileId });
    }
    const maxLevel = Math.max(...group.map((member) => player.properties[member.id]?.level ?? 0));
    const housesAvailable = state.settings.houseSupply - housesInUse;
    if (holding.level > 0 && holding.level === maxLevel &&
        (holding.level !== 5 || housesAvailable >= 4)) {
      actions.push({ type: "SELL_BUILDING", tileId });
    }
    const groupHasBuildings = group.some(
      (member) => (player.properties[member.id]?.level ?? 0) > 0,
    );
    if (!holding.mortgaged && !groupHasBuildings) {
      actions.push({ type: "MORTGAGE", tileId });
    }
    if (holding.mortgaged && player.cash >= Math.ceil(tile.mortgageValue * 1.1)) {
      actions.push({ type: "UNMORTGAGE", tileId });
    }
  }
  return actions;
}

export type ManagementActionType =
  | "BUILD_HOUSE"
  | "BUILD_HOTEL"
  | "SELL_BUILDING"
  | "MORTGAGE"
  | "UNMORTGAGE";

export function getManagementActionReason(
  state: GameState,
  playerId: string,
  tileId: string,
  type: ManagementActionType,
): string | null {
  const player = state.players.find((candidate) => candidate.id === playerId);
  const tile = state.theme.tiles.find((candidate) => candidate.id === tileId);
  if (!player || !tile || !("price" in tile)) return "This asset cannot be managed.";
  const holding = player.properties[tileId];
  if (!holding) return "This player does not own this asset.";
  if (state.players[state.currentPlayerIndex]?.id !== playerId) {
    return "Only the active player can manage assets.";
  }
  if (type === "MORTGAGE") {
    if (holding.mortgaged) return "This asset is already mortgaged.";
    if (tile.type === "property" && propertiesInGroup(state, tile.colorGroup)
      .some((member) => (player.properties[member.id]?.level ?? 0) > 0)) {
      return "Sell all buildings in the colour set first.";
    }
    return null;
  }
  if (type === "UNMORTGAGE") {
    if (!holding.mortgaged) return "This asset is not mortgaged.";
    if (player.cash < Math.ceil(tile.mortgageValue * 1.1)) {
      return "Not enough cash to pay the 10% interest.";
    }
    return null;
  }
  if (tile.type !== "property") return "Only properties can have buildings.";
  const group = propertiesInGroup(state, tile.colorGroup);
  if (type === "SELL_BUILDING") {
    if (holding.level <= 0) return "There are no buildings to sell.";
    if (holding.level !== Math.max(...group.map((member) => player.properties[member.id]?.level ?? 0))) {
      return "Sell buildings evenly across the set.";
    }
    const used = state.players.reduce((sum, owner) => sum + Object.values(owner.properties)
      .reduce((n, asset) => n + (asset.level === 5 ? 0 : asset.level), 0), 0);
    if (holding.level === 5 && state.settings.houseSupply - used < 4) {
      return "The bank needs four houses before a hotel can be sold.";
    }
    return null;
  }
  if (!ownsFullGroup(state, player, tile.colorGroup)) return "Need the full colour set.";
  if (group.some((member) => player.properties[member.id]?.mortgaged)) {
    return "Unmortgage the colour set before building.";
  }
  if (holding.mortgaged) return "Unmortgage this property before building.";
  if (player.cash < tile.houseCost) return "Not enough cash to build.";
  if (type === "BUILD_HOUSE") {
    if (holding.level >= 4) return "Build a hotel after four houses.";
    if (holding.level !== Math.min(...group.map((member) => player.properties[member.id].level))) {
      return "Build evenly across the set.";
    }
    const used = state.players.reduce((sum, owner) => sum + Object.values(owner.properties)
      .reduce((n, asset) => n + (asset.level === 5 ? 0 : asset.level), 0), 0);
    return used >= state.settings.houseSupply ? "No houses left in the bank." : null;
  }
  if (!group.every((member) => player.properties[member.id].level >= 4)) {
    return "Every property needs four houses before a hotel.";
  }
  if (holding.level !== 4) return "This property needs four houses before a hotel.";
  const hotels = state.players.reduce((sum, owner) =>
    sum + Object.values(owner.properties).filter((asset) => asset.level === 5).length, 0);
  return hotels >= state.settings.hotelSupply ? "No hotels left in the bank." : null;
}

export function getBuildingSupply(state: GameState): { houses: number; hotels: number } {
  let housesUsed = 0;
  let hotelsUsed = 0;
  for (const player of state.players) {
    for (const holding of Object.values(player.properties)) {
      if (holding.level === 5) hotelsUsed += 1;
      else housesUsed += holding.level;
    }
  }
  return {
    houses: state.settings.houseSupply - housesUsed,
    hotels: state.settings.hotelSupply - hotelsUsed,
  };
}

export function getAvailableActions(state: GameState): GameAction[] {
  const actingPlayerId =
    state.phase === "auction"
      ? state.auction?.activePlayerId
      : state.phase === "debt"
        ? state.pendingDebt?.debtorId
        : state.phase === "trade"
          ? state.pendingTrade?.offer.toPlayerId
          : state.players[state.currentPlayerIndex]?.id;
  const player = state.players.find((candidate) => candidate.id === actingPlayerId);
  if (!player || player.bankrupt) return [];

  switch (state.phase) {
    case "roll":
      return [{ type: "ROLL_DICE" }, { type: "RESIGN" }, ...managementActions(state, player)];
    case "jail": {
      const actions: GameAction[] = [{ type: "ROLL_DICE" }, { type: "RESIGN" }];
      actions.push({ type: "PAY_JAIL_FINE" });
      if (player.jailCards.length > 0) actions.push({ type: "USE_JAIL_CARD" });
      return actions;
    }
    case "purchase": {
      if (!state.pendingPurchase) return [];
      const tile = getBuyableTile(state, state.pendingPurchase);
      return [
        { type: "RESIGN" },
        ...(player.cash >= tile.price ? [{ type: "BUY_PROPERTY" as const }] : []),
        { type: "DECLINE_PURCHASE" },
      ];
    }
    case "auction": {
      if (!state.auction) return [];
      const bidder = state.players.find(
        (candidate) => candidate.id === state.auction?.activePlayerId,
      );
      if (!bidder) return [];
      const bids = [...new Set([
        state.auction.highBid + 1,
        state.auction.highBid + 10,
        state.auction.highBid + 50,
        state.auction.highBid + 100,
        bidder.cash,
      ])]
        .filter((amount) => amount > state.auction!.highBid && amount <= bidder.cash)
        .map((amount) => ({ type: "AUCTION_BID" as const, amount }));
      return [
        ...bids,
        { type: "AUCTION_PASS" as const },
      ];
    }
    case "trade": {
      const offer = state.pendingTrade?.offer;
      if (!offer || offer.toPlayerId !== player.id) return [];
      return [{ type: "ACCEPT_TRADE" }, { type: "REJECT_TRADE" }];
    }
    case "card":
      return state.pendingCard ? [{ type: "RESOLVE_CARD" }] : [];
    case "debt": {
      const debt = state.pendingDebt;
      if (!debt || debt.debtorId !== player.id) return [];
      const debtActions = managementActions(state, player).filter(
        (action) => action.type === "MORTGAGE" || action.type === "SELL_BUILDING",
      );
      return [
        ...(player.cash >= debt.amount
          ? [{ type: "PAY_DEBT" as const }]
          : []),
        ...debtActions,
        { type: "DECLARE_BANKRUPTCY" },
      ];
    }
    case "endTurn":
      return [{ type: "END_TURN" }, { type: "RESIGN" }, ...managementActions(state, player)];
    case "gameOver":
      return [];
  }
}

function reduceAction(state: GameState, action: GameAction): GameState {
  assertRule(state.phase !== "gameOver", "The game is already over.");
  switch (action.type) {
    case "ROLL_DICE":
      return roll(state);
    case "BUY_PROPERTY":
      return buyProperty(state);
    case "DECLINE_PURCHASE":
      return startAuction(state);
    case "AUCTION_BID":
      return auctionBid(state, action.amount);
    case "AUCTION_PASS":
      return auctionPass(state);
    case "BUILD_HOUSE":
      return buildHouse(state, action.tileId);
    case "BUILD_HOTEL":
      return buildHotel(state, action.tileId);
    case "SELL_BUILDING":
      return sellBuilding(state, action.tileId);
    case "MORTGAGE":
      return mortgage(state, action.tileId);
    case "UNMORTGAGE":
      return unmortgage(state, action.tileId);
    case "PAY_JAIL_FINE":
      return payJailFine(state);
    case "USE_JAIL_CARD":
      return useJailCard(state);
    case "RESOLVE_CARD": {
      const pending = state.pendingCard;
      assertRule(state.phase === "card" && pending, "There is no card awaiting resolution.");
      const card = state.theme.cards[pending.deck].find(
        (candidate) => candidate.id === pending.cardId,
      );
      assertRule(card, `Unknown card id: ${pending.cardId}`);
      const ready: GameState = {
        ...state,
        phase: state.afterLandingPhase,
        pendingCard: null,
      };
      return applyCardEffect(ready, pending.playerId, card);
    }
    case "PAY_DEBT":
      return payDebt(state);
    case "DECLARE_BANKRUPTCY":
      return bankrupt(state);
    case "RESIGN":
      return resign(state);
    case "PROPOSE_TRADE":
      return proposeTrade(state, action.offer);
    case "COUNTER_TRADE":
      return counterTrade(state, action.offer);
    case "ACCEPT_TRADE":
      return resolveTrade(state, true);
    case "REJECT_TRADE":
      return resolveTrade(state, false);
    case "END_TURN":
      return endTurn(state);
    case "UNDO":
      return state;
  }
}

function undo(state: GameState): GameState {
  const frame = state.undoFrames[state.undoFrames.length - 1];
  assertRule(frame, "There is no action to undo this turn.");
  assertRule(frame.turnNumber === state.turnNumber, "An action from a prior turn cannot be undone.");
  const log = state.eventLog.filter((event) => event.id <= frame.eventLogLastId);
  const restored: GameState = {
    ...state,
    ...frame,
    eventLog: log,
    nextEventId: state.nextEventId,
    undoFrames: state.undoFrames.slice(0, -1),
  };
  return withEvent(restored, "ACTION_UNDONE", null, { actionId: state.eventLog[state.eventLog.length - 1]?.id ?? null });
}

export function gameReducer(state: GameState, action: GameAction): GameState {
  if (action.type === "UNDO") return undo(state);
  const before = snapshot(state);
  const reduced = reduceAction(state, action);
  const player =
    action.type === "COUNTER_TRADE" || action.type === "PROPOSE_TRADE"
      ? state.players.find((candidate) => candidate.id === action.offer.fromPlayerId)
      : action.type === "ACCEPT_TRADE" || action.type === "REJECT_TRADE"
        ? state.players.find((candidate) => candidate.id === state.pendingTrade?.offer.toPlayerId)
        : state.phase === "auction"
          ? state.players.find((candidate) => candidate.id === state.auction?.activePlayerId)
          : state.phase === "debt"
            ? state.players.find((candidate) => candidate.id === state.pendingDebt?.debtorId)
            : state.players[state.currentPlayerIndex];
  const logged = withEvent(reduced, action.type, player?.id ?? null, {
    ...(action.type === "AUCTION_BID" ? { amount: action.amount } : {}),
    ...("tileId" in action ? { tileId: action.tileId } : {}),
    ...(action.type === "ROLL_DICE" && reduced.dice
      ? {
          first: reduced.dice.first,
          second: reduced.dice.second,
          isDouble: reduced.dice.isDouble,
        }
      : {}),
  });
  if (action.type === "END_TURN") return { ...logged, undoFrames: [] };
  return {
    ...logged,
    undoFrames: [...state.undoFrames, before].slice(-MAX_UNDO_FRAMES),
  };
}
