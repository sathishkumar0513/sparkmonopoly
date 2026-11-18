import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { getAvailableActions, validateTrade } from "../engine/gameReducer";
import type { GameAction, GameState, Player, TradeOffer } from "../engine/types";
import { localizedName } from "../i18n/themeText";
import { formatMoney } from "../themes/formatMoney";
import { useDialogFocus } from "./useDialogFocus";
import { useMotionLevel } from "../ui/useMotionLevel";
import { MOTION_MS, MOTION_SPRING } from "../ui/motion";

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
  const { t, i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? "en";
  const motionLevel = useMotionLevel();
  const reducedMotion = motionLevel !== "full";
  const motionOff = motionLevel === "off";
  const dialogRef = useRef<HTMLElement>(null);
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
  useDialogFocus(dialogRef, (open || Boolean(pending)) && !busy);

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
          initial={motionOff ? false : { opacity: 0 }}
          animate={{ opacity: 1, pointerEvents: "auto" }}
          exit={motionOff ? undefined : { opacity: 0, pointerEvents: "none" }}
          transition={{ duration: motionOff ? 0 : reducedMotion ? 0.01 : MOTION_MS.button / 1000 }}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !pending) onClose();
          }}
        >
          <motion.section
            ref={dialogRef}
            tabIndex={-1}
            className="gameplay-modal trade-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="trade-title"
            initial={motionOff ? false : reducedMotion ? { opacity: 0 } : { opacity: 0, y: 18 }}
            animate={reducedMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
            exit={motionOff ? undefined : reducedMotion ? { opacity: 0 } : { opacity: 0, y: 10 }}
            transition={motionOff ? { duration: 0 } : reducedMotion ? { duration: MOTION_MS.reduced / 1000 } : MOTION_SPRING.modal}
          >
            {composing && draft ? (
              <>
                <span className="eyebrow">{pending ? t("trade.counterProposal") : t("trade.negotiation")}</span>
                <h2 id="trade-title">{pending ? t("trade.makeCounter") : t("trade.create")}</h2>
                <p className="modal-description">
                  {pending
                    ? t("trade.counterDevice", { name: state.players.find((player) => player.id === draft.fromPlayerId)?.name })
                    : t("trade.chooseOffer")}
                </p>
                {!pending ? (
                  <label className="trade-partner-select">
                    {t("trade.partner")}
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
                    title={t("trade.youGive")}
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
                    title={t("trade.youReceive")}
                    cash={draft.cashTo}
                    properties={draft.propertiesTo}
                    jailCards={draft.jailCardsTo}
                    onCash={(value) => update("cashTo", value)}
                    onProperties={(value) => update("propertiesTo", value)}
                    onCards={(value) => update("jailCardsTo", value)}
                  />
                </div>
                <div className="trade-totals">
                  <span>{t("trade.valueGiven")} <b>{money(tradeValue(state, draft.fromPlayerId, draft.cashFrom, draft.propertiesFrom, draft.jailCardsFrom.length), state, language)}</b></span>
                  <span>{t("trade.valueReceived")} <b>{money(tradeValue(state, draft.toPlayerId, draft.cashTo, draft.propertiesTo, draft.jailCardsTo.length), state, language)}</b></span>
                </div>
                {errors.length > 0 ? (
                  <ul className="trade-errors" role="alert">
                    {errors.map((error) => <li key={error}>{translateTradeError(error, state, t, language)}</li>)}
                  </ul>
                ) : null}
                <div className="modal-actions">
                  <button className="primary-button" disabled={errors.length > 0} onClick={submit}>
                    {pending ? t("trade.sendCounter") : t("trade.sendOffer")}
                  </button>
                  <button className="secondary-button" onClick={() => pending ? setComposing(false) : onClose()}>
                    {t("common.cancel")}
                  </button>
                </div>
              </>
            ) : pending ? (
              <div className="trade-response">
                <span className="eyebrow">{t("trade.passDevice", { name: currentResponder?.name ?? t("trade.yourPartner") })}</span>
                <h2 id="trade-title">{t("trade.offerFrom", { name: state.players.find((player) => player.id === pending.fromPlayerId)?.name })}</h2>
                <TradeSummary state={state} offer={pending} />
                <p className="pass-device-note">{t("trade.review")}</p>
                {currentResponder?.isBot ? (
                  <p className="thinking-note" role="status">{t("trade.thinking")}</p>
                ) : (
                  <div className="modal-actions">
                    <button className="primary-button" disabled={!can("ACCEPT_TRADE")} onClick={() => onAction({ type: "ACCEPT_TRADE" }, "coin")}>{t("trade.accept")}</button>
                    <button className="secondary-button" disabled={!can("REJECT_TRADE")} onClick={() => onAction({ type: "REJECT_TRADE" })}>{t("trade.reject")}</button>
                    <button className="secondary-button" onClick={startCounter}>{t("trade.counter")}</button>
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
  const { t, i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? "en";
  const player = state.players.find((candidate) => candidate.id === playerId);
  if (!player) return null;
  const ownedTiles = state.theme.tiles.filter((tile) => player.properties[tile.id]);
  return (
    <fieldset className="trade-side" disabled={readOnly}>
      <legend>{title} · {player.name}</legend>
      <label>
        {t("trade.cash")}
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
        <strong>{t("trade.properties")}</strong>
        {ownedTiles.length === 0 ? <span className="muted-copy">{t("trade.noProperties")}</span> : ownedTiles.map((tile) => (
          <label key={tile.id}>
            <input
              type="checkbox"
              checked={properties.includes(tile.id)}
              onChange={(event) => onProperties(event.target.checked
                ? [...properties, tile.id]
                : properties.filter((id) => id !== tile.id))}
            />
            {localizedName(tile, language)}{player.properties[tile.id]?.mortgaged ? ` ${t("trade.mortgaged")}` : ""}
          </label>
        ))}
      </div>
      <div className="trade-checklist">
        <strong>{t("trade.releaseCards")}</strong>
        {player.jailCards.length === 0 ? <span className="muted-copy">{t("trade.noCards")}</span> : player.jailCards.map((cardId, index) => (
          <label key={`${cardId}-${index}`}>
            <input
              type="checkbox"
              checked={jailCards.includes(cardId)}
              onChange={(event) => onCards(event.target.checked
                ? [...jailCards, cardId]
                : jailCards.filter((id, cardIndex) => id !== cardId || cardIndex !== jailCards.indexOf(cardId)))}
            />
            {t("trade.getOutCard")}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function TradeSummary({ state, offer }: { state: GameState; offer: TradeOffer }) {
  const { t, i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? "en";
  const from = state.players.find((player) => player.id === offer.fromPlayerId);
  const to = state.players.find((player) => player.id === offer.toPlayerId);
  return (
    <div className="trade-summary">
      <section>
        <strong>{t("trade.youGiveSummary", { name: from?.name })}</strong>
        <span>{money(offer.cashFrom, state, language)} {t("trade.cash").toLowerCase()}</span>
        {offer.propertiesFrom.map((id) => <span key={id}>{tileName(state, id, language)}</span>)}
        {offer.jailCardsFrom.length > 0 ? <span>{offer.jailCardsFrom.length} {t("trade.releaseCards").toLowerCase()}</span> : null}
      </section>
      <span className="trade-swap" aria-hidden="true">⇄</span>
      <section>
        <strong>{t("trade.youReceiveSummary", { name: to?.name })}</strong>
        <span>{money(offer.cashTo, state, language)} {t("trade.cash").toLowerCase()}</span>
        {offer.propertiesTo.map((id) => <span key={id}>{tileName(state, id, language)}</span>)}
        {offer.jailCardsTo.length > 0 ? <span>{offer.jailCardsTo.length} {t("trade.releaseCards").toLowerCase()}</span> : null}
      </section>
      <div className="trade-response-totals">
        <span>{from?.name}: <b>{money(tradeValue(state, offer.fromPlayerId, offer.cashFrom, offer.propertiesFrom, offer.jailCardsFrom.length), state, language)}</b></span>
        <span>{to?.name}: <b>{money(tradeValue(state, offer.toPlayerId, offer.cashTo, offer.propertiesTo, offer.jailCardsTo.length), state, language)}</b></span>
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

function tileName(state: GameState, tileId: string, language: string) {
  const tile = state.theme.tiles.find((candidate) => candidate.id === tileId);
  return tile ? localizedName(tile, language) : tileId;
}

function money(amount: number, state: GameState, language: string) {
  return formatMoney(amount, state.theme.currency, language);
}

function translateTradeError(
  error: string,
  state: GameState,
  t: TFunction,
  language: string,
): string {
  const staticErrors: Record<string, string> = {
    "Both trade partners must be in the game.": "bothPartners",
    "Choose a different trade partner.": "differentPartner",
    "Include cash, property, or a release card in the trade.": "includeAsset",
    "Bankrupt players cannot trade.": "bankrupt",
    "Cash offers must be non-negative whole numbers.": "cashWholeNumber",
    "A property can only appear once in a trade.": "propertyOnce",
    "A release card can only appear once in a trade.": "cardOnce",
  };
  const staticKey = staticErrors[error];
  if (staticKey) return t(`trade.errors.${staticKey}`);

  const cashPlayer = state.players.find((player) =>
    error === `${player.name} does not have enough cash.`,
  );
  if (cashPlayer) return t("trade.errors.notEnoughCash", { name: cashPlayer.name });
  const cardPlayer = state.players.find((player) =>
    error === `${player.name} does not hold that release card.`,
  );
  if (cardPlayer) return t("trade.errors.noReleaseCard", { name: cardPlayer.name });
  const interestPlayer = state.players.find((player) =>
    error === `${player.name} needs more cash to accept mortgage interest.`,
  );
  if (interestPlayer) return t("trade.errors.mortgageInterest", { name: interestPlayer.name });

  const ownershipError = /^(.*?) does not own (.+)\.$/.exec(error);
  if (ownershipError) {
    const tile = state.theme.tiles.find((candidate) =>
      candidate.name === ownershipError[2] || candidate.id === ownershipError[2],
    );
    return t("trade.errors.notOwned", {
      name: ownershipError[1],
      property: tile ? localizedName(tile, language) : ownershipError[2],
    });
  }
  for (const group of ["brown", "lightBlue", "pink", "orange", "red", "yellow", "green", "darkBlue"] as const) {
    if (error === `Sell all buildings in ${group} before trading its properties.`) {
      return t("trade.errors.sellBuildings", { group: t(`trade.color.${group}`) });
    }
  }
  return error;
}
