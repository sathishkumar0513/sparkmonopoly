import internationalTheme from "../../themes/international.json";
import { createGame } from "../gameReducer";
import type { GameEvent, PlayerSetup } from "../types";
import { runBotGame } from "./index";

declare const process: {
  argv: string[];
  env: Record<string, string | undefined>;
  exitCode?: number;
};

const DEFAULT_GAMES = 200;
const TURN_CAP = 1000;

interface GameMetrics {
  seed: number;
  playerCount: number;
  finished: boolean;
  turns: number;
  rounds: number;
  finalActivePlayers: number;
  bankruptcies: number;
  completeSetPlayerProperties: number[];
  housesBuilt: number;
  tradesProposed: number;
  tradesAccepted: number;
  bankPayouts: number;
  bankReceipts: number;
  drawReason: string;
  finalCash: number;
  finalProperties: number;
  finalCompleteSets: number;
  finalBuildings: number;
  phase: string;
  recentActions: string[];
}

function parseGameCount(args: string[]): number {
  const flag = args.find((argument) => argument.startsWith("--games="));
  const value = flag
    ? Number(flag.slice("--games=".length))
    : Number(process.env.SIM_GAMES ?? DEFAULT_GAMES);
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error("Usage: npm run simulate -- --games=<positive integer>");
  }
  return value;
}

function parseSimulationRange(): { seed: number; playerCounts: number[] } {
  const seed = Number(process.env.SIM_SEED ?? 20261109);
  if (!Number.isSafeInteger(seed)) throw new Error("SIM_SEED must be a whole number.");
  const playerRange = process.env.SIM_PLAYERS ?? "2-6";
  const playerCounts = playerRange.split(/[-,]/).map(Number);
  if (
    playerCounts.length < 1 ||
    playerCounts.some((count) => !Number.isInteger(count) || count < 2 || count > 6)
  ) {
    throw new Error("SIM_PLAYERS must be a player count or a range/list between 2 and 6.");
  }
  if (playerRange.includes("-") && playerCounts.length !== 2) {
    throw new Error("A SIM_PLAYERS range must have exactly two endpoints.");
  }
  const counts = playerRange.includes("-")
    ? Array.from(
        { length: (playerCounts[1] ?? 0) - (playerCounts[0] ?? 0) + 1 },
        (_, index) => (playerCounts[0] ?? 0) + index,
      )
    : playerCounts;
  return { seed, playerCounts: counts };
}

function createSetups(gameIndex: number, playerCount: number): PlayerSetup[] {
  return Array.from({ length: playerCount }, (_, index) => ({
    id: `bot-${index + 1}`,
    name: `Bot ${index + 1}`,
    isBot: true,
    botDifficulty: (index + gameIndex) % 2 === 0 ? "easy" : "medium",
  }));
}

