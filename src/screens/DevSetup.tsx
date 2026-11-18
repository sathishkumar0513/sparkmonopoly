import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { createGame } from "../engine/gameReducer";
import { runBotGame } from "../engine/bots";
import type { BotSpeed } from "./GameScreen";
import type { PlayerSetup } from "../engine/types";
import type { Theme } from "../themes/themeSchema";
import { localizedName } from "../i18n/themeText";
import { LanguageSwitcher } from "../i18n/LanguageSwitcher";
import { publicAsset } from "../ui/publicAsset";
import { validateSetupSeats } from "../game/setupValidation";
import { appendNetWorthPoint, createNetWorthPoint, type NetWorthPoint } from "../game/saveGame";

interface SeatDraft {
  name: string;
  kind: "human" | "bot";
  difficulty: "easy" | "medium";
  token: string;
  color: string;
}

interface DevSetupProps {
  theme: Theme;
  onChangeTheme: () => void;
  onStart: (game: ReturnType<typeof createGame>, speed: BotSpeed, timer: 0 | 30 | 60 | 90) => void;
  onSimulationComplete?: (game: ReturnType<typeof createGame>, history: NetWorthPoint[]) => void;
  developerMode?: boolean;
}

const TOKENS = ["🚗", "🎩", "🚢", "🐕", "🚀", "🦊"];
const COLORS = ["#54b7a6", "#f0a441", "#7d9fff", "#e879a5", "#9d83eb", "#78c66e"];

