import ArabicQuran from "../../assets/QuranData/ArabicQuran.json";
import EnglishQuran from "../../assets/QuranData/EnglishQuran.json";
import PashtoQuran from "../../assets/QuranData/PashtoQuran.json";
import DariQuran from "../../assets/QuranData/PersianQuran.json";

const mergedData = [];

for (const [id, verse] of Object.entries(ArabicQuran["quran-uthmani-hafs"])) {
  const en = EnglishQuran[id] ? EnglishQuran[id].translation : "";
  const ps = PashtoQuran[id] ? PashtoQuran[id].translation : "";
  const dr = DariQuran[id] ? DariQuran[id].translation : "";

  mergedData.push({
    id: verse.id,
    surah: verse.surah,
    ayah: verse.ayah,
    verse: verse.verse,
    translation_en: en,
    translation_ps: ps,
    translation_dr: dr,
  });
}

export default mergedData;
