import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import type { GameAction, GameState } from "../engine/types";
import { getAvailableActions } from "../engine/gameReducer";
import { localizedCardText, localizedName } from "../i18n/themeText";
import { formatMoney } from "../themes/formatMoney";
import { MOTION_MS, MOTION_SPRING } from "../ui/motion";
import { useMotionLevel } from "../ui/useMotionLevel";

interface GameplayModalsProps {
  state: GameState;
  busy: boolean;
  onAction: (action: GameAction, sound?: "buy" | "build" | "cardFlip" | "jailDoor" | "coin" | "click") => void;
}

export function GameplayModals({ state, busy, onAction }: GameplayModalsProps) {
  const { t, i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? "en";
  const motionLevel = useMotionLevel();
  const reducedMotion = motionLevel !== "full";
  const motionOff = motionLevel === "off";
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
        <Modal key="purchase" label={t("modal.purchase", { name: localizedName(tile, language) })}>
          <PropertyCard tile={tile} state={state} />
          <div className="modal-actions">
            {can("BUY_PROPERTY") && "price" in tile ? (
              <button className="primary-button" onClick={() => onAction({ type: "BUY_PROPERTY" })}>
                {t("modal.buyFor", { amount: currency(tile.price, state, language) })}
              </button>
            ) : null}
            {can("DECLINE_PURCHASE") ? (
              <button className="secondary-button" onClick={() => onAction({ type: "DECLINE_PURCHASE" })}>
                {t("modal.sendToAuction")}
              </button>
            ) : null}
          </div>
        </Modal>
      ) : null}

      {!busy && state.phase === "auction" && state.auction && tile && activeBidder ? (
        <Modal key="auction" label={t("modal.auction", { name: localizedName(tile, language) })}>
          <div className="auction-modal">
            <div className="auction-heading">
              <div>
                <span className="eyebrow">{t("modal.liveAuction")}</span>
                <h2>{localizedName(tile, language)}</h2>
              </div>
              <div
                className="timer-ring"
                style={{ "--timer-angle": `${secondsLeft * 24}deg` } as React.CSSProperties}
              >
                <span aria-label={t("modal.secondsRemaining", { count: secondsLeft })}>{secondsLeft}</span>
              </div>
            </div>
            <PropertyCard tile={tile} state={state} compact />
            <div className="auction-current">
              <span>{t("modal.highestOffer")}</span>
              <strong>{currency(state.auction.highBid, state, language)}</strong>
            </div>
            <div className="auction-players" aria-label={t("modal.bidderStatus")}>
              {state.players.filter((player) => !player.bankrupt).map((player) => (
                <span
                  key={player.id}
                  className={`auction-player ${player.id === activeBidder.id ? "auction-player-active" : ""} ${state.auction?.passedPlayerIds.includes(player.id) ? "auction-player-passed" : ""}`}
                >
                  {player.id === activeBidder.id ? "◉" : state.auction?.passedPlayerIds.includes(player.id) ? "×" : "○"} {player.name}
                </span>
              ))}
            </div>
            <p className="acting-as">{t("modal.actingAs")} <strong>{activeBidder.name}</strong> · {t("modal.available", { amount: currency(activeBidder.cash, state, language) })}</p>
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
                  +{currency(increment, state, language)}
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
              <label className="sr-only" htmlFor="custom-bid">{t("modal.customBid")}</label>
              <input
                id="custom-bid"
                type="number"
                min={state.auction.highBid + 1}
                max={activeBidder.cash}
                step="1"
                value={customBid}
                onChange={(event) => setCustomBid(event.target.value)}
                placeholder={t("modal.customAmount")}
                disabled={!can("AUCTION_BID")}
              />
              <button className="primary-button" type="submit" disabled={!can("AUCTION_BID") || !customBid}>
                {t("modal.bid")}
              </button>
            </form>
            <button className="withdraw-button" onClick={() => onAction({ type: "AUCTION_PASS" })}>
              {t("modal.withdrawAuction")}
            </button>
          </div>
        </Modal>
      ) : null}

      {!busy && state.phase === "card" && pendingCard ? (
        <Modal key="card" label={pendingDeck === "chance" ? t("modal.chanceCard") : t("modal.communityChestCard")}>
          <motion.div
            className={`drawn-card ${pendingDeck === "chance" ? "drawn-card-chance" : "drawn-card-chest"}`}
            initial={motionOff ? false : reducedMotion ? { opacity: 0 } : { opacity: 0, rotateY: 90, y: 14 }}
            animate={reducedMotion ? { opacity: 1 } : { opacity: 1, rotateY: 0, y: 0 }}
            transition={motionOff ? { duration: 0 } : reducedMotion ? { duration: MOTION_MS.reduced / 1000 } : { ...MOTION_SPRING.modal, duration: MOTION_MS.card / 1000 }}
          >
            <span className="card-stamp">{pendingDeck === "chance" ? "✨" : "🎁"}</span>
            <span className="eyebrow">{pendingDeck === "chance" ? t("modal.marketOpportunity") : t("modal.communityChest")}</span>
            <p>{localizedCardText(pendingCard, language)}</p>
            <span className="effect-chip">{effectIcon(pendingCard.effect.type)} {effectLabel(pendingCard.effect.type, t)}</span>
          </motion.div>
          <button
            className="primary-button modal-main-button"
            disabled={!can("RESOLVE_CARD")}
            onClick={() => onAction({ type: "RESOLVE_CARD" })}
          >
            {t("modal.applyCard")}
          </button>
        </Modal>
      ) : null}

      {!busy && state.phase === "debt" && state.pendingDebt ? (
        <Modal key="debt" label={t("modal.raiseFunds")}>
          <span className="eyebrow">{t("modal.paymentRequired")}</span>
          <h2>{t("modal.raiseFunds")}</h2>
          {(() => {
            const debtor = state.players.find((player) => player.id === state.pendingDebt?.debtorId);
            const creditor = state.players.find((player) => player.id === state.pendingDebt?.creditorId);
            const cash = debtor?.cash ?? 0;
            const shortfall = Math.max(0, state.pendingDebt.amount - cash);
            return (
              <>
          <p className="modal-description">
            {t("modal.owes", { name: debtor?.name, amount: currency(state.pendingDebt.amount, state, language) })}
            {" "}{creditor ? t("modal.toPlayer", { name: creditor.name }) : t("modal.toBank")}.
          </p>
          <div className={`debt-shortfall ${shortfall === 0 ? "debt-covered" : ""}`}>
            <span>{t("modal.cashAvailable")} <b>{currency(cash, state, language)}</b></span>
            <span>{shortfall === 0 ? t("modal.covered") : t("modal.shortfall", { amount: currency(shortfall, state, language) })}</span>
          </div>
          <div className="debt-assets">
            {Object.entries(debtor?.properties ?? {}).map(([tileId, holding]) => {
              const asset = state.theme.tiles.find((candidate) => candidate.id === tileId);
              const liquidationAction = actions.find((action) =>
                (action.type === "MORTGAGE" || action.type === "SELL_BUILDING") &&
                action.tileId === tileId,
              );
              const raises = liquidationAction?.type === "MORTGAGE"
                ? (asset && "mortgageValue" in asset ? asset.mortgageValue : 0)
                : asset && "houseCost" in asset ? Math.floor(asset.houseCost / 2) : 0;
              return (
                <div className="debt-asset" key={tileId}>
                  <span>{asset ? localizedName(asset, language) : tileId} {holding.level > 0 ? t("modal.level", { level: holding.level }) : ""} {holding.mortgaged ? `· ${t("game.mortgaged")}` : ""}</span>
                  {liquidationAction ? (
                    <button
                      className="secondary-button"
                      onClick={() => onAction(
                        liquidationAction,
                        liquidationAction.type === "SELL_BUILDING" ? "build" : "coin",
                      )}
                    >
                      {liquidationAction.type === "SELL_BUILDING" ? t("modal.sell") : t("modal.mortgage")} · +{currency(raises, state, language)}
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
          <div className="modal-actions">
            <button className="primary-button" disabled={!can("PAY_DEBT")} onClick={() => onAction({ type: "PAY_DEBT" }, "coin")}>
              {t("modal.payAmount", { amount: currency(state.pendingDebt.amount, state, language) })}
            </button>
            <button className="secondary-button" onClick={() => onAction({ type: "DECLARE_BANKRUPTCY" }, "jailDoor")}>
              {t("modal.declareBankruptcy")}
            </button>
          </div>
              </>
            );
          })()}
        </Modal>
      ) : null}

      {!busy && state.phase === "jail" ? (
        <div className="jail-status" role="status" aria-live="polite">
          <span className="jail-bars" aria-hidden="true">▥</span>
          <span>{t("modal.jailAttempt", {
            attempt: Math.min(state.players[state.currentPlayerIndex]?.jailTurns ?? 0, state.settings.maxJailTurns),
            maximum: state.settings.maxJailTurns,
          })}</span>
        </div>
      ) : null}

      {state.phase === "gameOver" ? (
        <Modal key="winner" label={t("modal.gameWinner")}>
          <div className="winner-overlay">
            <motion.div
              className="winner-trophy"
              initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 18, rotate: -12, scale: 0.7 }}
              animate={{ opacity: 1, y: 0, rotate: 0, scale: 1 }}
            >🏆</motion.div>
            <span className="eyebrow">{t("modal.champion")}</span>
            <h2>{state.players.find((player) => player.id === state.winnerId)?.name ?? t("modal.winner")}</h2>
            <p>{t("modal.winnerMessage")}</p>
          </div>
        </Modal>
      ) : null}
    </AnimatePresence>
  );
}

function Modal({ children, label }: { children: React.ReactNode; label: string }) {
  const motionLevel = useMotionLevel();
  const reducedMotion = motionLevel !== "full";
  const motionOff = motionLevel === "off";
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    const focusable = () => dialog?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    focusable()?.[0]?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab" || !dialog) return;
      const items = [...(focusable() ?? [])];
      if (items.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previousFocus?.focus();
    };
  }, []);
  return (
    <motion.div
      className="modal-scrim"
      initial={motionOff ? false : { opacity: 0 }}
      animate={{ opacity: 1, pointerEvents: "auto" }}
      exit={motionOff ? undefined : { opacity: 0, pointerEvents: "none" }}
      transition={{ duration: motionOff ? 0 : reducedMotion ? 0.01 : MOTION_MS.button / 1000 }}
      role="dialog"
      aria-modal="true"
      aria-label={label}
      tabIndex={-1}
      ref={dialogRef}
    >
      <motion.section
        className="gameplay-modal"
        initial={motionOff ? false : reducedMotion ? { opacity: 0 } : { opacity: 0, y: 18, scale: 0.96 }}
        animate={reducedMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
        exit={motionOff ? undefined : reducedMotion ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.98 }}
        transition={motionOff ? { duration: 0 } : reducedMotion ? { duration: MOTION_MS.reduced / 1000 } : MOTION_SPRING.modal}
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
  const { t, i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? "en";
  const groupColor = tile.type === "property" ? GROUP_COLORS[tile.colorGroup] : "#53b6a8";
  return (
    <article className={`property-card ${compact ? "property-card-compact" : ""}`} style={{ "--property-color": groupColor } as React.CSSProperties}>
      <div className="property-card-band" />
      <div className="property-card-content">
        <span className="eyebrow">{localizedName(state.theme, language)} · {t("modal.businessAsset")}</span>
        <h2>{("icon" in tile ? `${tile.icon} ` : "") + localizedName(tile, language)}</h2>
        {"price" in tile ? <strong className="property-price">{currency(tile.price, state, language)}</strong> : null}
        {tile.type === "property" ? (
          <dl className="rent-table">
            <div><dt>{t("game.baseRent")}</dt><dd>{currency(tile.rent.base, state, language)}</dd></div>
            <div><dt>{t("modal.fullColorGroup")}</dt><dd>{currency(tile.rent.colorSetDouble, state, language)}</dd></div>
            {tile.rent.houses.map((rent, index) => (
              <div key={index}><dt>{index + 1} {index === 0 ? t("game.house") : t("game.houses")}</dt><dd>{currency(rent, state, language)}</dd></div>
            ))}
            <div><dt>{t("game.hotel")}</dt><dd>{currency(tile.rent.hotel, state, language)}</dd></div>
            {!compact ? <div><dt>{t("modal.mortgageValue")}</dt><dd>{currency(tile.mortgageValue, state, language)}</dd></div> : null}
          </dl>
        ) : tile.type === "transport" ? (
          <dl className="rent-table">
            {tile.rentByCount.map((rent, index) => (
              <div key={index}><dt>{index + 1} {index ? t("game.transportAssets") : t("game.transportAsset")}</dt><dd>{currency(rent, state, language)}</dd></div>
            ))}
            {!compact ? <div><dt>{t("modal.mortgageValue")}</dt><dd>{currency(tile.mortgageValue, state, language)}</dd></div> : null}
          </dl>
        ) : tile.type === "utility" ? (
          <dl className="rent-table">
            <div><dt>{t("game.oneUtility")}</dt><dd>{tile.diceMultipliers[0]}× dice</dd></div>
            <div><dt>{t("game.bothUtilities")}</dt><dd>{tile.diceMultipliers[1]}× dice</dd></div>
            {!compact ? <div><dt>{t("modal.mortgageValue")}</dt><dd>{currency(tile.mortgageValue, state, language)}</dd></div> : null}
          </dl>
        ) : null}
        {"businessFact" in tile && !compact ? <p className="business-fact">{language.startsWith("ta") ? tile.fact_ta ?? tile.businessFact : tile.businessFact}</p> : null}
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

function effectLabel(type: string, t: ReturnType<typeof useTranslation>["t"]): string {
  if (type === "move" || type === "moveRelative") return t("modal.effectMove");
  if (type === "pay") return t("modal.effectPay");
  if (type === "collect") return t("modal.effectCollect");
  if (type === "jail") return t("modal.effectJail");
  if (type === "getOutOfJailFree") return t("modal.effectRelease");
  if (type === "repair") return t("modal.effectRepair");
  return t("modal.effectTablePayment");
}

function currency(amount: number, state: GameState, language: string) {
  return formatMoney(amount, state.theme.currency, language);
}
