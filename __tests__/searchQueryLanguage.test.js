const assert = require("node:assert/strict");
const {
  SEARCH_LANGUAGES,
  normalizeSearchLanguage,
  getSearchLanguageForAppLocale,
} = require("../components/searchQueryLanguage");

assert.deepEqual(SEARCH_LANGUAGES, ["english", "pashto", "dari", "arabic"]);
assert.equal(normalizeSearchLanguage("pashto"), "pashto");
assert.equal(normalizeSearchLanguage("unsupported"), null);
assert.equal(getSearchLanguageForAppLocale("pa"), "pashto");
assert.equal(getSearchLanguageForAppLocale("da"), "dari");
assert.equal(getSearchLanguageForAppLocale("ar"), "arabic");
assert.equal(getSearchLanguageForAppLocale("en"), "english");

console.log("Search language selector tests passed");
