import { useEffect, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Board } from "../components/Board";
import { Dice } from "../components/Dice";
import { PlayerPanel } from "../components/PlayerPanel";
import { tilePath } from "../components/boardLayout";
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
  const previousPositions = useRef<Record<string, number>>({});
  const moveTimeouts = useRef<ReturnType<typeof setTimeout>[]>([]);
  const motionDisabled = reducedMotion ?? false;

  const positionsKey = useMemo(
    () => state?.players.map((player) => `${player.id}:${player.position}`).join("|") ?? "",
    [state?.players],
  );

  useEffect(() => {
    if (!state) return;
    for (const timeout of moveTimeouts.current) clearTimeout(timeout);
    moveTimeouts.current = [];

    const nextPositions = Object.fromEntries(
      state.players.map((player) => [player.id, player.position]),
    );
    const oldPositions = previousPositions.current;
    const wasDiceRoll = state.eventLog.at(-1)?.type === "ROLL_DICE";
    let passedGo = false;

    for (const player of state.players) {
      const oldPosition = oldPositions[player.id];
      if (oldPosition === undefined || oldPosition === player.position) continue;

      const forwardPath = tilePath(oldPosition, player.position);
      if (forwardPath.includes(0)) passedGo = true;
      const isJailMove =
        state.phase === "jail" &&
        state.theme.tiles[player.position]?.type === "jail";
      const shouldHop =
        !motionDisabled && wasDiceRoll && forwardPath.length > 0 && forwardPath.length <= 12 && !isJailMove;
      if (!shouldHop) {
        setVisualPositions((current) => ({
          ...current,
          [player.id]: player.position,
        }));
        continue;
      }

      forwardPath.forEach((position, step) => {
        const timeout = setTimeout(
          () => {
            setVisualPositions((current) => ({
              ...current,
              [player.id]: position,
            }));
          },
          (step + 1) * 145,
        );
        moveTimeouts.current.push(timeout);
      });
    }

    if (passedGo) {
      setGoFlash(true);
      const timeout = setTimeout(() => setGoFlash(false), 1300);
      moveTimeouts.current.push(timeout);
    }

    previousPositions.current = nextPositions;
    setVisualPositions((current) => {
      const updated = { ...current };
      for (const [playerId, position] of Object.entries(nextPositions)) {
        if (updated[playerId] === undefined) updated[playerId] = position;
      }
      return updated;
    });

    return () => {
      for (const timeout of moveTimeouts.current) clearTimeout(timeout);
    };
  }, [motionDisabled, positionsKey]);

  if (!state) return null;

  const currentPlayer = state.players[state.currentPlayerIndex];
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
              {phaseMessage(
                state.phase,
                state.theme.tiles.find((tile) => tile.id === state.pendingPurchase)?.name,
              )}
            </p>
            {state.phase === "roll" || state.phase === "jail" ? (
              <button
                className="primary-button"
                onClick={() => dispatch({ type: "ROLL_DICE" })}
                aria-label="Roll the dice"
              >
                Roll Dice <span aria-hidden="true">↗</span>
              </button>
            ) : null}
            {state.phase === "purchase" ? (
              <div className="action-row">
                <button className="primary-button" onClick={() => dispatch({ type: "BUY_PROPERTY" })}>
                  Buy asset
                </button>
                <button className="secondary-button" onClick={() => dispatch({ type: "DECLINE_PURCHASE" })}>
                  Auction
                </button>
              </div>
            ) : null}
            {state.phase === "auction" && state.auction ? (
              <div className="auction-actions">
                <p>Top offer: {formatCurrency(state.auction.highBid, state.theme.currency)}</p>
                <div className="action-row">
                  <button
                    className="primary-button"
                    onClick={() =>
                      dispatch({
                        type: "AUCTION_BID",
                        amount: state.auction!.highBid + 10,
                      })
                    }
                    disabled={
                      (state.players.find((player) => player.id === state.auction?.activePlayerId)?.cash ?? 0)
                      < state.auction.highBid + 10
                    }
                  >
                    Bid +10
                  </button>
                  <button className="secondary-button" onClick={() => dispatch({ type: "AUCTION_PASS" })}>
                    Pass
                  </button>
                </div>
              </div>
            ) : null}
            {state.phase === "endTurn" ? (
              <button className="primary-button" onClick={() => dispatch({ type: "END_TURN" })}>
                End turn <span aria-hidden="true">→</span>
              </button>
            ) : null}
            {state.phase === "debt" ? (
              <p className="debt-note" role="status">
                This player owes {formatCurrency(state.pendingDebt?.amount ?? 0, state.theme.currency)}. Asset management is coming in a later phase.
              </p>
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
              {[...state.eventLog].reverse().slice(0, 7).map((event) => (
                <li key={event.id}>
                  <span className="event-dot" />
                  <span>{describeEvent(event, state.players)}</span>
                </li>
              ))}
            </ol>
          </section>
        </aside>
      </div>

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

function phaseMessage(phase: string, selectedTileName?: string) {
  switch (phase) {
    case "purchase": return `${selectedTileName ?? "An unclaimed asset"} is available to buy or auction.`;
    case "auction": return "Make an offer or pass.";
    case "jail": return "Roll for a double to leave the Time-Out Office.";
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
  event: { type: string; playerId: string | null; details: Record<string, string | number | boolean | null> },
  players: { id: string; name: string }[],
) {
  const playerName = players.find((player) => player.id === event.playerId)?.name ?? "The table";
  if (event.type === "GAME_STARTED") return "The game is ready to play.";
  if (event.type === "ROLL_DICE") return `${playerName} rolled ${event.details.first ?? "the dice"}.`;
  if (event.type === "BUY_PROPERTY") return `${playerName} bought ${event.details.tileId ?? "an asset"}.`;
  if (event.type === "END_TURN") return `${playerName} ended their turn.`;
  if (event.type === "CARD_DRAWN") return String(event.details.text ?? "A card was drawn.");
  if (event.type === "ACTION_UNDONE") return "The last action was undone.";
  return `${playerName}: ${event.type.toLowerCase().replaceAll("_", " ")}.`;
}
