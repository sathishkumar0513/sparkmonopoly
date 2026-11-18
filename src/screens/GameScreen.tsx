import { Profiler, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { lazy, Suspense } from "react";
import type { TFunction } from "i18next";
import type { GameAction, GameEvent, GameState } from "../engine/types";
import { createGame, getAvailableActions } from "../engine/gameReducer";
import { getAudioPreferences, playSound, setMuted, setMusicEnabled, setVolume } from "../audio/soundManager";
import type { SoundId } from "../audio/soundRegistry";
import { Board } from "../components/Board";
import { Dice } from "../components/Dice";
import { GameplayModals } from "../components/GameplayModals";
import { PlayerPanel } from "../components/PlayerPanel";
import { tilePath } from "../components/boardLayout";
import { AnimationQueue } from "../components/animationQueue";
import { PropertyManagement } from "../components/PropertyManagement";
import { TradeModal } from "../components/TradeModal";
import { chooseBotAction, createBotRandom, getBotActor, isBotActionLegal } from "../engine/bots";
import { useGameStore } from "../store/gameStore";
import { LanguageSwitcher } from "../i18n/LanguageSwitcher";
import { localizedCardText, localizedFact, localizedName } from "../i18n/themeText";
import { formatMoney } from "../themes/formatMoney";
import { getTimeoutActions } from "../game/turnTimeout";
import { readPreferences } from "../game/preferences";
import { MOTION_EASE, MOTION_MS, resolveMotionLevel } from "../ui/motion";
import { useDialogFocus } from "../components/useDialogFocus";
import { usePageVisibility } from "../ui/usePageVisibility";

const LazySettingsScreen = lazy(() =>
  import("./SettingsScreen").then((module) => ({ default: module.SettingsScreen })),
);

const TOKEN_DESIGNS = ["🚗", "🎩", "🚢", "🐕", "🚀", "🦊"];
const EVENT_SYNCED_SOUND_ACTIONS = new Set<GameAction["type"]>([
  "ROLL_DICE",
  "BUY_PROPERTY",
  "PAY_JAIL_FINE",
  "USE_JAIL_CARD",
  "PAY_DEBT",
  "DECLARE_BANKRUPTCY",
  "ACCEPT_TRADE",
  "BUILD_HOUSE",
  "BUILD_HOTEL",
  "SELL_BUILDING",
  "MORTGAGE",
  "UNMORTGAGE",
]);
const renderCounts = new Map<string, number>();

function countDevRender(id: string): void {
  if (!import.meta.env.DEV) return;
  const count = (renderCounts.get(id) ?? 0) + 1;
  renderCounts.set(id, count);
  if (count === 1 || count % 25 === 0) {
    console.debug(`[render count] ${id}: ${count}`);
  }
}

export type BotSpeed = "normal" | "fast" | "instant";

export function GameScreen({ botSpeed = "normal", turnTimerSeconds = 0, paused = false }: { botSpeed?: BotSpeed; turnTimerSeconds?: 0 | 30 | 60 | 90; paused?: boolean }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const language = i18n.resolvedLanguage ?? "en";
  const state = useGameStore((store) => store.state);
  const dispatch = useGameStore((store) => store.dispatch);
  const savedSetup = useGameStore((store) => store.setup);
  const startGame = useGameStore((store) => store.startGame);
  const reducedMotion = useReducedMotion();
  const pageVisible = usePageVisibility();
  const [preferences, setPreferences] = useState(readPreferences);
  useEffect(() => {
    const updatePreferences = (event: Event) => {
      setPreferences((event as CustomEvent<typeof preferences>).detail);
    };
    window.addEventListener("business-tycoon-preferences", updatePreferences);
    return () => window.removeEventListener("business-tycoon-preferences", updatePreferences);
  }, []);
  const [selectedTileId, setSelectedTileId] = useState<string | null>(null);
  const [visualPositions, setVisualPositions] = useState<Record<string, number>>(
    {},
  );
  const [goFlash, setGoFlash] = useState(false);
  const [landedTileIndex, setLandedTileIndex] = useState<number | null>(null);
  const [rentFlight, setRentFlight] = useState<{
    id: number;
    startX: number;
    startY: number;
    deltaX: number;
    deltaY: number;
  } | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);
  const [toast, setToast] = useState<{ id: number; text: string; tone: string } | null>(null);
  const [audioPreferences, setAudioPreferences] = useState(getAudioPreferences);
  const [managementOpen, setManagementOpen] = useState(false);
  const [tradeOpen, setTradeOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [timerRemaining, setTimerRemaining] = useState<number>(turnTimerSeconds);
  const [announcement, setAnnouncement] = useState("");
  const menuDialogRef = useRef<HTMLElement>(null);
  const tileDialogRef = useRef<HTMLElement>(null);
  const [thinkingId, setThinkingId] = useState<string | null>(null);
  const previousPositions = useRef<Record<string, number>>({});
  const previousEventId = useRef(0);
  const queue = useRef(new AnimationQueue());
  const toastSequence = useRef(0);
  const timedOutKey = useRef("");
  const timerDeadline = useRef<number | null>(null);
  const timerRemainingRef = useRef<number>(turnTimerSeconds);
  const landingTimer = useRef<number | null>(null);
  const rentFlightSequence = useRef(0);
  const motionLevel = resolveMotionLevel(preferences.animation, reducedMotion === true);
  const motionDisabled = motionLevel !== "full" || !pageVisible;
  const cameraFollow = motionLevel === "full" && pageVisible;
  const stateRef = useRef(state);
  stateRef.current = state;
  const availableActions = state ? getAvailableActions(state) : [];
  const can = (type: GameAction["type"]) =>
    availableActions.some((action) => action.type === type);
  const canManage = Boolean(
    state &&
    (state.phase === "roll" || state.phase === "endTurn") &&
    !state.players[state.currentPlayerIndex]?.isBot,
  );
  useDialogFocus(menuDialogRef, menuOpen);
  useDialogFocus(tileDialogRef, Boolean(selectedTileId));

  const positionsKey = useMemo(
    () => state?.players.map((player) => `${player.id}:${player.position}`).join("|") ?? "",
    [state?.players],
  );
  const eventsKey = state?.eventLog.at(-1)?.id ?? 0;
  const triggerRentFlight = useCallback(async (payerId: string, ownerId: string) => {
    const payer = document.getElementById(`player-panel-${payerId}`)?.getBoundingClientRect();
    const owner = document.getElementById(`player-panel-${ownerId}`)?.getBoundingClientRect();
    if (motionDisabled || !payer || !owner) {
      playSound("coin");
      return;
    }
    const id = ++rentFlightSequence.current;
    const startX = payer.left + payer.width / 2;
    const startY = payer.top + payer.height / 2;
    setRentFlight({
      id,
      startX,
      startY,
      deltaX: owner.left + owner.width / 2 - startX,
      deltaY: owner.top + owner.height / 2 - startY,
    });
    await wait(MOTION_MS.rentSoundOffset);
    playSound("coin");
    await wait(MOTION_MS.rentFlight - MOTION_MS.rentSoundOffset);
    setRentFlight((current) => current?.id === id ? null : current);
  }, [motionDisabled]);

  useEffect(() => () => {
    if (landingTimer.current !== null) window.clearTimeout(landingTimer.current);
  }, []);

  useEffect(() => {
    if (!state) return;
    const nextPositions = Object.fromEntries(
      state.players.map((player) => [player.id, player.position]),
    );
    const oldPositions = previousPositions.current;
    const newEvents = state.eventLog.filter(
      (event) => event.id > previousEventId.current,
    );
    const initialized = Object.keys(oldPositions).length > 0;
    const movedPlayers = initialized
      ? state.players.filter(
          (player) => oldPositions[player.id] !== player.position,
        )
      : [];
    previousEventId.current = state.eventLog.at(-1)?.id ?? previousEventId.current;
    previousPositions.current = nextPositions;
    setVisualPositions((current) => {
      const updated = { ...current };
      for (const [playerId, position] of Object.entries(nextPositions)) {
        if (updated[playerId] === undefined) updated[playerId] = position;
      }
      return updated;
    });

    const jobs: (() => Promise<void>)[] = [];
    if (movedPlayers.length > 0) {
      jobs.push(async () => {
        const rollMovement = newEvents.some(
          (event) => event.type === "ROLL_DICE" || event.type === "RESOLVE_CARD",
        );
        for (const player of movedPlayers) {
          const from = oldPositions[player.id];
          const path = tilePath(from, player.position);
          const sentToJail = newEvents.some((event) => event.type === "JAIL_ENTERED" && event.playerId === player.id);
          const shouldHop =
            !motionDisabled &&
            rollMovement &&
            !sentToJail &&
            path.length > 0 &&
            path.length <= 12;

          if (shouldHop) {
            for (const position of path) {
              setVisualPositions((current) => ({ ...current, [player.id]: position }));
              await wait(MOTION_MS.tokenSoundOffset);
              playSound("tokenStep");
              await wait(Math.max(0, MOTION_MS.tokenStep - MOTION_MS.tokenSoundOffset));
            }
          } else {
            setVisualPositions((current) => ({
              ...current,
              [player.id]: player.position,
            }));
            await wait(motionDisabled ? 0 : MOTION_MS.tokenMove);
          }
          if (!motionDisabled) {
            setLandedTileIndex(player.position);
            if (landingTimer.current !== null) window.clearTimeout(landingTimer.current);
            landingTimer.current = window.setTimeout(
              () => setLandedTileIndex(null),
              MOTION_MS.landing,
            );
          }
        }
        if (newEvents.some((event) => event.type === "SALARY_COLLECTED")) {
          setGoFlash(true);
          await wait(motionDisabled ? 0 : MOTION_MS.soundBeat);
          playSound("coin");
          await wait(motionDisabled ? 0 : MOTION_MS.salary - MOTION_MS.soundBeat);
          setGoFlash(false);
        }
      });
    }

    const notify = async (message: string, tone: string) => {
      const id = ++toastSequence.current;
      setToast({ id, text: message, tone });
      await wait(motionLevel === "off" ? 0 : motionDisabled ? 120 : MOTION_MS.toast);
      setToast((current) => (current?.id === id ? null : current));
    };

    for (const event of newEvents) {
      const eventJob = createEventJob(
        event,
        state,
        motionDisabled,
        notify,
        t,
        language,
        triggerRentFlight,
      );
      if (eventJob) jobs.push(eventJob);
    }

    if (jobs.length > 0) {
      queue.current.enqueue(...jobs);
      if (!queue.current.isRunning) {
        setIsAnimating(true);
        void queue.current.drain().finally(() => setIsAnimating(false));
      }
    }
  }, [eventsKey, language, motionDisabled, motionLevel, positionsKey, t, triggerRentFlight]);

  const onAction = useCallback(
    (action: GameAction, _sound?: SoundId) => {
      playSound("click");
      if (_sound && !EVENT_SYNCED_SOUND_ACTIONS.has(action.type)) playSound(_sound);
      if (
        action.type === "PROPOSE_TRADE" ||
        action.type === "COUNTER_TRADE" ||
        action.type === "ACCEPT_TRADE" ||
        action.type === "REJECT_TRADE"
      ) {
        setTradeOpen(false);
      }
      dispatch(action);
    },
    [dispatch],
  );

  const timerActor = state
    ? state.phase === "auction" ? state.auction?.activePlayerId : state.players[state.currentPlayerIndex]?.id
    : undefined;
  const timerIdentity = state
    ? `${state.turnNumber}:${state.phase}:${timerActor ?? ""}`
    : "";
  const timerShouldRun = Boolean(
    turnTimerSeconds > 0 &&
    !isAnimating &&
    !menuOpen &&
    !settingsOpen &&
    !paused &&
    !managementOpen &&
    !tradeOpen &&
    !thinkingId &&
    state &&
    state.phase !== "gameOver" &&
    !state.players.find((player) => player.id === timerActor)?.isBot,
  );
  useEffect(() => {
    timedOutKey.current = "";
    timerRemainingRef.current = turnTimerSeconds;
    timerDeadline.current = null;
    setTimerRemaining(turnTimerSeconds);
  }, [state?.turnNumber, state?.phase, timerActor, turnTimerSeconds]);
  useEffect(() => {
    if (!timerShouldRun) {
      timerDeadline.current = null;
      return;
    }
    const deadline = Date.now() + timerRemainingRef.current * 1000;
    timerDeadline.current = deadline;
    const updateRemaining = () => {
      const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      timerRemainingRef.current = remaining;
      setTimerRemaining(remaining);
    };
    updateRemaining();
    const timer = window.setInterval(updateRemaining, 250);
    document.addEventListener("visibilitychange", updateRemaining);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", updateRemaining);
      timerRemainingRef.current = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      timerDeadline.current = null;
    };
  }, [timerIdentity, timerShouldRun]);
  useEffect(() => {
    if (
      timerRemaining !== 0 ||
      turnTimerSeconds <= 0 ||
      isAnimating ||
      menuOpen ||
      settingsOpen ||
      paused ||
      managementOpen ||
      tradeOpen ||
      thinkingId ||
      !state ||
      state.players.find((player) => player.id === timerActor)?.isBot
    ) return;
    const key = `${state.turnNumber}:${state.phase}:${timerActor ?? ""}`;
    if (timedOutKey.current === key) return;
    timedOutKey.current = key;
    const actions = getTimeoutActions(state);
    if (!actions.length) {
      timerRemainingRef.current = turnTimerSeconds;
      timerDeadline.current = null;
      setTimerRemaining(turnTimerSeconds);
      return;
    }
    setAnnouncement(t("navigation.timerExpired"));
    for (const action of actions) dispatch(action);
  }, [dispatch, isAnimating, managementOpen, menuOpen, paused, settingsOpen, state, thinkingId, timerActor, timerRemaining, t, tradeOpen, turnTimerSeconds]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (settingsOpen) setSettingsOpen(false);
        else if (managementOpen) setManagementOpen(false);
        else if (tradeOpen || menuOpen) { setTradeOpen(false); setMenuOpen(false); }
        else if (selectedTileId) setSelectedTileId(null);
        else if (stateRef.current?.phase === "trade") onAction({ type: "REJECT_TRADE" });
        else if (stateRef.current?.phase === "auction") onAction({ type: "AUCTION_PASS" });
        else if (stateRef.current?.phase === "purchase") onAction({ type: "DECLINE_PURCHASE" });
        else if (stateRef.current?.phase === "card") onAction({ type: "RESOLVE_CARD" });
        else setMenuOpen(true);
        return;
      }
      if (!preferences.keyboardShortcuts || event.altKey || event.ctrlKey || event.metaKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input,select,textarea,[contenteditable=true]")) return;
      const key = event.key.toLowerCase();
      if (key === "r" && can("ROLL_DICE") && !isAnimating) onAction({ type: "ROLL_DICE" }, "diceRoll");
      if (key === "b" && can("BUY_PROPERTY") && !isAnimating) onAction({ type: "BUY_PROPERTY" }, "buy");
      if (key === "e" && can("END_TURN") && !isAnimating) onAction({ type: "END_TURN" });
      if (key === "m" && canManage) setManagementOpen(true);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [can, canManage, isAnimating, managementOpen, menuOpen, onAction, preferences.keyboardShortcuts, tradeOpen]);

  useEffect(() => {
    if (!state || state.phase === "gameOver") return;
    const onPopState = () => {
      if (!window.confirm(t("navigation.confirmLeave"))) navigate(1);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [navigate, state, t]);
  const botActor = state ? getBotActor(state) : null;
  useBotTurn({
    state,
    actorId: botActor?.id ?? null,
    isAnimating: isAnimating || paused || menuOpen || settingsOpen,
    botSpeed,
    dispatch,
    onThinking: setThinkingId,
  });

  const toggleMute = () => {
    setMuted(!audioPreferences.muted);
    setAudioPreferences(getAudioPreferences());
  };
  const toggleMusic = () => {
    setMusicEnabled(!audioPreferences.musicEnabled);
    setAudioPreferences(getAudioPreferences());
  };
  const changeVolume = (volume: number) => {
    setVolume(volume);
    setAudioPreferences(getAudioPreferences());
  };

  if (!state) return null;

  const actingPlayerId = state.phase === "auction" ? state.auction?.activePlayerId : undefined;
  const currentPlayer =
    state.players.find((player) => player.id === actingPlayerId) ??
    state.players[state.currentPlayerIndex];
  const jailReleased = state.eventLog
    .slice(-5)
    .some((event) => event.type === "JAIL_RELEASED");
  const selectedTile =
    state.theme.tiles.find((tile) => tile.id === selectedTileId) ?? null;
  const tileIndex = selectedTile
    ? state.theme.tiles.findIndex((tile) => tile.id === selectedTile.id)
    : -1;
  const controlCard = (
    <motion.section
      className="control-card board-control-card"
      animate={motionDisabled ? undefined : { opacity: [0.98, 1] }}
      transition={{ duration: MOTION_MS.controlPulse / 1000, repeat: Infinity, repeatType: "reverse" }}
    >
      <div className="turn-title">
        <span className="turn-token">
          {currentPlayer
            ? TOKEN_DESIGNS[state.players.indexOf(currentPlayer) % TOKEN_DESIGNS.length]
            : "🎩"}
        </span>
        <div>
          <span className="eyebrow">{t("game.currentTurn")}</span>
          <h2>{currentPlayer?.name}</h2>
        </div>
      </div>
      <Dice
        result={state.dice}
        rolling={state.eventLog.at(-1)?.type === "ROLL_DICE"}
        reducedMotion={motionDisabled}
        canRoll={can("ROLL_DICE") && !isAnimating && !botActor && !paused && !menuOpen && !settingsOpen && !managementOpen && !tradeOpen}
        rollLabel={state.phase === "jail" ? t("game.rollForDoubles") : state.dice?.isDouble ? t("game.rollAgain") : t("game.rollDice")}
        onRoll={() => onAction({ type: "ROLL_DICE" }, "diceRoll")}
      />
      <p className="phase-label" aria-live="polite">
        {state.phase === "roll" && state.dice?.isDouble
          ? t("game.doublesAgain")
          : phaseMessage(state.phase, t)}
      </p>
      {canManage ? (
        <div className="phase5-actions">
          <button className="secondary-button" onClick={() => setManagementOpen(true)}>
            {t("game.manageProperties")}
          </button>
          <button className="secondary-button" onClick={() => setTradeOpen(true)}>
            {t("game.proposeTrade")}
          </button>
        </div>
      ) : null}
      {state.phase === "jail" ? (
        <div className="action-row">
          <button className="secondary-button" disabled={isAnimating || !can("PAY_JAIL_FINE")} onClick={() => onAction({ type: "PAY_JAIL_FINE" }, "coin")}>
            {t("game.payFine")}
          </button>
          {can("USE_JAIL_CARD") ? (
            <button className="secondary-button" disabled={isAnimating} onClick={() => onAction({ type: "USE_JAIL_CARD" }, "jailDoor")}>
              {t("game.useCard")}
            </button>
          ) : null}
        </div>
      ) : null}
      {state.phase === "debt" ? (
        <p className="debt-note" role="status">
          {t("game.debtNote")}
        </p>
      ) : null}
      {state.phase === "endTurn" ? (
        <button className="primary-button" disabled={isAnimating || !can("END_TURN")} onClick={() => onAction({ type: "END_TURN" })}>
          {t("game.endTurn")} <span aria-hidden="true">→</span>
        </button>
      ) : null}
      {state.phase === "roll" && state.consecutiveDoubles > 0 ? (
        <p className="doubles-banner">⚡ {t("game.doublesBanner")}</p>
      ) : null}
    </motion.section>
  );

  return (
    <main
      className="game-shell"
      style={{
        "--theme-primary": state.theme.palette.primary,
        "--theme-secondary": state.theme.palette.secondary,
        "--theme-accent": state.theme.palette.accent,
        "--theme-background": state.theme.palette.background,
        "--theme-surface": state.theme.palette.surface,
        "--theme-text": state.theme.palette.text,
      } as React.CSSProperties}
    >
      <header className="game-header">
        <div>
          <p className="eyebrow">{t("game.tagline")}</p>
          <h1>Business Tycoon</h1>
        </div>
        <div className="header-chip">
          <span className="online-dot" />
          {localizedName(state.theme, language)} · {t("game.turn")} {state.turnNumber}
        </div>
        <div className="game-header-actions">
        <button className="secondary-button game-menu-button" onClick={() => setMenuOpen(true)} aria-label={t("navigation.pause")}>☰</button>
        <LanguageSwitcher />
        <div className="audio-controls" aria-label={t("game.soundSettings")}>
          <button className="audio-toggle" onClick={toggleMute} aria-label={audioPreferences.muted ? t("game.unmute") : t("game.mute")}>
            {audioPreferences.muted ? "🔇" : "🔊"}
          </button>
          <label className="volume-control">
            <span className="sr-only">{t("game.soundVolume")}</span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={audioPreferences.volume}
              onChange={(event) => changeVolume(Number(event.target.value))}
            />
          </label>
          <button className={`audio-toggle ${audioPreferences.musicEnabled ? "music-active" : ""}`} onClick={toggleMusic} aria-label={audioPreferences.musicEnabled ? t("game.musicOff") : t("game.musicOn")}>
            ♫
          </button>
        </div>
        </div>
      </header>

      <div className="game-layout">
        <section className="board-column" aria-label={t("game.board")}>
          <Profiler id="board" onRender={countDevRender}>
            <Board
              state={state}
              visualPositions={visualPositions}
              goFlash={goFlash}
              selectedTileId={selectedTileId}
              onSelectTile={setSelectedTileId}
              motionDisabled={motionDisabled}
              jailReleased={jailReleased}
              centerContent={controlCard}
              landedTileIndex={landedTileIndex}
              idleActiveToken={!isAnimating && cameraFollow}
              cameraFollow={cameraFollow}
            />
          </Profiler>
        </section>

        <aside className="game-sidebar">
          <Profiler id="player-panels" onRender={countDevRender}>
          <section className="player-list" aria-label={t("game.players")}>
            {state.players.map((player, index) => (
              <PlayerPanel
                key={player.id}
                id={`player-panel-${player.id}`}
                player={player}
                index={index}
                active={player.id === currentPlayer?.id}
                currency={state.theme.currency}
                manageable={
                  canManage &&
                  player.id === state.players[state.currentPlayerIndex]?.id
                }
                thinking={player.id === thinkingId}
                timer={player.id === currentPlayer?.id && turnTimerSeconds > 0 && !player.isBot
                  ? { remaining: timerRemaining, total: turnTimerSeconds }
                  : undefined}
                onManage={() => setManagementOpen(true)}
              />
            ))}
          </section>
          </Profiler>

          <section className="event-card" aria-label={t("game.activity")}>
            <div className="section-heading">
              <div>
                <span className="eyebrow">{t("game.aroundBoard")}</span>
                <h2>{t("game.activity")}</h2>
              </div>
              <span className="live-tag">{t("game.live")}</span>
            </div>
            <ol className="event-log" aria-live="polite">
              {state.eventLog
                .filter((event) => event.type !== "BUY_PROPERTY")
                .slice(-7)
                .reverse()
                .map((event) => (
                <li key={event.id}>
                  <span className="event-dot" />
                  <span>{describeEvent(event, state, t, language)}</span>
                </li>
                ))}
            </ol>
          </section>
        </aside>
      </div>

      <GameplayModals state={state} busy={isAnimating || Boolean(botActor)} onAction={onAction} />
      {rentFlight ? (
        <div className="rent-flight-layer" aria-hidden="true">
          <motion.span
            key={rentFlight.id}
            className="rent-coin-flight"
            style={{ left: rentFlight.startX, top: rentFlight.startY }}
            initial={{ opacity: 0, scale: 0.55 }}
            animate={{
              opacity: [0, 1, 1, 0],
              scale: [0.55, 1.15, 1, 0.65],
              x: rentFlight.deltaX,
              y: rentFlight.deltaY,
            }}
            transition={{ duration: MOTION_MS.rentFlight / 1000, ease: [...MOTION_EASE.standard] }}
          >
            🪙
          </motion.span>
        </div>
      ) : null}
      {managementOpen && canManage && currentPlayer ? (
        <PropertyManagement
          state={state}
          player={currentPlayer}
          onAction={onAction}
          onClose={() => setManagementOpen(false)}
        />
      ) : null}
      <TradeModal
        state={state}
        open={tradeOpen}
        busy={isAnimating || Boolean(botActor)}
        onAction={onAction}
        onClose={() => setTradeOpen(false)}
      />
      {toast ? (
        <motion.div
          key={toast.id}
          className={`game-toast toast-${toast.tone}`}
          role="status"
          initial={motionDisabled ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={motionDisabled ? undefined : { opacity: 0, y: -8 }}
          transition={{ duration: motionDisabled ? 0 : MOTION_MS.toast / 1000 }}
        >
          {toast.text}
        </motion.div>
      ) : null}
      <p className="sr-only" aria-live="assertive" aria-atomic="true">{announcement || (state.eventLog.at(-1) ? describeEvent(state.eventLog.at(-1)!, state, t, language) : "")}</p>
      {menuOpen ? (
        <div className="popover-scrim" onMouseDown={(event) => { if (event.target === event.currentTarget) setMenuOpen(false); }}>
          <section ref={menuDialogRef} tabIndex={-1} className="tile-popover game-menu-dialog" role="dialog" aria-modal="true" aria-labelledby="game-menu-title">
            <button className="popover-close" aria-label={t("common.close")} onClick={() => setMenuOpen(false)}>×</button>
            <h2 id="game-menu-title">{t("navigation.pause")}</h2>
            <button className="primary-button" onClick={() => setMenuOpen(false)}>{t("navigation.resume")}</button>
            <button className="secondary-button" onClick={() => { setMenuOpen(false); setSettingsOpen(true); }}>{t("navigation.settings")}</button>
            <button className="secondary-button" onClick={() => navigate("/how-to-play")}>{t("navigation.howToPlay")}</button>
            <button className="secondary-button" onClick={() => {
              setMenuOpen(false);
              navigate("/");
            }}>{t("navigation.saveQuit")}</button>
            <button className="secondary-button" onClick={() => {
              if (!window.confirm(t("navigation.confirmRestart"))) return;
              const seed = Math.floor(Date.now() % 2_000_000_000);
              const setup = savedSetup;
              const players = setup?.players ?? state.players.map((player) => ({
                id: player.id, name: player.name, isBot: player.isBot,
                botDifficulty: player.botDifficulty, token: player.token, color: player.color,
              }));
              const options = { ...state.settings, seed };
              startGame(createGame(state.theme, players, options), {
                themeId: state.theme.id, players, options,
                turnTimerSeconds,
              });
              setMenuOpen(false);
            }}>{t("navigation.restart")}</button>
            <button className="secondary-button" onClick={() => {
              if (!window.confirm(t("navigation.confirmResign"))) return;
              onAction({ type: "RESIGN" });
              setMenuOpen(false);
            }}>{t("navigation.resign")}</button>
          </section>
        </div>
      ) : null}

      {selectedTile ? (
        <div className="popover-scrim" onClick={() => setSelectedTileId(null)}>
          <section
            ref={tileDialogRef}
            tabIndex={-1}
            className="tile-popover"
            role="dialog"
            aria-modal="true"
            aria-labelledby="tile-detail-title"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              className="popover-close"
              onClick={() => setSelectedTileId(null)}
              aria-label={t("game.closeTileDetails")}
            >
              ×
            </button>
            <span className="eyebrow">{t("game.boardSpace", { number: tileIndex + 1 })}</span>
            <h2 id="tile-detail-title">
              {"icon" in selectedTile ? `${selectedTile.icon} ` : ""}
              {localizedName(selectedTile, language)}
            </h2>
            {"price" in selectedTile ? (
              <p className="popover-price">
                {formatCurrency(selectedTile.price, state.theme.currency, language)}
              </p>
            ) : null}
            {selectedTile.type === "property" ? (
              <dl className="rent-table">
                <div><dt>{t("game.baseRent")}</dt><dd>{formatCurrency(selectedTile.rent.base, state.theme.currency, language)}</dd></div>
                <div><dt>{t("game.fullColorSet")}</dt><dd>{formatCurrency(selectedTile.rent.colorSetDouble, state.theme.currency, language)}</dd></div>
                {selectedTile.rent.houses.map((rent, index) => (
                  <div key={index}><dt>{index + 1} {index === 0 ? t("game.house") : t("game.houses")}</dt><dd>{formatCurrency(rent, state.theme.currency, language)}</dd></div>
                ))}
                <div><dt>{t("game.hotel")}</dt><dd>{formatCurrency(selectedTile.rent.hotel, state.theme.currency, language)}</dd></div>
              </dl>
            ) : selectedTile.type === "transport" ? (
              <dl className="rent-table">
                {selectedTile.rentByCount.map((rent, index) => (
                  <div key={index}><dt>{index + 1} {index === 0 ? t("game.transportAsset") : t("game.transportAssets")}</dt><dd>{formatCurrency(rent, state.theme.currency, language)}</dd></div>
                ))}
              </dl>
            ) : selectedTile.type === "utility" ? (
              <dl className="rent-table">
                <div><dt>{t("game.oneUtility")}</dt><dd>{selectedTile.diceMultipliers[0]}× dice</dd></div>
                <div><dt>{t("game.bothUtilities")}</dt><dd>{selectedTile.diceMultipliers[1]}× dice</dd></div>
              </dl>
            ) : null}
            {"businessFact" in selectedTile ? (
              <p className="business-fact">{localizedFact(selectedTile, language)}</p>
            ) : null}
          </section>
        </div>
      ) : null}

      {settingsOpen ? (
        <Suspense fallback={<div className="settings-modal-scrim" role="status">{t("common.loading")}</div>}>
          <LazySettingsScreen modal onClose={() => setSettingsOpen(false)} />
        </Suspense>
      ) : null}
    </main>
  );
}

function useBotTurn({
  state,
  actorId,
  isAnimating,
  botSpeed,
  dispatch,
  onThinking,
}: {
  state: GameState | null;
  actorId: string | null;
  isAnimating: boolean;
  botSpeed: BotSpeed;
  dispatch: (action: GameAction) => void;
  onThinking: (playerId: string | null) => void;
}) {
  const eventsKey = state?.eventLog.at(-1)?.id ?? 0;
  const delay = botSpeed === "instant" ? 0 : botSpeed === "fast" ? 180 : 850;
  useEffect(() => {
    if (!state || !actorId || isAnimating) {
      onThinking(null);
      return;
    }
    const actor = state.players.find((player) => player.id === actorId);
    if (!actor) return;
    onThinking(actor.id);
    const timer = setTimeout(() => {
      const seed = state.rngState ^ (state.nextEventId * 0x45d9f3b) ^ state.turnNumber;
      const action = chooseBotAction(
        state,
        actor.id,
        actor.botDifficulty,
        createBotRandom(seed),
      );
      if (!action) {
        onThinking(null);
        return;
      }
      if (!isBotActionLegal(state, action)) {
        throw new Error(`Bot ${actor.name} selected an illegal action: ${JSON.stringify(action)}`);
      }
      playSound("click");
      dispatch(action);
    }, delay);
    return () => clearTimeout(timer);
  }, [actorId, delay, dispatch, eventsKey, isAnimating, onThinking, state]);
}

function phaseMessage(phase: string, t: TFunction) {
  switch (phase) {
    case "purchase": return t("game.phasePurchase");
    case "auction": return t("game.phaseAuction");
    case "jail": return t("game.phaseJail");
    case "card": return t("game.phaseCard");
    case "endTurn": return t("game.phaseEndTurn");
    case "debt": return t("game.phaseDebt");
    case "gameOver": return t("game.phaseGameOver");
    default: return t("game.phaseRoll");
  }
}

function formatCurrency(
  amount: number,
  currency: GameState["theme"]["currency"],
  language: string,
) {
  return formatMoney(amount, currency, language);
}

function describeEvent(
  event: GameEvent,
  state: GameState,
  t: TFunction,
  language: string,
) {
  const playerName = state.players.find((player) => player.id === event.playerId)?.name ?? t("log.table");
  const tileId = String(event.details.tileId ?? "");
  const tile = state.theme.tiles.find((candidate) => candidate.id === tileId);
  const asset = tile ? localizedName(tile, language) : t("trade.noPropertiesOffered");
  if (event.type === "GAME_STARTED") return t("log.ready");
  if (event.type === "ROLL_DICE") {
    const player = state.players.find((candidate) => candidate.id === event.playerId);
    const tile = state.theme.tiles[player?.position ?? 0];
    return t("log.rolled", {
      player: playerName,
      first: event.details.first ?? "?",
      second: event.details.second ?? "?",
      tile: tile ? localizedName(tile, language) : "",
    });
  }
  if (event.type === "PROPERTY_BOUGHT") return t("log.bought", { player: playerName, asset });
  if (event.type === "AUCTION_WON") return t("log.auctionWon", { player: playerName, asset });
  if (event.type === "RENT_PAID") {
    const owner = state.players.find((player) => player.id === event.details.creditorId);
    return t("log.rentPaid", {
      player: playerName,
      amount: formatCurrency(Number(event.details.amount), state.theme.currency, language),
      owner: owner?.name ?? t("log.table"),
    });
  }
  if (event.type === "END_TURN") return t("log.endedTurn", { player: playerName });
  if (event.type === "CARD_DRAWN") {
    const cardId = String(event.details.cardId ?? "");
    const card = [...state.theme.cards.chance, ...state.theme.cards.communityChest]
      .find((candidate) => candidate.id === cardId);
    if (card) return localizedCardText(card, language);
    return String(event.details.text ?? t("log.cardDrawn"));
  }
  if (event.type === "JAIL_ENTERED") return t("log.jailed", { player: playerName });
  if (event.type === "SPEEDING") return t("log.speeding", { player: playerName });
  if (event.type === "ACTION_UNDONE") return t("log.undone");
  const eventLabel = t(`event.${event.type}`, {
    defaultValue: event.type.toLowerCase().replaceAll("_", " "),
  });
  return t("log.generic", { player: playerName, event: eventLabel });
}

function wait(duration: number): Promise<void> {
  if (duration <= 0 || (typeof document !== "undefined" && document.visibilityState === "hidden")) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const finish = () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      resolve();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") finish();
    };
    const timer = window.setTimeout(finish, duration);
    document.addEventListener("visibilitychange", onVisibilityChange);
  });
}

