import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import * as Localization from "expo-localization";
import AsyncStorage from "@react-native-async-storage/async-storage";
import en from "../locales/en.json";
import pa from "../locales/pa.json";
import da from "../locales/da.json";

const LANGUAGE_PREFERENCE = "language_preference";

const getSavedLanguage = async () => {
  try {
    const savedLanguage = await AsyncStorage.getItem(LANGUAGE_PREFERENCE);
    return savedLanguage || Localization.locale.split("-")[0];
  } catch (error) {
    console.error("Failed to load the language from storage", error);
    return Localization.locale.split("-")[0];
  }
};

const initI18n = async () => {
  const language = await getSavedLanguage();
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
};

export { initI18n, i18n };
