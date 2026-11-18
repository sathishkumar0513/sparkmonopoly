import { lazy, Suspense, useEffect, useState } from "react";
import { AnimatePresence, MotionConfig, motion, useReducedMotion } from "framer-motion";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useGameStore } from "./store/gameStore";
import type { BotSpeed } from "./screens/GameScreen";
import type { Theme } from "./themes/themeSchema";
import { loadTheme } from "./themes";
import { readPreferences, type AppPreferences } from "./game/preferences";
import { readSavedGame } from "./game/saveGame";
import { hasStorageWarning } from "./game/safeStorage";
import { BrandLoadingScreen } from "./components/BrandLoadingScreen";
import { OpeningSplash } from "./components/OpeningSplash";
import { openingAnimationDurationMs } from "./brandAssets";
import { installMotionTokens, MOTION_MS, resolveMotionLevel } from "./ui/motion";
import { GameErrorBoundary } from "./components/GameErrorBoundary";
import { ReloadPrompt } from "./components/ReloadPrompt";

const GameScreen = lazy(() =>
  import("./screens/GameScreen").then((module) => ({ default: module.GameScreen })),
);
const DevSetup = lazy(() =>
  import("./screens/DevSetup").then((module) => ({ default: module.DevSetup })),
);
const ThemeSelect = lazy(() =>
  import("./screens/ThemeSelect").then((module) => ({ default: module.ThemeSelect })),
);
const MainMenu = lazy(() =>
  import("./screens/MainMenu").then((module) => ({ default: module.MainMenu })),
);
const SettingsScreen = lazy(() =>
  import("./screens/SettingsScreen").then((module) => ({ default: module.SettingsScreen })),
);
const HowToPlay = lazy(() =>
  import("./screens/HowToPlay").then((module) => ({ default: module.HowToPlay })),
);
const GameOverScreen = lazy(() =>
  import("./screens/GameOverScreen").then((module) => ({ default: module.GameOverScreen })),
);
const NotFound = lazy(() =>
  import("./screens/NotFound").then((module) => ({ default: module.NotFound })),
);

