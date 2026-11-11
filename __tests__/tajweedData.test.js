const assert = require("node:assert/strict");
const {
  TAJWEED_RULES,
  getTajweedAnnotationsForAyah,
  buildTajweedSegments,
  getTajweedStyleForRule,
  normalizeAnnotation,
} = require("../components/tajweedData");

const sampleVerse = "بِسۡمِ ٱللَّهِ ٱلرَّحۡمَٰنِ ٱلرَّحِيمِ";

const contrastAgainstWhite = (hex) => {
  const channels = hex
    .slice(1)
    .match(/.{2}/g)
    .map((channel) => Number.parseInt(channel, 16) / 255)
    .map((value) =>
      value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
    );
  const luminance = channels.reduce(
    (sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index],
    0,
  );
  return 1.05 / (luminance + 0.05);
};

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

  const lightPlainStyle = getTajweedStyleForRule("plain", {
    text: "#111111",
    dark: false,
  });
  assert.equal(
    lightPlainStyle.color,
    "#111111",
    "plain Arabic text should use the light theme text color",
  );
  assert.equal(
    lightPlainStyle.backgroundColor,
    "transparent",
    "plain Arabic text should have no highlight background",
  );

  const darkDefaultStyle = getTajweedStyleForRule("default", {
    text: "#f5f5f5",
    dark: true,
  });
  assert.equal(
    darkDefaultStyle.color,
    "#f5f5f5",
    "neutral Tajweed text should remain readable in dark theme",
  );
  assert.equal(
    darkDefaultStyle.backgroundColor,
    "rgba(255,255,255,0.08)",
    "neutral Tajweed highlighting should adapt to dark theme",
  );

  const lightRuleStyle = getTajweedStyleForRule("madd_2", {
    dark: false,
  });
  const darkRuleStyle = getTajweedStyleForRule("madd_2", { dark: true });
  assert.ok(
    contrastAgainstWhite(lightRuleStyle.color) >= 5,
    "Tajweed colors should remain legible on light surfaces",
  );
  assert.equal(
    darkRuleStyle.color,
    TAJWEED_RULES.madd_2.color,
    "dark theme should retain the Tajweed rule color",
  );
};

testSuite();
console.log("tajweedData tests passed");
