const quranCache = new Map();
let surahNamesCache;
let arabicVersesByIdCache;
let arabicVersesBySurahCache;

const QURAN_TRANSLATIONS = {
  arabic: () => require("../assets/QuranData/ArabicQuran.json"),
  english: () => require("../assets/QuranData/EnglishQuran.json"),
  pashto: () => require("../assets/QuranData/PashtoQuran.json"),
  dari: () => require("../assets/QuranData/PersianQuran.json"),
};

const normalizeLanguage = (language) => {
  if (language === "pa" || language === "pashto") return "pashto";
  if (language === "da" || language === "dari" || language === "persian") {
    return "dari";
  }
  if (language === "ar" || language === "arabic") return "arabic";
  return "english";
};

const getQuranData = (language = "english") => {
  const normalizedLanguage = normalizeLanguage(language);
  const cachedData = quranCache.get(normalizedLanguage);
  if (cachedData) return cachedData;

  const data = QURAN_TRANSLATIONS[normalizedLanguage]();
  quranCache.set(normalizedLanguage, data);
  return data;
};

const getQuranVerses = (language = "english") =>
  Object.values(getQuranData(language)?.quran?.["quran-uthmani-hafs"] || {});

const getSurahNames = () => {
  if (surahNamesCache) return surahNamesCache;
  const names = require("../assets/QuranData/SurahNames.json");
  surahNamesCache = Array.isArray(names) ? names : [];
  return surahNamesCache;
};

const getArabicVersesById = () => {
  if (arabicVersesByIdCache) return arabicVersesByIdCache;
  arabicVersesByIdCache = new Map(
    getQuranVerses("arabic").map((verse) => [verse.id, verse]),
  );
  return arabicVersesByIdCache;
};

const getArabicVersesBySurah = () => {
  if (arabicVersesBySurahCache) return arabicVersesBySurahCache;
  arabicVersesBySurahCache = new Map();

  for (const verse of getQuranVerses("arabic")) {
    const surahVerses = arabicVersesBySurahCache.get(verse.surah);
    if (surahVerses) surahVerses.push(verse);
    else arabicVersesBySurahCache.set(verse.surah, [verse]);
  }

  return arabicVersesBySurahCache;
};

const getArabicVerseById = (id) => getArabicVersesById().get(id);

const getArabicVersesForSurah = (surahNumber) =>
  getArabicVersesBySurah().get(surahNumber) || [];

export {
  getArabicVerseById,
  getArabicVersesForSurah,
  getQuranData,
  getQuranVerses,
  getSurahNames,
};