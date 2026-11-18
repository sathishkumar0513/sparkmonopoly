import { useState } from "react";
import { motion } from "framer-motion";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { LanguageSwitcher } from "../i18n/LanguageSwitcher";
import { availableThemes } from "../themes";
import { writeStorageItem } from "../game/safeStorage";
import { useMotionLevel } from "../ui/useMotionLevel";
import { publicAsset } from "../ui/publicAsset";
import { MOTION_MS } from "../ui/motion";

const MINI_BOARD_CELLS = Array.from({ length: 121 }, (_, index) => {
  const row = Math.floor(index / 11);
  const column = index % 11;
  return row === 0 || row === 10 || column === 0 || column === 10;
});

export function ThemeSelect() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const motionLevel = useMotionLevel();
  const reducedMotion = motionLevel !== "full";
  const motionOff = motionLevel === "off";
  const [hoveredTheme, setHoveredTheme] = useState(searchParams.get("theme") ?? "international");
  const language = i18n.resolvedLanguage ?? "en";

  const themeName = (id: string, name: string) =>
    id === "tamilnadu" && language.startsWith("ta") ? "தமிழ்நாடு" : name;

  return (
    <main className="theme-shell">
      <header className="setup-header">
        <img className="setup-mark" src={publicAsset("business-tycoon-logo.png")} alt="" aria-hidden="true" />
        <div>
          <p className="eyebrow">{t("themePicker.eyebrow")}</p>
          <h1>Business Tycoon</h1>
        </div>
        <LanguageSwitcher />
      </header>
      <section className="theme-picker" aria-labelledby="theme-picker-title">
        <div className="theme-picker-heading">
          <span className="eyebrow">01 / 03 · {t("themePicker.eyebrow")}</span>
          <h2 id="theme-picker-title">{t("themePicker.title")}</h2>
          <p>{t("themePicker.description")}</p>
        </div>
        <div className="theme-card-grid">
          {availableThemes.map((theme, index) => {
            const selected = hoveredTheme === theme.id;
            const description = t(`themePicker.${theme.id}Description`);
            const currency = theme.id === "international"
              ? t("themePicker.currencyUsd")
              : t("themePicker.currencyInr");
            return (
              <motion.article
                key={theme.id}
                className={`theme-choice ${selected ? "theme-choice-selected" : ""}`}
                style={{
                  "--theme-preview-primary": theme.colors[0],
                  "--theme-preview-secondary": theme.colors[1],
                  "--theme-preview-accent": theme.colors[2],
                } as React.CSSProperties}
                initial={motionOff ? false : reducedMotion ? { opacity: 0 } : { opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: motionOff ? 0 : reducedMotion ? 0.01 : MOTION_MS.themeCard / 1000, delay: reducedMotion ? 0 : index * MOTION_MS.themeStagger / 1000 }}
                onMouseEnter={() => setHoveredTheme(theme.id)}
                onFocus={() => setHoveredTheme(theme.id)}
              >
                <button
                  type="button"
                  className="theme-choice-button"
                  aria-pressed={selected}
                  onClick={() => {
                    setHoveredTheme(theme.id);
                    writeStorageItem("business-tycoon-theme", theme.id);
                    navigate(`/setup?theme=${encodeURIComponent(theme.id)}`);
                  }}
                  onTouchStart={() => setHoveredTheme(theme.id)}
                >
                  <div className="mini-board" aria-hidden="true">
                    {MINI_BOARD_CELLS.map((isEdge, cellIndex) => (
                      <span
                        key={cellIndex}
                        className={isEdge ? "mini-board-tile" : ""}
                        style={isEdge ? { "--mini-index": cellIndex } as React.CSSProperties : undefined}
                      />
                    ))}
                    <span className="mini-board-center">BT</span>
                  </div>
                  <div className="theme-choice-copy">
                    <span className="eyebrow">{currency}</span>
                    <h3>{themeName(theme.id, theme.name)}</h3>
                    <p>{description}</p>
                    <span className="theme-property-count">
                      {t("themePicker.properties", { count: theme.propertyCount })}
                    </span>
                    <span className="theme-select-cta">{t("themePicker.choose")} <span aria-hidden="true">→</span></span>
                  </div>
                </button>
              </motion.article>
            );
          })}
        </div>
      </section>
    </main>
  );
}
