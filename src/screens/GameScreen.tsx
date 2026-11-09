import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import type { GameAction, GameEvent, GameState } from "../engine/types";
import { getAvailableActions } from "../engine/gameReducer";
import { getAudioPreferences, playSound, setMuted, setMusicEnabled, setVolume } from "../audio/soundManager";
import type { SoundId } from "../audio/soundRegistry";
import { Board } from "../components/Board";
import { Dice } from "../components/Dice";
import { GameplayModals } from "../components/GameplayModals";
import { PlayerPanel } from "../components/PlayerPanel";
import { tilePath } from "../components/boardLayout";
import { AnimationQueue } from "../components/animationQueue";
import { useGameStore } from "../store/gameStore";

const TOKEN_DESIGNS = ["🚗", "🎩", "🚢", "🐕", "🚀", "🦊"];

export function GameScreen() {
  const state = useGameStore((store) => store.state);
  const dispatch = useGameStore((store) => store.dispatch);
  const reducedMotion = useReducedMotion();
  const [selectedTileId, setSelectedTileId] = useState<string | null>(null);
  const [visualPositions, setVisualPositions] = useState<Record<string, number>>(
    {},
  );
  const [goFlash, setGoFlash] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const [toast, setToast] = useState<{ id: number; text: string; tone: string } | null>(null);
  const [audioPreferences, setAudioPreferences] = useState(getAudioPreferences);
  const previousPositions = useRef<Record<string, number>>({});
  const previousEventId = useRef(0);
  const queue = useRef(new AnimationQueue());
  const toastSequence = useRef(0);
  const motionDisabled = reducedMotion ?? false;

  const positionsKey = useMemo(
    () => state?.players.map((player) => `${player.id}:${player.position}`).join("|") ?? "",
    [state?.players],
  );
  const eventsKey = state?.eventLog.at(-1)?.id ?? 0;

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
              playSound("tokenStep");
              await wait(motionDisabled ? 0 : 135);
            }
          } else {
            setVisualPositions((current) => ({
              ...current,
              [player.id]: player.position,
            }));
            await wait(motionDisabled ? 80 : 380);
          }
        }
        if (newEvents.some((event) => event.type === "SALARY_COLLECTED")) {
          setGoFlash(true);
          playSound("coin");
          await wait(motionDisabled ? 100 : 900);
          setGoFlash(false);
        }
      });
    }

    const notify = async (message: string, tone: string) => {
      const id = ++toastSequence.current;
      setToast({ id, text: message, tone });
      await wait(motionDisabled ? 120 : 820);
      setToast((current) => (current?.id === id ? null : current));
    };

    for (const event of newEvents) {
      const eventJob = createEventJob(
        event,
        state,
        motionDisabled,
        notify,
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
  }, [eventsKey, motionDisabled, positionsKey]);

  const onAction = useCallback(
    (action: GameAction, sound?: SoundId) => {
      playSound("click");
      if (sound) playSound(sound);
      dispatch(action);
    },
    [dispatch],
  );

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
  const availableActions = getAvailableActions(state);
  const can = (type: GameAction["type"]) =>
    availableActions.some((action) => action.type === type);
  const selectedTile =
    state.theme.tiles.find((tile) => tile.id === selectedTileId) ?? null;
  const tileIndex = selectedTile
    ? state.theme.tiles.findIndex((tile) => tile.id === selectedTile.id)
    : -1;

  return (
    <main className="game-shell">
      <header className="game-header">
        <div>
          <p className="eyebrow">A strategy game for big ideas</p>
          <h1>Business Tycoon</h1>
        </div>
        <div className="header-chip">
          <span className="online-dot" />
          {state.theme.name} · Turn {state.turnNumber}
        </div>
        <div className="audio-controls" aria-label="Sound settings">
          <button className="audio-toggle" onClick={toggleMute} aria-label={audioPreferences.muted ? "Unmute sound" : "Mute sound"}>
            {audioPreferences.muted ? "🔇" : "🔊"}
          </button>
          <label className="volume-control">
            <span className="sr-only">Sound volume</span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={audioPreferences.volume}
              onChange={(event) => changeVolume(Number(event.target.value))}
            />
          </label>
          <button className={`audio-toggle ${audioPreferences.musicEnabled ? "music-active" : ""}`} onClick={toggleMusic} aria-label={audioPreferences.musicEnabled ? "Turn music off" : "Turn music on"}>
            ♫
          </button>
        </div>
      </header>

      <div className="game-layout">
        <section className="board-column" aria-label="Game board">
          <Board
            state={state}
            visualPositions={visualPositions}
            goFlash={goFlash}
            selectedTileId={selectedTileId}
            onSelectTile={setSelectedTileId}
            motionDisabled={motionDisabled}
            jailReleased={jailReleased}
          />
        </section>

        <aside className="game-sidebar">
          <section className="player-list" aria-label="Players">
            {state.players.map((player, index) => (
              <PlayerPanel
                key={player.id}
                player={player}
                index={index}
                active={player.id === currentPlayer?.id}
                currency={state.theme.currency}
              />
            ))}
          </section>

          <motion.section
            className="control-card"
            animate={motionDisabled ? undefined : { opacity: [0.98, 1] }}
            transition={{ duration: 1.6, repeat: Infinity, repeatType: "reverse" }}
          >
            <div className="turn-title">
              <span className="turn-token">
                {currentPlayer
                  ? TOKEN_DESIGNS[state.players.indexOf(currentPlayer) % TOKEN_DESIGNS.length]
                  : "🎩"}
              </span>
              <div>
                <span className="eyebrow">Current turn</span>
                <h2>{currentPlayer?.name}</h2>
              </div>
            </div>
            <Dice result={state.dice} rolling={state.eventLog.at(-1)?.type === "ROLL_DICE"} reducedMotion={motionDisabled} />
            <p className="phase-label" aria-live="polite">
              {state.phase === "roll" && state.dice?.isDouble
                ? "Doubles — take another roll."
                : phaseMessage(state.phase)}
            </p>
            {state.phase === "roll" ? (
              <button
                className="primary-button"
                disabled={isAnimating || !can("ROLL_DICE")}
                onClick={() => onAction({ type: "ROLL_DICE" }, "diceRoll")}
                aria-label="Roll the dice"
              >
                {state.dice?.isDouble ? "Roll again! " : "Roll Dice "}
                <span aria-hidden="true">↗</span>
              </button>
            ) : null}
            {state.phase === "jail" ? (
              <div className="action-row">
                <button className="primary-button" disabled={isAnimating || !can("ROLL_DICE")} onClick={() => onAction({ type: "ROLL_DICE" }, "diceRoll")}>
                  Roll for doubles
                </button>
                <button className="secondary-button" disabled={isAnimating || !can("PAY_JAIL_FINE")} onClick={() => onAction({ type: "PAY_JAIL_FINE" }, "coin")}>
                  Pay fine
                </button>
                {can("USE_JAIL_CARD") ? (
                  <button className="secondary-button" disabled={isAnimating} onClick={() => onAction({ type: "USE_JAIL_CARD" }, "jailDoor")}>
                    Use card
                  </button>
                ) : null}
              </div>
            ) : null}
            {state.phase === "debt" ? (
              <p className="debt-note" role="status">
                Raise funds or settle the outstanding payment in the dialog.
              </p>
            ) : null}
            {state.phase === "endTurn" ? (
              <button className="primary-button" disabled={isAnimating || !can("END_TURN")} onClick={() => onAction({ type: "END_TURN" })}>
                End turn <span aria-hidden="true">→</span>
              </button>
            ) : null}
            {state.phase === "roll" && state.consecutiveDoubles > 0 ? (
              <p className="doubles-banner">⚡ Doubles — roll again!</p>
            ) : null}
          </motion.section>

          <section className="event-card" aria-label="Event log">
            <div className="section-heading">
              <div>
                <span className="eyebrow">Around the board</span>
                <h2>Activity</h2>
              </div>
              <span className="live-tag">LIVE</span>
            </div>
            <ol className="event-log" aria-live="polite">
              {state.eventLog
                .filter((event) => event.type !== "BUY_PROPERTY")
                .slice(-7)
                .reverse()
                .map((event) => (
                <li key={event.id}>
                  <span className="event-dot" />
                  <span>{describeEvent(event, state.players)}</span>
                </li>
                ))}
            </ol>
          </section>
        </aside>
      </div>

      <GameplayModals state={state} busy={isAnimating} onAction={onAction} />
      {toast ? (
        <motion.div
          key={toast.id}
          className={`game-toast toast-${toast.tone}`}
          role="status"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
        >
          {toast.text}
        </motion.div>
      ) : null}

      {selectedTile ? (
        <div className="popover-scrim" onClick={() => setSelectedTileId(null)}>
          <section
            className="tile-popover"
            role="dialog"
            aria-modal="true"
            aria-labelledby="tile-detail-title"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              className="popover-close"
              onClick={() => setSelectedTileId(null)}
              aria-label="Close tile details"
            >
              ×
            </button>
            <span className="eyebrow">Board space {tileIndex + 1}</span>
            <h2 id="tile-detail-title">
              {"icon" in selectedTile ? `${selectedTile.icon} ` : ""}
              {selectedTile.name}
            </h2>
            {"price" in selectedTile ? (
              <p className="popover-price">
                {formatCurrency(selectedTile.price, state.theme.currency)}
              </p>
            ) : null}
            {selectedTile.type === "property" ? (
              <dl className="rent-table">
                <div><dt>Base rent</dt><dd>{formatCurrency(selectedTile.rent.base, state.theme.currency)}</dd></div>
                <div><dt>Full color set</dt><dd>{formatCurrency(selectedTile.rent.colorSetDouble, state.theme.currency)}</dd></div>
                {selectedTile.rent.houses.map((rent, index) => (
                  <div key={index}><dt>{index + 1} {index === 0 ? "house" : "houses"}</dt><dd>{formatCurrency(rent, state.theme.currency)}</dd></div>
                ))}
                <div><dt>Hotel</dt><dd>{formatCurrency(selectedTile.rent.hotel, state.theme.currency)}</dd></div>
              </dl>
            ) : selectedTile.type === "transport" ? (
              <dl className="rent-table">
                {selectedTile.rentByCount.map((rent, index) => (
                  <div key={index}><dt>{index + 1} transport {index === 0 ? "asset" : "assets"}</dt><dd>{formatCurrency(rent, state.theme.currency)}</dd></div>
                ))}
              </dl>
            ) : selectedTile.type === "utility" ? (
              <dl className="rent-table">
                <div><dt>One utility</dt><dd>{selectedTile.diceMultipliers[0]}× dice</dd></div>
                <div><dt>Both utilities</dt><dd>{selectedTile.diceMultipliers[1]}× dice</dd></div>
              </dl>
            ) : null}
            {"businessFact" in selectedTile ? (
              <p className="business-fact">{selectedTile.businessFact}</p>
            ) : null}
          </section>
        </div>
      ) : null}
    </main>
  );
}

