const hadithIndexCache = new Map();
const booksCache = new Map();
const metadataCache = new Map();

const HADITH_COLLECTIONS = {
  bukhari: {
    books: () => require("../assets/Hadiths/sahih_bukhari/bukhari_books.json"),
    hadiths: {
      arabic: () =>
        require("../assets/Hadiths/sahih_bukhari/sahih_bukhari_arabic.json"),
      english: () =>
        require("../assets/Hadiths/sahih_bukhari/sahih_bukhari_english.json"),
    },
  },
  muslim: {
    books: () => require("../assets/Hadiths/sahih_muslim/muslim_books.json"),
    hadiths: {
      arabic: () =>
        require("../assets/Hadiths/sahih_muslim/sahih_muslim_arabic.json"),
      english: () =>
        require("../assets/Hadiths/sahih_muslim/sahih_muslim_english.json"),
    },
  },
  tirmidhi: {
    books: () =>
      require("../assets/Hadiths/Jami_at-Tirmidhi/tirmidhi_books.json"),
    hadiths: {
      arabic: () =>
        require("../assets/Hadiths/Jami_at-Tirmidhi/tirmidhi_arabic.json"),
      english: () =>
        require("../assets/Hadiths/Jami_at-Tirmidhi/tirmidhi_english.json"),
    },
  },
  "abi-dawud": {
    books: () =>
      require("../assets/Hadiths/Sunan_Abi_Dawud/abi_dawud_books.json"),
    hadiths: {
      arabic: () =>
        require("../assets/Hadiths/Sunan_Abi_Dawud/abi_dawud_arabic.json"),
      english: () =>
        require("../assets/Hadiths/Sunan_Abi_Dawud/abi_dawud_english.json"),
    },
  },
  "an-nasai": {
    books: () =>
      require("../assets/Hadiths/Sunan_an-Nasai/an_nasai_books.json"),
    hadiths: {
      arabic: () =>
        require("../assets/Hadiths/Sunan_an-Nasai/an_nasai_arabic.json"),
      english: () =>
        require("../assets/Hadiths/Sunan_an-Nasai/an_nasai_english.json"),
    },
  },
  "ibn-majah": {
    books: () =>
      require("../assets/Hadiths/Sunan_Ibn_Majah/ibn_majah_books.json"),
    hadiths: {
      arabic: () =>
        require("../assets/Hadiths/Sunan_Ibn_Majah/ibn_majah_arabic.json"),
      english: () =>
        require("../assets/Hadiths/Sunan_Ibn_Majah/ibn_majah_english.json"),
    },
  },
};

const normalizeHadithCollection = (collection) =>
  Object.prototype.hasOwnProperty.call(HADITH_COLLECTIONS, collection)
    ? collection
    : "bukhari";

const normalizeLanguage = (language) =>
  language === "arabic" ? "arabic" : "english";

const createHadithIndex = (hadiths) => {
  const index = new Map();

  for (const hadith of hadiths) {
    const bookNumber = String(hadith?.reference?.book ?? "");
    if (!bookNumber) continue;

    const bookHadiths = index.get(bookNumber);
    if (bookHadiths) {
      bookHadiths.push(hadith);
    } else {
      index.set(bookNumber, [hadith]);
    }
  }

  return index;
};

const getHadithIndex = (collection, language) => {
  const normalizedCollection = normalizeHadithCollection(collection);
  const normalizedLanguage = normalizeLanguage(language);
  const cacheKey = `${normalizedCollection}:${normalizedLanguage}`;
  const cachedIndex = hadithIndexCache.get(cacheKey);
  if (cachedIndex) return cachedIndex;

  const hadiths =
    HADITH_COLLECTIONS[normalizedCollection].hadiths[normalizedLanguage]();
  const index = createHadithIndex(hadiths);
  hadithIndexCache.set(cacheKey, index);
  return index;
};

const getHadithBooks = (collection = "bukhari", language = "english") => {
  const normalizedCollection = normalizeHadithCollection(collection);
  const normalizedLanguage = normalizeLanguage(language);
  const cacheKey = `${normalizedCollection}:${normalizedLanguage}`;
  const cachedBooks = booksCache.get(cacheKey);
  if (cachedBooks) return cachedBooks;

  const books = HADITH_COLLECTIONS[normalizedCollection]
    .books()
    .map((book) => ({
      bookNumber: book.Book_Number,
      bookName: book.Book_Name[normalizedLanguage] || book.Book_Name.english,
      count: book.Hadith_Count,
    }));
  booksCache.set(cacheKey, books);
  return books;
};

const getHadithsByBook = (collection, language, bookNumber) =>
  getHadithIndex(collection, language).get(String(bookNumber)) || [];

const getAllHadiths = (collection = "bukhari", language = "english") => {
  const normalizedCollection = normalizeHadithCollection(collection);
  const normalizedLanguage = normalizeLanguage(language);
  const cacheKey = `all:${normalizedCollection}:${normalizedLanguage}`;
  const cachedHadiths = hadithIndexCache.get(cacheKey);
  if (cachedHadiths) return cachedHadiths;

  const hadiths =
    HADITH_COLLECTIONS[normalizedCollection].hadiths[normalizedLanguage]();
  hadithIndexCache.set(cacheKey, hadiths);
  return hadiths;
};

const getHadithCollectionStats = (collection = "bukhari") => {
  const normalizedCollection = normalizeHadithCollection(collection);
  const cachedStats = metadataCache.get(normalizedCollection);
  if (cachedStats) return cachedStats;

  const books = getHadithBooks(normalizedCollection, "english");
  const stats = {
    bookCount: books.length,
    hadithCount: books.reduce((total, book) => total + book.count, 0),
  };
  metadataCache.set(normalizedCollection, stats);
  return stats;
};

const getHadithId = (item) =>
  String(item?.reference?.hadith || item?.hadithnumber || "");

export {
  getAllHadiths,
  getHadithCollectionStats,
  getHadithId,
  getHadithBooks,
  getHadithsByBook,
  normalizeHadithCollection,
};
