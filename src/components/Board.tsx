import { memo, useMemo } from "react";
import { motion } from "framer-motion";
import type { CSSProperties } from "react";
import type { GameState } from "../engine/types";
import type { Tile } from "../themes/themeSchema";
import { selectTileOwner } from "../store/gameStore";
import { tileGridPosition } from "./boardLayout";

const TOKEN_DESIGNS = ["🚗", "🎩", "🚢", "🐕", "🚀", "🦊"];
const PLAYER_COLORS = ["#ff806d", "#55c8a7", "#bd91ff", "#ffcb68", "#63b4ff", "#ff82bb"];

interface BoardProps {
  state: GameState;
  visualPositions: Record<string, number>;
  goFlash: boolean;
  selectedTileId: string | null;
  onSelectTile: (tileId: string) => void;
  motionDisabled: boolean;
  jailReleased: boolean;
}

interface TileCardProps {
  tile: Tile;
  index: number;
  ownerName: string | null;
  ownerIndex: number;
  level: number;
  mortgaged: boolean;
  selected: boolean;
  tokens: { id: string; name: string; icon: string; color: string; jailed: boolean }[];
  currency: GameState["theme"]["currency"];
  motionDisabled: boolean;
  goFlash: boolean;
  jailBars: boolean;
  jailReleased: boolean;
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
}: BoardProps) {
  const tokenKey = state.players
    .map((player) => `${player.id}:${player.position}:${player.bankrupt}`)
    .join("|");
  const tokensByTile = useMemo(() => {
    const result = new Map<number, { id: string; name: string; icon: string; color: string; jailed: boolean }[]>();
    state.players.forEach((player, index) => {
      if (player.bankrupt) return;
      const position = visualPositions[player.id] ?? player.position;
      const tokens = result.get(position) ?? [];
      tokens.push({
        id: player.id,
        name: player.name,
        icon: TOKEN_DESIGNS[index % TOKEN_DESIGNS.length],
        color: PLAYER_COLORS[index % PLAYER_COLORS.length],
        jailed:
          player.id === state.players[state.currentPlayerIndex]?.id &&
          state.phase === "jail",
      });
      result.set(position, tokens);
    });
    return result;
  }, [state.currentPlayerIndex, state.phase, tokenKey, visualPositions]);

  return (
    <div className={`board-frame ${state.phase === "roll" ? "board-frame-active" : ""}`}>
      <div
        className="board-grid"
        role="grid"
        aria-label={`${state.theme.name} 40-space business board`}
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
              level={holding?.level ?? 0}
              mortgaged={holding?.mortgaged ?? false}
              selected={selectedTileId === tile.id}
              tokens={tokensByTile.get(index) ?? EMPTY_TOKENS}
              currency={state.theme.currency}
              motionDisabled={motionDisabled}
              goFlash={tile.type === "go" && goFlash}
              jailBars={tile.type === "jail" && state.phase === "jail"}
              jailReleased={tile.type === "jail" && jailReleased}
              onSelect={onSelectTile}
            />
          );
        })}
        <section className="board-centre">
          <div className="centre-orbit" aria-hidden="true">✦</div>
          <span className="eyebrow">{state.theme.name} edition</span>
          <h2>Make your<br />next big move.</h2>
          <p>Build smart. Grow together.</p>
          <div className="centre-stats">
            <span><strong>40</strong> opportunities</span>
            <span><strong>{state.players.filter((player) => !player.bankrupt).length}</strong> founders</span>
          </div>
          <span className="centre-watermark">BT</span>
        </section>
      </div>
      <span className="board-caption">Tap any space to inspect its details</span>
      {motionDisabled ? <span className="sr-only">Reduced motion is enabled.</span> : null}
    </div>
  );
}

const EMPTY_TOKENS: TileCardProps["tokens"] = [];

