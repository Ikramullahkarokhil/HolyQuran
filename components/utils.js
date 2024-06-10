import SurahNames from "../assets/QuranData/SurahNames.json";

export const loadSurahNames = async () => {
  try {
    // Directly return the Surah names since we are importing the JSON file
    return SurahNames;
  } catch (error) {
    console.error("Failed to load Surah names", error);
    return [];
  }
};
