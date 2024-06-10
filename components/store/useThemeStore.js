import { create } from "zustand";
import AsyncStorage from "@react-native-async-storage/async-storage";

const useThemeStore = create((set) => ({
  isDarkTheme: false,
  toggleTheme: async () => {
    const isDarkTheme = !(
      (await AsyncStorage.getItem("isDarkTheme")) === "true"
    );
    await AsyncStorage.setItem("isDarkTheme", JSON.stringify(isDarkTheme));
    set({ isDarkTheme });
  },
  initializeTheme: async () => {
    const isDarkTheme = (await AsyncStorage.getItem("isDarkTheme")) === "true";
    set({ isDarkTheme });
  },
}));

export default useThemeStore;
