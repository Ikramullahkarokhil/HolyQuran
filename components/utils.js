import SurahNames from "../assets/QuranData/SurahNames.json";

export const loadSurahNames = async () => {
  try {
    // Directly return the Surah names since we are importing the JSON file
    const names = SurahNames;
    if (!names || !Array.isArray(names)) {
      throw new Error('Invalid surah names data');
    }
    return names;
  } catch (error) {
    console.error("Failed to load Surah names", error);
    return [];
  }
};