function createEventJob(
  event: GameEvent,
  state: GameState,
  reducedMotion: boolean,
  notify: (message: string, tone: string) => Promise<void>,
  t: TFunction,
  language: string,
  onRentFlight: (payerId: string, ownerId: string) => Promise<void>,
): (() => Promise<void>) | null {
  const playerName =
    state.players.find((player) => player.id === event.playerId)?.name ??
    t("log.table");
  const tileId = String(event.details.tileId ?? "");
  const tile = state.theme.tiles.find((candidate) => candidate.id === tileId);
  const asset = tile ? localizedName(tile, language) : t("trade.noPropertiesOffered");
  const taxName = tile
    ? localizedName(tile, language)
    : String(event.details.name ?? t("modal.tax"));
  const amount = formatCurrency(Number(event.details.amount), state.theme.currency, language);
  switch (event.type) {
    case "PROPERTY_BOUGHT":
      return async () => {
        if (!reducedMotion) await wait(MOTION_MS.soundBeat);
        playSound("buy");
        await notify(t("toast.bought", { player: playerName, asset }), "success");
      };
    case "AUCTION_WON":
      return async () => {
        if (!reducedMotion) await wait(MOTION_MS.soundBeat);
        playSound("buy");
        await notify(t("toast.auctionWon", { player: playerName, asset, amount }), "success");
      };
    case "RENT_PAID": {
      const ownerName =
        state.players.find((player) => player.id === event.details.creditorId)?.name ??
        "the owner";
      return async () => {
        await onRentFlight(event.playerId ?? "", String(event.details.creditorId ?? ""));
        await notify(t("toast.rentPaid", { player: playerName, amount, owner: ownerName }), "rent");
      };
    }
    case "TAX_DUE":
      return async () => {
        await notify(t("toast.taxDue", { player: playerName, amount, tax: taxName }), "tax");
      };
    case "PAYMENT_DUE":
      return async () => {
        await notify(t("toast.paymentDue", { player: playerName, amount }), "warning");
      };
    case "PAYMENT_MADE":
      return async () => {
        if (!reducedMotion) await wait(MOTION_MS.soundBeat);
        playSound("coin");
        if (String(event.details.reason).includes("tax")) {
          await notify(t("toast.paidBank", { player: playerName, amount }), "tax");
        } else if (String(event.details.reason).startsWith("chance-") || String(event.details.reason).startsWith("chest-")) {
          await notify(t("toast.paid", { player: playerName, amount }), "tax");
        }
      };
    case "SALARY_COLLECTED":
      return async () => {
        if (!reducedMotion) await wait(MOTION_MS.soundBeat);
      };
    case "CARD_DRAWN":
      return async () => {
        if (!reducedMotion) await wait(MOTION_MS.soundBeat);
        playSound("cardFlip");
        if (!reducedMotion) await wait(MOTION_MS.card - MOTION_MS.soundBeat);
      };
    case "JAIL_ENTERED":
      return async () => {
        if (!reducedMotion) await wait(MOTION_MS.soundBeat);
        playSound("jailDoor");
        await notify(t("toast.sentJail", { player: playerName }), "warning");
      };
    case "SPEEDING":
      return async () => {
        if (!reducedMotion) await wait(MOTION_MS.soundBeat);
        playSound("jailDoor");
        await notify(t("toast.speeding"), "warning");
      };
    case "JAIL_RELEASED":
      return async () => {
        if (!reducedMotion) await wait(MOTION_MS.soundBeat);
        playSound("jailDoor");
        await notify(t("toast.released", { player: playerName }), "success");
      };
    case "BANKRUPTCY":
      return async () => {
        if (!reducedMotion) await wait(MOTION_MS.soundBeat);
        playSound("bankruptcy");
        if (state.phase === "gameOver" && state.winnerId) {
          playSound("win");
          const winner = state.players.find((player) => player.id === state.winnerId);
          await notify(t("toast.bankruptWinner", { player: playerName, winner: winner?.name ?? t("toast.rival") }), "warning");
        } else {
          const propertyList = String(event.details.properties ?? "")
            .split(",")
            .filter(Boolean);
          await notify(t("toast.bankruptAssets", {
            player: playerName,
            count: propertyList.length,
            transfer: t(event.details.creditorId ? "toast.toCreditor" : "toast.toAuction"),
          }), "warning");
        }
      };
    case "TRADE_ACCEPTED":
      return async () => {
        if (!reducedMotion) await wait(MOTION_MS.soundBeat);
        playSound("coin");
        const partner = state.players.find((player) => player.id === event.details.partnerId)?.name ?? t("trade.partner");
        await notify(t("toast.tradeComplete", { player: playerName, partner }), "success");
      };
    case "TRADE_REJECTED":
      return async () => {
        await notify(t("toast.tradeDeclined", { player: playerName }), "warning");
      };
    case "BUILD_HOUSE":
    case "BUILD_HOTEL":
      return async () => {
        if (!reducedMotion) await wait(MOTION_MS.soundBeat);
        playSound("build");
        await notify(t("toast.upgraded", { player: playerName, asset }), "success");
      };
    case "SELL_BUILDING":
      return async () => {
        if (!reducedMotion) await wait(MOTION_MS.soundBeat);
        playSound("build");
        await notify(t("toast.soldBuilding", { player: playerName, asset }), "tax");
      };
    case "MORTGAGE":
    case "UNMORTGAGE":
      return async () => {
        if (!reducedMotion) await wait(MOTION_MS.soundBeat);
        playSound("coin");
      };
    default:
      return null;
  }
}
