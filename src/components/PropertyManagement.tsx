import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { calculateRent, getAvailableActions, getBuildingSupply, getManagementActionReason } from "../engine/gameReducer";
import type { ManagementActionType } from "../engine/gameReducer";
import type { GameAction, GameState, Player } from "../engine/types";
import type { CSSProperties } from "react";

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
  const reducedMotion = useReducedMotion();
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
            <strong>{tile.name}</strong>
            <span>
              {holding.level === 5 ? "Hotel" : holding.level > 0 ? `${holding.level} house${holding.level === 1 ? "" : "s"}` : "No buildings"}
              {holding.mortgaged ? " · Mortgaged" : ""}
            </span>
          </div>
          {holding.mortgaged ? <span className="mortgaged-stamp">Mortgaged</span> : null}
        </div>
        <div className="management-rents">
          <span>Rent now <b>{formatMoney(rentNow, state)}</b></span>
          {nextRent !== null ? <span>Next build <b>{formatMoney(nextRent, state)}</b></span> : null}
        </div>
        <div className="management-actions">
          <ActionButton
            label={holding.level === 4 ? "Build hotel" : "Build"}
            action={buildAction}
            disabled={!isAvailable(buildType, tile.id)}
            reason={buildReason}
            sound="build"
            onAction={onAction}
          />
          <ActionButton
            label="Sell building"
            action={sellAction}
            disabled={!isAvailable("SELL_BUILDING", tile.id)}
            reason={sellReason}
            sound="coin"
            onAction={onAction}
          />
          <ActionButton
            label={holding.mortgaged ? "Unmortgage" : "Mortgage"}
            action={mortgageAction}
            disabled={!isAvailable(mortgageType, tile.id)}
            reason={mortgageReason}
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
        initial={{ opacity: 0 }}
        animate={{ opacity: 1, pointerEvents: "auto" }}
        exit={{ opacity: 0, pointerEvents: "none" }}
        transition={{ duration: reducedMotion ? 0.01 : 0.18 }}
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) onClose();
        }}
      >
        <motion.section
          className="management-drawer"
          role="dialog"
          aria-modal="true"
          aria-labelledby="management-title"
          initial={reducedMotion ? { opacity: 0 } : { opacity: 0, x: 32 }}
          animate={reducedMotion ? { opacity: 1 } : { opacity: 1, x: 0 }}
          exit={reducedMotion ? { opacity: 0 } : { opacity: 0, x: 32 }}
        >
          <header className="management-header">
            <div>
              <span className="eyebrow">Portfolio management</span>
              <h2 id="management-title">{player.name}'s assets</h2>
              <p>{formatMoney(player.cash, state)} available</p>
            </div>
            <button type="button" className="popover-close" onClick={onClose} aria-label="Close property management">×</button>
          </header>
          <div className="building-supply" aria-label="Bank building supply">
            <span>🏠 {supply.houses} houses remaining</span>
            <span>🏨 {supply.hotels} hotels remaining</span>
          </div>
          <div className="management-content">
            {propertyGroups.size === 0 && otherAssets.length === 0 ? (
              <p className="empty-portfolio">No assets to manage yet. Land on an unowned space to grow your portfolio.</p>
            ) : null}
            {[...propertyGroups.entries()].map(([groupName, groupTiles]) => (
              <section className="management-group" key={groupName}>
                <h3><span style={{ "--group-color": GROUP_COLORS[groupName] ?? "#64748b" } as CSSProperties} />{groupName.replace(/([A-Z])/g, " $1")}</h3>
                {groupTiles.map(renderAsset)}
              </section>
            ))}
            {otherAssets.length > 0 ? (
              <section className="management-group">
                <h3>Other assets</h3>
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
  return (
    <button
      type="button"
      className="management-action"
      disabled={disabled}
      title={disabled ? reason ?? "This action is not available now." : label}
      aria-label={disabled ? `${label}: ${reason ?? "not available"}` : label}
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

function formatMoney(amount: number, state: GameState) {
  const formatted = amount.toLocaleString("en-US");
  return state.theme.currency.format === "before"
    ? `${state.theme.currency.symbol}${formatted}`
    : `${formatted}${state.theme.currency.symbol}`;
}
