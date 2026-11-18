import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { LanguageSwitcher } from "../i18n/LanguageSwitcher";

const STEPS = ["turns", "buying", "building", "jail", "trading", "winning"] as const;
const ILLUSTRATIONS = ["🎲", "🏙️", "🏠", "🚔", "🤝", "🏆"];

export function HowToPlay() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const key = STEPS[step] ?? "turns";
  return (
    <main className="tutorial-shell">
      <header className="setup-header">
        <button className="secondary-button" onClick={() => navigate(-1)}>{t("common.back")}</button>
        <div><p className="eyebrow">{t("tutorial.eyebrow")}</p><h1>{t("tutorial.title")}</h1></div>
        <LanguageSwitcher />
      </header>
      <section className="tutorial-card" aria-live="polite">
        <span className="tutorial-illustration" aria-hidden="true">{ILLUSTRATIONS[step]}</span>
        <span className="eyebrow">{t("tutorial.step", { current: step + 1, total: STEPS.length })}</span>
        <h2>{t(`tutorial.steps.${key}.title`)}</h2>
        <p>{t(`tutorial.steps.${key}.body`)}</p>
        <div className="tutorial-controls">
          <button className="secondary-button" disabled={step === 0} onClick={() => setStep((value) => value - 1)}>{t("tutorial.previous")}</button>
          {step < STEPS.length - 1
            ? <button className="primary-button" onClick={() => setStep((value) => value + 1)}>{t("tutorial.next")}</button>
            : <button className="primary-button" onClick={() => navigate("/")}>{t("tutorial.done")}</button>}
        </div>
        <div className="tutorial-dots" aria-label={t("tutorial.progress")}>
          {STEPS.map((item, index) => <button key={item} aria-label={t("tutorial.goToStep", { number: index + 1 })} aria-current={index === step ? "step" : undefined} onClick={() => setStep(index)} />)}
        </div>
      </section>
      <p className="shortcut-note">{t("tutorial.shortcuts")}</p>
    </main>
  );
}
