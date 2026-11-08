// searchEngine.js
//
// Semantic (AI) search engine for the Zād al-Hudā search screen, backed by the
// on-device EmbeddingGemma model. It builds a single, language-independent
// corpus covering *every* Quran translation (Arabic, English, Pashto, Dari) and
// *every* hadith (all six collections in Arabic and English, plus Jawami'
// al-Kalim), precomputes one embedding per entity, and persists that index to
// disk so searches are fast on every subsequent launch.
//
// Search = embed the query + a linear dot-product scan over the precomputed
// vectors (normalized, so dot product equals cosine similarity). No lexical
// fallback: every search goes through the model.

import { EmbeddingTask } from "react-native-litert-lm";
import { File, Paths } from "expo-file-system";

import { getQuranVerses, getSurahNames } from "./quranData";
import {
  getAllHadiths,
  getHadithBooks,
  getHadithCollectionIds,
  getHadithId,
} from "./hadithData";

// ─── Tunables ───────────────────────────────────────────────────────────────

export const MIN_QUERY_LENGTH = 2;
export const MAX_RESULTS = 60;

const EMBED_OPTIONS = { normalize: true, outputSize: 256 };
const EMBED_DIM = 256;
const EMBED_BATCH_SIZE = 64;
const MIN_EMBED_BATCH_SIZE = 8;
const EMBEDDING_MAX_QUERY_LENGTH = 220;
const EMBEDDING_MAX_DOC_LENGTH = 640;
const SEMANTIC_MIN_SCORE = 0.12;

export const INDEX_VERSION = 3;
const INDEX_FILE_NAME = "zad-semantic-index.bin";
const INDEX_MAGIC = 0x5a484958; // "ZHIX"
const INDEX_HEADER_BYTES = 28;
const QUANTIZED_VECTOR_BYTES = Float32Array.BYTES_PER_ELEMENT + EMBED_DIM;

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
      embedding: null,
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
        embedding: null,
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

const selectDocs = (corpus, filter) => {
  if (filter === "quran") return corpus.quran;
  if (filter === "hadith") return corpus.hadith;
  return corpus.all;
};

// ─── Embedding index ────────────────────────────────────────────────────────
//
// One embedding per entity. We embed the English translation as the semantic
// anchor (EmbeddingGemma is multilingual and English is its strongest pivot),
// falling back to Arabic. This keeps the index language-independent: switching
// the display translation never requires re-indexing.

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

/**
 * Embed every doc in the corpus. Vectors are copied out of native memory
 * (the library returns views that can be reused by later calls) and assigned
 * to `doc.embedding`. `onProgress(done, total)` reports chunk progress.
 */
export async function buildEmbeddingIndex(corpus, embedder, onProgress) {
  const docs = corpus.all;
  const total = docs.length;
  if (!embedder || typeof embedder.embedBatch !== "function") {
    throw new Error("Embedding model is unavailable");
  }

  let completed = 0;
  const embedAndStore = async (batch, inputs) => {
    let vectors;
    try {
      vectors = await embedder.embedBatch(inputs, EMBED_OPTIONS);
    } catch (error) {
      if (batch.length <= MIN_EMBED_BATCH_SIZE) throw error;
      const middle = Math.floor(batch.length / 2);
      await embedAndStore(batch.slice(0, middle), inputs.slice(0, middle));
      await embedAndStore(batch.slice(middle), inputs.slice(middle));
      return;
    }

    if (!Array.isArray(vectors) || vectors.length !== batch.length) {
      throw new Error(
        `Embedding batch returned ${vectors?.length ?? 0} vectors for ${batch.length} documents`,
      );
    }

    batch.forEach((doc, index) => {
      const vector = vectors[index];
      if (!vector || vector.length !== EMBED_DIM) {
        throw new Error(`Embedding for ${doc.id} has an invalid dimension`);
      }
      const copiedVector = new Float32Array(vector);
      if (!copiedVector.every(Number.isFinite)) {
        throw new Error(`Embedding for ${doc.id} contains a non-finite value`);
      }
      doc.embedding = copiedVector;
      doc.embeddingScale = 1;
    });

    completed += batch.length;
    if (typeof onProgress === "function") onProgress(completed, total);
    await waitForUi(0);
  };

  for (let i = 0; i < total; i += EMBED_BATCH_SIZE) {
    const batch = docs.slice(i, i + EMBED_BATCH_SIZE);
    const inputs = batch.map((doc) =>
      EmbeddingTask.document({
        title: truncateForEmbedding(embedTitleFor(doc), 48),
        text:
          truncateForEmbedding(embedTextFor(doc), EMBEDDING_MAX_DOC_LENGTH) ||
          truncateForEmbedding(embedTitleFor(doc), 48),
      }),
    );

    await embedAndStore(batch, inputs);
  }
}

