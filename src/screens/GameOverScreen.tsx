import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { GameState } from "../engine/types";
import { calculateNetWorth, type NetWorthPoint } from "../game/saveGame";
import { formatMoney } from "../themes/formatMoney";
import { localizedName } from "../i18n/themeText";
import { useGameStore } from "../store/gameStore";
import { LanguageSwitcher } from "../i18n/LanguageSwitcher";
import { useMotionLevel } from "../ui/useMotionLevel";
import { MOTION_MS } from "../ui/motion";

const TOKENS = ["🚗", "🎩", "🚢", "🐕", "🚀", "🦊"];

function NetWorthChart({ state, history }: { state: GameState; history: NetWorthPoint[] }) {
  const { t } = useTranslation();
  const width = 680;
  const height = 220;
  const values = history.flatMap((point) => Object.values(point.values));
  const min = Math.min(0, ...values);
  const max = Math.max(1, ...values);
  const pointsFor = (playerId: string) => history.map((point, index) => {
    const value = point.values[playerId] ?? 0;
    const x = history.length < 2 ? width / 2 : (index / (history.length - 1)) * width;
    const y = height - ((value - min) / (max - min || 1)) * height;
    return `${x},${y}`;
  }).join(" ");
  return (
    <svg className="net-worth-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={t("summary.chartLabel")}>
      {state.players.map((player, index) => (
        <polyline
          key={player.id}
          points={pointsFor(player.id)}
          fill="none"
          stroke={player.color ?? `hsl(${index * 67 + 20} 75% 62%)`}
          strokeWidth="4"
          strokeLinejoin="round"
        />
      ))}
    </svg>
  );
}

export function GameOverScreen({ state, history }: { state: GameState; history: NetWorthPoint[] }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const motionLevel = useMotionLevel();
  const reduced = motionLevel !== "full";
  const setup = useGameStore((store) => store.setup);
  const clearGame = useGameStore((store) => store.clearGame);
  if (state.phase !== "gameOver") return null;
  const winner = state.players.find((player) => player.id === state.winnerId);
  const standings = [...state.players].sort((a, b) => calculateNetWorth(state, b.id) - calculateNetWorth(state, a.id));
  const bankruptcies = state.eventLog.filter((event) => event.type === "BANKRUPTCY")
    .map((event) => state.players.find((player) => player.id === event.playerId)?.name ?? "—");
  const biggestRent = state.eventLog
    .filter((event) => event.type === "RENT_PAID")
    .reduce((largest, event) => Math.max(largest, Number(event.details.amount) || 0), 0);
  const totalTurns = state.eventLog.filter((event) => event.type === "END_TURN").length;
  const playAgain = async () => {
    if (!setup) { navigate("/themes"); return; }
    const { loadTheme } = await import("../themes");
    const { createGame } = await import("../engine/gameReducer");
    const theme = await loadTheme(setup.themeId);
    const nextOptions = { ...setup.options, seed: Math.floor(Date.now() % 2_000_000_000) };
    const nextState = createGame(theme, setup.players, nextOptions);
    clearGame();
    useGameStore.getState().startGame(nextState, { ...setup, options: nextOptions });
    navigate("/game");
  };
  return (
    <main className="summary-shell">
      <header className="setup-header"><div><p className="eyebrow">{t("summary.eyebrow")}</p><h1>{t("summary.title")}</h1></div><LanguageSwitcher /></header>
      <section className="winner-card">
        {!reduced ? (
          <div className="confetti" aria-hidden="true">
            {Array.from({ length: 32 }, (_, index) => (
              <i
                key={index}
                style={{
                  "--confetti-left": `${(index * 37) % 100}%`,
                  "--confetti-top": `${(index % 4) * -8}px`,
                  "--confetti-color": `hsl(${(index * 43) % 360} 88% 66%)`,
                  "--confetti-delay": `${(index % 9) * 35}ms`,
                } as React.CSSProperties}
              />
            ))}
          </div>
        ) : null}
        <motion.span className="winner-trophy" animate={reduced ? undefined : { y: [0, -8, 0] }} transition={{ duration: MOTION_MS.drift / 1000, repeat: Infinity }} aria-hidden="true">🏆</motion.span>
        <span className="eyebrow">{t("summary.champion")}</span>
        <h2>{winner?.token ?? TOKENS[Math.max(0, state.players.indexOf(winner!)) % TOKENS.length]} {winner?.name ?? t("summary.noWinner")}</h2>
        {winner ? <strong>{formatMoney(calculateNetWorth(state, winner.id), state.theme.currency, i18n.resolvedLanguage ?? "en")}</strong> : null}
      </section>
      <section className="summary-card">
        <h2>{t("summary.standings")}</h2>
        <ol className="standings-list">{standings.map((player, index) => (
          <li key={player.id}><span>{index + 1}. {player.token ?? TOKENS[state.players.indexOf(player) % TOKENS.length]} {player.name}</span><strong>{formatMoney(calculateNetWorth(state, player.id), state.theme.currency, i18n.resolvedLanguage ?? "en")}</strong></li>
        ))}</ol>
      </section>
      <section className="summary-card">
        <h2>{t("summary.netWorth")}</h2>
        <NetWorthChart state={state} history={history} />
        <div className="chart-legend">{state.players.map((player, index) => <span key={player.id} style={{ "--legend-color": player.color ?? `hsl(${index * 67 + 20} 75% 62%)` } as React.CSSProperties}>{player.name}</span>)}</div>
      </section>
      <section className="summary-stats">
        <article><span>{t("summary.turns")}</span><strong>{totalTurns}</strong></article>
        <article><span>{t("summary.biggestRent")}</span><strong>{formatMoney(biggestRent, state.theme.currency, i18n.resolvedLanguage ?? "en")}</strong></article>
        {state.players.map((player) => <article key={player.id}><span>{player.name} · {t("summary.properties")}</span><strong>{Object.keys(player.properties).length}</strong><small>{t("summary.rentCollected")}: {formatMoney(player.stats.rentEarned, state.theme.currency, i18n.resolvedLanguage ?? "en")} · {t("summary.rentPaid")}: {formatMoney(player.stats.rentPaid, state.theme.currency, i18n.resolvedLanguage ?? "en")}</small></article>)}
      </section>
      <section className="summary-card"><h2>{t("summary.bankruptcyOrder")}</h2><p>{bankruptcies.length ? bankruptcies.join(" → ") : t("summary.none")}</p></section>
      <div className="summary-actions">
        <button className="primary-button" onClick={() => void playAgain()}>{t("summary.playAgain")}</button>
        <button className="secondary-button" onClick={() => { clearGame(); navigate("/setup"); }}>{t("summary.newSetup")}</button>
        <button className="secondary-button" onClick={() => { clearGame(); navigate("/"); }}>{t("summary.mainMenu")}</button>
      </div>
      <span className="sr-only">{localizedName(state.theme, i18n.resolvedLanguage ?? "en")}</span>
    </main>
  );
}