function phaseMessage(phase: string) {
  switch (phase) {
    case "purchase": return "Choose Buy or Auction in the property card.";
    case "auction": return "Make an offer or pass.";
    case "jail": return "Roll for a double to leave the Time-Out Office.";
    case "card": return "Review the card, then choose OK to resolve its effect.";
    case "endTurn": return "Your move is complete.";
    case "debt": return "Settle the outstanding payment.";
    case "gameOver": return "The game is over.";
    default: return "Roll the dice to make your move.";
  }
}

function formatCurrency(
  amount: number,
  currency: {
    symbol: string;
    format: "before" | "after";
    shortScale: { thousand: string; million: string; billion: string };
  },
) {
  const absolute = Math.abs(amount);
  const prefix = amount < 0 ? "−" : "";
  const compact =
    absolute >= 1_000_000_000
      ? `${(absolute / 1_000_000_000).toFixed(1)}${currency.shortScale.billion}`
      : absolute >= 1_000_000
        ? `${(absolute / 1_000_000).toFixed(1)}${currency.shortScale.million}`
        : absolute >= 10_000
          ? `${(absolute / 1_000).toFixed(0)}${currency.shortScale.thousand}`
          : absolute.toLocaleString("en-US");
  return currency.format === "before"
    ? `${prefix}${currency.symbol}${compact}`
    : `${prefix}${compact}${currency.symbol}`;
}

