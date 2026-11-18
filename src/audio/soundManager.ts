import { Howl, Howler } from "howler";
import { getSoundSource, SOUND_ASSETS } from "./soundRegistry";
import type { SoundId } from "./soundRegistry";
import { readStorageItem, writeStorageItem } from "../game/safeStorage";

export interface AudioPreferences {
  muted: boolean;
  volume: number;
  musicEnabled: boolean;
}

const STORAGE_KEY = "business-tycoon.audio.v1";
const DEFAULT_PREFERENCES: AudioPreferences = {
  muted: false,
  volume: 0.5,
  musicEnabled: false,
};

let preferences = loadPreferences();
const sounds = new Map<SoundId, Howl>();

export function getAudioPreferences(): AudioPreferences {
  return { ...preferences };
}

export function setMuted(muted: boolean): void {
  preferences = { ...preferences, muted };
  Howler.mute(muted);
  savePreferences();
}

export function setVolume(volume: number): void {
  preferences = {
    ...preferences,
    volume: Math.max(0, Math.min(1, volume)),
  };
  Howler.volume(preferences.volume);
  savePreferences();
}

export function setMusicEnabled(enabled: boolean): void {
  preferences = { ...preferences, musicEnabled: enabled };
  if (enabled) playSound("music");
  else sounds.get("music")?.stop();
  savePreferences();
}

export function playSound(id: SoundId): void {
  if (preferences.muted || (id === "music" && !preferences.musicEnabled)) return;
  Howler.volume(preferences.volume);
  const sound =
    sounds.get(id) ??
    new Howl({
      src: [getSoundSource(id, SOUND_ASSETS)],
      format: ["wav"],
      volume: 1,
      loop: id === "music",
      preload: true,
    });
  sounds.set(id, sound);
  sound.play();
}

function loadPreferences(): AudioPreferences {
  try {
    const parsed: unknown = JSON.parse(readStorageItem(STORAGE_KEY) ?? "null");
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "muted" in parsed &&
      typeof parsed.muted === "boolean" &&
      "volume" in parsed &&
      typeof parsed.volume === "number" &&
      "musicEnabled" in parsed &&
      typeof parsed.musicEnabled === "boolean"
    ) {
      return {
        muted: parsed.muted,
        volume: Math.max(0, Math.min(1, parsed.volume)),
        musicEnabled: parsed.musicEnabled,
      };
    }
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
  }
  return { ...DEFAULT_PREFERENCES };
}

function savePreferences(): void {
  writeStorageItem(STORAGE_KEY, JSON.stringify(preferences));
}
