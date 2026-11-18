import { describe, expect, it } from "vitest";
import internationalData from "../../themes/international.json";
import indiaData from "../../themes/india.json";
import tamilnaduData from "../../themes/tamilnadu.json";
import { validateTheme } from "../../themes/themeSchema";
import { createGame, gameReducer } from "../gameReducer";
import { chooseBotAction, createBotRandom, getBotActor, isBotActionLegal, runBotGame } from "./index";

function makeBots(seed: number) {
  return createGame(
    internationalData,
    [
      { id: "easy-1", name: "Easy 1", isBot: true, botDifficulty: "easy" },
      { id: "medium", name: "Medium", isBot: true, botDifficulty: "medium" },
      { id: "easy-2", name: "Easy 2", isBot: true, botDifficulty: "easy" },
    ],
    { seed },
  );
}

describe("bot action policy", () => {
  it("chooses legal actions across 200 seeded game states", () => {
    for (let seed = 1; seed <= 200; seed += 1) {
      let state = makeBots(seed);
      const random = createBotRandom(seed ^ 0xa53c);
      for (let step = 0; step < 24 && state.phase !== "gameOver"; step += 1) {
        const actor = getBotActor(state);
        expect(actor, `seed ${seed} should have a bot actor`).not.toBeNull();
        if (!actor) break;
        const action = chooseBotAction(state, actor.id, actor.botDifficulty, random);
        expect(action, `seed ${seed}, step ${step}`).not.toBeNull();
        if (!action) break;
        expect(isBotActionLegal(state, action), `illegal action on seed ${seed}: ${JSON.stringify(action)}`).toBe(true);
        state = gameReducer(state, action);
      }
    }
  });

  it("completes full bot simulations with a winner or a documented capped draw", () => {
    for (let seed = 71; seed <= 73; seed += 1) {
      const result = runBotGame(makeBots(seed), { turnCap: 1000 });
      expect(["winner", "draw"]).toContain(result.outcome);
      expect(result.turns).toBeLessThanOrEqual(1000);
      if (result.outcome === "winner") {
        expect(result.state.winnerId).not.toBeNull();
      } else {
        expect(result.reason).toMatch(/draw|cap|action cap|no legal action/i);
      }
    }
  });

  it("records net-worth checkpoints at completed bot turns", () => {
    const checkpoints: number[] = [];
    const result = runBotGame(makeBots(31000), {
      turnCap: 1000,
      onTurnEnd: (state) => checkpoints.push(state.turnNumber),
    });
    expect(result.outcome).toBe("winner");
    expect(checkpoints.length).toBeGreaterThan(1);
    expect(checkpoints).toEqual([...checkpoints].sort((a, b) => a - b));
  });

  it("finishes at least 90% of 50 seeded 3-4 player games on each theme without illegal actions", () => {
    const themes = [internationalData, indiaData, tamilnaduData].map(validateTheme);
    for (const theme of themes) {
      let winners = 0;
      for (let index = 0; index < 50; index += 1) {
        const seed = 31000 + index;
        const playerCount = 3 + (index % 2);
        const setups = Array.from({ length: playerCount }, (_, seat) => ({
          id: `player-${seat + 1}`,
          name: `Player ${seat + 1}`,
          isBot: true,
          botDifficulty: (seat + index) % 2 === 0 ? "easy" as const : "medium" as const,
        }));
        const result = runBotGame(
          createGame(theme, setups, { seed }),
          { turnCap: 1000, retainEventLog: false },
        );
        expect(result.turns, `${theme.id}, seed ${seed} exceeded the cap`).toBeLessThanOrEqual(1000);
        expect(result.reason, `${theme.id}, seed ${seed} stopped on an illegal bot action`).not.toMatch(/no legal action|illegal action/i);
        if (result.outcome === "winner") {
          winners += 1;
          expect(result.state.winnerId).not.toBeNull();
        }
      }
      expect(winners, `${theme.id} winner rate`).toBeGreaterThanOrEqual(45);
    }
  }, 15_000);
});
