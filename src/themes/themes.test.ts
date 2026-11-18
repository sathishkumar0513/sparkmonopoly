import { describe, expect, it } from "vitest";
import { formatMoney } from "./formatMoney";
import { validateTheme } from "./themeSchema";
import international from "./international.json";
import india from "./india.json";
import tamilnadu from "./tamilnadu.json";

const themes = [international, india, tamilnadu].map(validateTheme);

describe("built-in themes", () => {
  it("validates every theme with matching tile and card counts", () => {
    expect(themes.map((theme) => theme.id)).toEqual(["international", "india", "tamilnadu"]);
    for (const theme of themes) {
      expect(theme.tiles).toHaveLength(40);
      expect(theme.tiles.filter((tile) => tile.type === "property")).toHaveLength(22);
      expect(theme.tiles.filter((tile) => tile.type === "transport")).toHaveLength(4);
      expect(theme.tiles.filter((tile) => tile.type === "utility")).toHaveLength(2);
      expect(theme.cards.chance).toHaveLength(16);
      expect(theme.cards.communityChest).toHaveLength(16);
    }
    expect(themes[1]?.tiles.map((tile) => tile.type)).toEqual(
      themes[0]?.tiles.map((tile) => tile.type),
    );
    expect(themes[2]?.tiles.map((tile) => tile.type)).toEqual(
      themes[0]?.tiles.map((tile) => tile.type),
    );
    const economy = (theme: (typeof themes)[number]) =>
      theme.tiles.map((tile) => ({
        type: tile.type,
        ...("colorGroup" in tile ? { colorGroup: tile.colorGroup } : {}),
        ...("price" in tile ? { price: tile.price, mortgageValue: tile.mortgageValue } : {}),
        ...("salary" in tile ? { salary: tile.salary } : {}),
        ...("amount" in tile ? { amount: tile.amount } : {}),
        ...("houseCost" in tile ? { houseCost: tile.houseCost, rent: tile.rent } : {}),
        ...("rentByCount" in tile ? { rentByCount: tile.rentByCount } : {}),
        ...("diceMultipliers" in tile ? { diceMultipliers: tile.diceMultipliers } : {}),
      }));
    expect(economy(themes[1]!)).toEqual(economy(themes[0]!));
    expect(economy(themes[2]!)).toEqual(economy(themes[0]!));
    expect(themes[1]?.cards.chance.map((card) => card.effect)).toEqual(
      themes[0]?.cards.chance.map((card) => card.effect),
    );
    expect(themes[1]?.cards.communityChest.map((card) => card.effect)).toEqual(
      themes[0]?.cards.communityChest.map((card) => card.effect),
    );
    expect(themes[2]?.cards.chance.map((card) => card.effect)).toEqual(
      themes[0]?.cards.chance.map((card) => card.effect),
    );
    expect(themes[2]?.cards.communityChest.map((card) => card.effect)).toEqual(
      themes[0]?.cards.communityChest.map((card) => card.effect),
    );
  });

  it("provides Tamil names and localized card text for the Tamil Nadu edition", () => {
    const theme = themes[2];
    expect(theme?.name_ta).toBe("தமிழ்நாடு");
    expect(theme?.tiles.filter((tile) => tile.type === "property" && tile.name_ta)).toHaveLength(22);
    expect(theme?.cards.chance.every((card) => Boolean(card.text_ta))).toBe(true);
    expect(theme?.cards.communityChest.every((card) => Boolean(card.text_ta))).toBe(true);
  });
});

describe("theme money formatting", () => {
  const rupees = themes[1]!.currency;

  it("uses lakh and crore abbreviations at the Indian grouping thresholds", () => {
    expect(formatMoney(150_000, rupees, "en")).toBe("₹1.5L");
    expect(formatMoney(100_000, rupees, "en")).toBe("₹1L");
    expect(formatMoney(20_000_000, rupees, "en")).toBe("₹2Cr");
    expect(formatMoney(10_000_000, rupees, "en")).toBe("₹1Cr");
    expect(formatMoney(10_000, rupees, "en")).toBe("₹10K");
    expect(formatMoney(-150_000, rupees, "en")).toBe("−₹1.5L");
  });
});
