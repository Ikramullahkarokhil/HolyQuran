import { createInstance } from "i18next";
import { initReactI18next } from "react-i18next";
import * as Localization from "expo-localization";
import AsyncStorage from "@react-native-async-storage/async-storage";
import en from "../locales/en.json";
import pa from "../locales/pa.json";
import da from "../locales/da.json";

const LANGUAGE_PREFERENCE = "language_preference";
const i18n = createInstance();

const getDeviceLanguage = () => {
  try {
    const locales =
      Localization.getLocales && typeof Localization.getLocales === "function"
        ? Localization.getLocales()
        : [];

    if (Array.isArray(locales) && locales.length > 0) {
      const firstLocale = locales[0];
      if (firstLocale?.languageCode) {
        return firstLocale.languageCode;
      }
      if (firstLocale?.languageTag) {
        return firstLocale.languageTag.split("-")[0];
      }
    }
  } catch (_error) {
    // ignore
  }

  return "en";
};

const getSavedLanguage = async () => {
  try {
    const savedLanguage = await AsyncStorage.getItem(LANGUAGE_PREFERENCE);
    return savedLanguage || getDeviceLanguage();
  } catch (error) {
    console.error("Failed to load the language from storage", error);
    return getDeviceLanguage();
  }
};

// Function to save language preference
export const saveLanguagePreference = async (language) => {
  try {
    await AsyncStorage.setItem(LANGUAGE_PREFERENCE, language);
  } catch (error) {
    console.error("Failed to save language preference:", error);
  }
};

const initI18n = async (savedLanguage = null) => {
  try {
    const language = savedLanguage || (await getSavedLanguage());
    await i18n.use(initReactI18next).init({
      compatibilityJSON: "v3",
      resources: {
        en: { translation: en },
        pa: { translation: pa },
        da: { translation: da },
      },
      lng: language,
      fallbackLng: "en",
      interpolation: {
        escapeValue: false,
      },
    });
  } catch (error) {
    console.error("Failed to initialize i18n:", error);
    await i18n.use(initReactI18next).init({
      compatibilityJSON: "v3",
      resources: { en: { translation: en } },
      lng: "en",
      fallbackLng: "en",
      interpolation: { escapeValue: false },
    });
  }
};

export { initI18n, i18n };
