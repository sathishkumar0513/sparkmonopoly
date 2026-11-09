import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import type { GameAction, GameState } from "../engine/types";
import { getAvailableActions } from "../engine/gameReducer";

interface GameplayModalsProps {
  state: GameState;
  busy: boolean;
  onAction: (action: GameAction, sound?: "buy" | "cardFlip" | "jailDoor" | "coin" | "click") => void;
}

export function GameplayModals({ state, busy, onAction }: GameplayModalsProps) {
  const reducedMotion = useReducedMotion();
  const actions = getAvailableActions(state);
  const [customBid, setCustomBid] = useState("");
  const [secondsLeft, setSecondsLeft] = useState(15);
  const autoPassed = useRef(false);
  const activeBidderId = state.auction?.activePlayerId;

  useEffect(() => {
    if (state.phase !== "auction" || busy) return;
    setSecondsLeft(15);
    autoPassed.current = false;
    let remaining = 15;
    const timer = setInterval(() => {
      remaining -= 1;
      setSecondsLeft(remaining);
      if (remaining <= 0) {
        clearInterval(timer);
        if (
          !autoPassed.current &&
          getAvailableActions(state).some((action) => action.type === "AUCTION_PASS")
        ) {
          autoPassed.current = true;
          onAction({ type: "AUCTION_PASS" });
        }
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [activeBidderId, busy, onAction, state]);

  const tile =
    state.pendingPurchase
      ? state.theme.tiles.find((candidate) => candidate.id === state.pendingPurchase)
      : null;
  const pendingCard = state.pendingCard
    ? state.theme.cards[state.pendingCard.deck].find(
        (card) => card.id === state.pendingCard?.cardId,
      )
    : null;
  const pendingDeck = state.pendingCard?.deck ?? "chance";
  const activeBidder = state.auction
    ? state.players.find((player) => player.id === state.auction?.activePlayerId)
    : null;
  const can = (type: GameAction["type"]) =>
    actions.some((action) => action.type === type);

  return (
    <AnimatePresence>
      {!busy && state.phase === "purchase" && tile ? (
        <Modal key="purchase" label={`${tile.name} purchase`}>
          <PropertyCard tile={tile} state={state} />
          <div className="modal-actions">
            {can("BUY_PROPERTY") && "price" in tile ? (
              <button className="primary-button" onClick={() => onAction({ type: "BUY_PROPERTY" })}>
                Buy for {currency(tile.price, state)}
              </button>
            ) : null}
            {can("DECLINE_PURCHASE") ? (
              <button className="secondary-button" onClick={() => onAction({ type: "DECLINE_PURCHASE" })}>
                Send to auction
              </button>
            ) : null}
          </div>
        </Modal>
      ) : null}

      {!busy && state.phase === "auction" && state.auction && tile && activeBidder ? (
        <Modal key="auction" label={`${tile.name} auction`}>
          <div className="auction-modal">
            <div className="auction-heading">
              <div>
                <span className="eyebrow">Live auction</span>
                <h2>{tile.name}</h2>
              </div>
              <div
                className="timer-ring"
                style={{ "--timer-angle": `${secondsLeft * 24}deg` } as React.CSSProperties}
              >
                <span aria-label={`${secondsLeft} seconds remaining`}>{secondsLeft}</span>
              </div>
            </div>
            <PropertyCard tile={tile} state={state} compact />
            <div className="auction-current">
              <span>Highest offer</span>
              <strong>{currency(state.auction.highBid, state)}</strong>
            </div>
            <div className="auction-players" aria-label="Bidder status">
              {state.players.filter((player) => !player.bankrupt).map((player) => (
                <span
                  key={player.id}
                  className={`auction-player ${player.id === activeBidder.id ? "auction-player-active" : ""} ${state.auction?.passedPlayerIds.includes(player.id) ? "auction-player-passed" : ""}`}
                >
                  {player.id === activeBidder.id ? "◉" : state.auction?.passedPlayerIds.includes(player.id) ? "×" : "○"} {player.name}
                </span>
              ))}
            </div>
            <p className="acting-as">Acting as <strong>{activeBidder.name}</strong> · {currency(activeBidder.cash, state)} available</p>
            <div className="quick-bids">
              {[10, 50, 100].map((increment) => (
                <button
                  key={increment}
                  className="secondary-button"
                  disabled={
                    !can("AUCTION_BID") ||
                    activeBidder.cash < state.auction!.highBid + increment
                  }
                  onClick={() =>
                    onAction({
                      type: "AUCTION_BID",
                      amount: state.auction!.highBid + increment,
                    })
                  }
                >
                  +{currency(increment, state)}
                </button>
              ))}
            </div>
            <form
              className="custom-bid"
              onSubmit={(event) => {
                event.preventDefault();
                const amount = Number(customBid);
                if (Number.isInteger(amount) && amount > state.auction!.highBid && amount <= activeBidder.cash) {
                  onAction({ type: "AUCTION_BID", amount });
                  setCustomBid("");
                }
              }}
            >
              <label className="sr-only" htmlFor="custom-bid">Custom bid amount</label>
              <input
                id="custom-bid"
                type="number"
                min={state.auction.highBid + 1}
                max={activeBidder.cash}
                step="1"
                value={customBid}
                onChange={(event) => setCustomBid(event.target.value)}
                placeholder="Custom amount"
                disabled={!can("AUCTION_BID")}
              />
              <button className="primary-button" type="submit" disabled={!can("AUCTION_BID") || !customBid}>
                Bid
              </button>
            </form>
            <button className="withdraw-button" onClick={() => onAction({ type: "AUCTION_PASS" })}>
              Withdraw from auction
            </button>
          </div>
        </Modal>
      ) : null}

      {!busy && state.phase === "card" && pendingCard ? (
        <Modal key="card" label={pendingDeck === "chance" ? "Chance card" : "Community Chest card"}>
          <motion.div
            className={`drawn-card ${pendingDeck === "chance" ? "drawn-card-chance" : "drawn-card-chest"}`}
            initial={reducedMotion ? { opacity: 0 } : { opacity: 0, rotateY: 90, y: 14 }}
            animate={reducedMotion ? { opacity: 1 } : { opacity: 1, rotateY: 0, y: 0 }}
            transition={{ duration: reducedMotion ? 0.15 : 0.55, type: "spring", stiffness: 100 }}
          >
            <span className="card-stamp">{pendingDeck === "chance" ? "✨" : "🎁"}</span>
            <span className="eyebrow">{pendingDeck === "chance" ? "Market opportunity" : "Community chest"}</span>
            <p>{pendingCard.text}</p>
            <span className="effect-chip">{effectIcon(pendingCard.effect.type)} {pendingCard.effect.type.replaceAll("getOutOfJailFree", "release").replaceAll("payEachPlayer", "table payment")}</span>
          </motion.div>
          <button
            className="primary-button modal-main-button"
            disabled={!can("RESOLVE_CARD")}
            onClick={() => onAction({ type: "RESOLVE_CARD" })}
          >
            OK — apply card
          </button>
        </Modal>
      ) : null}

      {!busy && state.phase === "debt" && state.pendingDebt ? (
        <Modal key="debt" label="Raise funds">
          <span className="eyebrow">Payment required</span>
          <h2>Raise funds</h2>
          <p className="modal-description">
            {state.players.find((player) => player.id === state.pendingDebt?.debtorId)?.name} needs{" "}
            <strong>{currency(state.pendingDebt.amount, state)}</strong> for this payment.
          </p>
          <div className="debt-assets">
            {Object.entries(state.players[state.currentPlayerIndex]?.properties ?? {}).map(([tileId, holding]) => {
              const asset = state.theme.tiles.find((candidate) => candidate.id === tileId);
              const mortgageAction = actions.find(
                (action) => action.type === "MORTGAGE" && action.tileId === tileId,
              );
              return (
                <div className="debt-asset" key={tileId}>
                  <span>{asset?.name} {holding.mortgaged ? "· Mortgaged" : ""}</span>
                  {mortgageAction?.type === "MORTGAGE" ? (
                    <button className="secondary-button" onClick={() => onAction(mortgageAction)}>
                      Mortgage
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
          <div className="modal-actions">
            {can("PAY_DEBT") ? (
              <button className="primary-button" onClick={() => onAction({ type: "PAY_DEBT" }, "coin")}>
                Pay debt
              </button>
            ) : null}
            <button className="secondary-button" onClick={() => onAction({ type: "DECLARE_BANKRUPTCY" }, "jailDoor")}>
              Declare bankruptcy
            </button>
          </div>
        </Modal>
      ) : null}

      {!busy && state.phase === "jail" ? (
        <div className="jail-status" role="status" aria-live="polite">
          <span className="jail-bars" aria-hidden="true">▥</span>
          <span>Time-Out Office · Attempt {Math.min(state.players[state.currentPlayerIndex]?.jailTurns ?? 0, state.settings.maxJailTurns)} of {state.settings.maxJailTurns}</span>
        </div>
      ) : null}
    </AnimatePresence>
  );
}

function Modal({ children, label }: { children: React.ReactNode; label: string }) {
  const reducedMotion = useReducedMotion();
  return (
    <motion.div
      className="modal-scrim"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, pointerEvents: "auto" }}
      exit={{ opacity: 0, pointerEvents: "none" }}
      transition={{ duration: reducedMotion ? 0.01 : 0.18 }}
      role="dialog"
      aria-modal="true"
      aria-label={label}
    >
      <motion.section
        className="gameplay-modal"
        initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 18, scale: 0.96 }}
        animate={reducedMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
        exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.98 }}
        transition={{ duration: reducedMotion ? 0.01 : 0.24 }}
      >
        {children}
      </motion.section>
    </motion.div>
  );
}

function PropertyCard({
  tile,
  state,
  compact = false,
}: {
  tile: GameState["theme"]["tiles"][number];
  state: GameState;
  compact?: boolean;
}) {
  const groupColor = tile.type === "property" ? GROUP_COLORS[tile.colorGroup] : "#53b6a8";
  return (
    <article className={`property-card ${compact ? "property-card-compact" : ""}`} style={{ "--property-color": groupColor } as React.CSSProperties}>
      <div className="property-card-band" />
      <div className="property-card-content">
        <span className="eyebrow">{state.theme.name} · Business asset</span>
        <h2>{("icon" in tile ? `${tile.icon} ` : "") + tile.name}</h2>
        {"price" in tile ? <strong className="property-price">{currency(tile.price, state)}</strong> : null}
        {tile.type === "property" ? (
          <dl className="rent-table">
            <div><dt>Base rent</dt><dd>{currency(tile.rent.base, state)}</dd></div>
            <div><dt>Full colour group</dt><dd>{currency(tile.rent.colorSetDouble, state)}</dd></div>
            {tile.rent.houses.map((rent, index) => (
              <div key={index}><dt>{index + 1} {index === 0 ? "house" : "houses"}</dt><dd>{currency(rent, state)}</dd></div>
            ))}
            <div><dt>Hotel</dt><dd>{currency(tile.rent.hotel, state)}</dd></div>
            {!compact ? <div><dt>Mortgage value</dt><dd>{currency(tile.mortgageValue, state)}</dd></div> : null}
          </dl>
        ) : tile.type === "transport" ? (
          <dl className="rent-table">
            {tile.rentByCount.map((rent, index) => (
              <div key={index}><dt>{index + 1} transport asset{index ? "s" : ""}</dt><dd>{currency(rent, state)}</dd></div>
            ))}
            {!compact ? <div><dt>Mortgage value</dt><dd>{currency(tile.mortgageValue, state)}</dd></div> : null}
          </dl>
        ) : tile.type === "utility" ? (
          <dl className="rent-table">
            <div><dt>One utility</dt><dd>{tile.diceMultipliers[0]}× dice</dd></div>
            <div><dt>Both utilities</dt><dd>{tile.diceMultipliers[1]}× dice</dd></div>
            {!compact ? <div><dt>Mortgage value</dt><dd>{currency(tile.mortgageValue, state)}</dd></div> : null}
          </dl>
        ) : null}
        {"businessFact" in tile && !compact ? <p className="business-fact">{tile.businessFact}</p> : null}
      </div>
    </article>
  );
}

const GROUP_COLORS: Record<string, string> = {
  brown: "#956344",
  lightBlue: "#77d5dd",
  pink: "#e583c4",
  orange: "#ee9d5a",
  red: "#e96b70",
  yellow: "#e6ce67",
  green: "#56b78d",
  darkBlue: "#687ddd",
};

function effectIcon(type: string) {
  if (type === "move" || type === "moveRelative") return "🧭";
  if (type === "pay") return "💸";
  if (type === "collect") return "🪙";
  if (type === "jail") return "🔒";
  if (type === "getOutOfJailFree") return "🗝️";
  if (type === "repair") return "🛠️";
  return "🤝";
}

function currency(amount: number, state: GameState) {
  const formatted = amount.toLocaleString("en-US");
  return state.theme.currency.format === "before"
    ? `${state.theme.currency.symbol}${formatted}`
    : `${formatted}${state.theme.currency.symbol}`;
}
