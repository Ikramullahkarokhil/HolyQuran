import { create } from "zustand";
import AsyncStorage from "@react-native-async-storage/async-storage";

const THEME_PREFERENCE = 'theme_preference';
const THEME_MODE = 'theme_mode';

const useThemeStore = create((set, get) => ({
  isDarkTheme: false,
  themeMode: 'system',
  
  setThemeMode: async (mode, isSystemDark = false) => {
    try {
      // Save the theme mode to storage
      await AsyncStorage.setItem(THEME_MODE, mode);
      set({ themeMode: mode });
      
      // Set isDarkTheme based on mode
      if (mode === 'system') {
        set({ isDarkTheme: isSystemDark });
      } else {
        set({ isDarkTheme: mode === 'dark' });
      }
      
      // Save the theme preference
      await AsyncStorage.setItem(THEME_PREFERENCE, JSON.stringify(mode === 'dark'));
    } catch (error) {
      console.error('Failed to save theme mode:', error);
    }
  },

  initializeTheme: async (isSystemDark = false) => {
    try {
      const mode = await AsyncStorage.getItem(THEME_MODE) || 'system';
      set({ themeMode: mode });

      if (mode === 'system') {
        set({ isDarkTheme: isSystemDark });
      } else {
        const savedTheme = await AsyncStorage.getItem(THEME_PREFERENCE);
        set({ isDarkTheme: savedTheme ? JSON.parse(savedTheme) : false });
      }
    } catch (error) {
      console.error('Failed to load theme preference:', error);
      set({ 
        themeMode: 'system',
        isDarkTheme: isSystemDark 
      });
    }
  },
}));

export default useThemeStore;
