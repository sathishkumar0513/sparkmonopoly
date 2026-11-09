export type BoardSide = "corner" | "bottom" | "left" | "top" | "right";

export interface BoardPosition {
  row: number;
  column: number;
  side: BoardSide;
}

export function tileGridPosition(index: number): BoardPosition {
  if (!Number.isInteger(index) || index < 0 || index >= 40) {
    throw new RangeError("Tile index must be an integer between 0 and 39.");
  }
  if (index === 0) return { row: 11, column: 11, side: "corner" };
  if (index < 10) return { row: 11, column: 11 - index, side: "bottom" };
  if (index === 10) return { row: 11, column: 1, side: "corner" };
  if (index < 20) return { row: 21 - index, column: 1, side: "left" };
  if (index === 20) return { row: 1, column: 1, side: "corner" };
  if (index < 30) return { row: 1, column: index - 19, side: "top" };
  if (index === 30) return { row: 1, column: 11, side: "corner" };
  return { row: index - 29, column: 11, side: "right" };
}

export function tilePath(from: number, to: number, boardSize = 40): number[] {
  if (
    !Number.isInteger(from) ||
    !Number.isInteger(to) ||
    !Number.isInteger(boardSize) ||
    boardSize <= 0 ||
    from < 0 ||
    to < 0 ||
    from >= boardSize ||
    to >= boardSize
  ) {
    throw new RangeError("Tile positions must be valid indexes on the board.");
  }
  const path: number[] = [];
  let position = from;
  while (position !== to) {
    position = (position + 1) % boardSize;
    path.push(position);
  }
  return path;
}
