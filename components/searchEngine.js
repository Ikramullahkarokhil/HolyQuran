// searchEngine.js
//
// Semantic (AI) search engine for the Zād al-Hudā search screen, backed by the
// on-device EmbeddingGemma model. It builds a single, language-independent
// corpus covering *every* Quran translation (Arabic, English, Pashto, Dari) and
// *every* hadith (all six collections in Arabic and English, plus Jawami'
// al-Kalim), imports bundled precomputed vectors, and persists them in an
// on-device Qdrant Edge shard for fast nearest-neighbor search.
//
// Search = embed the query + HNSW vector search. No lexical fallback: every
// search goes through the model.

import { EmbeddingTask } from "react-native-litert-lm";
import {
  createShard,
  loadShard,
  mobileWalDefaults,
} from "react-native-qdrant-edge";
import { Asset } from "expo-asset";
import { Directory, File, Paths } from "expo-file-system";

import { getQuranVerses, getSurahNames } from "./quranData";
import {
  getAllHadiths,
  getHadithBooks,
  getHadithCollectionIds,
  getHadithId,
} from "./hadithData";
import { normalizeSearchLanguage } from "./searchQueryLanguage";

// ─── Tunables ───────────────────────────────────────────────────────────────

export const MIN_QUERY_LENGTH = 2;
export const MAX_RESULTS = 60;

const EMBED_OPTIONS = { normalize: true, outputSize: 256 };
const EMBED_DIM = 256;
const EMBEDDING_MAX_QUERY_LENGTH = 220;
const EMBEDDING_MAX_DOC_LENGTH = 640;
const SEMANTIC_MIN_SCORE = 0.12;
const SEARCH_HNSW_EF = 128;
const SEARCH_INDEX_DIRECTORY = "zad-semantic-qdrant";
const SEARCH_INDEX_METADATA_FILE = "zad-semantic-qdrant.json";
const PREBUILT_INDEX_FORMAT_VERSION = 1;
const PREBUILT_INDEX_RECORD_BYTES = Float32Array.BYTES_PER_ELEMENT + EMBED_DIM;
const PREBUILT_INDEX_METADATA = require("../assets/search-index.json");
const PREBUILT_INDEX_ASSET = require("../assets/search-index.bin");

export const INDEX_VERSION = 4;

const HADITH_COLLECTION_NAMES = {
  bukhari: "Sahih Bukhari",
  muslim: "Sahih Muslim",
  tirmidhi: "Jami at-Tirmidhi",
  "abi-dawud": "Sunan Abi Dawud",
  "an-nasai": "Sunan an-Nasai",
  "ibn-majah": "Sunan Ibn Majah",
  jawami_al_kalim: "Jawami al-Kalim",
};

// ─── Helpers ────────────────────────────────────────────────────────────────

