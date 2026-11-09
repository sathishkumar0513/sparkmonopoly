import { useMemo, useState } from "react";
import internationalTheme from "../themes/international.json";
import { createGame } from "../engine/gameReducer";
import { runBotGame } from "../engine/bots";
import type { BotSpeed } from "./GameScreen";
import type { PlayerSetup } from "../engine/types";

interface SeatDraft {
  name: string;
  kind: "human" | "bot";
  difficulty: "easy" | "medium";
}

interface DevSetupProps {
  onStart: (game: ReturnType<typeof createGame>, speed: BotSpeed) => void;
}

const TOKENS = ["🚗", "🎩", "🚢", "🐕", "🚀", "🦊"];

export function DevSetup({ onStart }: DevSetupProps) {
  const [count, setCount] = useState(3);
  const [seed, setSeed] = useState("20261109");
  const [botSpeed, setBotSpeed] = useState<BotSpeed>("normal");
  const [botsOnly, setBotsOnly] = useState(false);
  const [seats, setSeats] = useState<SeatDraft[]>(() =>
    Array.from({ length: 6 }, (_, index) => ({
      name: ["Alex", "Jordan", "Sam", "Taylor", "Riley", "Casey"][index] ?? `Player ${index + 1}`,
      kind: index === 1 ? "bot" : "human",
      difficulty: index === 1 ? "medium" : "easy",
    })),
  );
  const [simulation, setSimulation] = useState<{
    outcome: "winner" | "draw";
    turns: number;
    reason: string;
    winner: string | null;
  } | null>(null);

  const selectedSeats = useMemo(() => seats.slice(0, count), [count, seats]);
  const numericSeed = Number(seed);
  const validSeed = /^-?\d+$/.test(seed.trim()) && Number.isSafeInteger(numericSeed);

  const updateSeat = (index: number, patch: Partial<SeatDraft>) => {
    setSeats((current) => current.map((seat, seatIndex) =>
      seatIndex === index ? { ...seat, ...patch } : seat,
    ));
  };

  const createSetups = (allBots = botsOnly): PlayerSetup[] =>
    selectedSeats.map((seat, index) => ({
      id: `player-${index + 1}`,
      name: seat.name.trim() || `Player ${index + 1}`,
      isBot: allBots || seat.kind === "bot",
      botDifficulty: seat.difficulty,
    }));

  const start = () => {
    if (!validSeed) return;
    setSimulation(null);
    onStart(createGame(internationalTheme, createSetups(), { seed: numericSeed }), botSpeed);
  };

  const simulate = () => {
    if (!validSeed) return;
    const game = createGame(internationalTheme, createSetups(true), { seed: numericSeed });
    const result = runBotGame(game, { turnCap: 1000 });
    setSimulation({
      outcome: result.outcome,
      turns: result.turns,
      reason: result.reason,
      winner: result.state.winnerId
        ? result.state.players.find((player) => player.id === result.state.winnerId)?.name ?? null
        : null,
    });
  };

  return (
    <main className="setup-shell">
      <header className="setup-header">
        <div className="setup-mark">BT</div>
        <div>
          <p className="eyebrow">A strategy game for big ideas</p>
          <h1>Business Tycoon</h1>
        </div>
        <span className="header-chip">Development table</span>
      </header>
      <section className="setup-card" aria-labelledby="setup-title">
        <div className="setup-title-row">
          <div>
            <span className="eyebrow">International edition</span>
            <h2 id="setup-title">Set up your table</h2>
            <p>Choose your players, seed, and how quickly bots should act.</p>
          </div>
          <span className="setup-theme-mark">🌐</span>
        </div>
        <div className="setup-options">
          <label>
            Players
            <select value={count} onChange={(event) => setCount(Number(event.target.value))}>
              {[2, 3, 4, 5, 6].map((value) => <option value={value} key={value}>{value} players</option>)}
            </select>
          </label>
          <label>
            Game seed
            <input type="number" step="1" value={seed} onChange={(event) => setSeed(event.target.value)} />
          </label>
          <label>
            Bot speed
            <select value={botSpeed} onChange={(event) => setBotSpeed(event.target.value as BotSpeed)}>
              <option value="normal">Normal</option>
              <option value="fast">Fast</option>
              <option value="instant">Instant</option>
            </select>
          </label>
        </div>
        <div className="seat-list">
          {selectedSeats.map((seat, index) => (
            <article className="seat-card" key={index}>
              <span className="seat-token" aria-hidden="true">{TOKENS[index]}</span>
              <label className="seat-name">
                <span>Seat {index + 1} name</span>
                <input value={seat.name} onChange={(event) => updateSeat(index, { name: event.target.value })} maxLength={24} />
              </label>
              <label>
                Player type
                <select
                  value={botsOnly ? "bot" : seat.kind}
                  disabled={botsOnly}
                  onChange={(event) => updateSeat(index, { kind: event.target.value as SeatDraft["kind"] })}
                >
                  <option value="human">Human</option>
                  <option value="bot">Bot</option>
                </select>
              </label>
              <label>
                Bot difficulty
                <select
                  value={seat.difficulty}
                  disabled={!botsOnly && seat.kind !== "bot"}
                  onChange={(event) => updateSeat(index, { difficulty: event.target.value as SeatDraft["difficulty"] })}
                >
                  <option value="easy">Easy</option>
                  <option value="medium">Medium</option>
                </select>
              </label>
            </article>
          ))}
        </div>
        <label className="simulation-toggle">
          <input type="checkbox" checked={botsOnly} onChange={(event) => setBotsOnly(event.target.checked)} />
          <span><strong>Bots only</strong><small>Set every seat to bot players for an instant simulation.</small></span>
        </label>
        {validSeed ? null : <p className="setup-error" role="alert">Enter a whole-number seed.</p>}
        <div className="setup-actions">
          <button className="primary-button" disabled={!validSeed} onClick={start}>
            Start game
          </button>
          {botsOnly ? (
            <button className="secondary-button" disabled={!validSeed} onClick={simulate}>
              Run simulation
            </button>
          ) : null}
        </div>
        {simulation ? (
          <section className={`simulation-result ${simulation.outcome}`} aria-live="polite">
            <span className="eyebrow">Seeded simulation · {simulation.turns} turns</span>
            <h3>{simulation.winner ? `${simulation.winner} wins` : "Documented draw"}</h3>
            <p>{simulation.reason}</p>
          </section>
        ) : null}
      </section>
    </main>
  );
}
