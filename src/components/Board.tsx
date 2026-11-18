import { memo, useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { CSSProperties, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { GameState } from "../engine/types";
import type { Tile } from "../themes/themeSchema";
import { formatMoney } from "../themes/formatMoney";
import { localizedName } from "../i18n/themeText";
import { selectTileOwner } from "../store/gameStore";
import { MOTION_EASE, MOTION_MS, MOTION_SPRING } from "../ui/motion";
import { tileGridPosition } from "./boardLayout";

const TOKEN_DESIGNS = ["🚗", "🎩", "🚢", "🐕", "🚀", "🦊"];
const PLAYER_COLORS = ["#ff806d", "#55c8a7", "#bd91ff", "#ffcb68", "#63b4ff", "#ff82bb"];
const GROUP_MARKS = ["brown", "lightBlue", "pink", "orange", "red", "yellow", "green", "darkBlue"];

interface BoardProps {
  state: GameState;
  visualPositions: Record<string, number>;
  goFlash: boolean;
  selectedTileId: string | null;
  onSelectTile: (tileId: string) => void;
  motionDisabled: boolean;
  jailReleased: boolean;
  centerContent: ReactNode;
  landedTileIndex: number | null;
  idleActiveToken: boolean;
  cameraFollow: boolean;
}

interface TileCardProps {
  tile: Tile;
  index: number;
  ownerName: string | null;
  ownerIndex: number;
  groupMark: number;
  level: number;
  mortgaged: boolean;
  selected: boolean;
  tokens: { id: string; name: string; icon: string; color: string; jailed: boolean; idle: boolean }[];
  currency: GameState["theme"]["currency"];
  language: string;
  motionDisabled: boolean;
  goFlash: boolean;
  jailBars: boolean;
  jailReleased: boolean;
  landed: boolean;
  onSelect: (tileId: string) => void;
}

export function Board({
  state,
  visualPositions,
  goFlash,
  selectedTileId,
  onSelectTile,
  motionDisabled,
  jailReleased,
  centerContent,
  landedTileIndex,
  idleActiveToken,
  cameraFollow,
}: BoardProps) {
  const { t, i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? "en";
  const tokenKey = state.players
    .map((player) => `${player.id}:${player.position}:${player.bankrupt}`)
    .join("|");
  const tokensByTile = useMemo(() => {
    const activePlayerId = state.auction?.activePlayerId ?? state.players[state.currentPlayerIndex]?.id;
    const result = new Map<number, { id: string; name: string; icon: string; color: string; jailed: boolean; idle: boolean }[]>();
    state.players.forEach((player, index) => {
      if (player.bankrupt) return;
      const position = visualPositions[player.id] ?? player.position;
      const tokens = result.get(position) ?? [];
      tokens.push({
        id: player.id,
        name: player.name,
        icon: player.token ?? TOKEN_DESIGNS[index % TOKEN_DESIGNS.length],
        color: player.color ?? PLAYER_COLORS[index % PLAYER_COLORS.length],
        jailed:
          player.id === state.players[state.currentPlayerIndex]?.id &&
          state.phase === "jail",
        idle: player.id === activePlayerId && idleActiveToken,
      });
      result.set(position, tokens);
    });
    return result;
  }, [idleActiveToken, state.auction?.activePlayerId, state.currentPlayerIndex, state.phase, tokenKey, visualPositions]);
  const activePlayerId = state.auction?.activePlayerId ?? state.players[state.currentPlayerIndex]?.id;
  const activePlayer = state.players.find((player) => player.id === activePlayerId);
  const activePosition = activePlayer
    ? visualPositions[activePlayer.id] ?? activePlayer.position
    : 0;
  const cameraTile = tileGridPosition(activePosition);

  return (
    <div
      className={`board-frame ${state.phase === "roll" ? "board-frame-active" : ""}`}
      data-camera-follow={cameraFollow || undefined}
      style={{
        "--camera-x": `${(6 - cameraTile.column) * 2.5}px`,
        "--camera-y": `${(6 - cameraTile.row) * 2.5}px`,
      } as CSSProperties}
    >
      <div
        className="board-grid"
        role="grid"
        aria-label={t("game.boardTitle", { theme: localizedName(state.theme, language) })}
        style={{
          "--board-primary": state.theme.palette.primary,
          "--board-secondary": state.theme.palette.secondary,
          "--board-accent": state.theme.palette.accent,
        } as CSSProperties}
      >
        {state.theme.tiles.map((tile, index) => {
          const owner = selectTileOwner(state, tile.id);
          const ownerIndex = owner ? state.players.indexOf(owner) : -1;
          const holding = owner?.properties[tile.id];
          return (
            <MemoTileCard
              key={tile.id}
              tile={tile}
              index={index}
              ownerName={owner?.name ?? null}
              ownerIndex={ownerIndex}
              groupMark={tile.type === "property" ? GROUP_MARKS.indexOf(tile.colorGroup) + 1 : 0}
              level={holding?.level ?? 0}
              mortgaged={holding?.mortgaged ?? false}
              selected={selectedTileId === tile.id}
              tokens={tokensByTile.get(index) ?? EMPTY_TOKENS}
              currency={state.theme.currency}
              language={language}
              motionDisabled={motionDisabled}
              goFlash={tile.type === "go" && goFlash}
              jailBars={tile.type === "jail" && state.phase === "jail"}
              jailReleased={tile.type === "jail" && jailReleased}
              landed={landedTileIndex === index}
              onSelect={onSelectTile}
            />
          );
        })}
        <section className="board-centre board-centre-controls">
          {centerContent}
        </section>
      </div>
      <span className="board-caption">{t("game.inspectSpace")}</span>
      {motionDisabled ? <span className="sr-only">{t("game.reducedMotion")}</span> : null}
    </div>
  );
}

const EMPTY_TOKENS: TileCardProps["tokens"] = [];

const MemoTileCard = memo(function TileCard({
  tile,
  index,
  ownerName,
  ownerIndex,
  groupMark,
  level,
  mortgaged,
  selected,
  tokens,
  currency,
  language,
  motionDisabled,
  goFlash,
  jailBars,
  jailReleased,
  landed,
  onSelect,
}: TileCardProps) {
  const { t } = useTranslation();
  const position = tileGridPosition(index);
  const corner = tile.type === "go" || tile.type === "jail" || tile.type === "freeParking" || tile.type === "goToJail";
  const groupColor = tile.type === "property" ? GROUP_COLORS[tile.colorGroup] : undefined;
  const price = "price" in tile ? tile.price : null;
  const unitCount = level === 5 ? 1 : level;

  return (
    <motion.button
      type="button"
      role="gridcell"
      className={`board-tile tile-${position.side} ${corner ? "tile-corner" : ""} ${selected ? "tile-selected" : ""} ${mortgaged ? "tile-mortgaged" : ""} ${goFlash ? "tile-go-flash" : ""} ${landed ? "tile-landed" : ""}`}
      data-group-mark={groupMark || undefined}
      style={{
        gridRow: position.row,
        gridColumn: position.column,
        "--group-color": groupColor ?? "transparent",
        "--owner-color": ownerIndex >= 0 ? PLAYER_COLORS[ownerIndex % PLAYER_COLORS.length] : "transparent",
      } as CSSProperties}
      onClick={() => onSelect(tile.id)}
      aria-label={`${localizedName(tile, language)}${price === null ? "" : `, ${formatPrice(price, currency, language)}`}${ownerName ? `, ${t("game.ownedBy", { name: ownerName })}` : ""}${level > 0 ? `, ${level === 5 ? t("game.hotel") : t("game.housesCount", { count: level })}` : ""}${mortgaged ? `, ${t("game.mortgaged")}` : ""}`}
      aria-pressed={selected}
      whileHover={motionDisabled ? undefined : { y: -3, scale: 1.035 }}
      whileTap={motionDisabled ? undefined : { scale: 0.97 }}
      transition={{ duration: MOTION_MS.tile / 1000, ease: [...MOTION_EASE.standard] }}
    >
      {tile.type === "property" ? <span className="tile-color-band" /> : null}
      {jailBars || jailReleased ? (
        <span
          className={`jail-bars-overlay ${jailBars ? "jail-bars-closed" : "jail-bars-opening"}`}
          aria-hidden="true"
        />
      ) : null}
      {goFlash && tile.type === "go" ? (
        <>
          <span className="go-salary-pop" aria-label={t("game.salaryCollected")}>+{formatPrice(tile.salary, currency, language)}</span>
          <span className="go-coin-shower" aria-hidden="true">
            {Array.from({ length: 7 }, (_, coin) => <i key={coin}>●</i>)}
          </span>
        </>
      ) : null}
      {landed ? <span className="tile-landing-sparkle" aria-hidden="true">✦</span> : null}
      {ownerName ? <span className="owner-flag" title={t("game.ownedBy", { name: ownerName })} aria-hidden="true">P{ownerIndex + 1}</span> : null}
      {mortgaged ? <span className="mortgage-mark" aria-label={t("game.mortgaged")}>M</span> : null}
      <span className={`tile-content ${position.side !== "corner" ? `tile-content-${position.side}` : ""}`}>
        <span className="tile-icon" aria-hidden="true">
          {"icon" in tile ? tile.icon : corner ? cornerIcon(tile.type) : tile.type === "chance" ? "✨" : tile.type === "communityChest" ? "🎁" : tile.type === "incomeTax" || tile.type === "luxuryTax" ? "🧾" : "•"}
        </span>
        <span className="tile-name">{localizedName(tile, language)}</span>
        {price !== null ? <span className="tile-price">{formatPrice(price, currency, language)}</span> : null}
      </span>
      {unitCount > 0 ? (
        <motion.span
          key={tile.id}
          className={`building-markers ${level === 5 ? "hotel-marker" : ""}`}
          aria-label={level === 5 ? t("game.hotel") : t("game.housesCount", { count: level })}
          initial={false}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={motionDisabled ? { duration: 0 } : MOTION_SPRING.pop}
        >
          <AnimatePresence>
            {level === 5 ? (
              <motion.span
                key="hotel"
                initial={motionDisabled ? false : { opacity: 0, scale: 0.45, y: 3 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={motionDisabled ? undefined : { opacity: 0, scale: 0.45, y: 3 }}
                transition={motionDisabled ? { duration: 0 } : MOTION_SPRING.pop}
                aria-hidden="true"
              >
                🏨
              </motion.span>
            ) : Array.from({ length: unitCount }, (_, marker) => (
              <motion.i
                key={`house-${marker}`}
                initial={motionDisabled ? false : { opacity: 0, scale: 0.45, y: 3 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={motionDisabled ? undefined : { opacity: 0, scale: 0.45, y: 3 }}
                transition={motionDisabled ? { duration: 0 } : MOTION_SPRING.pop}
                aria-hidden="true"
              />
            ))}
          </AnimatePresence>
        </motion.span>
      ) : null}
      {tokens.length > 0 ? (
        <span className="token-stack">
          {tokens.map((token, tokenIndex) => (
            <motion.span
              key={token.id}
              className="player-token"
              style={{
                "--token-color": token.color,
                "--token-offset-x": `${(tokenIndex % 3) * 7 - 7}px`,
                "--token-offset-y": `${Math.floor(tokenIndex / 3) * 8}px`,
              } as CSSProperties}
              title={token.name}
              aria-label={t("game.tokenOf", { name: token.name })}
              layout
              layoutId={`player-token-${token.id}`}
              animate={
                motionDisabled
                  ? { opacity: 1 }
                  : token.jailed
                    ? { x: [0, -2, 2, -2, 0], rotate: [0, -2, 2, -2, 0] }
                    : token.idle
                      ? { y: [0, -2, 0], scaleY: [1, 0.98, 1] }
                    : tokenIndex === 0
                    ? { y: [0, -4, 0], scaleY: [1, 0.88, 1.08] }
                    : { y: [0, -2, 0] }
              }
              transition={{
                duration: motionDisabled
                  ? 0
                  : token.jailed
                    ? MOTION_MS.jailShake / 1000
                    : token.idle
                      ? MOTION_MS.tokenIdle / 1000
                      : MOTION_MS.tokenHop / 1000,
                repeat: motionDisabled ? 0 : token.jailed || token.idle ? Infinity : 1,
                ease: [...MOTION_EASE.standard],
              }}
            >
              {token.icon}
            </motion.span>
          ))}
        </span>
      ) : null}
    </motion.button>
  );
});

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

function cornerIcon(type: Tile["type"]) {
  if (type === "go") return "🚀";
  if (type === "jail") return "🗂️";
  if (type === "freeParking") return "🅿️";
  if (type === "goToJail") return "⛔";
  return "✦";
}

function formatPrice(
  price: number,
  currency: GameState["theme"]["currency"],
  language: string,
) {
  return formatMoney(price, currency, language);
}
