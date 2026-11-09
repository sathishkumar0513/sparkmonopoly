import { describe, expect, it } from "vitest";
import { tileGridPosition, tilePath } from "./boardLayout";

describe("board layout", () => {
  it("places the four corners and connects all side positions", () => {
    expect(tileGridPosition(0)).toEqual({
      row: 11,
      column: 11,
      side: "corner",
    });
    expect(tileGridPosition(10)).toEqual({
      row: 11,
      column: 1,
      side: "corner",
    });
    expect(tileGridPosition(20)).toEqual({
      row: 1,
      column: 1,
      side: "corner",
    });
    expect(tileGridPosition(30)).toEqual({
      row: 1,
      column: 11,
      side: "corner",
    });
    expect(tileGridPosition(39)).toEqual({
      row: 10,
      column: 11,
      side: "right",
    });
  });

  it("returns forward movement paths including wrap-around", () => {
    expect(tilePath(37, 2)).toEqual([38, 39, 0, 1, 2]);
    expect(tilePath(5, 5)).toEqual([]);
    expect(tilePath(9, 12)).toEqual([10, 11, 12]);
  });
});
