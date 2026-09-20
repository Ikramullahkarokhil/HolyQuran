const quranCache = new Map();
let surahNamesCache = null;
let surahNamesByIndexCache = null;
let arabicVersesByIdCache = null;
let arabicVersesBySurahCache = null;

const QURAN_TRANSLATIONS = {
  arabic: () => require("../assets/QuranData/ArabicQuran.json"),
  english: () => require("../assets/QuranData/EnglishQuran.json"),
  pashto: () => require("../assets/QuranData/PashtoQuran.json"),
  dari: () => require("../assets/QuranData/PersianQuran.json"),
};

const normalizeLanguage = (language = "english") => {
  if (!language) return "english";
  const lang = String(language).toLowerCase().trim();

  if (lang === "pa" || lang === "pashto") return "pashto";
  if (lang === "da" || lang === "dari" || lang === "persian" || lang === "fa") {
    return "dari";
  }
  if (lang === "ar" || lang === "arabic") return "arabic";
  return "english";
};

const getQuranData = (language = "english") => {
  const normalizedLanguage = normalizeLanguage(language);
  if (quranCache.has(normalizedLanguage)) {
    return quranCache.get(normalizedLanguage);
  }

  const loader = QURAN_TRANSLATIONS[normalizedLanguage];
  if (!loader) {
    throw new Error(`Unsupported language: ${language}`);
  }

  const data = loader();
  quranCache.set(normalizedLanguage, data);
  return data;
};

const getQuranVerses = (language = "english") => {
  const data = getQuranData(language);
  return Object.values(data?.quran?.["quran-uthmani-hafs"] || {});
};

/**
 * Returns the full list of 114 surahs (cached)
 * Format: { index, ayas, name, tname, type }
 */
const getSurahNames = () => {
  if (surahNamesCache) return surahNamesCache;

  const names = require("../assets/QuranData/QuranMetaData/surahs.json");
  surahNamesCache = Array.isArray(names) ? names : [];

  return surahNamesCache;
};

/**
 * Fast O(1) lookup by surah number
 */
const getSurahByIndex = (index) => {
  if (!surahNamesByIndexCache) {
    surahNamesByIndexCache = new Map(getSurahNames().map((s) => [s.index, s]));
  }
  return surahNamesByIndexCache.get(Number(index)) || null;
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
    const list = arabicVersesBySurahCache.get(verse.surah);
    if (list) {
      list.push(verse);
    } else {
      arabicVersesBySurahCache.set(verse.surah, [verse]);
    }
  }

  return arabicVersesBySurahCache;
};

const getArabicVerseById = (id) => getArabicVersesById().get(id) || null;

const getArabicVersesForSurah = (surahNumber) =>
  getArabicVersesBySurah().get(Number(surahNumber)) || [];

export {
  getArabicVerseById,
  getArabicVersesForSurah,
  getQuranData,
  getQuranVerses,
  getSurahNames,
  getSurahByIndex, // new helper
};
