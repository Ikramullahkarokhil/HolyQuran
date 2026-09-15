import { getSurahNames } from "./quranData";

export const loadSurahNames = async () => {
  try {
    const names = getSurahNames();
    if (!names || !Array.isArray(names)) {
      throw new Error('Invalid surah names data');
    }
    return names;
  } catch (error) {
    console.error("Failed to load Surah names", error);
    return [];
  }
};
