import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import type { DiceResult } from "../engine/types";

interface DiceProps {
  result: DiceResult | null;
  rolling: boolean;
  reducedMotion: boolean;
}

export function Dice({ result, rolling, reducedMotion }: DiceProps) {
  const [isAnimating, setIsAnimating] = useState(false);
  const [rollKey, setRollKey] = useState(0);

  useEffect(() => {
    if (!rolling || reducedMotion) return;
    setIsAnimating(true);
    setRollKey((key) => key + 1);
    const timeout = setTimeout(() => setIsAnimating(false), 880);
    return () => clearTimeout(timeout);
  }, [rolling, result, reducedMotion]);

  return (
    <div className={`dice-stage ${result?.isDouble ? "dice-double" : ""}`} aria-live="polite" aria-label={result ? `Dice show ${result.first} and ${result.second}` : "Dice ready"}>
      {[result?.first ?? 1, result?.second ?? 1].map((value, index) => (
        <motion.div
          key={`${index}-${rollKey}`}
          className="dice-cube"
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
              ? { duration: 0.88, ease: [0.2, 0.8, 0.2, 1] }
              : { type: "spring", stiffness: 190, damping: 15 }
          }
          role="img"
          aria-label={`Die ${index + 1}: ${value}`}
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
          {result.isDouble ? <b>DOUBLE!</b> : null}
        </span>
      ) : <span className="dice-total dice-hint">Awaiting roll</span>}
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
