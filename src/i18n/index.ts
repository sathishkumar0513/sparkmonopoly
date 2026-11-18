import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import english from "./en.json";
import tamil from "./ta.json";
import { readStorageItem, writeStorageItem } from "../game/safeStorage";

const savedLanguage = readStorageItem("business-tycoon-language");

void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: english },
    ta: { translation: tamil },
  },
  lng: savedLanguage === "ta" ? "ta" : "en",
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

i18n.on("languageChanged", (language) => {
  if (typeof window !== "undefined") {
    writeStorageItem("business-tycoon-language", language === "ta" ? "ta" : "en");
  }
});

export default i18n;