/** Persist the index to the app cache so later launches load instantly. */
export async function saveEmbeddingIndex(corpus) {
  const docs = corpus.all;
  const count = docs.length;
  const [fingerprintHigh, fingerprintLow] = getIndexFingerprint(docs);
  const byteLength = INDEX_HEADER_BYTES + count * QUANTIZED_VECTOR_BYTES;
  const buffer = new ArrayBuffer(byteLength);
  const view = new DataView(buffer);

  view.setUint32(0, INDEX_MAGIC, false);
  view.setUint32(4, INDEX_VERSION, false);
  view.setUint32(8, EMBED_DIM, false);
  view.setUint32(12, count, false);
  view.setUint32(16, fingerprintHigh, false);
  view.setUint32(20, fingerprintLow, false);
  view.setUint32(24, 1, false);

  for (let i = 0; i < count; i += 1) {
    const vector = docs[i].embedding;
    if (!vector || vector.length !== EMBED_DIM) {
      throw new Error("Embedding index is incomplete");
    }
    const recordOffset = INDEX_HEADER_BYTES + i * QUANTIZED_VECTOR_BYTES;
    let maxAbs = 0;
    for (let j = 0; j < EMBED_DIM; j += 1) {
      if (!Number.isFinite(vector[j])) {
        throw new Error(
          `Embedding for ${docs[i].id} contains a non-finite value`,
        );
      }
      maxAbs = Math.max(maxAbs, Math.abs(vector[j]));
    }

    const scale = maxAbs > 0 ? maxAbs / 127 : 1;
    view.setFloat32(recordOffset, scale, false);
    const quantized = new Int8Array(
      buffer,
      recordOffset + Float32Array.BYTES_PER_ELEMENT,
      EMBED_DIM,
    );
    for (let j = 0; j < EMBED_DIM; j += 1) {
      quantized[j] = Math.max(
        -127,
        Math.min(127, Math.round(vector[j] / scale)),
      );
    }
  }

  const file = new File(Paths.cache, INDEX_FILE_NAME);
  file.create({ overwrite: true, intermediates: true });
  await file.write(new Uint8Array(buffer));
}

/**
 * Load a previously persisted index into `doc.embedding`. Returns false (and
 * leaves the corpus untouched) when the file is missing, stale, or corrupt, in
 * which case the caller should rebuild it.
 */
