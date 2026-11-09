import { useEffect, useRef, useState } from "react";
import { motion, useMotionValue, useMotionValueEvent, useReducedMotion, useSpring } from "framer-motion";
import type { CSSProperties } from "react";
import type { Player } from "../engine/types";

const TOKEN_DESIGNS = ["🚗", "🎩", "🚢", "🐕", "🚀", "🦊"];
const PLAYER_COLORS = ["#ff806d", "#55c8a7", "#bd91ff", "#ffcb68", "#63b4ff", "#ff82bb"];

interface PlayerPanelProps {
  player: Player;
  index: number;
  active: boolean;
  currency: {
    symbol: string;
    format: "before" | "after";
    shortScale: { thousand: string; million: string; billion: string };
  };
  manageable?: boolean;
  thinking?: boolean;
  onManage?: () => void;
}

export function PlayerPanel({
  player,
  index,
  active,
  currency,
  manageable = false,
  thinking = false,
  onManage,
}: PlayerPanelProps) {
  const reducedMotion = useReducedMotion();
  const cashValue = useMotionValue(player.cash);
  const cashSpring = useSpring(cashValue, { stiffness: 100, damping: 20 });
  const [displayedCash, setDisplayedCash] = useState(() =>
    formatMoney(player.cash, currency),
  );
  const previousCash = useRef(player.cash);
  const [change, setChange] = useState<number | null>(null);

  useMotionValueEvent(cashSpring, "change", (value) => {
    setDisplayedCash(formatMoney(Math.round(value), currency));
  });

  useEffect(() => {
    const delta = player.cash - previousCash.current;
    if (delta !== 0) setChange(delta);
    previousCash.current = player.cash;
    if (reducedMotion) {
      setDisplayedCash(formatMoney(player.cash, currency));
    }
    cashValue.set(player.cash);
    if (delta !== 0) {
      const timeout = setTimeout(() => setChange(null), 1200);
      return () => clearTimeout(timeout);
    }
  }, [cashValue, currency, player.cash, reducedMotion]);

  const ownedCount = Object.keys(player.properties).length;
  return (
    <motion.article
      className={`player-panel ${active ? "player-panel-active" : ""} ${player.bankrupt ? "player-bankrupt" : ""}`}
      style={{ "--player-color": PLAYER_COLORS[index % PLAYER_COLORS.length] } as CSSProperties}
      animate={reducedMotion ? undefined : active ? { scale: [1, 1.012, 1] } : { scale: 1 }}
      transition={{ duration: 1.8, repeat: active && !reducedMotion ? Infinity : 0 }}
      aria-current={active ? "step" : undefined}
    >
      <motion.div
        className="player-avatar"
        animate={player.bankrupt && !reducedMotion ? { opacity: 0, scale: 1.8, rotate: 35, filter: "blur(5px)" } : undefined}
        transition={{ duration: 0.7 }}
      >
        {TOKEN_DESIGNS[index % TOKEN_DESIGNS.length]}
        {player.bankrupt ? <span className="shatter-spark">✦</span> : null}
      </motion.div>
      <div className="player-info">
        <div className="player-name-row">
          <h3>{player.name}</h3>
          {thinking ? <span className="thinking-badge" aria-live="polite">thinking…</span> : active ? <span className="active-badge">TURN</span> : null}
        </div>
        <span className="player-assets">{ownedCount} assets · {player.isBot ? "AI" : "Player"}</span>
        {manageable ? (
          <div className="player-panel-actions">
            <button type="button" className="panel-action" onClick={onManage}>Manage</button>
          </div>
        ) : null}
      </div>
      <div className="player-balance">
        <motion.span className="cash-number">{displayedCash}</motion.span>
        {change !== null ? (
          <motion.span
            key={`${player.id}-${player.cash}`}
            className={`cash-change ${change >= 0 ? "cash-gain" : "cash-loss"}`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: -16 }}
            transition={{ duration: 0.8 }}
          >
            {change >= 0 ? "+" : "−"}{formatMoney(Math.abs(change), currency)}
          </motion.span>
        ) : null}
      </div>
      {player.bankrupt ? <span className="bankrupt-stamp">Bankrupt</span> : null}
    </motion.article>
  );
}

function formatMoney(
  amount: number,
  currency: PlayerPanelProps["currency"],
) {
  const formatted = amount.toLocaleString("en-US");
  return currency.format === "before"
    ? `${currency.symbol}${formatted}`
    : `${formatted}${currency.symbol}`;
}
