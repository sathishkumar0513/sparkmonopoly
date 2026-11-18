import type { AnimationLevel } from "../game/preferences";

export type ResolvedMotionLevel = AnimationLevel;

export const MOTION_MS = {
  button: 140,
  tile: 150,
  route: 200,
  modal: 240,
  card: 460,
  tokenStep: 135,
  tokenSoundOffset: 35,
  tokenHop: 420,
  tokenIdle: 2400,
  jailShake: 450,
  soundBeat: 70,
  tokenMove: 380,
  dice: 880,
  salary: 900,
  toast: 820,
  counter: 1200,
  cashBounce: 240,
  camera: 380,
  watchdog: 6000,
  logo: 3200,
  drift: 4000,
  driftStagger: 300,
  ownerFlag: 340,
  jailClose: 260,
  jailOpen: 420,
  shatter: 520,
  landing: 760,
  rentFlight: 680,
  rentSoundOffset: 70,
  confetti: 2200,
  themeCard: 350,
  themeStagger: 80,
  coinStagger: 50,
  coinLateStagger: 100,
  activePulse: 3200,
  panelPulse: 1800,
  controlPulse: 1600,
  reduced: 120,
  rentToast: 600,
} as const;

export const MOTION_EASE = {
  standard: [0.2, 0.8, 0.2, 1] as const,
  enter: [0.2, 0.75, 0.25, 1] as const,
  exit: [0.4, 0, 1, 1] as const,
};

export const MOTION_SPRING = {
  modal: { type: "spring" as const, stiffness: 280, damping: 26 },
  pop: { type: "spring" as const, stiffness: 360, damping: 17 },
  die: { type: "spring" as const, stiffness: 190, damping: 15 },
  cash: { stiffness: 100, damping: 20 },
};

export function resolveMotionLevel(
  preference: AnimationLevel,
  prefersReducedMotion: boolean,
): ResolvedMotionLevel {
  if (preference === "off") return "off";
  if (preference === "reduced" || prefersReducedMotion) return "reduced";
  return "full";
}

export function installMotionTokens(): void {
  const root = document.documentElement;
  for (const [name, milliseconds] of Object.entries(MOTION_MS)) {
    root.style.setProperty(`--motion-${name}`, `${milliseconds}ms`);
  }
  for (const [name, values] of Object.entries(MOTION_EASE)) {
    root.style.setProperty(`--motion-ease-${name}`, `cubic-bezier(${values.join(",")})`);
  }
}
