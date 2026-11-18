import { validateTheme } from "./themeSchema";
import type { Theme } from "./themeSchema";

export interface ThemeMetadata {
  id: string;
  name: string;
  description: string;
  currencyLabel: string;
  colors: [string, string, string];
  propertyCount: number;
}

interface ThemeEntry extends ThemeMetadata {
  load: () => Promise<Theme>;
}

const entries: ThemeEntry[] = [
  {
    id: "international",
    name: "International",
    description: "A global tour of fictional businesses and big ideas.",
    currencyLabel: "US dollar ($)",
    colors: ["#3157a4", "#53b6a8", "#f2b84b"],
    propertyCount: 22,
    load: async () => validateTheme((await import("./international.json")).default),
  },
  {
    id: "india",
    name: "India",
    description: "A business journey across Indian cities, infrastructure, and industries.",
    currencyLabel: "Indian rupee (₹)",
    colors: ["#b85b2a", "#248b72", "#e6b84e"],
    propertyCount: 22,
    load: async () => validateTheme((await import("./india.json")).default),
  },
  {
    id: "tamilnadu",
    name: "Tamil Nadu",
    description: "Explore Tamil Nadu’s cities, craft, manufacturing, services, and ports.",
    currencyLabel: "Indian rupee (₹)",
    colors: ["#a84636", "#248b76", "#e7ba55"],
    propertyCount: 22,
    load: async () => validateTheme((await import("./tamilnadu.json")).default),
  },
];

export const availableThemes: ThemeMetadata[] = entries.map((entry) => ({
  id: entry.id,
  name: entry.name,
  description: entry.description,
  currencyLabel: entry.currencyLabel,
  colors: entry.colors,
  propertyCount: entry.propertyCount,
}));

const entryById = new Map(entries.map((entry) => [entry.id, entry]));

export async function loadTheme(id: string): Promise<Theme> {
  const entry = entryById.get(id);
  if (!entry) throw new Error(`Unknown theme "${id}".`);
  return entry.load();
}

export function getThemeMetadata(id: string): ThemeMetadata | undefined {
  return availableThemes.find((theme) => theme.id === id);
}