function describeEvent(
  event: GameEvent,
  players: { id: string; name: string }[],
) {
  const playerName = players.find((player) => player.id === event.playerId)?.name ?? "The table";
  if (event.type === "GAME_STARTED") return "The game is ready to play.";
  if (event.type === "ROLL_DICE") return `${playerName} rolled ${event.details.first ?? "?"} and ${event.details.second ?? "?"}.`;
  if (event.type === "PROPERTY_BOUGHT") return `${playerName} bought ${event.details.tileId ?? "an asset"}.`;
  if (event.type === "AUCTION_WON") return `${playerName} won the auction for ${event.details.tileId ?? "an asset"}.`;
  if (event.type === "RENT_PAID") return `${playerName} paid ${event.details.amount} in rent.`;
  if (event.type === "END_TURN") return `${playerName} ended their turn.`;
  if (event.type === "CARD_DRAWN") return String(event.details.text ?? "A card was drawn.");
  if (event.type === "JAIL_ENTERED") return `${playerName} was sent to the Time-Out Office.`;
  if (event.type === "SPEEDING") return `${playerName} rolled three doubles and is sent to the Time-Out Office.`;
  if (event.type === "ACTION_UNDONE") return "The last action was undone.";
  return `${playerName}: ${event.type.toLowerCase().replaceAll("_", " ")}.`;
}