export function DevSetup({ theme, onChangeTheme, onStart, onSimulationComplete, developerMode = false }: DevSetupProps) {
  const { t, i18n } = useTranslation();
  const [count, setCount] = useState(3);
  const [seed, setSeed] = useState("20261109");
  const [startingCashLevel, setStartingCashLevel] = useState<"low" | "standard" | "high">("standard");
  const [freeParkingJackpot, setFreeParkingJackpot] = useState(false);
  const [doubleSalaryOnGo, setDoubleSalaryOnGo] = useState(false);
  const [turnTimer, setTurnTimer] = useState<0 | 30 | 60 | 90>(0);
  const [lateGamePressureEnabled, setLateGamePressureEnabled] = useState(false);
  const [pressureStartTurn, setPressureStartTurn] = useState("120");
  const [botSpeed, setBotSpeed] = useState<BotSpeed>("normal");
  const [botsOnly, setBotsOnly] = useState(false);
  const [seats, setSeats] = useState<SeatDraft[]>(() =>
    Array.from({ length: 6 }, (_, index) => ({
      name: ["Alex", "Jordan", "Sam", "Taylor", "Riley", "Casey"][index] ?? `Player ${index + 1}`,
      kind: index === 1 ? "bot" : "human",
      difficulty: index === 1 ? "medium" : "easy",
      token: TOKENS[index] ?? TOKENS[0]!,
      color: COLORS[index] ?? COLORS[0]!,
    })),
  );
  const [simulation, setSimulation] = useState<{
    outcome: "winner" | "draw";
    turns: number;
    reason: string;
    winner: string | null;
  } | null>(null);

  const selectedSeats = useMemo(() => seats.slice(0, count), [count, seats]);
  const numericSeed = seed.trim() ? Number(seed) : Math.floor(Date.now() % 2_000_000_000);
  const validSeed = !seed.trim() || (/^-?\d+$/.test(seed.trim()) && Number.isSafeInteger(numericSeed));
  const numericPressureStart = Number(pressureStartTurn);
  const validPressureStart = Number.isSafeInteger(numericPressureStart) && numericPressureStart > 0;
  const seatErrors = validateSetupSeats(selectedSeats);
  const validSetup = validSeed && (!lateGamePressureEnabled || validPressureStart) &&
    (botsOnly || seatErrors.length === 0);

  const updateSeat = (index: number, patch: Partial<SeatDraft>) => {
    setSeats((current) => current.map((seat, seatIndex) =>
      seatIndex === index ? { ...seat, ...patch } : seat,
    ));
  };
  const randomize = () => {
    const shuffledTokens = [...TOKENS].sort(() => Math.random() - 0.5);
    const shuffledColors = [...COLORS].sort(() => Math.random() - 0.5);
    setSeats((current) => current.map((seat, index) => ({
      ...seat,
      token: shuffledTokens[index] ?? seat.token,
      color: shuffledColors[index] ?? seat.color,
    })));
  };
  const resetSeats = () => setSeats(Array.from({ length: 6 }, (_, index) => ({
    name: ["Alex", "Jordan", "Sam", "Taylor", "Riley", "Casey"][index] ?? `Player ${index + 1}`,
    kind: index === 1 ? "bot" as const : "human" as const,
    difficulty: index === 1 ? "medium" as const : "easy" as const,
    token: TOKENS[index] ?? TOKENS[0]!,
    color: COLORS[index] ?? COLORS[0]!,
  })));

  const createSetups = (allBots = botsOnly): PlayerSetup[] =>
    selectedSeats.map((seat, index) => ({
      id: `player-${index + 1}`,
      name: seat.name.trim() || `Player ${index + 1}`,
      isBot: allBots || seat.kind === "bot",
      botDifficulty: seat.difficulty,
      token: seat.token,
      color: seat.color,
    }));

  const start = () => {
    if (!validSetup) return;
    setSimulation(null);
    const salary = theme.tiles.find((tile) => tile.type === "go")?.salary ?? 200;
    const startingCash = Math.round(salary * (
      startingCashLevel === "low" ? 5 : startingCashLevel === "high" ? 10 : 7.5
    ));
    onStart(createGame(theme, createSetups(), {
      seed: numericSeed,
      startingCash,
      freeParkingJackpot,
      doubleSalaryOnGo,
      lateGamePressure: lateGamePressureEnabled
        ? { startTurn: numericPressureStart, rentMultiplier: 1.5 }
        : null,
    }), botSpeed, turnTimer);
  };

  const simulate = () => {
    if (!validSeed) return;
    const game = createGame(theme, createSetups(true), { seed: numericSeed });
    const history = [createNetWorthPoint(game)];
    const result = runBotGame(game, {
      turnCap: 1000,
      onTurnEnd: (state) => {
        const nextHistory = appendNetWorthPoint(history, state);
        history.splice(0, history.length, ...nextHistory);
      },
    });
    onSimulationComplete?.(result.state, history);
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
    <main
      className="setup-shell"
      style={{
        "--theme-primary": theme.palette.primary,
        "--theme-secondary": theme.palette.secondary,
        "--theme-accent": theme.palette.accent,
        "--theme-background": theme.palette.background,
        "--theme-surface": theme.palette.surface,
        "--theme-text": theme.palette.text,
      } as React.CSSProperties}
    >
    <header className="setup-header">
      <img className="setup-mark" src={publicAsset("spark-monopoly-logo.png")} alt="" aria-hidden="true" />
      <div>
        <p className="eyebrow">{t("setup.tagline")}</p>
        <h1>Spark Monopoly</h1>
      </div>
      <div className="setup-header-actions">
        <button className="header-chip theme-back-button" onClick={onChangeTheme}>
          {t("setup.changeTheme")}
        </button>
        <LanguageSwitcher />
        <span className="header-chip">{t("setup.developmentTable")}</span>
      </div>
    </header>
    <section className="setup-card" aria-labelledby="setup-title">
      <div className="setup-title-row">
        <div>
          <span className="eyebrow">{t("setup.edition", { theme: localizedName(theme, i18n.resolvedLanguage ?? "en") })}</span>
          <h2 id="setup-title">{t("setup.title")}</h2>
          <p>{t("setup.description")}</p>
        </div>
        <span className="setup-theme-mark">{theme.id === "tamilnadu" ? "🪷" : theme.id === "india" ? "🇮🇳" : "🌐"}</span>
      </div>
      <div className="setup-options">
        <label>
          {t("setup.players")}
          <select value={count} onChange={(event) => setCount(Number(event.target.value))}>
            {[2, 3, 4, 5, 6].map((value) => <option value={value} key={value}>{t("setup.playerOption", { count: value })}</option>)}
          </select>
        </label>
        <label>
          {t("setup.gameSeed")}
          <input type="number" step="1" value={seed} onChange={(event) => setSeed(event.target.value)} />
        </label>
        <label>
          {t("setup.botSpeed")}
          <select value={botSpeed} onChange={(event) => setBotSpeed(event.target.value as BotSpeed)}>
            <option value="normal">{t("setup.normal")}</option>
            <option value="fast">{t("setup.fast")}</option>
            <option value="instant">{t("setup.instant")}</option>
            </select>
          </label>
        </div>
        <div className="seat-list">
          {selectedSeats.map((seat, index) => (
            <article className="seat-card" key={index}>
              <span className="seat-token" aria-hidden="true">{seat.token}</span>
              <label className="seat-name">
                <span>{t("setup.seatName", { number: index + 1 })}</span>
                <input value={seat.name} onChange={(event) => updateSeat(index, { name: event.target.value })} maxLength={24} />
              </label>
              <label>
                {t("setup.playerType")}
                <select
                  value={botsOnly ? "bot" : seat.kind}
                  disabled={botsOnly}
                  onChange={(event) => updateSeat(index, { kind: event.target.value as SeatDraft["kind"] })}
                >
                  <option value="human">{t("setup.human")}</option>
                  <option value="bot">{t("setup.bot")}</option>
                </select>
              </label>
              <label>
                {t("setup.token")}
                <select value={seat.token} onChange={(event) => updateSeat(index, { token: event.target.value })}>
                  {TOKENS.map((token) => <option key={token} value={token} disabled={selectedSeats.some((other, otherIndex) => otherIndex !== index && other.token === token)}>{token}</option>)}
                </select>
              </label>
              <label>
                {t("setup.color")}
                <select value={seat.color} onChange={(event) => updateSeat(index, { color: event.target.value })}>
                  {COLORS.map((color, colorIndex) => <option key={color} value={color} disabled={selectedSeats.some((other, otherIndex) => otherIndex !== index && other.color === color)}>{t("setup.colorName", { number: colorIndex + 1 })}</option>)}
                </select>
              </label>
              <label>
                {t("setup.difficulty")}
                <select
                  value={seat.difficulty}
                  disabled={!botsOnly && seat.kind !== "bot"}
                  onChange={(event) => updateSeat(index, { difficulty: event.target.value as SeatDraft["difficulty"] })}
                >
                  <option value="easy">{t("setup.easy")}</option>
                  <option value="medium">{t("setup.medium")}</option>
                </select>
              </label>
            </article>
          ))}
        </div>
        <div className="setup-options setup-house-rules">
          <label>{t("setup.startingCash")}
            <select value={startingCashLevel} onChange={(event) => setStartingCashLevel(event.target.value as typeof startingCashLevel)}>
              <option value="low">{t("setup.cashLow")}</option><option value="standard">{t("setup.cashStandard")}</option><option value="high">{t("setup.cashHigh")}</option>
            </select>
          </label>
          <label>{t("setup.turnTimer")}
            <select value={turnTimer} onChange={(event) => setTurnTimer(Number(event.target.value) as typeof turnTimer)}>
              <option value={0}>{t("setup.timerOff")}</option><option value={30}>{t("setup.seconds30")}</option><option value={60}>{t("setup.seconds60")}</option><option value={90}>{t("setup.seconds90")}</option>
            </select>
          </label>
          <label className="simulation-toggle"><input type="checkbox" checked={freeParkingJackpot} onChange={(event) => setFreeParkingJackpot(event.target.checked)} /><span>{t("setup.freeParking")}</span></label>
          <label className="simulation-toggle"><input type="checkbox" checked={doubleSalaryOnGo} onChange={(event) => setDoubleSalaryOnGo(event.target.checked)} /><span>{t("setup.doubleGo")}</span></label>
        </div>
        {!botsOnly && seatErrors.map((error) => <p className="setup-error" key={error} role="alert">{t(`setup.${error}`)}</p>)}
        <div className="setup-actions setup-seat-actions">
          <button type="button" className="secondary-button" onClick={randomize}>{t("setup.randomize")}</button>
          <button type="button" className="secondary-button" onClick={resetSeats}>{t("setup.reset")}</button>
        </div>
        {developerMode ? <label className="simulation-toggle">
          <input type="checkbox" checked={botsOnly} onChange={(event) => setBotsOnly(event.target.checked)} />
          <span><strong>{t("setup.botsOnly")}</strong><small>{t("setup.botsOnlyHelp")}</small></span>
        </label> : null}
        <div className="simulation-toggle">
          <input
            id="late-game-pressure"
            type="checkbox"
            checked={lateGamePressureEnabled}
            onChange={(event) => setLateGamePressureEnabled(event.target.checked)}
          />
          <label htmlFor="late-game-pressure">
            <strong>{t("setup.lateGamePressure")}</strong>
            <small>{t("setup.lateGamePressureHelp")}</small>
          </label>
          <div>
            {lateGamePressureEnabled ? (
              <label className="pressure-turn-field">
                {t("setup.startAfterRound")}
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={pressureStartTurn}
                  onChange={(event) => setPressureStartTurn(event.target.value)}
                />
              </label>
            ) : null}
          </div>
        </div>
        {!validSeed ? <p className="setup-error" role="alert">{t("setup.seedError")}</p> : null}
        {lateGamePressureEnabled && !validPressureStart ? (
          <p className="setup-error" role="alert">{t("setup.pressureError")}</p>
        ) : null}
        <div className="setup-actions">
          <button className="primary-button" disabled={!validSetup} onClick={start}>
            {t("setup.startGame")}
          </button>
          {developerMode && botsOnly ? (
            <button className="secondary-button" disabled={!validSeed} onClick={simulate}>
              {t("setup.runSimulation")}
            </button>
          ) : null}
        </div>
        {simulation ? (
          <section className={`simulation-result ${simulation.outcome}`} aria-live="polite">
            <span className="eyebrow">{t("setup.simulationTurns", { turns: simulation.turns })}</span>
            <h3>{simulation.winner ? t("setup.wins", { name: simulation.winner }) : t("setup.documentedDraw")}</h3>
            <p>{simulation.outcome === "draw" ? t("setup.simulationDrawReason") : t("setup.simulationComplete")}</p>
          </section>
        ) : null}
      </section>
    </main>
  );
}
