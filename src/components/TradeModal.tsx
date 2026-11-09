import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { getAvailableActions, validateTrade } from "../engine/gameReducer";
import type { GameAction, GameState, Player, TradeOffer } from "../engine/types";

interface TradeModalProps {
  state: GameState;
  open: boolean;
  busy: boolean;
  onAction: (action: GameAction, sound?: "coin" | "click") => void;
  onClose: () => void;
}

function emptyOffer(from: Player, to: Player): TradeOffer {
  return {
    fromPlayerId: from.id,
    toPlayerId: to.id,
    cashFrom: 0,
    cashTo: 0,
    propertiesFrom: [],
    propertiesTo: [],
    jailCardsFrom: [],
    jailCardsTo: [],
  };
}

export function TradeModal({ state, open, busy, onAction, onClose }: TradeModalProps) {
  const reducedMotion = useReducedMotion();
  const [draft, setDraft] = useState<TradeOffer | null>(null);
  const [composing, setComposing] = useState(false);
  const pending = state.pendingTrade?.offer ?? null;
  const activePlayer = state.players[state.currentPlayerIndex];
  const currentResponder = pending
    ? state.players.find((player) => player.id === pending.toPlayerId) ?? null
    : null;
  const actions = getAvailableActions(state);
  const errors = useMemo(
    () => draft ? validateTrade(state, draft) : [],
    [draft, state],
  );
  const can = (type: GameAction["type"]) => actions.some((action) => action.type === type);

  useEffect(() => {
    if (pending) {
      setComposing(false);
      setDraft(null);
    } else if (open && activePlayer) {
      const partner = state.players.find((player) => !player.bankrupt && player.id !== activePlayer.id);
      setDraft(partner ? emptyOffer(activePlayer, partner) : null);
      setComposing(true);
    } else {
      setComposing(false);
      setDraft(null);
    }
  }, [open, pending?.fromPlayerId, pending?.toPlayerId, activePlayer?.id, state.players]);

  const startCounter = () => {
    if (!pending) return;
    setDraft({
      fromPlayerId: pending.toPlayerId,
      toPlayerId: pending.fromPlayerId,
      cashFrom: pending.cashTo,
      cashTo: pending.cashFrom,
      propertiesFrom: [...pending.propertiesTo],
      propertiesTo: [...pending.propertiesFrom],
      jailCardsFrom: [...pending.jailCardsTo],
      jailCardsTo: [...pending.jailCardsFrom],
    });
    setComposing(true);
  };

  const update = <K extends keyof TradeOffer>(key: K, value: TradeOffer[K]) => {
    setDraft((current) => current ? { ...current, [key]: value } : current);
  };

  const submit = () => {
    if (!draft || errors.length > 0) return;
    if (pending) {
      onAction({ type: "COUNTER_TRADE", offer: draft });
    } else {
      onAction({ type: "PROPOSE_TRADE", offer: draft });
    }
    setComposing(false);
  };

  return (
    <AnimatePresence>
      {(open || pending) && !busy ? (
        <motion.div
          key="trade-modal"
          className="modal-scrim"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, pointerEvents: "auto" }}
          exit={{ opacity: 0, pointerEvents: "none" }}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !pending) onClose();
          }}
        >
          <motion.section
            className="gameplay-modal trade-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="trade-title"
            initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
          >
            {composing && draft ? (
              <>
                <span className="eyebrow">{pending ? "Counter proposal" : "Negotiation"}</span>
                <h2 id="trade-title">{pending ? "Make a counter-offer" : "Create a trade"}</h2>
                <p className="modal-description">
                  {pending
                    ? `Pass the device to ${state.players.find((player) => player.id === draft.fromPlayerId)?.name} to prepare a counter.`
                    : "Choose what you offer and what you want in return."}
                </p>
                {!pending ? (
                  <label className="trade-partner-select">
                    Trade partner
                    <select
                      value={draft.toPlayerId}
                      onChange={(event) => {
                        const partner = state.players.find((player) => player.id === event.target.value);
                        const sender = state.players.find((player) => player.id === draft.fromPlayerId);
                        if (partner && sender) setDraft(emptyOffer(sender, partner));
                      }}
                    >
                      {state.players.filter((player) => !player.bankrupt && player.id !== draft.fromPlayerId)
                        .map((player) => <option value={player.id} key={player.id}>{player.name}</option>)}
                    </select>
                  </label>
                ) : null}
                <div className="trade-columns">
                  <TradeSide
                    state={state}
                    playerId={draft.fromPlayerId}
                    title="You give"
                    cash={draft.cashFrom}
                    properties={draft.propertiesFrom}
                    jailCards={draft.jailCardsFrom}
                    onCash={(value) => update("cashFrom", value)}
                    onProperties={(value) => update("propertiesFrom", value)}
                    onCards={(value) => update("jailCardsFrom", value)}
                  />
                  <TradeSide
                    state={state}
                    playerId={draft.toPlayerId}
                    title="You receive"
                    cash={draft.cashTo}
                    properties={draft.propertiesTo}
                    jailCards={draft.jailCardsTo}
                    onCash={(value) => update("cashTo", value)}
                    onProperties={(value) => update("propertiesTo", value)}
                    onCards={(value) => update("jailCardsTo", value)}
                  />
                </div>
                <div className="trade-totals">
                  <span>Value given <b>{money(tradeValue(state, draft.fromPlayerId, draft.cashFrom, draft.propertiesFrom, draft.jailCardsFrom.length), state)}</b></span>
                  <span>Value received <b>{money(tradeValue(state, draft.toPlayerId, draft.cashTo, draft.propertiesTo, draft.jailCardsTo.length), state)}</b></span>
                </div>
                {errors.length > 0 ? (
                  <ul className="trade-errors" role="alert">
                    {errors.map((error) => <li key={error}>{error}</li>)}
                  </ul>
                ) : null}
                <div className="modal-actions">
                  <button className="primary-button" disabled={errors.length > 0} onClick={submit}>
                    {pending ? "Send counter-offer" : "Send offer"}
                  </button>
                  <button className="secondary-button" onClick={() => pending ? setComposing(false) : onClose()}>
                    Cancel
                  </button>
                </div>
              </>
            ) : pending ? (
              <div className="trade-response">
                <span className="eyebrow">Pass the device to {currentResponder?.name ?? "your partner"}</span>
                <h2 id="trade-title">Trade offer from {state.players.find((player) => player.id === pending.fromPlayerId)?.name}</h2>
                <TradeSummary state={state} offer={pending} />
                <p className="pass-device-note">Review both sides before responding. The offer stays private to this screen.</p>
                {currentResponder?.isBot ? (
                  <p className="thinking-note" role="status">Thinking… the offer will be accepted or declined shortly.</p>
                ) : (
                  <div className="modal-actions">
                    <button className="primary-button" disabled={!can("ACCEPT_TRADE")} onClick={() => onAction({ type: "ACCEPT_TRADE" }, "coin")}>Accept trade</button>
                    <button className="secondary-button" disabled={!can("REJECT_TRADE")} onClick={() => onAction({ type: "REJECT_TRADE" })}>Reject</button>
                    <button className="secondary-button" onClick={startCounter}>Counter</button>
                  </div>
                )}
              </div>
            ) : null}
          </motion.section>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

