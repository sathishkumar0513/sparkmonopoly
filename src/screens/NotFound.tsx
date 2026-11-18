import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
export function NotFound() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return <main className="not-found"><p className="eyebrow">404</p><h1>{t("navigation.notFound")}</h1><button className="primary-button" onClick={() => navigate("/")}>{t("navigation.home")}</button></main>;
}
