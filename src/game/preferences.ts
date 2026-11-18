import { readStorageItem, writeStorageItem } from "./safeStorage";

export const PREFERENCES_KEY = "business-tycoon-preferences";

export type AnimationLevel = "full" | "reduced" | "off";
export type TextSize = "small" | "normal" | "large";

export interface AppPreferences {
  animation: AnimationLevel;
  botSpeed: "normal" | "fast" | "instant";
  musicVolume: number;
  colorBlind: boolean;
  highContrast: boolean;
  textSize: TextSize;
  keyboardShortcuts: boolean;
}

export const DEFAULT_PREFERENCES: AppPreferences = {
  animation: "full",
  botSpeed: "normal",
  musicVolume: 0.35,
  colorBlind: false,
  highContrast: false,
  textSize: "normal",
  keyboardShortcuts: true,
};

export function getDefaultPreferences(): AppPreferences {
  const osPrefersReduced = typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  return { ...DEFAULT_PREFERENCES, animation: osPrefersReduced ? "reduced" : "full" };
}

export function readPreferences(storage?: Pick<Storage, "getItem">): AppPreferences {
  const raw = storage ? storage.getItem(PREFERENCES_KEY) : readStorageItem(PREFERENCES_KEY);
  if (!raw) return getDefaultPreferences();
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object") return getDefaultPreferences();
    const partial = value as Partial<AppPreferences>;
    return {
      ...DEFAULT_PREFERENCES,
      ...partial,
      musicVolume: typeof partial.musicVolume === "number"
        ? Math.max(0, Math.min(1, partial.musicVolume))
        : DEFAULT_PREFERENCES.musicVolume,
    };
  } catch {
    return getDefaultPreferences();
  }
}

export function writePreferences(
  preferences: AppPreferences,
  storage?: Pick<Storage, "setItem">,
): void {
  if (storage) storage.setItem(PREFERENCES_KEY, JSON.stringify(preferences));
  else writeStorageItem(PREFERENCES_KEY, JSON.stringify(preferences));
  if (typeof window !== "undefined" && !storage) {
    window.dispatchEvent(new CustomEvent("business-tycoon-preferences", { detail: preferences }));
  }
}