function analyzeGame(
  state: ReturnType<typeof createGame>,
  seed: number,
  finished: boolean,
  rounds: number,
  playerCount: number,
  reason: string,
  eventLog: GameEvent[],
): GameMetrics {
  const completeSetPlayers = new Set<string>();
  const groups = new Map<string, string[]>();
  for (const tile of state.theme.tiles) {
    if (tile.type !== "property") continue;
    const group = groups.get(tile.colorGroup) ?? [];
    group.push(tile.id);
    groups.set(tile.colorGroup, group);
  }
  for (const player of state.players.filter((candidate) => !candidate.bankrupt)) {
    for (const tileIds of groups.values()) {
      if (tileIds.every((tileId) => player.properties[tileId])) {
        completeSetPlayers.add(player.id);
      }
    }
  }

  const cardsById = new Map(
    [...state.theme.cards.chance, ...state.theme.cards.communityChest]
      .map((card) => [card.id, card] as const),
  );
  let cardPayouts = 0;
  let salary = 0;
  let bankPayouts = 0;
  let bankReceipts = 0;
  const tileById = new Map(state.theme.tiles.map((tile) => [tile.id, tile]));
  for (const event of eventLog) {
    if (event.type === "SALARY_COLLECTED") {
      salary += Number(event.details.amount);
    } else if (event.type === "CARD_DRAWN") {
      const card = cardsById.get(String(event.details.cardId));
      if (card?.effect.type === "collect") cardPayouts += card.effect.amount;
    } else if (event.type === "PAYMENT_MADE") {
      bankReceipts += Number(event.details.amount);
    } else if (event.type === "PROPERTY_BOUGHT") {
      bankReceipts += Number(event.details.price);
    } else if (event.type === "AUCTION_WON") {
      bankReceipts += Number(event.details.amount);
    } else if (
      event.type === "BUILD_HOUSE" ||
      event.type === "BUILD_HOTEL" ||
      event.type === "UNMORTGAGE"
    ) {
      const tile = tileById.get(String(event.details.tileId));
      if (tile && "houseCost" in tile) {
        bankReceipts += event.type === "UNMORTGAGE"
          ? Math.ceil(tile.mortgageValue * 1.1)
          : tile.houseCost;
      } else if (tile && event.type === "UNMORTGAGE" && "mortgageValue" in tile) {
        bankReceipts += Math.ceil(tile.mortgageValue * 1.1);
      }
    } else if (event.type === "MORTGAGE") {
      const tile = tileById.get(String(event.details.tileId));
      if (tile && "mortgageValue" in tile) bankPayouts += tile.mortgageValue;
    } else if (event.type === "SELL_BUILDING") {
      const tile = tileById.get(String(event.details.tileId));
      if (tile && "houseCost" in tile) bankPayouts += Math.floor(tile.houseCost / 2);
    }
  }
  bankPayouts += salary + cardPayouts;
  const completeSetPlayerProperties = [...completeSetPlayers].map((playerId) => {
    const player = state.players.find((candidate) => candidate.id === playerId);
    return player
      ? state.theme.tiles.filter((tile) => tile.type === "property" && player.properties[tile.id]).length
      : 0;
  });
  const activePlayers = state.players.filter((player) => !player.bankrupt);
  const completedTurns = eventLog.filter((event) => event.type === "END_TURN").length;
  const finalBuildings = state.players.reduce((total, player) =>
    total + Object.values(player.properties).reduce((sum, holding) =>
      sum + (holding.level === 5 ? 5 : holding.level), 0,
    ), 0,
  );

  return {
    seed,
    playerCount,
    finished,
    turns: completedTurns + (finished ? 1 : 0),
    rounds,
    finalActivePlayers: activePlayers.length,
    bankruptcies: eventLog.filter((event) => event.type === "BANKRUPTCY").length,
    completeSetPlayerProperties,
    housesBuilt: eventLog.filter((event) =>
      event.type === "BUILD_HOUSE" || event.type === "BUILD_HOTEL",
    ).length,
    tradesProposed: eventLog.filter((event) =>
      event.type === "PROPOSE_TRADE" || event.type === "COUNTER_TRADE",
    ).length,
    tradesAccepted: eventLog.filter((event) => event.type === "TRADE_ACCEPTED").length,
    bankPayouts,
    bankReceipts,
    drawReason: finished ? "" : reason,
    finalCash: activePlayers.reduce((total, player) => total + player.cash, 0) /
      Math.max(1, activePlayers.length),
    finalProperties: activePlayers.reduce((total, player) =>
      total + Object.keys(player.properties).length, 0,
    ) / Math.max(1, activePlayers.length),
    finalCompleteSets: completeSetPlayers.size,
    finalBuildings,
    phase: state.phase,
    recentActions: eventLog.slice(-10).map((event) => event.type),
  };
}

function average(values: number[]): number {
  return values.length === 0
    ? 0
    : values.reduce((total, value) => total + value, 0) / values.length;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
    : sorted[middle] ?? 0;
}

