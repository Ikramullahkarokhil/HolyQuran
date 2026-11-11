#!/usr/bin/env node
/**
 * build-search-index.js
 *
 * Pure Node.js (zero dependencies) packer for the app's precomputed vectors.
 * Builds the corpus fingerprint and quantized format that searchEngine.js
 * expects. Embedding vectors are supplied separately with --vectors.
 *
 * Usage:
 *   npm run index:search -- --dry-run
 *   npm run index:search -- --vectors path/to/search-index-vectors.bin
 *   npm run index:search -- --export-documents path/to/search-documents.json
 *
 * The script itself never loads a neural-network library.
 * You must supply one 256-dim float32 vector per corpus document.
 */

import fs from "node:fs";
import { Buffer } from "node:buffer";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT = path.resolve(__dirname, "..");
const DIMENSION = 256;
const INDEX_VERSION = 4;
const FORMAT_VERSION = 1;
const RECORD_BYTES = 4 + DIMENSION; // float32 scale + int8[256]
const MAX_TITLE_LENGTH = 48;
const MAX_DOCUMENT_LENGTH = 640;

const COLLECTIONS = [
  [
    "bukhari",
    "Sahih Bukhari",
    "sahih_bukhari",
    "sahih_bukhari_arabic.json",
    "sahih_bukhari_english.json",
  ],
  [
    "muslim",
    "Sahih Muslim",
    "sahih_muslim",
    "sahih_muslim_arabic.json",
    "sahih_muslim_english.json",
  ],
  [
    "tirmidhi",
    "Jami at-Tirmidhi",
    "Jami_at-Tirmidhi",
    "tirmidhi_arabic.json",
    "tirmidhi_english.json",
  ],
  [
    "abi-dawud",
    "Sunan Abi Dawud",
    "Sunan_Abi_Dawud",
    "abi_dawud_arabic.json",
    "abi_dawud_english.json",
  ],
  [
    "an-nasai",
    "Sunan an-Nasai",
    "Sunan_an-Nasai",
    "an_nasai_arabic.json",
    "an_nasai_english.json",
  ],
  [
    "ibn-majah",
    "Sunan Ibn Majah",
    "Sunan_Ibn_Majah",
    "ibn_majah_arabic.json",
    "ibn_majah_english.json",
  ],
];

// ─── Helpers ────────────────────────────────────────────────────────────────

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function normalizeText(value) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim();
}

/** Truncate to ≤ length UTF-16 code units (JS string length). */
function truncateForEmbedding(value, length) {
  const normalized = normalizeText(value);
  if (!normalized) return "";
  if (normalized.length <= length) return normalized;
  return normalized.slice(0, length).replace(/\s+$/u, "") + "…";
}

function hadithId(item) {
  const reference = item?.reference || {};
  const value = reference.hadith ?? item?.hadithnumber ?? "";
  return String(value);
}

function hadithKey(item) {
  const reference = item?.reference || {};
  const bookNumber =
    reference.book !== undefined && reference.book !== null
      ? String(reference.book)
      : "";
  return `${bookNumber}-${hadithId(item)}`;
}

function embedText(translations) {
  for (const language of ["english", "arabic", "pashto", "dari"]) {
    const value = translations[language];
    if (value) return value;
  }
  return "";
}

function addDocument(documents, docId, docType, title, text) {
  documents.push({
    id: docId,
    type: docType,
    title: title || "",
    text: text || "",
  });
}

// ─── Corpus (identical order & IDs to searchEngine.js) ──────────────────────

