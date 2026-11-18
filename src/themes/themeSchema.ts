export type ColorGroup =
  | "brown"
  | "lightBlue"
  | "pink"
  | "orange"
  | "red"
  | "yellow"
  | "green"
  | "darkBlue";

export type Tile =
  | { id: string; type: "go"; name: string; name_ta?: string; salary: number }
  | {
      id: string;
      type: "property";
      name: string;
      price: number;
      mortgageValue: number;
      rent: {
        base: number;
        colorSetDouble: number;
        houses: [number, number, number, number];
        hotel: number;
      };
      houseCost: number;
      colorGroup: ColorGroup;
      icon: string;
      businessFact: string;
      name_ta?: string;
      fact_ta?: string;
    }
  | {
      id: string;
      type: "transport";
      name: string;
      price: number;
      mortgageValue: number;
      rentByCount: [number, number, number, number];
      icon: string;
      businessFact: string;
      name_ta?: string;
      fact_ta?: string;
    }
  | {
      id: string;
      type: "utility";
      name: string;
      price: number;
      mortgageValue: number;
      diceMultipliers: [number, number];
      icon: string;
      businessFact: string;
      name_ta?: string;
      fact_ta?: string;
    }
  | { id: string; type: "communityChest" | "chance"; name: string; name_ta?: string }
  | { id: string; type: "incomeTax" | "luxuryTax"; name: string; amount: number; name_ta?: string }
  | { id: string; type: "jail" | "freeParking" | "goToJail"; name: string; name_ta?: string };

export type CardEffect =
  | { type: "move"; destination: number; collectSalaryOnPass: boolean }
  | { type: "moveRelative"; steps: number; collectSalaryOnPass: boolean }
  | { type: "pay" | "collect"; amount: number }
  | { type: "jail" | "getOutOfJailFree" }
  | { type: "repair"; houseCost: number; hotelCost: number }
  | { type: "payEachPlayer"; amount: number };

export interface ThemeCard {
  id: string;
  text: string;
  text_ta?: string;
  effect: CardEffect;
}

export interface Theme {
  id: string;
  name: string;
  name_ta?: string;
  description?: string;
  description_ta?: string;
  currency: {
    symbol: string;
    format: "before" | "after";
    shortScale: {
      thousand: string;
      million: string;
      billion: string;
      lakh?: string;
      crore?: string;
    };
  };
  palette: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
    surface: string;
    text: string;
  };
  backgroundStyle: string;
  tiles: Tile[];
  cards: {
    chance: ThemeCard[];
    communityChest: ThemeCard[];
  };
}