const truncateForEmbedding = (text, maxLength) => {
  if (typeof text !== "string") return "";
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength).trimEnd()}…`;
};

const waitForUi = (ms = 8) => new Promise((resolve) => setTimeout(resolve, ms));

const getIndexDirectory = () =>
  new Directory(Paths.document, SEARCH_INDEX_DIRECTORY);

const getNativePath = (uri) =>
  decodeURIComponent(uri.replace(/^file:\/\//, ""));

const getIndexMetadataFile = () =>
  new File(Paths.document, SEARCH_INDEX_METADATA_FILE);

let searchShard = null;
let embeddingIndexLoaded = false;
let embeddingIndexLoadPromise = null;

const closeSearchShard = () => {
  if (!searchShard) return;
  searchShard.close();
  searchShard = null;
};

const removePersistedIndex = () => {
  closeSearchShard();
  const directory = getIndexDirectory();
  if (directory.exists) directory.delete();
  const metadataFile = getIndexMetadataFile();
  if (metadataFile.exists) metadataFile.delete();
};

const getIndexMetadata = (docs) => {
  const [fingerprintHigh, fingerprintLow] = getIndexFingerprint(docs);
  return {
    version: INDEX_VERSION,
    count: docs.length,
    fingerprintHigh,
    fingerprintLow,
  };
};

export const getPrebuiltIndexMetadata = (corpus) =>
  getIndexMetadata(corpus.all);

const createSearchShard = () => {
  const directory = getIndexDirectory();
  directory.create({ intermediates: true, idempotent: true });
  const shard = createShard(getNativePath(directory.uri), {
    vectors: { "": { size: EMBED_DIM, distance: "Cosine" } },
    hnsw_config: { m: 16, ef_construct: 100 },
    optimizers: { indexing_threshold: 10000 },
    wal_options: mobileWalDefaults(),
    max_search_threads: 2,
  });
  shard.createFieldIndex("type", "keyword");
  return shard;
};

// ─── Corpus ─────────────────────────────────────────────────────────────────

let corpusCache = null;
let corpusBuildPromise = null;
let jawamiCache = null;

const loadJawami = () => {
  if (jawamiCache) return jawamiCache;
  try {
    jawamiCache = require("../assets/Hadiths/jawami_al_kalim.json");
  } catch {
    jawamiCache = [];
  }
  if (!Array.isArray(jawamiCache)) jawamiCache = [];
  return jawamiCache;
};

/**
 * Build (once) the full search corpus. Each doc is a logical entity carrying
 * all of its translations. The build is chunked with `await` yields between
 * heavy JSON loads so the UI thread stays responsive.
 */
export function buildSearchCorpus(onProgress) {
  if (corpusCache) {
    if (typeof onProgress === "function") onProgress(1, 1);
    return Promise.resolve(corpusCache);
  }
  if (!corpusBuildPromise) {
    corpusBuildPromise = buildCorpusInternal(onProgress);
  }
  return corpusBuildPromise;
}

async function buildCorpusInternal(onProgress) {
  const report = (done, total) => {
    if (typeof onProgress === "function") onProgress(done, total);
  };

  const surahByName = new Map(getSurahNames().map((s) => [s.index, s]));

  // ── Quran: merge the four translations into one doc per verse ─────────────
  const quranByLang = {};
  const quranLangs = ["arabic", "english", "pashto", "dari"];
  for (const lang of quranLangs) {
    quranByLang[lang] = getQuranVerses(lang);
    await waitForUi(0);
  }

  const quranMap = new Map();
  for (const verse of quranByLang.arabic) {
    quranMap.set(verse.id, {
      surah: verse.surah,
      ayah: verse.ayah,
      arabic: verse.verse || "",
      english: "",
      pashto: "",
      dari: "",
    });
  }
  for (const lang of ["english", "pashto", "dari"]) {
    for (const verse of quranByLang[lang]) {
      const entry = quranMap.get(verse.id);
      if (entry) entry[lang] = verse.verse || "";
    }
  }

  const quranDocs = [];
  for (const [id, v] of quranMap) {
    const surahMeta = surahByName.get(v.surah) || {
      name: `Surah ${v.surah}`,
      tname: "",
    };
    quranDocs.push({
      type: "quran",
      id: `quran-${id}`,
      verseId: id,
      surahId: v.surah,
      ayah: v.ayah,
      translations: {
        arabic: v.arabic,
        english: v.english,
        pashto: v.pashto,
        dari: v.dari,
      },
      surahName: surahMeta.name || `Surah ${v.surah}`,
      surahTname: surahMeta.tname || "",
    });
  }

  report(1, 8);

  // ── Hadith: six collections, Arabic + English merged per hadith ────────────
  const hadithDocs = [];
  const collectionIds = getHadithCollectionIds();

  for (let ci = 0; ci < collectionIds.length; ci += 1) {
    const collection = collectionIds[ci];
    const arabicList = getAllHadiths(collection, "arabic");
    await waitForUi(0);
    const englishList = getAllHadiths(collection, "english");
    await waitForUi(0);

    const englishByKey = new Map();
    for (const hadith of englishList) {
      englishByKey.set(
        `${String(hadith?.reference?.book ?? "")}-${getHadithId(hadith)}`,
        hadith,
      );
    }

    const books = getHadithBooks(collection, "english");
    const bookNameById = new Map(
      books.map((b) => [String(b.bookNumber), b.bookName]),
    );
    const collectionName = HADITH_COLLECTION_NAMES[collection];

    arabicList.forEach((hadith, index) => {
      const hadithId = getHadithId(hadith);
      const bookNumber = String(hadith?.reference?.book ?? "");
      const english = englishByKey.get(`${bookNumber}-${hadithId}`);
      hadithDocs.push({
        type: "hadith",
        id: `hadith-${collection}-${bookNumber}-${hadithId || index}`,
        collection,
        collectionName,
        bookNumber,
        hadithId,
        translations: {
          arabic: hadith?.text || "",
          english: english?.text || "",
        },
        bookName: bookNameById.get(bookNumber) || `Book ${bookNumber}`,
      });
    });

    report(ci + 2, 8);
  }

  // ── Jawami' al-Kalim ──────────────────────────────────────────────────────
  for (const item of loadJawami()) {
    hadithDocs.push({
      type: "hadith",
      id: `jawami-${item?.id ?? ""}`,
      collection: "jawami_al_kalim",
      collectionName: HADITH_COLLECTION_NAMES.jawami_al_kalim,
      bookNumber: null,
      hadithId: String(item?.id ?? ""),
      translations: {
        arabic: item?.arabic || "",
        english: item?.english || "",
        pashto: item?.pashto || "",
        dari: item?.dari || "",
      },
      bookName: HADITH_COLLECTION_NAMES.jawami_al_kalim,
      embedding: null,
    });
  }

  report(8, 8);

  corpusCache = {
    quran: quranDocs,
    hadith: hadithDocs,
    all: [...quranDocs, ...hadithDocs],
  };
  return corpusCache;
}

// ─── Index identity ─────────────────────────────────────────────────────────
//
// The same language-independent text selection is used by the laptop index
// generator and determines whether the bundled index matches the corpus.

const embedTitleFor = (doc) =>
  doc.type === "quran"
    ? doc.surahName
    : doc.collectionName || doc.bookName || "";

const embedTextFor = (doc) =>
  doc.translations.english ||
  doc.translations.arabic ||
  doc.translations.pashto ||
  doc.translations.dari ||
  "";

export const getSearchDocumentEmbeddingInput = (doc) => {
  const title = truncateForEmbedding(embedTitleFor(doc), 48);
  const text =
    truncateForEmbedding(embedTextFor(doc), EMBEDDING_MAX_DOC_LENGTH) || title;
  return { title, text };
};

const getIndexFingerprint = (docs) => {
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  const update = (text) => {
    for (let i = 0; i < text.length; i += 1) {
      const code = text.charCodeAt(i);
      first = Math.imul(first ^ code, 0x01000193);
      second = Math.imul(second ^ code, 0x85ebca6b);
    }
    first = Math.imul(first ^ 0xff, 0x01000193);
    second = Math.imul(second ^ 0xff, 0x85ebca6b);
  };

  for (const doc of docs) {
    update(doc.id);
    update(truncateForEmbedding(embedTitleFor(doc), 48));
    update(
      truncateForEmbedding(embedTextFor(doc), EMBEDDING_MAX_DOC_LENGTH) ||
        truncateForEmbedding(embedTitleFor(doc), 48),
    );
  }

  return [first >>> 0, second >>> 0];
};

async function loadPrebuiltEmbeddingIndex(corpus, onProgress) {
  const docs = corpus.all;
  const expectedMetadata = getIndexMetadata(docs);
  const metadata = PREBUILT_INDEX_METADATA;
  if (
    metadata?.formatVersion !== PREBUILT_INDEX_FORMAT_VERSION ||
    metadata?.indexVersion !== expectedMetadata.version ||
    metadata?.dimension !== EMBED_DIM ||
    metadata?.recordBytes !== PREBUILT_INDEX_RECORD_BYTES ||
    metadata?.count !== expectedMetadata.count ||
    metadata?.fingerprintHigh !== expectedMetadata.fingerprintHigh ||
    metadata?.fingerprintLow !== expectedMetadata.fingerprintLow
  ) {
    throw new Error(
      "Bundled search index is missing or stale. Regenerate it with scripts/build-search-index.js.",
    );
  }

  try {
    const asset = Asset.fromModule(PREBUILT_INDEX_ASSET);
    await asset.downloadAsync();
    if (!asset.localUri) {
      throw new Error("Prebuilt search index asset is unavailable locally");
    }

    const bytes = await new File(asset.localUri).bytes();
    const expectedByteLength = docs.length * PREBUILT_INDEX_RECORD_BYTES;
    if (bytes.byteLength !== expectedByteLength) {
      throw new Error(
        `Prebuilt search index has ${bytes.byteLength} bytes; expected ${expectedByteLength}`,
      );
    }

    removePersistedIndex();
    searchShard = createSearchShard();
    const dataView = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const batchSize = 512;
    for (let start = 0; start < docs.length; start += batchSize) {
      const end = Math.min(start + batchSize, docs.length);
      const points = [];
      for (let index = start; index < end; index += 1) {
        const recordOffset = index * PREBUILT_INDEX_RECORD_BYTES;
        const scale = dataView.getFloat32(recordOffset, true);
        if (!Number.isFinite(scale) || scale <= 0) {
          throw new Error(`Prebuilt vector ${index} has an invalid scale`);
        }

        const quantized = new Int8Array(
          bytes.buffer,
          bytes.byteOffset + recordOffset + Float32Array.BYTES_PER_ELEMENT,
          EMBED_DIM,
        );
        const vector = Array.from(quantized, (value) => value * scale);
        if (!vector.every(Number.isFinite)) {
          throw new Error(`Prebuilt vector ${index} contains a non-finite value`);
        }
        points.push({
          id: index + 1,
          vector,
          payload: { type: docs[index].type },
        });
      }

      searchShard.upsert(points);
      if (typeof onProgress === "function") onProgress(end, docs.length);
      await waitForUi(0);
    }

    if (searchShard.count() !== docs.length) {
      throw new Error("Imported prebuilt search index is incomplete");
    }
    searchShard.optimize();
    searchShard.flush();

    const metadataFile = getIndexMetadataFile();
    metadataFile.create({ overwrite: true, intermediates: true });
    await metadataFile.write(JSON.stringify(expectedMetadata));
    return true;
  } catch (error) {
    removePersistedIndex();
    throw error;
  }
}

/**
 * Load the persisted Qdrant shard or import its bundled prebuilt vectors.
 * Throws when the bundled index is invalid; the app never embeds the corpus.
 */
export async function loadEmbeddingIndex(corpus, onProgress) {
  if (embeddingIndexLoaded && searchShard) return true;
  if (embeddingIndexLoadPromise) return embeddingIndexLoadPromise;

  embeddingIndexLoadPromise = loadEmbeddingIndexInternal(corpus, onProgress)
    .then((loaded) => {
      embeddingIndexLoaded = loaded;
      return loaded;
    })
    .finally(() => {
      embeddingIndexLoadPromise = null;
    });

  return embeddingIndexLoadPromise;
}

async function loadEmbeddingIndexInternal(corpus, onProgress) {
  try {
    const directory = getIndexDirectory();
    const metadataFile = getIndexMetadataFile();
    if (!directory.exists || !metadataFile.exists) {
      removePersistedIndex();
      return loadPrebuiltEmbeddingIndex(corpus, onProgress);
    }

    const storedMetadata = JSON.parse(await metadataFile.text());
    const expectedMetadata = getIndexMetadata(corpus.all);
    if (
      storedMetadata?.version !== expectedMetadata.version ||
      storedMetadata?.count !== expectedMetadata.count ||
      storedMetadata?.fingerprintHigh !== expectedMetadata.fingerprintHigh ||
      storedMetadata?.fingerprintLow !== expectedMetadata.fingerprintLow
    ) {
      removePersistedIndex();
      return loadPrebuiltEmbeddingIndex(corpus, onProgress);
    }

    closeSearchShard();
    searchShard = loadShard(getNativePath(directory.uri));
    if (searchShard.count() !== corpus.all.length) {
      removePersistedIndex();
      return loadPrebuiltEmbeddingIndex(corpus, onProgress);
    }

    return true;
  } catch (error) {
    console.warn("[Search] persisted Qdrant index could not be loaded", error);
    removePersistedIndex();
    return loadPrebuiltEmbeddingIndex(corpus, onProgress);
  }
}

// ─── Display resolution ─────────────────────────────────────────────────────

const resolveQuranText = (doc, language) =>
  language === "arabic" ? "" : doc.translations[language] || "";

const resolveHadith = (doc, language) => {
  if (language === "arabic") {
    return { text: doc.translations.arabic || "", language: "arabic" };
  }
  if (doc.translations[language]) {
    return { text: doc.translations[language], language };
  }
  if (doc.translations.english) {
    return { text: doc.translations.english, language: "english" };
  }
  return { text: doc.translations.arabic || "", language: "arabic" };
};

/** Convert `{ doc, score }` matches into the shape the result cards expect. */
export function toResultViewModels(scored, language) {
  return scored.map(({ doc, score }) => {
    if (doc.type === "quran") {
      return {
        type: "quran",
        id: doc.id,
        verseId: doc.verseId,
        surahId: doc.surahId,
        ayah: doc.ayah,
        arabic: doc.translations.arabic || "",
        translation: resolveQuranText(doc, language),
        translationLanguage: language,
        surahName: doc.surahName,
        surahTname: doc.surahTname,
        score,
      };
    }

    const resolved = resolveHadith(doc, language);
    return {
      type: "hadith",
      id: doc.id,
      collection: doc.collection,
      collectionName: doc.collectionName,
      bookNumber: doc.bookNumber,
      hadithId: doc.hadithId,
      text: resolved.text,
      bookName: doc.bookName,
      contentLanguage: resolved.language,
      score,
    };
  });
}

// ─── Semantic search ────────────────────────────────────────────────────────

/**
 * Embed the query and rank matching documents with Qdrant's HNSW index.
 * Returns at most MAX_RESULTS view models.
 */
export async function searchSemantic(
  query,
  corpus,
  embedder,
  filter,
  searchLanguage,
) {
  const q = (query || "").trim();
  if (!q || q.length < MIN_QUERY_LENGTH || !embedder || !embedder.isReady?.()) {
    return [];
  }
  const resultLanguage = normalizeSearchLanguage(searchLanguage);
  if (!resultLanguage) {
    throw new Error(`Unsupported search language: ${searchLanguage}`);
  }

  const queryVector = new Float32Array(
    await embedder.embed(
      EmbeddingTask.searchQuery(
        truncateForEmbedding(q, EMBEDDING_MAX_QUERY_LENGTH),
      ),
      EMBED_OPTIONS,
    ),
  );

  const dim = queryVector.length;
  if (dim !== EMBED_DIM || !queryVector.every(Number.isFinite)) {
    throw new Error("Query embedding has an invalid dimension or value");
  }

  if (!searchShard) {
    throw new Error("Qdrant search index is unavailable");
  }

  const request = {
    vector: Array.from(queryVector),
    limit: MAX_RESULTS,
    with_payload: false,
    score_threshold: SEMANTIC_MIN_SCORE,
    params: { hnsw_ef: SEARCH_HNSW_EF },
    ...(filter === "quran" || filter === "hadith"
      ? { filter: { must: [{ key: "type", match: { value: filter } }] } }
      : {}),
  };
  const scored = searchShard.search(request).map(({ id, score }) => {
    const docIndex = Number(id) - 1;
    const doc = corpus.all[docIndex];
    if (!Number.isSafeInteger(docIndex) || !doc) {
      throw new Error(`Qdrant returned an unknown document ID: ${id}`);
    }
    return { doc, score };
  });
  return toResultViewModels(scored, resultLanguage);
}
