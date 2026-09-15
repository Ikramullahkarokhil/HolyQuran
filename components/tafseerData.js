const tafseerCache = new Map();
let pashtoTafseerData;

const loadPashtoTafseer = () => {
  if (!pashtoTafseerData) {
    pashtoTafseerData = require("../assets/Tafseer/pashto-mokhtasar.json");
  }
  return pashtoTafseerData;
};

const getPashtoTafseerForSurah = (surahNumber) => {
  const normalizedSurahNumber = String(surahNumber);
  const cachedTafseer = tafseerCache.get(normalizedSurahNumber);
  if (cachedTafseer) return cachedTafseer;

  const prefix = `${normalizedSurahNumber}:`;
  const tafseer = Object.entries(loadPashtoTafseer())
    .filter(([key]) => key.startsWith(prefix))
    .map(([key, value]) => ({
      id: key,
      ayah: Number(key.slice(prefix.length)),
      text: value?.text || "",
    }))
    .sort((first, second) => first.ayah - second.ayah);

  tafseerCache.set(normalizedSurahNumber, tafseer);
  return tafseer;
};

export { getPashtoTafseerForSurah };