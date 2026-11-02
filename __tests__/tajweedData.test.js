const assert = require("node:assert/strict");
const {
  getTajweedAnnotationsForAyah,
  buildTajweedSegments,
  getTajweedStyleForRule,
  normalizeAnnotation,
} = require("../components/tajweedData");

const sampleVerse = "بِسۡمِ ٱللَّهِ ٱلرَّحۡمَٰنِ ٱلرَّحِيمِ";

const testSuite = () => {
  const annotations = getTajweedAnnotationsForAyah(1, 1);
  assert.ok(
    Array.isArray(annotations),
    "should return an array of annotations",
  );
  assert.ok(
    annotations.length > 0,
    "should contain tajweed annotations for Surah 1 Ayah 1",
  );

  const segments = buildTajweedSegments(sampleVerse, annotations);
  assert.ok(Array.isArray(segments), "segments should be returned as an array");
  assert.ok(segments.length > 0, "segment list should not be empty");
  assert.ok(
    segments.some((segment) => segment.rule),
    "should keep the rule metadata on each segment",
  );
  assert.equal(
    segments[0].text.length > 0,
    true,
    "first segment should carry visible text",
  );

  const plainTextSegments = buildTajweedSegments("abc", []);
  assert.deepEqual(plainTextSegments, [{ text: "abc", rule: "plain" }]);

  const invalidRange = normalizeAnnotation({ start: "invalid", end: 3 }, 10);
  assert.equal(invalidRange, null, "should reject invalid numeric ranges");

  const overlappingSegments = buildTajweedSegments("abcd", [
    { start: 1, end: 3, rule: "madd_2" },
    { start: 2, end: 4, rule: "hamzat_wasl" },
  ]);
  assert.equal(
    overlappingSegments.map((segment) => segment.text).join(""),
    "abcd",
    "should preserve the full verse when ranges overlap",
  );

  const style = getTajweedStyleForRule("madd_2");
  assert.ok(style.color, "should return a color for known tajweed rules");
  assert.ok(style.label, "should include a human-readable label");
};

testSuite();
console.log("tajweedData tests passed");
