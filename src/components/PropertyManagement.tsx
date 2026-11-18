import { AnimatePresence, motion } from "framer-motion";
import { useRef } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { calculateRent, getAvailableActions, getBuildingSupply, getManagementActionReason } from "../engine/gameReducer";
import type { ManagementActionType } from "../engine/gameReducer";
import type { GameAction, GameState, Player } from "../engine/types";
import type { CSSProperties } from "react";
import { localizedName } from "../i18n/themeText";
import { formatMoney as formatThemeMoney } from "../themes/formatMoney";
import { useDialogFocus } from "./useDialogFocus";
import { useMotionLevel } from "../ui/useMotionLevel";
import { MOTION_MS, MOTION_SPRING } from "../ui/motion";

interface PropertyManagementProps {
  state: GameState;
  player: Player;
  onAction: (action: GameAction, sound?: "build" | "coin" | "click") => void;
  onClose: () => void;
}

export function PropertyManagement({
  state,
  player,
  onAction,
  onClose,
}: PropertyManagementProps) {
  const { t, i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? "en";
  const motionLevel = useMotionLevel();
  const reducedMotion = motionLevel !== "full";
  const motionOff = motionLevel === "off";
  const dialogRef = useRef<HTMLElement>(null);
  useDialogFocus(dialogRef, true);
  const actions = getAvailableActions(state);
  const supply = getBuildingSupply(state);
  const assets = Object.keys(player.properties)
    .map((id) => state.theme.tiles.find((tile) => tile.id === id))
    .filter((tile): tile is NonNullable<typeof tile> => tile !== undefined);
  const propertyGroups = new Map<string, typeof assets>();
  const otherAssets: typeof assets = [];
  for (const tile of assets) {
    if (tile.type === "property") {
      const group = propertyGroups.get(tile.colorGroup) ?? [];
      group.push(tile);
      propertyGroups.set(tile.colorGroup, group);
    } else {
      otherAssets.push(tile);
    }
  }

  const isAvailable = (type: ManagementActionType, tileId: string) =>
    actions.some((action) => action.type === type && "tileId" in action && action.tileId === tileId);
  const renderAsset = (tile: (typeof assets)[number]) => {
    const holding = player.properties[tile.id];
    if (!holding) return null;
    const buildType: ManagementActionType = holding.level === 4 ? "BUILD_HOTEL" : "BUILD_HOUSE";
    const buildReason = getManagementActionReason(state, player.id, tile.id, buildType);
    const sellReason = getManagementActionReason(state, player.id, tile.id, "SELL_BUILDING");
    const mortgageType: ManagementActionType = holding.mortgaged ? "UNMORTGAGE" : "MORTGAGE";
    const mortgageReason = getManagementActionReason(state, player.id, tile.id, mortgageType);
    const rentNow = calculateRent(state, tile.id, player.id);
    const nextRent = tile.type === "property" && holding.level < 5
      ? holding.level < 4
        ? tile.rent.houses[holding.level]
        : tile.rent.hotel
      : null;
    const buildAction: GameAction = { type: buildType, tileId: tile.id };
    const sellAction: GameAction = { type: "SELL_BUILDING", tileId: tile.id };
    const mortgageAction: GameAction = { type: mortgageType, tileId: tile.id };

    return (
      <article className={`management-asset ${holding.mortgaged ? "management-asset-mortgaged" : ""}`} key={tile.id}>
        <div className="management-asset-heading">
          <span className="management-color-dot" style={{ "--group-color": tile.type === "property" ? GROUP_COLORS[tile.colorGroup] : "#64748b" } as CSSProperties} />
          <div className="management-asset-name">
            <strong>{localizedName(tile, language)}</strong>
            <span>
            {holding.level === 5 ? t("management.hotel") : holding.level > 0 ? t("management.houseCount", { count: holding.level }) : t("management.noBuildings")}
            {holding.mortgaged ? ` · ${t("game.mortgaged")}` : ""}
            </span>
          </div>
          {holding.mortgaged ? <span className="mortgaged-stamp">{t("game.mortgaged")}</span> : null}
        </div>
        <div className="management-rents">
          <span>{t("management.rentNow")} <b>{formatMoney(rentNow, state, language)}</b></span>
          {nextRent !== null ? <span>{t("management.nextBuild")} <b>{formatMoney(nextRent, state, language)}</b></span> : null}
        </div>
        <div className="management-actions">
          <ActionButton
            label={holding.level === 4 ? t("management.buildHotel") : t("management.build")}
            action={buildAction}
            disabled={!isAvailable(buildType, tile.id)}
            reason={localizeManagementReason(buildReason, t)}
            sound="build"
            onAction={onAction}
          />
          <ActionButton
            label={t("management.sellBuilding")}
            action={sellAction}
            disabled={!isAvailable("SELL_BUILDING", tile.id)}
            reason={localizeManagementReason(sellReason, t)}
            sound="coin"
            onAction={onAction}
          />
          <ActionButton
            label={holding.mortgaged ? t("management.unmortgage") : t("management.mortgage")}
            action={mortgageAction}
            disabled={!isAvailable(mortgageType, tile.id)}
            reason={localizeManagementReason(mortgageReason, t)}
            sound={holding.mortgaged ? "coin" : undefined}
            onAction={onAction}
          />
        </div>
      </article>
    );
  };

  return (
    <AnimatePresence>
      <motion.div
        className="management-scrim"
        initial={motionOff ? false : { opacity: 0 }}
        animate={{ opacity: 1, pointerEvents: "auto" }}
        exit={motionOff ? undefined : { opacity: 0, pointerEvents: "none" }}
        transition={{ duration: motionOff ? 0 : reducedMotion ? 0.01 : MOTION_MS.button / 1000 }}
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) onClose();
        }}
      >
        <motion.section
          ref={dialogRef}
          tabIndex={-1}
          className="management-drawer"
          role="dialog"
          aria-modal="true"
          aria-labelledby="management-title"
          initial={motionOff ? false : reducedMotion ? { opacity: 0 } : { opacity: 0, x: 32 }}
          animate={reducedMotion ? { opacity: 1 } : { opacity: 1, x: 0 }}
          exit={motionOff ? undefined : reducedMotion ? { opacity: 0 } : { opacity: 0, x: 32 }}
          transition={motionOff ? { duration: 0 } : reducedMotion ? { duration: MOTION_MS.reduced / 1000 } : MOTION_SPRING.modal}
        >
          <header className="management-header">
            <div>
              <span className="eyebrow">{t("management.portfolio")}</span>
              <h2 id="management-title">{t("management.assetsTitle", { name: player.name })}</h2>
              <p>{t("management.cashAvailable", { amount: formatMoney(player.cash, state, language) })}</p>
            </div>
            <button type="button" className="popover-close" onClick={onClose} aria-label={t("management.close")}>×</button>
          </header>
          <div className="building-supply" aria-label={t("management.bankSupply")}>
            <span>🏠 {t("management.housesRemaining", { count: supply.houses })}</span>
            <span>🏨 {t("management.hotelsRemaining", { count: supply.hotels })}</span>
          </div>
          <div className="management-content">
            {propertyGroups.size === 0 && otherAssets.length === 0 ? (
              <p className="empty-portfolio">{t("management.empty")}</p>
            ) : null}
            {[...propertyGroups.entries()].map(([groupName, groupTiles]) => (
              <section className="management-group" key={groupName}>
                <h3><span style={{ "--group-color": GROUP_COLORS[groupName] ?? "#64748b" } as CSSProperties} />{t(`trade.color.${groupName}`)}</h3>
                {groupTiles.map(renderAsset)}
              </section>
            ))}
            {otherAssets.length > 0 ? (
              <section className="management-group">
                <h3>{t("management.otherAssets")}</h3>
                {otherAssets.map(renderAsset)}
              </section>
            ) : null}
          </div>
        </motion.section>
      </motion.div>
    </AnimatePresence>
  );
}