function wait(duration: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, duration));
}

function createEventJob(
  event: GameEvent,
  state: GameState,
  reducedMotion: boolean,
  notify: (message: string, tone: string) => Promise<void>,
): (() => Promise<void>) | null {
  const playerName =
    state.players.find((player) => player.id === event.playerId)?.name ??
    "The player";
  switch (event.type) {
    case "PROPERTY_BOUGHT":
      return async () => {
        playSound("buy");
        await notify(`${playerName} acquired ${event.details.tileId}.`, "success");
      };
    case "AUCTION_WON":
      return async () => {
        playSound("buy");
        await notify(`${playerName} wins the auction for ${event.details.tileId} at ${formatCurrency(Number(event.details.amount), state.theme.currency)}.`, "success");
      };
    case "RENT_PAID": {
      const ownerName =
        state.players.find((player) => player.id === event.details.creditorId)?.name ??
        "the owner";
      return async () => {
        playSound("coin");
        await notify(`🪙 ${playerName} pays ${formatCurrency(Number(event.details.amount), state.theme.currency)} rent to ${ownerName}.`, "rent");
      };
    }
    case "TAX_DUE":
      return async () => {
        await notify(`${playerName} owes ${formatCurrency(Number(event.details.amount), state.theme.currency)} in ${event.details.name ?? "tax"}.`, "tax");
      };
    case "PAYMENT_DUE":
      return async () => {
        await notify(`${playerName} needs to raise ${formatCurrency(Number(event.details.amount), state.theme.currency)}.`, "warning");
      };
    case "PAYMENT_MADE":
      if (String(event.details.reason).includes("tax")) {
        return async () => {
          playSound("coin");
          await notify(`${playerName} paid ${formatCurrency(Number(event.details.amount), state.theme.currency)} to the bank.`, "tax");
        };
      }
      if (String(event.details.reason).startsWith("chance-") || String(event.details.reason).startsWith("chest-")) {
        return async () => {
          playSound("coin");
          await notify(`${playerName} pays ${formatCurrency(Number(event.details.amount), state.theme.currency)}.`, "tax");
        };
      }
      return null;
    case "SALARY_COLLECTED":
      return async () => {
        if (!reducedMotion) await wait(100);
      };
    case "CARD_DRAWN":
      return async () => {
        playSound("cardFlip");
        if (!reducedMotion) await wait(220);
      };
    case "JAIL_ENTERED":
      return async () => {
        playSound("jailDoor");
        await notify(`${playerName} is sent to the Time-Out Office.`, "warning");
      };
    case "SPEEDING":
      return async () => {
        playSound("jailDoor");
        await notify("Speeding! Three doubles sends you straight to the Time-Out Office.", "warning");
      };
    case "JAIL_RELEASED":
      return async () => {
        playSound("jailDoor");
        await notify(`${playerName} is released from the Time-Out Office.`, "success");
      };
    case "BANKRUPTCY":
      return async () => {
        playSound("bankruptcy");
        await notify(`${playerName} has declared bankruptcy.`, "warning");
      };
    default:
      return null;
  }
}
