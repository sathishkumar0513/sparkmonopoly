import { useTranslation } from "react-i18next";
import { openingAnimationUrl } from "../brandAssets";

export function OpeningSplash({ onLoad }: { onLoad: () => void }) {
  const { t } = useTranslation();

  return (
    <main className="opening-splash" role="status" aria-busy="true">
      <img
        className="opening-splash-image"
        src={openingAnimationUrl}
        alt=""
        aria-hidden="true"
        onLoad={onLoad}
      />
      <span className="sr-only">{t("common.loading")}</span>
    </main>
  );
}