function TradeSide({
  state,
  playerId,
  title,
  cash,
  properties,
  jailCards,
  readOnly = false,
  onCash,
  onProperties,
  onCards,
}: {
  state: GameState;
  playerId: string;
  title: string;
  cash: number;
  properties: string[];
  jailCards: string[];
  readOnly?: boolean;
  onCash: (value: number) => void;
  onProperties: (value: string[]) => void;
  onCards: (value: string[]) => void;
}) {
  const player = state.players.find((candidate) => candidate.id === playerId);
  if (!player) return null;
  const ownedTiles = state.theme.tiles.filter((tile) => player.properties[tile.id]);
  return (
    <fieldset className="trade-side" disabled={readOnly}>
      <legend>{title} · {player.name}</legend>
      <label>
        Cash
        <input
          type="number"
          min="0"
          max={player.cash}
          step="1"
          value={cash}
          onChange={(event) => onCash(Math.max(0, Math.min(player.cash, Math.floor(Number(event.target.value) || 0))))}
        />
      </label>
      <div className="trade-checklist">
        <strong>Properties</strong>
        {ownedTiles.length === 0 ? <span className="muted-copy">No properties owned</span> : ownedTiles.map((tile) => (
          <label key={tile.id}>
            <input
              type="checkbox"
              checked={properties.includes(tile.id)}
              onChange={(event) => onProperties(event.target.checked
                ? [...properties, tile.id]
                : properties.filter((id) => id !== tile.id))}
            />
            {tile.name}{player.properties[tile.id]?.mortgaged ? " · mortgaged" : ""}
          </label>
        ))}
      </div>
      <div className="trade-checklist">
        <strong>Release cards</strong>
        {player.jailCards.length === 0 ? <span className="muted-copy">No cards held</span> : player.jailCards.map((cardId, index) => (
          <label key={`${cardId}-${index}`}>
            <input
              type="checkbox"
              checked={jailCards.includes(cardId)}
              onChange={(event) => onCards(event.target.checked
                ? [...jailCards, cardId]
                : jailCards.filter((id, cardIndex) => id !== cardId || cardIndex !== jailCards.indexOf(cardId)))}
            />
            Get-out-of-jail card
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function TradeSummary({ state, offer }: { state: GameState; offer: TradeOffer }) {
  const from = state.players.find((player) => player.id === offer.fromPlayerId);
  const to = state.players.find((player) => player.id === offer.toPlayerId);
  return (
    <div className="trade-summary">
      <section>
        <strong>{from?.name} gives</strong>
        <span>{money(offer.cashFrom, state)} cash</span>
        {offer.propertiesFrom.map((id) => <span key={id}>{tileName(state, id)}</span>)}
        {offer.jailCardsFrom.length > 0 ? <span>{offer.jailCardsFrom.length} release card(s)</span> : null}
      </section>
      <span className="trade-swap" aria-hidden="true">⇄</span>
      <section>
        <strong>{to?.name} gives</strong>
        <span>{money(offer.cashTo, state)} cash</span>
        {offer.propertiesTo.map((id) => <span key={id}>{tileName(state, id)}</span>)}
        {offer.jailCardsTo.length > 0 ? <span>{offer.jailCardsTo.length} release card(s)</span> : null}
      </section>
      <div className="trade-response-totals">
        <span>{from?.name}: <b>{money(tradeValue(state, offer.fromPlayerId, offer.cashFrom, offer.propertiesFrom, offer.jailCardsFrom.length), state)}</b></span>
        <span>{to?.name}: <b>{money(tradeValue(state, offer.toPlayerId, offer.cashTo, offer.propertiesTo, offer.jailCardsTo.length), state)}</b></span>
      </div>
    </div>
  );
}

function tradeValue(
  state: GameState,
  playerId: string,
  cash: number,
  propertyIds: string[],
  jailCardCount: number,
) {
  const player = state.players.find((candidate) => candidate.id === playerId);
  return cash + jailCardCount * state.settings.jailFine + propertyIds.reduce((total, tileId) => {
    const tile = state.theme.tiles.find((candidate) => candidate.id === tileId);
    if (!tile || !("price" in tile)) return total;
    const holding = player?.properties[tileId];
    return total + (holding?.mortgaged ? Math.floor(tile.price * 0.6) : tile.price);
  }, 0);
}

function tileName(state: GameState, tileId: string) {
  return state.theme.tiles.find((tile) => tile.id === tileId)?.name ?? tileId;
}

function money(amount: number, state: GameState) {
  const value = amount.toLocaleString("en-US");
  return state.theme.currency.format === "before"
    ? `${state.theme.currency.symbol}${value}`
    : `${value}${state.theme.currency.symbol}`;
}
