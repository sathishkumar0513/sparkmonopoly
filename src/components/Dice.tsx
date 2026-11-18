import { useEffect, useState, type KeyboardEvent } from "react";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import type { DiceResult } from "../engine/types";
import { playSound } from "../audio/soundManager";
import { MOTION_EASE, MOTION_MS, MOTION_SPRING } from "../ui/motion";

interface DiceProps {
  result: DiceResult | null;
  rolling: boolean;
  reducedMotion: boolean;
  canRoll: boolean;
  rollLabel: string;
  onRoll: () => void;
}

export function Dice({ result, rolling, reducedMotion, canRoll, rollLabel, onRoll }: DiceProps) {
  const { t } = useTranslation();
  const [isAnimating, setIsAnimating] = useState(false);
  const [rollKey, setRollKey] = useState(0);

  const triggerRoll = () => {
    if (!canRoll || isAnimating) return;
    onRoll();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    triggerRoll();
  };

  useEffect(() => {
    if (!rolling) return;
    const soundFrame = window.requestAnimationFrame(() => playSound("diceRoll"));
    if (reducedMotion) return () => window.cancelAnimationFrame(soundFrame);
    setIsAnimating(true);
    setRollKey((key) => key + 1);
    const timeout = window.setTimeout(() => setIsAnimating(false), MOTION_MS.dice);
    return () => {
      window.cancelAnimationFrame(soundFrame);
      window.clearTimeout(timeout);
    };
  }, [rolling, result, reducedMotion]);

  return (
    <div
      className={`dice-stage ${result?.isDouble ? "dice-double" : ""} ${canRoll ? "dice-rollable" : ""}`}
      role={canRoll ? "button" : undefined}
      tabIndex={canRoll ? 0 : undefined}
      aria-live="polite"
      aria-label={canRoll ? rollLabel : result ? t("dice.showResult", { first: result.first, second: result.second }) : t("dice.ready")}
      onClick={canRoll ? triggerRoll : undefined}
      onKeyDown={canRoll ? handleKeyDown : undefined}
    >
      {[result?.first ?? 1, result?.second ?? 1].map((value, index) => (
        <motion.div
          key={`${index}-${rollKey}`}
          className={`dice-cube ${index === 0 ? "dice-cube-first" : ""}`}
          data-value={value}
          initial={false}
          animate={
            reducedMotion
              ? { rotateX: 0, rotateY: 0, scale: 1 }
              : isAnimating
                ? {
                    rotateX: [0, 360, 720, 1080],
                    rotateY: [0, 270, 540, 810],
                    y: [0, -22, 0, -8, 0],
                    scale: [1, 1.04, 0.97, 1],
                  }
                : {
                    rotateX: ({ 1: 0, 2: -90, 3: 0, 4: 0, 5: 90, 6: 0 })[value],
                    rotateY: ({ 1: 0, 2: 0, 3: -90, 4: 90, 5: 0, 6: 180 })[value],
                    scale: 1,
                  }
          }
          transition={
            isAnimating
              ? { duration: MOTION_MS.dice / 1000, ease: [...MOTION_EASE.standard] }
              : MOTION_SPRING.die
          }
          role="img"
          aria-label={t("dice.die", { number: index + 1, value })}
        >
          <span className="die-face die-front">{pips(1)}</span>
          <span className="die-face die-back">{pips(6)}</span>
          <span className="die-face die-right">{pips(3)}</span>
          <span className="die-face die-left">{pips(4)}</span>
          <span className="die-face die-top">{pips(2)}</span>
          <span className="die-face die-bottom">{pips(5)}</span>
        </motion.div>
      ))}
      {result ? (
        <span className="dice-total">
          {result.first + result.second}
          {result.isDouble ? <b>{t("dice.double")}</b> : null}
        </span>
      ) : <span className="dice-total dice-hint">{t("dice.awaiting")}</span>}
    </div>
  );
}

const PIP_LAYOUTS: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

function pips(value: number) {
  const active = PIP_LAYOUTS[value];
  return (
    <span className="pip-grid">
      {Array.from({ length: 9 }, (_, index) => (
        <i key={index} className={active.includes(index) ? "pip" : ""} />
      ))}
    </span>
  );
}
