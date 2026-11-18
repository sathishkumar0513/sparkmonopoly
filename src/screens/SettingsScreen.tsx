import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { getAudioPreferences, setMuted, setMusicEnabled, setVolume } from "../audio/soundManager";
import { getDefaultPreferences, readPreferences, writePreferences, type AppPreferences } from "../game/preferences";
import { LanguageSwitcher } from "../i18n/LanguageSwitcher";
import { useDialogFocus } from "../components/useDialogFocus";
import { useRef } from "react";

export function SettingsScreen({ modal = false, onClose }: { modal?: boolean; onClose?: () => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [preferences, setPreferences] = useState(readPreferences);
  const [audio, setAudio] = useState(getAudioPreferences);
  const dialogRef = useRef<HTMLElement>(null);

  useEffect(() => writePreferences(preferences), [preferences]);
  useDialogFocus(dialogRef, modal);
  const update = <K extends keyof AppPreferences>(key: K, value: AppPreferences[K]) =>
    setPreferences((current) => ({ ...current, [key]: value }));
  const close = () => onClose ? onClose() : navigate(-1);
  const Shell = modal ? "div" : "main";
  const reset = () => {
    setPreferences(getDefaultPreferences());
    setMuted(false);
    setMusicEnabled(false);
    setVolume(0.7);
    setAudio(getAudioPreferences());
  };

  return (
    <Shell className={modal ? "settings-modal-scrim" : "settings-shell"}>
      <section
        ref={dialogRef}
        tabIndex={modal ? -1 : undefined}
        className={modal ? "settings-modal-content" : undefined}
        role={modal ? "dialog" : undefined}
        aria-modal={modal ? true : undefined}
        aria-label={modal ? t("settings.title") : undefined}
      >
      <header className="setup-header">
        <button className="secondary-button" onClick={close}>{modal ? t("common.close") : t("common.back")}</button>
        <div><p className="eyebrow">{t("settings.eyebrow")}</p><h1>{t("settings.title")}</h1></div>
        <LanguageSwitcher />
      </header>
      <section className="settings-card" aria-label={t("settings.title")}>
        <fieldset>
          <legend>{t("settings.sound")}</legend>
          <label className="setting-range">{t("settings.soundVolume")}
            <input type="range" min="0" max="1" step="0.05" value={audio.volume} onChange={(event) => {
              setVolume(Number(event.target.value)); setAudio(getAudioPreferences());
            }} />
          </label>
          <label className="setting-range">{t("settings.musicVolume")}
            <input type="range" min="0" max="1" step="0.05" value={preferences.musicVolume} onChange={(event) => update("musicVolume", Number(event.target.value))} />
          </label>
          <label><input type="checkbox" checked={audio.muted} onChange={(event) => {
            setMuted(event.target.checked); setAudio(getAudioPreferences());
          }} /> {t("settings.mute")}</label>
          <label><input type="checkbox" checked={audio.musicEnabled} onChange={(event) => {
            setMusicEnabled(event.target.checked); setAudio(getAudioPreferences());
          }} /> {t("settings.music")}</label>
        </fieldset>
        <fieldset>
          <legend>{t("settings.accessibility")}</legend>
          <label>{t("settings.animation")}
            <select value={preferences.animation} onChange={(event) => update("animation", event.target.value as AppPreferences["animation"])}>
              <option value="full">{t("settings.full")}</option><option value="reduced">{t("settings.reduced")}</option><option value="off">{t("settings.off")}</option>
            </select>
          </label>
          <label>{t("settings.textSize")}
            <select value={preferences.textSize} onChange={(event) => update("textSize", event.target.value as AppPreferences["textSize"])}>
              <option value="small">{t("settings.small")}</option><option value="normal">{t("settings.normal")}</option><option value="large">{t("settings.large")}</option>
            </select>
          </label>
          <label><input type="checkbox" checked={preferences.colorBlind} onChange={(event) => update("colorBlind", event.target.checked)} /> {t("settings.colorBlind")}</label>
          <label><input type="checkbox" checked={preferences.highContrast} onChange={(event) => update("highContrast", event.target.checked)} /> {t("settings.highContrast")}</label>
          <label><input type="checkbox" checked={preferences.keyboardShortcuts} onChange={(event) => update("keyboardShortcuts", event.target.checked)} /> {t("settings.shortcuts")}</label>
        </fieldset>
        <fieldset>
          <legend>{t("settings.gameplay")}</legend>
          <label>{t("settings.botSpeed")}
            <select value={preferences.botSpeed} onChange={(event) => update("botSpeed", event.target.value as AppPreferences["botSpeed"])}>
              <option value="normal">{t("setup.normal")}</option><option value="fast">{t("setup.fast")}</option><option value="instant">{t("setup.instant")}</option>
            </select>
          </label>
          <div className="setting-language"><span>{t("common.language")}</span><LanguageSwitcher /></div>
        </fieldset>
        <button className="secondary-button" onClick={reset}>{t("settings.reset")}</button>
      </section>
      </section>
    </Shell>
  );
}