function printTable(metrics: GameMetrics[], gameCount: number): void {
  const finished = metrics.filter((game) => game.finished);
  const drawn = metrics.filter((game) => !game.finished);
  const completedPlayerProperties = metrics.flatMap((game) => game.completeSetPlayerProperties);
  const averagePayoutsPerRound = average(metrics.map((game) =>
    game.bankPayouts / Math.max(1, game.rounds),
  ));
  const averageReceiptsPerRound = average(metrics.map((game) =>
    game.bankReceipts / Math.max(1, game.rounds),
  ));
  const drawCash = drawn.reduce((total, game) => total + game.finalCash * game.finalActivePlayers, 0) /
    Math.max(1, drawn.reduce((total, game) => total + game.finalActivePlayers, 0));
  const playerCountRates = [2, 3, 4, 5, 6].map((playerCount) => {
    const subset = metrics.filter((game) => game.playerCount === playerCount);
    const winners = subset.filter((game) => game.finished).length;
    return `${playerCount}: ${winners}/${subset.length} (${subset.length ? Math.round((winners / subset.length) * 100) : 0}%)`;
  });
  const rows: Array<[string, string]> = [
    ["Games finished / drawn", `${finished.length} / ${drawn.length} of ${gameCount}`],
    ["Winner rate", `${((finished.length / gameCount) * 100).toFixed(1)}%`],
    ["Average turns to finish", finished.length ? average(finished.map((game) => game.turns)).toFixed(1) : "n/a"],
    ["Median turns to finish", finished.length ? median(finished.map((game) => game.turns)).toFixed(1) : "n/a"],
    ["Average bankruptcies / game", average(metrics.map((game) => game.bankruptcies)).toFixed(2)],
    ["Winner rate by player count", playerCountRates.join(" · ")],
    ["Properties / set-complete player", completedPlayerProperties.length ? average(completedPlayerProperties).toFixed(2) : "0 (no completed sets)"],
    ["Houses + hotels built / game", average(metrics.map((game) => game.housesBuilt)).toFixed(2)],
    ["Trades proposed / accepted per game", `${average(metrics.map((game) => game.tradesProposed)).toFixed(2)} / ${average(metrics.map((game) => game.tradesAccepted)).toFixed(2)}`],
    ["Salary + bank payouts vs receipts / round", `${averagePayoutsPerRound.toFixed(2)} vs ${averageReceiptsPerRound.toFixed(2)} (net ${(averagePayoutsPerRound - averageReceiptsPerRound >= 0 ? "+" : "")}${(averagePayoutsPerRound - averageReceiptsPerRound).toFixed(2)})`],
    ["Average player cash at end", average(metrics.map((game) => game.finalCash)).toFixed(1)],
    ["Average active-player cash in draws", drawCash.toFixed(1)],
    ["Average properties per active player", average(metrics.map((game) => game.finalProperties)).toFixed(2)],
    ["Players with a completed set / game", average(metrics.map((game) => game.finalCompleteSets)).toFixed(2)],
  ];

  const labelWidth = Math.max(...rows.map(([label]) => label.length));
  console.log(`\n${"Metric".padEnd(labelWidth)} | Result`);
  console.log(`${"-".repeat(labelWidth)}-+--------`);
  for (const [label, result] of rows) {
    console.log(`${label.padEnd(labelWidth)} | ${result}`);
  }
  if (drawn.length > 0) {
    const reasons = new Map<string, number>();
    for (const game of drawn) reasons.set(game.drawReason, (reasons.get(game.drawReason) ?? 0) + 1);
    console.log("\nDraw reasons:");
    for (const [reason, count] of reasons) console.log(`- ${count}: ${reason}`);
    console.log("Draw samples:");
    for (const game of drawn.slice(0, 5)) {
      console.log(
        `- seed ${game.seed}, ${game.playerCount} players, round ${game.rounds}, ` +
        `${game.finalActivePlayers} active, ${game.finalBuildings} buildings, phase ${game.phase}; ` +
        `last actions: ${game.recentActions.join(", ")}`,
      );
    }
  }
  console.log("\nBank flow includes salary, collect cards, mortgages, building sales, taxes/payments, purchases, auctions, builds, and unmortgages.");
}

function main(): void {
  const gameCount = parseGameCount(process.argv.slice(2));
  const { seed: firstSeed, playerCounts } = parseSimulationRange();
  const metrics: GameMetrics[] = [];
  for (let index = 0; index < gameCount; index += 1) {
    const seed = firstSeed + index;
    const playerCount = playerCounts[index % playerCounts.length] ?? 3;
    const initial = createGame(internationalTheme, createSetups(index, playerCount), { seed });
    const eventLog: GameEvent[] = [];
    const result = runBotGame(initial, {
      turnCap: TURN_CAP,
      retainEventLog: false,
      onEvents: (events) => eventLog.push(...events),
    });
    metrics.push(analyzeGame(
      result.state,
      seed,
      result.outcome === "winner",
      result.turns,
      playerCount,
      result.reason,
      eventLog,
    ));
  }
  console.log(`Bot-only economy diagnostic · international theme · cap ${TURN_CAP} turns · ${[...new Set(playerCounts)].join(", ")} players · seeds ${firstSeed}–${firstSeed + gameCount - 1}`);
  printTable(metrics, gameCount);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