export default function App() {
  const { t, i18n } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const game = useGameStore((store) => store.state);
  const history = useGameStore((store) => store.history);
  const savedSetup = useGameStore((store) => store.setup);
  const startGame = useGameStore((store) => store.startGame);
  const loadGame = useGameStore((store) => store.loadGame);
  const [preferences, setPreferences] = useState(readPreferences);
  const [storageWarning, setStorageWarning] = useState(hasStorageWarning);
  const osReducedMotion = useReducedMotion();
  const [openingImageLoaded, setOpeningImageLoaded] = useState(false);
  const [openingComplete, setOpeningComplete] = useState(() =>
    window.location.pathname !== "/" ||
    readPreferences().animation !== "full" ||
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true,
  );
  const [botSpeed, setBotSpeed] = useState<BotSpeed>(preferences.botSpeed);
  const [theme, setTheme] = useState<Theme | null>(null);
  const [themeError, setThemeError] = useState<string | null>(null);
  const themeId = searchParams.get("theme") ?? "international";

  useEffect(() => {
    const updatePreferences = (event: Event) => {
      setPreferences((event as CustomEvent<AppPreferences>).detail);
    };
    window.addEventListener("business-tycoon-preferences", updatePreferences);
    return () => window.removeEventListener("business-tycoon-preferences", updatePreferences);
  }, []);

  useEffect(() => {
    const updateStorageWarning = () => setStorageWarning(true);
    window.addEventListener("business-tycoon-storage-warning", updateStorageWarning);
    return () => window.removeEventListener("business-tycoon-storage-warning", updateStorageWarning);
  }, []);

  useEffect(() => {
    document.documentElement.lang = i18n.resolvedLanguage?.startsWith("ta") ? "ta" : "en";
    if (i18n.resolvedLanguage?.startsWith("ta")) {
      void Promise.all([
        import("@fontsource/noto-sans-tamil/tamil-400.css"),
        import("@fontsource/noto-sans-tamil/tamil-700.css"),
      ]);
    }
  }, [i18n.resolvedLanguage]);

  useEffect(() => {
    installMotionTokens();
  }, []);

  useEffect(() => {
    if (location.pathname !== "/dev" && location.pathname !== "/setup") {
      setTheme(null);
      setThemeError(null);
      return;
    }
    let active = true;
    setTheme(null);
    setThemeError(null);
    void loadTheme(themeId).then(
      (loaded) => {
        if (active) setTheme(loaded);
      },
      (error: unknown) => {
        if (active) {
          setThemeError(error instanceof Error ? error.message : String(error));
        }
      },
    );
    return () => {
      active = false;
    };
  }, [location.pathname, themeId]);

  useEffect(() => {
    if (location.pathname === "/game" && game?.phase === "gameOver") {
      navigate("/game-over", { replace: true });
    }
  }, [game?.phase, location.pathname, navigate]);

  useEffect(() => {
    if (location.pathname !== "/game" || game) return;
    const saved = readSavedGame();
    if (saved.status === "ok") {
      loadGame(saved.save.state, saved.save.history, saved.save.setup);
    } else {
      navigate("/", { replace: true });
    }
  }, [game, loadGame, location.pathname, navigate]);

  useEffect(() => {
    if (location.pathname !== "/game" || !game || game.phase === "gameOver") return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [game, location.pathname]);

  const isSetupRoute = location.pathname === "/dev" || location.pathname === "/setup";
  const motionLevel = resolveMotionLevel(preferences.animation, osReducedMotion === true);
  const transitionReduced = motionLevel !== "full";
  const transitionOff = motionLevel === "off";
  const showOpening = location.pathname === "/" && !openingComplete && !transitionReduced;

  useEffect(() => {
    if (!showOpening || !openingImageLoaded) return;
    const timer = window.setTimeout(
      () => setOpeningComplete(true),
      openingAnimationDurationMs,
    );
    return () => window.clearTimeout(timer);
  }, [openingImageLoaded, showOpening]);

  return (
    <div
      className="app-frame"
      data-color-blind={preferences.colorBlind || undefined}
      data-high-contrast={preferences.highContrast || undefined}
      data-text-size={preferences.textSize}
      data-animation={preferences.animation}
    >
      {storageWarning ? (
        <aside className="storage-fallback-notice" role="status">
          {t("common.storageFallback")}
        </aside>
      ) : null}
      <ReloadPrompt />
      <MotionConfig reducedMotion={transitionReduced ? "always" : "never"}>
        {showOpening ? (
          <OpeningSplash onLoad={() => setOpeningImageLoaded(true)} />
        ) : (
          <Suspense fallback={<BrandLoadingScreen label={t("common.loading")} reducedMotion={transitionReduced} />}>
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={location.pathname}
                className="route-transition"
                initial={transitionOff ? false : { opacity: 0, y: transitionReduced ? 0 : 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={transitionOff ? undefined : { opacity: 0, y: transitionReduced ? 0 : -5 }}
                transition={{ duration: transitionOff ? 0 : transitionReduced ? MOTION_MS.reduced / 1000 : MOTION_MS.route / 1000 }}
              >
            {location.pathname === "/" ? (
              <MainMenu reducedMotion={transitionReduced} />
            ) : location.pathname === "/themes" ? (
              <ThemeSelect />
            ) : isSetupRoute ? (
              theme && theme.id === themeId ? (
                <DevSetup
                  theme={theme}
                  onChangeTheme={() => navigate("/themes")}
                  developerMode={location.pathname === "/dev"}
                  onStart={(nextGame, speed, timer) => {
                    setBotSpeed(speed);
                    const players = nextGame.players.map((player) => ({
                      id: player.id,
                      name: player.name,
                      isBot: player.isBot,
                      botDifficulty: player.botDifficulty,
                      token: player.token,
                      color: player.color,
                    }));
                    const seed = Number(nextGame.eventLog.find((event) => event.type === "GAME_STARTED")?.details.seed ?? 1);
                    startGame(nextGame, {
                      themeId: nextGame.theme.id,
                      players,
                      options: { ...nextGame.settings, seed },
                      turnTimerSeconds: timer,
                      botSpeed: speed,
                    });
                    navigate("/game");
                  }}
                  onSimulationComplete={(finished, history) => {
                    loadGame(finished, history);
                    navigate("/game-over");
                  }}
                />
              ) : themeError ? (
                <main className="loading-screen" role="alert">
                  <p>{t("setup.themeLoadError", { detail: themeError })}</p>
                  <button className="secondary-button" onClick={() => navigate("/themes")}>{t("setup.changeTheme")}</button>
                </main>
              ) : <BrandLoadingScreen label={t("common.loading")} reducedMotion={transitionReduced} />
            ) : location.pathname === "/game" ? (
              game ? (
                <GameErrorBoundary
                  debugInfo={{
                    seed: Number(game.eventLog.find((event) => event.type === "GAME_STARTED")?.details.seed ?? game.rngState),
                    lastActions: game.eventLog.slice(-20).map((event) => ({
                      type: event.type,
                      playerId: event.playerId,
                      details: event.details,
                    })),
                    appVersion: "0.1.0",
                  }}
                  title={t("gameError.title")}
                  description={t("gameError.description")}
                  reloadLabel={t("gameError.reload")}
                  copyLabel={t("gameError.copy")}
                  copiedLabel={t("gameError.copied")}
                  copyFailedLabel={t("gameError.copyFailed")}
                >
                  <GameScreen botSpeed={savedSetup?.botSpeed ?? botSpeed} turnTimerSeconds={savedSetup?.turnTimerSeconds ?? 0} />
                </GameErrorBoundary>
              ) : <BrandLoadingScreen label={t("common.loading")} reducedMotion={transitionReduced} />
            ) : location.pathname === "/game-over" ? (
              game ? <GameOverScreen state={game} history={history} /> : <BrandLoadingScreen label={t("common.loading")} reducedMotion={transitionReduced} />
            ) : location.pathname === "/settings" ? (
              <SettingsScreen />
            ) : location.pathname === "/how-to-play" ? (
              <HowToPlay />
            ) : <NotFound />}
              </motion.div>
            </AnimatePresence>
          </Suspense>
        )}
      </MotionConfig>
    </div>
  );
}
