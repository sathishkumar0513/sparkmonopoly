import { loadingAnimationUrl } from "../brandAssets";
import { publicAsset } from "../ui/publicAsset";

export function BrandLoadingScreen({
  label,
  reducedMotion,
}: {
  label: string;
  reducedMotion: boolean;
}) {
  return (
    <main className="loading-screen" role="status" aria-live="polite" aria-busy="true">
      <img
        className="loading-brand-animation"
        src={reducedMotion ? publicAsset("business-tycoon-opening.webp") : loadingAnimationUrl}
        alt=""
        aria-hidden="true"
      />
      <span>{label}</span>
    </main>
  );
}