function buildCorpus() {
  const quranRoot = path.join(ROOT, "assets", "QuranData");
  const quranLanguages = {
    arabic: "ArabicQuran.json",
    english: "EnglishQuran.json",
    pashto: "PashtoQuran.json",
    dari: "PersianQuran.json",
  };

  const versesByLanguage = {};
  for (const [language, filename] of Object.entries(quranLanguages)) {
    const data = readJson(path.join(quranRoot, filename));
    versesByLanguage[language] = Object.fromEntries(
      Object.values(data.quran["quran-uthmani-hafs"]).map((v) => [v.id, v]),
    );
  }

  const surahNames = Object.fromEntries(
    readJson(path.join(quranRoot, "QuranMetaData", "surahs.json")).map((s) => [
      s.index,
      s.name,
    ]),
  );

  const documents = [];

  // Quran
  for (const verse of Object.values(versesByLanguage.arabic)) {
    const verseId = verse.id;
    const title = surahNames[verse.surah] ?? `Surah ${verse.surah}`;
    const translations = {};
    for (const language of Object.keys(quranLanguages)) {
      translations[language] = versesByLanguage[language][verseId]?.verse ?? "";
    }
    addDocument(
      documents,
      `quran-${verseId}`,
      "quran",
      title,
      embedText(translations),
    );
  }

  // Six major collections
  const hadithRoot = path.join(ROOT, "assets", "Hadiths");
  for (const [
    collection,
    collectionName,
    directory,
    arabicFile,
    englishFile,
  ] of COLLECTIONS) {
    const collectionDir = path.join(hadithRoot, directory);
    const arabicHadiths = readJson(path.join(collectionDir, arabicFile));
    const englishHadiths = readJson(path.join(collectionDir, englishFile));
    const englishByKey = Object.fromEntries(
      englishHadiths.map((item) => [hadithKey(item), item]),
    );

    arabicHadiths.forEach((hadith, index) => {
      const identifier = hadithId(hadith);
      const reference = hadith.reference || {};
      const bookNumber =
        reference.book !== undefined && reference.book !== null
          ? String(reference.book)
          : "";
      const english = englishByKey[`${bookNumber}-${identifier}`];
      addDocument(
        documents,
        `hadith-${collection}-${bookNumber}-${identifier || index}`,
        "hadith",
        collectionName,
        english?.text || hadith.text || "",
      );
    });
  }

  // Jawami' al-Kalim
  for (const item of readJson(path.join(hadithRoot, "jawami_al_kalim.json"))) {
    const identifier = item.id;
    addDocument(
      documents,
      `jawami-${identifier !== undefined && identifier !== null ? identifier : ""}`,
      "hadith",
      "Jawami al-Kalim",
      embedText({
        english: item.english || "",
        arabic: item.arabic || "",
        pashto: item.pashto || "",
        dari: item.dari || "",
      }),
    );
  }

  return documents;
}

// ─── Fingerprint (bit-identical to searchEngine.js) ─────────────────────────

function fingerprint(documents) {
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;

  function update(value) {
    for (let i = 0; i < value.length; i++) {
      const codeUnit = value.charCodeAt(i);
      first = Math.imul(first ^ codeUnit, 0x01000193) >>> 0;
      second = Math.imul(second ^ codeUnit, 0x85ebca6b) >>> 0;
    }
    first = Math.imul(first ^ 0xff, 0x01000193) >>> 0;
    second = Math.imul(second ^ 0xff, 0x85ebca6b) >>> 0;
  }

  for (const document of documents) {
    const title = truncateForEmbedding(document.title, MAX_TITLE_LENGTH);
    const text =
      truncateForEmbedding(document.text, MAX_DOCUMENT_LENGTH) || title;
    update(document.id);
    update(title);
    update(text);
  }

  return [first, second];
}

function getMetadata(documents) {
  const [high, low] = fingerprint(documents);
  return {
    formatVersion: FORMAT_VERSION,
    indexVersion: INDEX_VERSION,
    count: documents.length,
    dimension: DIMENSION,
    recordBytes: RECORD_BYTES,
    fingerprintHigh: high,
    fingerprintLow: low,
  };
}

// ─── Vector quantization ────────────────────────────────────────────────────

function quantizeVector(vector) {
  // vector = Float32Array length DIMENSION, already L2-normalised
  let maxAbs = 0;
  for (let i = 0; i < DIMENSION; i++) {
    const a = Math.abs(vector[i]);
    if (a > maxAbs) maxAbs = a;
  }
  const scale = maxAbs > 0 ? maxAbs / 127.0 : 1.0;

  const quantized = new Int8Array(DIMENSION);
  for (let i = 0; i < DIMENSION; i++) {
    let q = Math.round(vector[i] / scale);
    if (q > 127) q = 127;
    if (q < -127) q = -127;
    quantized[i] = q;
  }
  return { scale, quantized };
}

// ─── Write final artefacts ──────────────────────────────────────────────────

