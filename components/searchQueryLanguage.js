const SEARCH_LANGUAGES = ["english", "pashto", "dari", "arabic"];

const normalizeSearchLanguage = (language) =>
  SEARCH_LANGUAGES.includes(language) ? language : null;

const getSearchLanguageForAppLocale = (locale) => {
  const normalizedLocale = String(locale || "")
    .toLowerCase()
    .split("-")[0];
  if (normalizedLocale === "pa" || normalizedLocale === "ps") return "pashto";
  if (normalizedLocale === "da" || normalizedLocale === "fa") return "dari";
  if (normalizedLocale === "ar") return "arabic";
  return "english";
};

module.exports = {
  SEARCH_LANGUAGES,
  normalizeSearchLanguage,
  getSearchLanguageForAppLocale,
};
