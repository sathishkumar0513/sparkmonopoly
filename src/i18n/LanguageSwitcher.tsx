import { useEffect } from "react";
import { useTranslation } from "react-i18next";

export function LanguageSwitcher() {
  const { i18n, t } = useTranslation();
  const language = i18n.resolvedLanguage?.startsWith("ta") ? "ta" : "en";

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  return (
    <label className="language-switcher">
      <span>{t("common.language")}</span>
      <select
        aria-label={t("common.language")}
        value={language}
        onChange={(event) => void i18n.changeLanguage(event.target.value)}
      >
        <option value="en">{t("common.english")}</option>
        <option value="ta">{t("common.tamil")}</option>
      </select>
    </label>
  );
}