function ActionButton({
  label,
  action,
  disabled,
  reason,
  sound,
  onAction,
}: {
  label: string;
  action: GameAction;
  disabled: boolean;
  reason: string | null;
  sound?: "build" | "coin";
  onAction: PropertyManagementProps["onAction"];
}) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      className="management-action"
      disabled={disabled}
      title={disabled ? reason ?? t("management.unavailable") : label}
      aria-label={disabled ? `${label}: ${reason ?? t("management.notAvailable")}` : label}
      onClick={() => onAction(action, sound)}
    >
      {label}
    </button>
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

function formatMoney(amount: number, state: GameState, language: string) {
  return formatThemeMoney(amount, state.theme.currency, language);
}

function localizeManagementReason(reason: string | null, t: TFunction): string | null {
  if (!reason) return null;
  const keys: Record<string, string> = {
    "This asset cannot be managed.": "reasonCannotManage",
    "This player does not own this asset.": "reasonNotOwned",
    "Only the active player can manage assets.": "reasonInactive",
    "This asset is already mortgaged.": "reasonAlreadyMortgaged",
    "Sell all buildings in the colour set first.": "reasonSellSetBuildings",
    "This asset is not mortgaged.": "reasonNotMortgaged",
    "Not enough cash to pay the 10% interest.": "reasonInterest",
    "Only properties can have buildings.": "reasonPropertyOnly",
    "There are no buildings to sell.": "reasonNoBuildings",
    "Sell buildings evenly across the set.": "reasonSellEvenly",
    "The bank needs four houses before a hotel can be sold.": "reasonHotelSupply",
    "Need the full colour set.": "reasonFullSet",
    "Unmortgage the colour set before building.": "reasonUnmortgageSet",
    "Unmortgage this property before building.": "reasonUnmortgageProperty",
    "Not enough cash to build.": "reasonBuildCash",
    "Build a hotel after four houses.": "reasonBuildHotel",
    "Build evenly across the set.": "reasonBuildEvenly",
    "No houses left in the bank.": "reasonHouseSupply",
    "Every property needs four houses before a hotel.": "reasonFourHouses",
    "This property needs four houses before a hotel.": "reasonPropertyFourHouses",
    "No hotels left in the bank.": "reasonNoHotels",
  };
  const key = keys[reason];
  return key ? t(`management.${key}`) : reason;
}