const MemoTileCard = memo(function TileCard({
  tile,
  index,
  ownerName,
  ownerIndex,
  level,
  mortgaged,
  selected,
  tokens,
  currency,
  motionDisabled,
  goFlash,
  jailBars,
  jailReleased,
  onSelect,
}: TileCardProps) {
  const position = tileGridPosition(index);
  const corner = tile.type === "go" || tile.type === "jail" || tile.type === "freeParking" || tile.type === "goToJail";
  const groupColor = tile.type === "property" ? GROUP_COLORS[tile.colorGroup] : undefined;
  const price = "price" in tile ? tile.price : null;
  const unitCount = level === 5 ? 1 : level;

  return (
    <motion.button
      type="button"
      role="gridcell"
      className={`board-tile tile-${position.side} ${corner ? "tile-corner" : ""} ${selected ? "tile-selected" : ""} ${mortgaged ? "tile-mortgaged" : ""} ${goFlash ? "tile-go-flash" : ""}`}
      style={{
        gridRow: position.row,
        gridColumn: position.column,
        "--group-color": groupColor ?? "transparent",
        "--owner-color": ownerIndex >= 0 ? PLAYER_COLORS[ownerIndex % PLAYER_COLORS.length] : "transparent",
      } as CSSProperties}
      onClick={() => onSelect(tile.id)}
      aria-label={`${tile.name}${price === null ? "" : `, price ${formatPrice(price, currency)}`}${ownerName ? `, owned by ${ownerName}` : ""}`}
      aria-pressed={selected}
      whileHover={motionDisabled ? undefined : { y: -3, scale: 1.035 }}
      whileTap={motionDisabled ? undefined : { scale: 0.97 }}
      transition={{ duration: 0.15 }}
    >
      {tile.type === "property" ? <span className="tile-color-band" /> : null}
      {jailBars || jailReleased ? (
        <span
          className={`jail-bars-overlay ${jailBars ? "jail-bars-closed" : "jail-bars-opening"}`}
          aria-hidden="true"
        />
      ) : null}
      {goFlash && tile.type === "go" ? (
        <span className="go-salary-pop" aria-label="Salary collected">+${tile.salary}</span>
      ) : null}
      {ownerName ? <span className="owner-flag" title={`Owned by ${ownerName}`} /> : null}
      {mortgaged ? <span className="mortgage-mark" aria-label="Mortgaged">M</span> : null}
      <span className={`tile-content ${position.side !== "corner" ? `tile-content-${position.side}` : ""}`}>
        <span className="tile-icon" aria-hidden="true">
          {"icon" in tile ? tile.icon : corner ? cornerIcon(tile.type) : tile.type === "chance" ? "✨" : tile.type === "communityChest" ? "🎁" : tile.type === "incomeTax" || tile.type === "luxuryTax" ? "🧾" : "•"}
        </span>
        <span className="tile-name">{tile.name}</span>
        {price !== null ? <span className="tile-price">{formatPrice(price, currency)}</span> : null}
      </span>
      {unitCount > 0 ? (
        <span className={`building-markers ${level === 5 ? "hotel-marker" : ""}`} aria-label={level === 5 ? "Hotel" : `${level} houses`}>
          {level === 5 ? "🏨" : Array.from({ length: unitCount }, (_, marker) => <i key={marker} />)}
        </span>
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
              aria-label={`${token.name}'s token`}
              layout
              layoutId={`player-token-${token.id}`}
              animate={
                motionDisabled
                  ? { opacity: 1 }
                  : token.jailed
                    ? { x: [0, -2, 2, -2, 0], rotate: [0, -2, 2, -2, 0] }
                    : tokenIndex === 0
                    ? { y: [0, -4, 0], scaleY: [1, 0.88, 1.08] }
                    : { y: [0, -2, 0] }
              }
              transition={{
                duration: motionDisabled ? 0.01 : token.jailed ? 0.45 : 0.42,
                repeat: motionDisabled ? 0 : token.jailed ? Infinity : 1,
                ease: "easeOut",
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
) {
  const formatted = price.toLocaleString("en-US");
  return currency.format === "before"
    ? `${currency.symbol}${formatted}`
    : `${formatted}${currency.symbol}`;
}
