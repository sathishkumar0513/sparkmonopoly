import { motion } from "framer-motion";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { availableThemes } from "../themes";
import { discardSavedGame, readSavedGame } from "../game/saveGame";
import { useGameStore } from "../store/gameStore";
import { LanguageSwitcher } from "../i18n/LanguageSwitcher";
import { readStorageItem } from "../game/safeStorage";
import { MOTION_MS } from "../ui/motion";
import { publicAsset } from "../ui/publicAsset";

export function MainMenu({ reducedMotion }: { reducedMotion: boolean }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const loadGame = useGameStore((store) => store.loadGame);
  const [refresh, setRefresh] = useState(0);
  const saved = useMemo(() => readSavedGame(), [refresh]);
  const selectedThemeId = saved.status === "ok"
    ? saved.save.state.theme.id
    : readStorageItem("business-tycoon-theme") ?? "international";
  const selectedTheme = availableThemes.find((item) => item.id === selectedThemeId) ?? availableThemes[0];

  const continueGame = () => {
    if (saved.status !== "ok") return;
    loadGame(saved.save.state, saved.save.history, saved.save.setup);
    navigate(saved.save.state.phase === "gameOver" ? "/game-over" : "/game");
  };

  return (
    <main className="menu-shell" style={{
      "--menu-primary": selectedTheme?.colors[0],
      "--menu-secondary": selectedTheme?.colors[1],
      "--menu-accent": selectedTheme?.colors[2],
    } as React.CSSProperties}>
      <header className="menu-header">
        <div className="brand-lockup">
          <motion.img
            className="brand-logo"
            src={publicAsset("spark-monopoly-logo.png")}
            alt=""
            aria-hidden="true"
            animate={reducedMotion ? undefined : { y: [0, -4, 0] }}
            transition={{ duration: MOTION_MS.logo / 1000, repeat: Infinity, ease: "easeInOut" }}
          />
          <div>
            <p className="eyebrow">{t("menu.eyebrow")}</p>
            <h1>Spark Monopoly</h1>
          </div>
        </div>
        <LanguageSwitcher />
      </header>
      <section className="menu-hero">
        <img
          className="menu-brand-art"
          src={publicAsset("spark-monopoly-logo.png")}
          alt=""
          fetchPriority="high"
        />
        <span className="eyebrow">{t("menu.heroEyebrow")}</span>
        <h2>{t("menu.heroTitle")}</h2>
        <p>{t("menu.heroDescription")}</p>
        <div className="menu-actions">
          <button className="primary-button menu-primary" onClick={() => navigate("/themes")}>
            {t("menu.newGame")} <span aria-hidden="true">→</span>
          </button>
          {saved.status === "ok" ? (
            <button className="secondary-button" onClick={continueGame}>
              {t("menu.continue")}
            </button>
          ) : null}
          <button className="secondary-button" onClick={() => navigate("/settings")}>
            {t("menu.settings")}
          </button>
          <button className="secondary-button" onClick={() => navigate("/how-to-play")}>
            {t("menu.howToPlay")}
          </button>
        </div>
        {saved.status === "ok" ? (
          <p className="save-summary">
            {t("menu.savedGame", {
              theme: availableThemes.find((item) => item.id === saved.save.state.theme.id)?.name ?? saved.save.state.theme.name,
              players: saved.save.state.players.map((player) => player.name).join(", "),
              turn: saved.save.state.turnNumber,
            })}
          </p>
        ) : null}
        {saved.status === "corrupt" ? (
          <div className="corrupt-save" role="alert">
            <p>{t("menu.corruptSave")}</p>
            <button className="secondary-button" onClick={() => {
              discardSavedGame();
              setRefresh((value) => value + 1);
            }}>{t("menu.discardSave")}</button>
          </div>
        ) : null}
      </section>
      <footer className="menu-footer">
        <span>{t("menu.version", { version: "0.1.0" })}</span>
        <span>{t("menu.disclaimer")}</span>
      </footer>
    </main>
  );
}
