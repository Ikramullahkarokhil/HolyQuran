import lunr from "lunr";
import mergedData from "./mergeData";

let idx;

function createIndex() {
  idx = lunr(function () {
    this.ref("id");
    this.field("surah");
    this.field("ayah");
    this.field("verse");
    this.field("translation_en");
    this.field("translation_ps");
    this.field("translation_dr");

    mergedData.forEach((verse) => {
      this.add(verse);
    });
  });
}

function searchQuran(query, language) {
  if (!idx) {
    createIndex();
  }
  const searchField = `translation_${language}`;
  return idx
    .search(`${searchField}:${query}`)
    .map((result) => mergedData[result.ref]);
}

export { searchQuran };