export async function loadEmbeddingIndex(corpus) {
  try {
    const file = new File(Paths.cache, INDEX_FILE_NAME);
    if (!file.exists) return false;

    const bytes = await file.bytes();
    if (!bytes || bytes.byteLength < INDEX_HEADER_BYTES) return false;

    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (view.getUint32(0, false) !== INDEX_MAGIC) return false;
    if (view.getUint32(4, false) !== INDEX_VERSION) return false;

    const dim = view.getUint32(8, false);
    const count = view.getUint32(12, false);
    if (dim !== EMBED_DIM || count !== corpus.all.length) return false;
    if (
      bytes.byteLength !==
      INDEX_HEADER_BYTES + count * QUANTIZED_VECTOR_BYTES
    ) {
      return false;
    }
    if (view.getUint32(24, false) !== 1) return false;
    const [fingerprintHigh, fingerprintLow] = getIndexFingerprint(corpus.all);
    if (
      view.getUint32(16, false) !== fingerprintHigh ||
      view.getUint32(20, false) !== fingerprintLow
    ) {
      return false;
    }

    for (let i = 0; i < count; i += 1) {
      const recordOffset = INDEX_HEADER_BYTES + i * QUANTIZED_VECTOR_BYTES;
      const scale = view.getFloat32(recordOffset, false);
      if (!Number.isFinite(scale) || scale <= 0) return false;
      corpus.all[i].embeddingScale = scale;
      corpus.all[i].embedding = new Int8Array(
        bytes.buffer,
        bytes.byteOffset +
          recordOffset +
          Float32Array.BYTES_PER_ELEMENT,
        EMBED_DIM,
      );
    }
    return true;
  } catch {
    return false;
  }
}

// ─── Display resolution ─────────────────────────────────────────────────────

const resolveQuranText = (doc, quranLang) =>
  doc.translations[quranLang] ||
  doc.translations.english ||
  doc.translations.arabic ||
  "";

const resolveHadithText = (doc, hadithLang) =>
  doc.translations[hadithLang] ||
  doc.translations.english ||
  doc.translations.arabic ||
  "";

/** Convert `{ doc, score }` matches into the shape the result cards expect. */
export function toResultViewModels(scored, display) {
  const { quranLang, hadithLang } = display;
  return scored.map(({ doc, score }) => {
    if (doc.type === "quran") {
      return {
        type: "quran",
        id: doc.id,
        verseId: doc.verseId,
        surahId: doc.surahId,
        ayah: doc.ayah,
        arabic: doc.translations.arabic || "",
        translation: resolveQuranText(doc, quranLang),
        surahName: doc.surahName,
        surahTname: doc.surahTname,
        score,
      };
    }

    return {
      type: "hadith",
      id: doc.id,
      collection: doc.collection,
      collectionName: doc.collectionName,
      bookNumber: doc.bookNumber,
      hadithId: doc.hadithId,
      text: resolveHadithText(doc, hadithLang),
      bookName: doc.bookName,
      contentLanguage: hadithLang === "arabic" ? "arabic" : "english",
      score,
    };
  });
}

// ─── Semantic search ────────────────────────────────────────────────────────

/**
 * Embed the query and rank every doc in `filter` by normalized dot product
 * (cosine similarity). Returns at most MAX_RESULTS view models.
 */
export async function searchSemantic(query, corpus, embedder, display, filter) {
  const q = (query || "").trim();
  if (!q || q.length < MIN_QUERY_LENGTH || !embedder || !embedder.isReady?.()) {
    return [];
  }

  const queryVector = new Float32Array(
    await embedder.embed(
      EmbeddingTask.searchQuery(
        truncateForEmbedding(q, EMBEDDING_MAX_QUERY_LENGTH),
      ),
      EMBED_OPTIONS,
    ),
  );

  const docs = selectDocs(corpus, filter);
  const scored = [];
  const dim = queryVector.length;
  if (dim !== EMBED_DIM || !queryVector.every(Number.isFinite)) {
    throw new Error("Query embedding has an invalid dimension or value");
  }

  for (const doc of docs) {
    const vector = doc.embedding;
    if (!vector || vector.length !== dim) {
      throw new Error(
        `Semantic index is missing a valid embedding for ${doc.id}`,
      );
    }

    let sum = 0;
    for (let i = 0; i < dim; i += 1) {
      sum += queryVector[i] * vector[i];
    }
    sum *= doc.embeddingScale ?? 1;

    if (sum > SEMANTIC_MIN_SCORE) {
      scored.push({ doc, score: sum });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return toResultViewModels(scored.slice(0, MAX_RESULTS), display);
}
