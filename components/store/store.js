import { create } from "zustand";
import AsyncStorage from "@react-native-async-storage/async-storage";

const QURAN_LANGUAGE_PREFERENCE = "quran_language_preference";
const HADITH_LANGUAGE_PREFERENCE = "hadith_language_preference";
const APP_LANGUAGE_PREFERENCE = "app_language_preference";

const useQuranTranslationStore = create((set) => ({
  translationLanguage: "english",
  setTranslationLanguage: async (language) => {
    await AsyncStorage.setItem(QURAN_LANGUAGE_PREFERENCE, language);
    set({ translationLanguage: language });
  },
  initializeQuranTranslationLanguage: async () => {
    try {
      const language =
        (await AsyncStorage.getItem(QURAN_LANGUAGE_PREFERENCE)) || "english";
      set({ translationLanguage: language });
    } catch (error) {
      console.error("Failed to load translation language:", error);
      set({ translationLanguage: "english" });
    }
  },
}));

const useHadithTranslationStore = create((set) => ({
  translationLanguage: "english",
  setTranslationLanguage: async (language) => {
    await AsyncStorage.setItem(HADITH_LANGUAGE_PREFERENCE, language);
    set({ translationLanguage: language });
  },
  initializeHadithTranslationLanguage: async () => {
    try {
      const language =
        (await AsyncStorage.getItem(HADITH_LANGUAGE_PREFERENCE)) || "english";
      set({ translationLanguage: language });
    } catch (error) {
      console.error("Failed to load translation language:", error);
      set({ translationLanguage: "english" });
    }
  },
}));

const useAppLanguageStore = create((set) => ({
  language: "en",
  setLanguage: async (language) => {
    await AsyncStorage.setItem(APP_LANGUAGE_PREFERENCE, language);
    set({ language });
  },
  initializeAppLanguage: async () => {
    try {
      const language =
        (await AsyncStorage.getItem(APP_LANGUAGE_PREFERENCE)) || "en";
      set({ language });
      return language;
    } catch (error) {
      console.error("Failed to load app language:", error);
      set({ language: "en" });
      return "en";
    }
  },
}));

export {
  useQuranTranslationStore,
  useHadithTranslationStore,
  useAppLanguageStore,
};
