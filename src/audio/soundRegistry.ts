export const SOUND_IDS = [
  "diceRoll",
  "tokenStep",
  "coin",
  "buy",
  "build",
  "cardFlip",
  "jailDoor",
  "bankruptcy",
  "win",
  "click",
  "music",
] as const;

export type SoundId = (typeof SOUND_IDS)[number];
export type SoundAssets = Partial<Record<SoundId, string>>;
export const SOUND_ASSETS: SoundAssets = {};

const TONES: Record<SoundId, { frequency: number; duration: number }> = {
  diceRoll: { frequency: 105, duration: 0.2 },
  tokenStep: { frequency: 460, duration: 0.045 },
  coin: { frequency: 880, duration: 0.14 },
  buy: { frequency: 620, duration: 0.22 },
  build: { frequency: 310, duration: 0.18 },
  cardFlip: { frequency: 520, duration: 0.12 },
  jailDoor: { frequency: 145, duration: 0.28 },
  bankruptcy: { frequency: 82, duration: 0.38 },
  win: { frequency: 740, duration: 0.5 },
  click: { frequency: 540, duration: 0.035 },
  music: { frequency: 196, duration: 0.8 },
};

const generatedTones = new Map<SoundId, string>();

export function getSoundSource(id: SoundId, assets: SoundAssets = {}): string {
  return assets[id] ?? generatedTones.get(id) ?? createTone(id);
}

function createTone(id: SoundId): string {
  // Replace these generated WAV data URIs with licensed sound-file paths in this registry.
  const { frequency, duration } = TONES[id];
  const sampleRate = 22050;
  const sampleCount = Math.floor(sampleRate * duration);
  const bytes = new ArrayBuffer(44 + sampleCount * 2);
  const view = new DataView(bytes);
  const writeText = (offset: number, text: string) => {
    for (let index = 0; index < text.length; index += 1) {
      view.setUint8(offset + index, text.charCodeAt(index));
    }
  };

  writeText(0, "RIFF");
  view.setUint32(4, 36 + sampleCount * 2, true);
  writeText(8, "WAVE");
  writeText(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeText(36, "data");
  view.setUint32(40, sampleCount * 2, true);

  for (let sample = 0; sample < sampleCount; sample += 1) {
    const progress = sample / sampleCount;
    const envelope = Math.min(1, progress * 18) * Math.max(0, 1 - progress);
    const amplitude =
      Math.sin((2 * Math.PI * frequency * sample) / sampleRate) *
      envelope *
      0.32;
    view.setInt16(44 + sample * 2, Math.round(amplitude * 32767), true);
  }

  let binary = "";
  const data = new Uint8Array(bytes);
  for (let offset = 0; offset < data.length; offset += 1) {
    binary += String.fromCharCode(data[offset]);
  }
  const source = `data:audio/wav;base64,${btoa(binary)}`;
  generatedTones.set(id, source);
  return source;
}
