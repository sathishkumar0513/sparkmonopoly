import { useRegisterSW } from "virtual:pwa-register/react";
import { useTranslation } from "react-i18next";

export function ReloadPrompt() {
  const { t } = useTranslation();
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisterError(error) {
      console.error("Could not register the offline app worker.", error);
    },
  });

  if (!needRefresh) return null;
  return (
    <aside className="update-prompt" role="status">
      <p>{t("pwa.updateAvailable")}</p>
      <button className="primary-button" onClick={() => void updateServiceWorker(true)}>
        {t("pwa.reload")}
      </button>
      <button className="secondary-button" onClick={() => setNeedRefresh(false)}>
        {t("common.close")}
      </button>
    </aside>
  );
}