const colorGroups: ColorGroup[] = [
  "brown",
  "lightBlue",
  "pink",
  "orange",
  "red",
  "yellow",
  "green",
  "darkBlue",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function optionalStringIsValid(record: Record<string, unknown>, key: string): boolean {
  return !(key in record) || isString(record[key]);
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isNumberTuple<T extends number>(
  value: unknown,
  length: number,
): value is [T, ...T[]] {
  return (
    Array.isArray(value) &&
    value.length === length &&
    value.every((item) => isNumber(item))
  );
}

function validateTile(value: unknown): value is Tile {
  if (!isRecord(value) || !isString(value.id) || !isString(value.name)) {
    return false;
  }
  if (!optionalStringIsValid(value, "name_ta") || !optionalStringIsValid(value, "fact_ta")) {
    return false;
  }

  switch (value.type) {
    case "go":
      return isNumber(value.salary);
    case "property":
      return (
        isNumber(value.price) &&
        isNumber(value.mortgageValue) &&
        isNumber(value.houseCost) &&
        colorGroups.includes(value.colorGroup as ColorGroup) &&
        isString(value.icon) &&
        isString(value.businessFact) &&
        isRecord(value.rent) &&
        isNumber(value.rent.base) &&
        isNumber(value.rent.colorSetDouble) &&
        isNumberTuple(value.rent.houses, 4) &&
        isNumber(value.rent.hotel)
      );
    case "transport":
      return (
        isNumber(value.price) &&
        isNumber(value.mortgageValue) &&
        isNumberTuple(value.rentByCount, 4) &&
        isString(value.icon) &&
        isString(value.businessFact)
      );
    case "utility":
      return (
        isNumber(value.price) &&
        isNumber(value.mortgageValue) &&
        isNumberTuple(value.diceMultipliers, 2) &&
        isString(value.icon) &&
        isString(value.businessFact)
      );
    case "communityChest":
    case "chance":
    case "jail":
    case "freeParking":
    case "goToJail":
      return true;
    case "incomeTax":
    case "luxuryTax":
      return isNumber(value.amount);
    default:
      return false;
  }
}

function validateCard(value: unknown): value is ThemeCard {
  if (
    !isRecord(value) ||
    !isString(value.id) ||
    !isString(value.text) ||
    !optionalStringIsValid(value, "text_ta")
  ) {
    return false;
  }

  const effect = value.effect;
  if (!isRecord(effect) || !isString(effect.type)) return false;

  switch (effect.type) {
    case "move":
      return (
        Number.isInteger(effect.destination) &&
        (effect.destination as number) >= 0 &&
        typeof effect.collectSalaryOnPass === "boolean"
      );
    case "moveRelative":
      return (
        Number.isInteger(effect.steps) &&
        effect.steps !== 0 &&
        typeof effect.collectSalaryOnPass === "boolean"
      );
    case "pay":
    case "collect":
    case "payEachPlayer":
      return isNumber(effect.amount);
    case "jail":
    case "getOutOfJailFree":
      return true;
    case "repair":
      return isNumber(effect.houseCost) && isNumber(effect.hotelCost);
    default:
      return false;
  }
}

export function validateTheme(value: unknown): Theme {
  if (!isRecord(value)) throw new Error("Theme must be a JSON object.");
  if (!isString(value.id) || !isString(value.name)) {
    throw new Error("Theme must have a non-empty id and name.");
  }
  if (
    !optionalStringIsValid(value, "name_ta") ||
    !optionalStringIsValid(value, "description") ||
    !optionalStringIsValid(value, "description_ta")
  ) {
    throw new Error(`Theme "${value.id}" has invalid localized text.`);
  }

  const currency = value.currency;
  const palette = value.palette;
  const cards = value.cards;
  if (
    !isRecord(currency) ||
    !isString(currency.symbol) ||
    (currency.format !== "before" && currency.format !== "after") ||
    !isRecord(currency.shortScale) ||
    !isString(currency.shortScale.thousand) ||
    !isString(currency.shortScale.million) ||
    !isString(currency.shortScale.billion) ||
    !optionalStringIsValid(currency.shortScale, "lakh") ||
    !optionalStringIsValid(currency.shortScale, "crore")
  ) {
    throw new Error(`Theme "${value.id}" has an invalid currency format.`);
  }

  if (
    !isRecord(palette) ||
    !["primary", "secondary", "accent", "background", "surface", "text"].every(
      (key) => isString(palette[key]),
    ) ||
    !isString(value.backgroundStyle)
  ) {
    throw new Error(`Theme "${value.id}" has an invalid color palette.`);
  }

  if (!Array.isArray(value.tiles) || value.tiles.length !== 40) {
    throw new Error(`Theme "${value.id}" must define exactly 40 tiles.`);
  }
  if (!value.tiles.every(validateTile)) {
    throw new Error(`Theme "${value.id}" contains an invalid tile.`);
  }

  const tiles = value.tiles as Tile[];
  const tileIds = tiles.map((tile) => tile.id);
  if (new Set(tileIds).size !== tileIds.length) {
    throw new Error(`Theme "${value.id}" contains duplicate tile ids.`);
  }

  const count = (type: Tile["type"]) =>
    tiles.filter((tile) => tile.type === type).length;
  const propertyGroups = new Set(
    tiles
      .filter((tile) => tile.type === "property")
      .map((tile) => tile.colorGroup),
  );
  if (
    count("go") !== 1 ||
    count("property") !== 22 ||
    count("transport") !== 4 ||
    count("utility") !== 2 ||
    count("communityChest") !== 3 ||
    count("chance") !== 3 ||
    count("incomeTax") !== 1 ||
    count("luxuryTax") !== 1 ||
    count("jail") !== 1 ||
    count("freeParking") !== 1 ||
    count("goToJail") !== 1 ||
    propertyGroups.size !== 8
  ) {
    throw new Error(`Theme "${value.id}" does not match the 40-tile layout.`);
  }

  if (
    !isRecord(cards) ||
    !Array.isArray(cards.chance) ||
    !Array.isArray(cards.communityChest) ||
    cards.chance.length !== 16 ||
    cards.communityChest.length !== 16 ||
    !cards.chance.every(validateCard) ||
    !cards.communityChest.every(validateCard)
  ) {
    throw new Error(
      `Theme "${value.id}" must have valid 16-card Chance and Community Chest decks.`,
    );
  }

  const cardIds = [...cards.chance, ...cards.communityChest].map(
    (card) => card.id,
  );
  if (new Set(cardIds).size !== cardIds.length) {
    throw new Error(`Theme "${value.id}" contains duplicate card ids.`);
  }

  return value as unknown as Theme;
}
