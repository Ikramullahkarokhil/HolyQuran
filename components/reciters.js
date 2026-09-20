import data from "../assets/QuranData/QuranAudio/reciters.json";
// adjust path to match your project

export const AYAH_COUNT = data.ayahCount;
export const RECITERS = data.reciters;
export const BASE_URL = data.baseUrl || "https://everyayah.com/data";

/** Pad surah/ayah to 3 digits: 1 → "001" */
export const pad3 = (n) => String(n).padStart(3, "0");

/** EveryAyah file name: SSSAAA.mp3 e.g. 001001.mp3 */
export const getAyahFileName = (surah, ayah) =>
  `${pad3(surah)}${pad3(ayah)}.mp3`;

/** Full remote URL for one ayah */
export const getAyahAudioUrl = (reciterId, surah, ayah) => {
  const reciter = RECITERS.find((r) => r.id === Number(reciterId));
  if (!reciter) return null;
  return `${BASE_URL}/${reciter.subfolder}/${getAyahFileName(surah, ayah)}`;
};

export const getReciterById = (id) =>
  RECITERS.find((r) => r.id === Number(id)) || null;

export const getAyahCountForSurah = (surah) =>
  AYAH_COUNT[Number(surah) - 1] ?? 0;

/** Popular Arabic murattal defaults for picker */
export const DEFAULT_RECITER_ID = 15; // Alafasy 128kbps
