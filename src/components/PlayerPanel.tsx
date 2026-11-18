import { memo, useEffect, useRef, useState } from "react";
import { motion, useMotionValue, useMotionValueEvent, useSpring } from "framer-motion";
import type { CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import type { Player } from "../engine/types";
import type { Theme } from "../themes/themeSchema";
import { formatMoney } from "../themes/formatMoney";
import { MOTION_EASE, MOTION_MS, MOTION_SPRING } from "../ui/motion";
import { useMotionLevel } from "../ui/useMotionLevel";

const TOKEN_DESIGNS = ["🚗", "🎩", "🚢", "🐕", "🚀", "🦊"];
const PLAYER_COLORS = ["#ff806d", "#55c8a7", "#bd91ff", "#ffcb68", "#63b4ff", "#ff82bb"];

interface PlayerPanelProps {
  id: string;
  player: Player;
  index: number;
  active: boolean;
  currency: Theme["currency"];
  manageable?: boolean;
  thinking?: boolean;
  onManage?: () => void;
  timer?: { remaining: number; total: number };
}

export const PlayerPanel = memo(function PlayerPanel({
  id,
  player,
  index,
  active,
  currency,
  manageable = false,
  thinking = false,
  onManage,
  timer,
}: PlayerPanelProps) {
  const { t, i18n } = useTranslation();
  const motionLevel = useMotionLevel();
  const reducedMotion = motionLevel !== "full";
  const language = i18n.resolvedLanguage ?? "en";
  const cashValue = useMotionValue(player.cash);
  const cashSpring = useSpring(cashValue, MOTION_SPRING.cash);
  const [displayedCash, setDisplayedCash] = useState(() =>
    formatMoney(player.cash, currency, language),
  );
  const previousCash = useRef(player.cash);
  const [change, setChange] = useState<number | null>(null);

  useMotionValueEvent(cashSpring, "change", (value) => {
    setDisplayedCash(formatMoney(Math.round(value), currency, language));
  });

  useEffect(() => {
    const delta = player.cash - previousCash.current;
    if (delta !== 0) setChange(delta);
    previousCash.current = player.cash;
    if (reducedMotion) {
      setDisplayedCash(formatMoney(player.cash, currency, language));
      cashValue.jump(player.cash);
    } else {
      cashValue.set(player.cash);
    }
    if (delta !== 0) {
      const timeout = setTimeout(() => setChange(null), MOTION_MS.counter);
      return () => clearTimeout(timeout);
    }
  }, [cashValue, currency, language, player.cash, reducedMotion]);

  useEffect(() => {
    setDisplayedCash(formatMoney(Math.round(cashSpring.get()), currency, language));
  }, [cashSpring, currency, language]);

  const ownedCount = Object.keys(player.properties).length;
  return (
    <motion.article
      id={id}
      className={`player-panel ${active ? "player-panel-active" : ""} ${player.bankrupt ? "player-bankrupt" : ""}`}
      style={{ "--player-color": player.color ?? PLAYER_COLORS[index % PLAYER_COLORS.length] } as CSSProperties}
      animate={reducedMotion ? undefined : active ? { scale: [1, 1.012, 1] } : { scale: 1 }}
      transition={{ duration: MOTION_MS.panelPulse / 1000, repeat: active && !reducedMotion ? Infinity : 0, ease: [...MOTION_EASE.standard] }}
      aria-current={active ? "step" : undefined}
    >
      <motion.div
        className="player-avatar"
        animate={player.bankrupt && !reducedMotion ? { opacity: 0, scale: 1.8, rotate: 35 } : undefined}
        transition={{ duration: reducedMotion ? 0 : MOTION_MS.shatter / 1000 }}
      >
        {player.token ?? TOKEN_DESIGNS[index % TOKEN_DESIGNS.length]}
        <span className="sr-only">{t("game.playerMark", { number: index + 1 })}</span>
        {player.bankrupt ? <span className="shatter-spark">✦</span> : null}
      </motion.div>
      <div className="player-info">
        <div className="player-name-row">
          <h3>{player.name}</h3>
          {thinking ? <span className="thinking-badge" aria-live="polite">{t("game.thinking")}</span> : active ? <span className="active-badge">{t("game.turn")}</span> : null}
        </div>
        <span className="player-assets">{t("game.assets", { count: ownedCount })} · {player.isBot ? t("game.ai") : t("game.player")}</span>
        {manageable ? (
          <div className="player-panel-actions">
            <button type="button" className="panel-action" onClick={onManage}>{t("game.manage")}</button>
          </div>
        ) : null}
      </div>
      <div className="player-balance">
        <motion.span
          className="cash-number"
          animate={reducedMotion || change === null ? { scale: 1 } : { scale: [1, 1.08, 1] }}
          transition={{ duration: reducedMotion ? 0 : MOTION_MS.cashBounce / 1000 }}
        >
          {displayedCash}
        </motion.span>
        {change !== null ? (
          <motion.span
            key={`${player.id}-${player.cash}`}
            className={`cash-change ${change >= 0 ? "cash-gain" : "cash-loss"}`}
            initial={reducedMotion ? false : { opacity: 0, y: 8 }}
            animate={reducedMotion ? { opacity: 1, y: 0 } : { opacity: 1, y: -16 }}
            transition={{ duration: reducedMotion ? 0 : MOTION_MS.salary / 1000 }}
          >
            {change >= 0 ? "+" : "−"}{formatMoney(Math.abs(change), currency, language)}
          </motion.span>
        ) : null}
      </div>
      {timer ? (
        <div className="player-turn-timer" role="timer" aria-label={t("navigation.timer", { seconds: timer.remaining })}>
          <span style={{ "--timer-angle": `${(timer.remaining / timer.total) * 360}deg` } as CSSProperties}>{timer.remaining}</span>
        </div>
      ) : null}
      {player.bankrupt ? <span className="bankrupt-stamp">{t("game.bankrupt")}</span> : null}
    </motion.article>
  );
});
