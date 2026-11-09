import type { Theme, Tile } from "../themes/themeSchema";

export interface PlayerSetup {
  id: string;
  name: string;
  isBot?: boolean;
  botDifficulty?: "easy" | "medium";
}

export interface GameOptions {
  seed: number;
  startingCash?: number;
  jailFine?: number;
  maxJailTurns?: number;
  houseSupply?: number;
  hotelSupply?: number;
  doubleSalaryOnGo?: boolean;
  freeParkingJackpot?: boolean;
}

export interface PropertyHolding {
  level: number;
  mortgaged: boolean;
}

export interface Player {
  id: string;
  name: string;
  isBot: boolean;
  botDifficulty: "easy" | "medium";
  cash: number;
  position: number;
  properties: Record<string, PropertyHolding>;
  jailTurns: number;
  jailCards: string[];
  bankrupt: boolean;
  stats: {
    rentEarned: number;
    rentPaid: number;
  };
}

export type GamePhase =
  | "roll"
  | "purchase"
  | "auction"
  | "card"
  | "jail"
  | "debt"
  | "trade"
  | "endTurn"
  | "gameOver";

export interface DiceResult {
  first: number;
  second: number;
  isDouble: boolean;
}

export interface AuctionState {
  tileId: string;
  highBid: number;
  highBidderId: string | null;
  activePlayerId: string;
  passedPlayerIds: string[];
}

export interface PendingDebt {
  debtorId: string;
  creditorId: string | null;
  amount: number;
  reason: string;
}

export interface PendingCard {
  deck: "chance" | "communityChest";
  cardId: string;
  playerId: string;
}

export interface TradeOffer {
  fromPlayerId: string;
  toPlayerId: string;
  cashFrom: number;
  cashTo: number;
  propertiesFrom: string[];
  propertiesTo: string[];
  jailCardsFrom: string[];
  jailCardsTo: string[];
}

export interface PendingTrade {
  offer: TradeOffer;
  returnPhase: "roll" | "endTurn";
}

export interface GameEvent {
  id: number;
  type: string;
  playerId: string | null;
  details: Record<string, string | number | boolean | null>;
}

export interface UndoFrame {
  players: Player[];
  currentPlayerIndex: number;
  phase: GamePhase;
  dice: DiceResult | null;
  consecutiveDoubles: number;
  turnNumber: number;
  rngState: number;
  decks: Record<"chance" | "communityChest", string[]>;
  discards: Record<"chance" | "communityChest", string[]>;
  pendingPurchase: string | null;
  auction: AuctionState | null;
  pendingDebt: PendingDebt | null;
  pendingCard: PendingCard | null;
  pendingTrade: PendingTrade | null;
  bankAuctionQueue: string[];
  winnerId: string | null;
  freeParkingPot: number;
  afterLandingPhase: "roll" | "endTurn";
  eventLogLength: number;
}

export interface GameState {
  theme: Theme;
  settings: Required<Omit<GameOptions, "seed">>;
  players: Player[];
  currentPlayerIndex: number;
  phase: GamePhase;
  dice: DiceResult | null;
  consecutiveDoubles: number;
  turnNumber: number;
  rngState: number;
  decks: Record<"chance" | "communityChest", string[]>;
  discards: Record<"chance" | "communityChest", string[]>;
  pendingPurchase: string | null;
  auction: AuctionState | null;
  pendingDebt: PendingDebt | null;
  pendingCard: PendingCard | null;
  pendingTrade: PendingTrade | null;
  bankAuctionQueue: string[];
  winnerId: string | null;
  freeParkingPot: number;
  afterLandingPhase: "roll" | "endTurn";
  eventLog: GameEvent[];
  nextEventId: number;
  undoFrames: UndoFrame[];
}

export type GameAction =
  | { type: "ROLL_DICE" }
  | { type: "BUY_PROPERTY" }
  | { type: "DECLINE_PURCHASE" }
  | { type: "AUCTION_BID"; amount: number }
  | { type: "AUCTION_PASS" }
  | { type: "BUILD_HOUSE"; tileId: string }
  | { type: "BUILD_HOTEL"; tileId: string }
  | { type: "SELL_BUILDING"; tileId: string }
  | { type: "MORTGAGE"; tileId: string }
  | { type: "UNMORTGAGE"; tileId: string }
  | { type: "PAY_JAIL_FINE" }
  | { type: "USE_JAIL_CARD" }
  | { type: "RESOLVE_CARD" }
  | { type: "PAY_DEBT" }
  | { type: "DECLARE_BANKRUPTCY" }
  | { type: "PROPOSE_TRADE"; offer: TradeOffer }
  | { type: "ACCEPT_TRADE" }
  | { type: "REJECT_TRADE" }
  | { type: "COUNTER_TRADE"; offer: TradeOffer }
  | { type: "END_TURN" }
  | { type: "UNDO" };

export type BuyableTile = Extract<Tile, { price: number }>;
