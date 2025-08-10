import { create } from "zustand";
import AsyncStorage from "@react-native-async-storage/async-storage";

const QURAN_LANGUAGE_PREFERENCE = "quran_language_preference";

const useQuranTranslationStore = create((set) => ({
  translationLanguage: "english",
  setTranslationLanguage: async (language) => {
    await AsyncStorage.setItem(QURAN_LANGUAGE_PREFERENCE, language);
    set({ translationLanguage: language });
  },
  initializeTranslationLanguage: async () => {
    try {
      const language = await AsyncStorage.getItem(QURAN_LANGUAGE_PREFERENCE) || "english";
      set({ translationLanguage: language });
    } catch (error) {
      console.error('Failed to load translation language:', error);
      set({ translationLanguage: "english" });
    }
  },
}));

export default useQuranTranslationStore;
