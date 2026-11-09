import { describe, expect, it } from "vitest";
import internationalData from "../themes/international.json";
import { applyCardEffect, calculateRent, createGame, gameReducer, getAvailableActions } from "./gameReducer";
import { nextRandom } from "./random";
import type { GameState, Player } from "./types";

function makeGame(): GameState {
  return createGame(
    internationalData,
    [
      { id: "p1", name: "Avery" },
      { id: "p2", name: "Blake" },
    ],
    { seed: 91234 },
  );
}

function withHoldings(
  state: GameState,
  playerId: string,
  holdings: Record<string, { level: number; mortgaged: boolean }>,
): GameState {
  return {
    ...state,
    players: state.players.map((player) =>
      player.id === playerId
        ? { ...player, properties: { ...player.properties, ...holdings } }
        : player,
    ),
  };
}

function withPlayer(
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

describe("rent calculation", () => {
  it("uses base rent, doubles a complete clear color group, and uses building rent", () => {
    let state = withHoldings(makeGame(), "p1", {
      "harbor-labs": { level: 0, mortgaged: false },
    });
    expect(calculateRent(state, "harbor-labs", "p1")).toBe(2);

    state = withHoldings(state, "p1", {
      "copper-kite": { level: 0, mortgaged: false },
    });
    expect(calculateRent(state, "harbor-labs", "p1")).toBe(4);
    state = withHoldings(state, "p1", {
      "harbor-labs": { level: 2, mortgaged: false },
    });
    expect(calculateRent(state, "harbor-labs", "p1")).toBe(30);
    state = withHoldings(state, "p1", {
      "harbor-labs": { level: 5, mortgaged: false },
    });
    expect(calculateRent(state, "harbor-labs", "p1")).toBe(250);
  });

  it("uses transport ownership count and utility dice multipliers", () => {
    let state = withHoldings(makeGame(), "p1", {
      "northstar-rail": { level: 0, mortgaged: false },
      "blue-coast-air": { level: 0, mortgaged: false },
      "global-gateway": { level: 0, mortgaged: false },
    });
    expect(calculateRent(state, "northstar-rail", "p1")).toBe(100);
    state = withHoldings(state, "p1", {
      "grid-power": { level: 0, mortgaged: false },
    });
    expect(calculateRent(state, "grid-power", "p1", 8)).toBe(32);
    state = withHoldings(state, "p1", {
      "clearwater-works": { level: 0, mortgaged: false },
    });
    expect(calculateRent(state, "grid-power", "p1", 8)).toBe(80);
  });
});

describe("property management", () => {
  it("enforces even building and charges the configured house cost", () => {
    let state = withHoldings(makeGame(), "p1", {
      "harbor-labs": { level: 1, mortgaged: false },
      "copper-kite": { level: 0, mortgaged: false },
    });
    expect(() =>
      gameReducer(state, { type: "BUILD_HOUSE", tileId: "harbor-labs" }),
    ).toThrow(/evenly/);

    const beforeCash = state.players[0].cash;
    state = gameReducer(state, { type: "BUILD_HOUSE", tileId: "copper-kite" });
    expect(state.players[0].properties["copper-kite"].level).toBe(1);
    expect(state.players[0].cash).toBe(beforeCash - 50);
  });

  it("builds a hotel only after the full group has four houses", () => {
    let state = withHoldings(makeGame(), "p1", {
      "harbor-labs": { level: 4, mortgaged: false },
      "copper-kite": { level: 4, mortgaged: false },
    });
    state = gameReducer(state, { type: "BUILD_HOTEL", tileId: "harbor-labs" });
    expect(state.players[0].properties["harbor-labs"].level).toBe(5);
    expect(state.players[0].cash).toBe(1450);
  });

  it("mortgages at face value and charges ten percent interest to unmortgage", () => {
    let state = withHoldings(makeGame(), "p1", {
      "harbor-labs": { level: 0, mortgaged: false },
    });
    const initialCash = state.players[0].cash;
    state = gameReducer(state, { type: "MORTGAGE", tileId: "harbor-labs" });
    expect(state.players[0].cash).toBe(initialCash + 30);
    expect(calculateRent(state, "harbor-labs", "p1")).toBe(0);
    state = gameReducer(state, { type: "UNMORTGAGE", tileId: "harbor-labs" });
    expect(state.players[0].cash).toBe(initialCash - 3);
    expect(state.players[0].properties["harbor-labs"].mortgaged).toBe(false);
  });
});

describe("jail", () => {
  function seedForDouble(): number {
    let seed = 1;
    while (true) {
      const first = nextRandom(seed);
      const second = nextRandom(first.state);
      if (Math.floor(first.value * 6) === Math.floor(second.value * 6)) {
        return seed;
      }
      seed += 1;
    }
  }

  it("allows paying the fine or using a held release card", () => {
    const inJail = withPlayer(
      { ...makeGame(), phase: "jail" },
      "p1",
      (player) => ({ ...player, jailTurns: 0, jailCards: ["chance-release"] }),
    );
    const paid = gameReducer(inJail, { type: "PAY_JAIL_FINE" });
    expect(paid.players[0].cash).toBe(1450);
    expect(paid.players[0].jailTurns).toBe(0);

    const released = gameReducer(inJail, { type: "USE_JAIL_CARD" });
    expect(released.phase).toBe("roll");
    expect(released.players[0].jailCards).toEqual([]);
    expect(released.discards.chance).toContain("chance-release");
  });

  it("releases a jailed player who rolls doubles and sends a third-double roller to jail", () => {
    let inJail: GameState = {
      ...makeGame(),
      phase: "jail",
      rngState: seedForDouble(),
    };
    inJail = withPlayer(inJail, "p1", (player) => ({
      ...player,
      position: 10,
      jailTurns: 1,
    }));
    const released = gameReducer(inJail, { type: "ROLL_DICE" });
    expect(released.players[0].jailTurns).toBe(0);
    expect(released.players[0].position).not.toBe(10);
    expect(released.eventLog.some(
      (event) => event.type === "JAIL_RELEASED" && event.details.method === "doubles",
    )).toBe(true);

    const thirdDouble: GameState = {
      ...makeGame(),
      phase: "roll",
      consecutiveDoubles: 2,
      rngState: seedForDouble(),
    };
    const jailed = gameReducer(thirdDouble, { type: "ROLL_DICE" });
    expect(jailed.phase).toBe("jail");
    expect(jailed.players[0].position).toBe(10);
    expect(jailed.eventLog.some((event) => event.type === "SPEEDING")).toBe(true);
  });

  it("charges the fine and releases a player after the third failed jail roll", () => {
    let seed = 1;
    while (true) {
      const first = nextRandom(seed);
      const second = nextRandom(first.state);
      if (
        Math.floor(first.value * 6) !== Math.floor(second.value * 6)
      ) {
        break;
      }
      seed += 1;
    }

    let state: GameState = {
      ...makeGame(),
      phase: "jail",
      rngState: seed,
    };
    state = withPlayer(state, "p1", (player) => ({
      ...player,
      position: 10,
      jailTurns: 2,
    }));
    state = gameReducer(state, { type: "ROLL_DICE" });
    expect(state.players[0].cash).toBe(1450);
    expect(state.players[0].jailTurns).toBe(0);
    expect(state.players[0].position).not.toBe(10);
    expect(state.eventLog.some(
      (event) => event.type === "JAIL_RELEASED" && event.details.method === "third-roll-fine",
    )).toBe(true);
  });

  it("allows a player to mortgage assets before paying a jail fine", () => {
    let state: GameState = {
      ...withHoldings(makeGame(), "p1", {
        "harbor-labs": { level: 0, mortgaged: false },
        "copper-kite": { level: 0, mortgaged: false },
      }),
      phase: "debt",
      pendingDebt: {
        debtorId: "p1",
        creditorId: null,
        amount: 50,
        reason: "jail-fine",
      },
    };
    state = withPlayer(state, "p1", (player) => ({
      ...player,
      cash: 0,
      jailTurns: 1,
    }));
    state = gameReducer(state, { type: "MORTGAGE", tileId: "harbor-labs" });
    state = gameReducer(state, { type: "MORTGAGE", tileId: "copper-kite" });
    state = gameReducer(state, { type: "PAY_DEBT" });
    expect(state.phase).toBe("roll");
    expect(state.players[0].cash).toBe(10);
    expect(state.players[0].jailTurns).toBe(0);
    expect(state.eventLog.some(
      (event) => event.type === "JAIL_RELEASED" && event.details.method === "fine",
    )).toBe(true);
  });
});

describe("auctions", () => {
  it("awards an auctioned asset to the highest remaining bidder", () => {
    let state: GameState = {
      ...makeGame(),
      phase: "purchase",
      pendingPurchase: "harbor-labs",
    };
    state = gameReducer(state, { type: "DECLINE_PURCHASE" });
    expect(state.auction?.activePlayerId).toBe("p2");
    state = gameReducer(state, { type: "AUCTION_BID", amount: 75 });
    state = gameReducer(state, { type: "AUCTION_PASS" });
    expect(state.phase).toBe("endTurn");
    expect(state.players[1].properties["harbor-labs"]).toEqual({
      level: 0,
      mortgaged: false,
    });
    expect(state.players[1].cash).toBe(1425);
  });

  it("lets the last unpassed player make the opening bid", () => {
    let state: GameState = {
      ...makeGame(),
      phase: "purchase",
      pendingPurchase: "harbor-labs",
    };
    state = gameReducer(state, { type: "DECLINE_PURCHASE" });
    state = gameReducer(state, { type: "AUCTION_PASS" });
    expect(state.auction?.activePlayerId).toBe("p1");
    state = gameReducer(state, { type: "AUCTION_BID", amount: 40 });
    expect(state.phase).toBe("endTurn");
    expect(state.players[0].properties["harbor-labs"]).toBeDefined();
  });
});

describe("bankruptcy and winner detection", () => {
  it("transfers assets to a creditor and declares the last active player winner", () => {
    let state = withHoldings(makeGame(), "p2", {
      "northstar-rail": { level: 0, mortgaged: false },
    });
    state = {
      ...state,
      phase: "debt",
      pendingDebt: {
        debtorId: "p2",
        creditorId: "p1",
        amount: 500,
        reason: "rent",
      },
    };
    state = gameReducer(state, { type: "DECLARE_BANKRUPTCY" });
    expect(state.players[0].properties["northstar-rail"]).toBeDefined();
    expect(state.players[1].bankrupt).toBe(true);
    expect(state.phase).toBe("gameOver");
    expect(state.winnerId).toBe("p1");
  });
});

describe("card effects and reproducibility", () => {
  it("applies collection effects", () => {
    const state = makeGame();
    const next = applyCardEffect(state, "p1", {
      id: "test-collect",
      text: "A test dividend arrives.",
      effect: { type: "collect", amount: 75 },
    });
    expect(next.players[0].cash).toBe(1575);
  });

  it("collects salary when a card moves a player past Go", () => {
    let state = withPlayer(makeGame(), "p1", (player) => ({
      ...player,
      position: 39,
    }));
    state = applyCardEffect(state, "p1", {
      id: "test-go",
      text: "Advance to Launch Pad.",
      effect: { type: "move", destination: 0, collectSalaryOnPass: true },
    });
    expect(state.players[0].cash).toBe(1700);
    expect(state.players[0].position).toBe(0);
  });

  it("moves relative cards backward from the player's current tile", () => {
    let state = withPlayer(makeGame(), "p1", (player) => ({
      ...player,
      position: 17,
    }));
    state = applyCardEffect(state, "p1", {
      id: "chance-move-back",
      text: "Move back three spaces.",
      effect: { type: "moveRelative", steps: -3, collectSalaryOnPass: false },
    });
    expect(state.players[0].position).toBe(14);
    expect(state.phase).toBe("purchase");
    expect(state.pendingPurchase).toBe("summit-capital");
  });

  it("produces the same dice and movement for identical seeds", () => {
    const first = gameReducer(makeGame(), { type: "ROLL_DICE" });
    const second = gameReducer(makeGame(), { type: "ROLL_DICE" });
    expect(first.dice).toEqual(second.dice);
    expect(first.players.map((player) => player.position)).toEqual(
      second.players.map((player) => player.position),
    );
  });

  it("waits for card acknowledgement before applying a drawn effect", () => {
    let seed = 1;
    let state: GameState;
    while (true) {
      state = createGame(
        internationalData,
        [
          { id: "p1", name: "Avery" },
          { id: "p2", name: "Blake" },
        ],
        { seed },
      );
      const first = nextRandom(state.rngState);
      const second = nextRandom(first.state);
      if (Math.floor(first.value * 6) + Math.floor(second.value * 6) + 2 === 2) {
        break;
      }
      seed += 1;
    }

    state = gameReducer(state, { type: "ROLL_DICE" });
    expect(state.phase).toBe("card");
    expect(state.pendingCard).not.toBeNull();
    expect(state.players[0].position).toBe(2);
    expect(getAvailableActions(state)).toEqual([{ type: "RESOLVE_CARD" }]);
    const resolved = gameReducer(state, { type: "RESOLVE_CARD" });
    expect(resolved.pendingCard).toBeNull();
    expect(resolved.eventLog.at(-1)?.type).toBe("RESOLVE_CARD");
  });
});

describe("available actions", () => {
  it("exposes only the active bidder's legal auction actions", () => {
    const state: GameState = {
      ...makeGame(),
      phase: "auction",
      auction: {
        tileId: "harbor-labs",
        highBid: 40,
        highBidderId: "p1",
        activePlayerId: "p2",
        passedPlayerIds: [],
      },
    };
    expect(getAvailableActions(state)).toContainEqual({
      type: "AUCTION_BID",
      amount: 41,
    });
    expect(getAvailableActions(state)).toContainEqual({ type: "AUCTION_PASS" });
  });

  it("offers a jail card only to a player who has one", () => {
    const state: GameState = {
      ...makeGame(),
      phase: "jail",
    };
    expect(getAvailableActions(state).map((action) => action.type)).toEqual([
      "ROLL_DICE",
      "PAY_JAIL_FINE",
    ]);
    const heldCard = withPlayer(state, "p1", (player) => ({
      ...player,
      jailCards: ["chance-release"],
    }));
    expect(getAvailableActions(heldCard).map((action) => action.type)).toContain(
      "USE_JAIL_CARD",
    );
  });
});

describe("property purchase", () => {
  it("charges the theme price and records the new owner", () => {
    const state: GameState = {
      ...makeGame(),
      phase: "purchase",
      pendingPurchase: "harbor-labs",
    };
    const purchased = gameReducer(state, { type: "BUY_PROPERTY" });
    expect(purchased.players[0].cash).toBe(1440);
    expect(purchased.players[0].properties["harbor-labs"]).toEqual({
      level: 0,
      mortgaged: false,
    });
  });
});

describe("event log and undo", () => {
  it("logs actions and restores the pre-action state without losing the undo record", () => {
    const initial = makeGame();
    const rolled = gameReducer(initial, { type: "ROLL_DICE" });
    const undone = gameReducer(rolled, { type: "UNDO" });
    expect(undone.dice).toBe(initial.dice);
    expect(undone.players[0].position).toBe(initial.players[0].position);
    expect(undone.eventLog.at(-1)?.type).toBe("ACTION_UNDONE");
  });
});
