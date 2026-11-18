import { useEffect, useState } from "react";
import { readPreferences, type AnimationLevel } from "../game/preferences";
import { resolveMotionLevel, type ResolvedMotionLevel } from "./motion";

export function useMotionLevel(): ResolvedMotionLevel {
  const [preference, setPreference] = useState<AnimationLevel>(
    () => readPreferences().animation,
  );
  const [prefersReduced, setPrefersReduced] = useState(
    () => typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true,
  );

  useEffect(() => {
    const updatePreferences = (event: Event) => {
      const animation = (event as CustomEvent<{ animation?: AnimationLevel }>).detail?.animation;
      if (animation === "full" || animation === "reduced" || animation === "off") {
        setPreference(animation);
      }
    };
    const media = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const updateMedia = () => setPrefersReduced(media?.matches === true);
    window.addEventListener("business-tycoon-preferences", updatePreferences);
    media?.addEventListener?.("change", updateMedia);
    updateMedia();
    return () => {
      window.removeEventListener("business-tycoon-preferences", updatePreferences);
      media?.removeEventListener?.("change", updateMedia);
    };
  }, []);

  return resolveMotionLevel(preference, prefersReduced);
}