function writeIndex(documents, vectors) {
  if (vectors.length !== documents.length) {
    throw new Error(
      `Expected ${documents.length} vectors, got ${vectors.length}`,
    );
  }

  const binaryPath = path.join(ROOT, "assets", "search-index.bin");
  const metadataPath = path.join(ROOT, "assets", "search-index.json");
  const binaryTmp = binaryPath + ".tmp";
  const metadataTmp = metadataPath + ".tmp";

  const fd = fs.openSync(binaryTmp, "w");

  try {
    for (let i = 0; i < documents.length; i++) {
      const vector = vectors[i];
      if (!(vector instanceof Float32Array) || vector.length !== DIMENSION) {
        throw new Error(`Vector ${i} has wrong type or length`);
      }
      if (!vector.every(Number.isFinite)) {
        throw new Error(`Vector ${i} contains non-finite values`);
      }

      const { scale, quantized } = quantizeVector(vector);

      const scaleBuf = Buffer.alloc(4);
      scaleBuf.writeFloatLE(scale, 0);
      fs.writeSync(fd, scaleBuf);
      fs.writeSync(fd, Buffer.from(quantized.buffer));
    }
    fs.closeSync(fd);

    const metadata = getMetadata(documents);
    fs.writeFileSync(
      metadataTmp,
      JSON.stringify(metadata, null, 2) + "\n",
      "utf8",
    );

    fs.renameSync(binaryTmp, binaryPath);
    fs.renameSync(metadataTmp, metadataPath);

    console.log(
      `Built ${metadata.count.toLocaleString()} vectors (${DIMENSION} dimensions)`,
    );
    console.log(`Index data: ${path.relative(ROOT, binaryPath)}`);
    console.log(`Metadata:   ${path.relative(ROOT, metadataPath)}`);
    console.log(
      `Data size:  ${(fs.statSync(binaryPath).size / (1024 * 1024)).toFixed(1)} MiB`,
    );
  } catch (err) {
    try {
      fs.closeSync(fd);
    } catch {}
    try {
      fs.unlinkSync(binaryTmp);
    } catch {}
    try {
      fs.unlinkSync(metadataTmp);
    } catch {}
    throw err;
  }
}

// ─── Optional: load pre-computed raw float32 vectors ────────────────────────
// File layout: consecutive Float32Array of shape [N, 256] (little-endian)

function loadPrecomputedVectors(filePath, expectedCount) {
  const buf = fs.readFileSync(filePath);
  const expectedBytes = expectedCount * DIMENSION * 4;
  if (buf.byteLength !== expectedBytes) {
    throw new Error(
      `Vector file has ${buf.byteLength} bytes; expected ${expectedBytes}`,
    );
  }
  const vectors = [];
  for (let i = 0; i < expectedCount; i++) {
    const offset = i * DIMENSION * 4;
    const slice = buf.buffer.slice(
      buf.byteOffset + offset,
      buf.byteOffset + offset + DIMENSION * 4,
    );
    vectors.push(new Float32Array(slice));
  }
  return vectors;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = { dryRun: false, vectors: null, exportDocuments: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") args.dryRun = true;
    else if (a === "--vectors" && argv[i + 1]) args.vectors = argv[++i];
    else if (a === "--export-documents" && argv[i + 1])
      args.exportDocuments = argv[++i];
    else if (a === "--help" || a === "-h") {
      console.log(`Usage: npm run index:search -- [options]

Options:
  --dry-run                      Only build corpus + fingerprint (no embedding)
  --export-documents <file>      Export exact document inputs for laptop embedding
  --vectors <file>               Path to float32[N×256] vectors
  -h, --help                     Show help
`);
      process.exit(0);
    } else {
      console.error(`Unknown argument: ${a}`);
      process.exit(1);
    }
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv);

  console.log("Building corpus…");
  const documents = buildCorpus();
  const metadata = getMetadata(documents);

  console.log(
    `Corpus: ${metadata.count.toLocaleString()} documents; ` +
      `fingerprint ${metadata.fingerprintHigh.toString(16).padStart(8, "0")}` +
      `${metadata.fingerprintLow.toString(16).padStart(8, "0")}`,
  );

  if (args.dryRun) {
    console.log("Dry-run complete – no embeddings generated.");
    return;
  }

  if (args.exportDocuments) {
    const outputPath = path.resolve(ROOT, args.exportDocuments);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    const exported = {
      formatVersion: FORMAT_VERSION,
      indexVersion: INDEX_VERSION,
      count: documents.length,
      fingerprintHigh: metadata.fingerprintHigh,
      fingerprintLow: metadata.fingerprintLow,
      documents: documents.map((document) => {
        const title = truncateForEmbedding(document.title, MAX_TITLE_LENGTH);
        return {
          id: document.id,
          title,
          text:
            truncateForEmbedding(document.text, MAX_DOCUMENT_LENGTH) || title,
        };
      }),
    };
    fs.writeFileSync(outputPath, JSON.stringify(exported), "utf8");
    console.log(`Exported ${metadata.count.toLocaleString()} documents to ${outputPath}`);
    return;
  }

  if (!args.vectors) {
    console.error(
      "\nThis script has zero dependencies and therefore cannot run EmbeddingGemma itself.\n" +
        "Export the corpus with --export-documents and generate vectors on your computer with:\n" +
        "  python3 scripts/generate-search-vectors.py --documents <export.json> --output <vectors.bin>\n" +
        "Then supply the generated vectors with:\n" +
        "  npm run index:search -- --vectors path/to/search-index-vectors.bin\n\n" +
        "Or use --dry-run to validate corpus + fingerprint only.",
    );
    process.exit(1);
  }

  console.log(`Loading vectors from ${args.vectors}`);
  const vectors = loadPrecomputedVectors(args.vectors, documents.length);
  writeIndex(documents, vectors);
}

main();
