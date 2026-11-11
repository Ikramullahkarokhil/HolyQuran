const TAJWEED_RULES = {
  default: {
    color: "#1F2937",
    backgroundColor: "rgba(31,41,55,0.08)",
    label: "Default",
    description: "Base Arabic text styling",
    translations: {
      english: { label: "Default", description: "Base Arabic text styling" },
      pashto: { label: "طبقه يادي", description: "د عربی سندرې اساسيز تزیین" },
      dari: { label: "پیش‌فرض", description: "اساس سبک عربی" },
    },
  },
  plain: {
    color: "#1F2937",
    backgroundColor: "transparent",
    label: "Plain",
    description: "Unannotated Arabic text",
    translations: {
      english: { label: "Plain", description: "Unannotated Arabic text" },
      pashto: { label: "ساده", description: "بېنښه عربی متن" },
      dari: { label: "ساده", description: "متن عربی بدون نشان" },
    },
  },
  hamzat_wasl: {
    color: "#F59E0B",
    backgroundColor: "rgba(245, 158, 11, 0.12)",
    label: "Hamzat al-Wasl",
    description: "Light hamzah linking a word to the next",
    translations: {
      english: { label: "Hamzat al-Wasl", description: "Light hamzah linking a word to the next" },
      pashto: { label: "همزه وصل", description: "د ټوټې له یوې کلمې څخه تر بلې پورې د نرمه همزه" },
      dari: { label: "همزه وصل", description: "همزهٔ نرم که کلمه را به کلمهٔ بعد وصل می‌کند" },
    },
  },
  madd_2: {
    color: "#10B981",
    backgroundColor: "rgba(16, 185, 129, 0.12)",
    label: "Madd 2",
    description: "Lengthening of two counts",
    translations: {
      english: { label: "Madd 2", description: "Lengthening of two counts" },
      pashto: { label: "مد ٢", description: "د دوه پورته مد" },
      dari: { label: "مد ۲", description: "بلند کردن به دو مقدار" },
    },
  },
  madd_246: {
    color: "#14B8A6",
    backgroundColor: "rgba(20, 184, 166, 0.12)",
    label: "Madd 2/4/6",
    description: "Lengthening of two, four, or six counts",
    translations: {
      english: { label: "Madd 2/4/6", description: "Lengthening of two, four, or six counts" },
      pashto: { label: "مد ٢/٤/٦", description: "د دوه، څلور یا شپږ پورته مد" },
      dari: { label: "مد ۲/۴/۶", description: "بلند کردن به دو، چهار یا شش مقدار" },
    },
  },
  madd_muttasil: {
    color: "#22C55E",
    backgroundColor: "rgba(34, 197, 94, 0.12)",
    label: "Madd Muttasil",
    description: "Connected elongation",
    translations: {
      english: { label: "Madd Muttasil", description: "Connected elongation" },
      pashto: { label: "مد متصل", description: "د متصل مد" },
      dari: { label: "مد متصل", description: "تمدید پیوسته" },
    },
  },
  madd_munfasil: {
    color: "#2DD4BF",
    backgroundColor: "rgba(45, 212, 191, 0.12)",
    label: "Madd Munfasil",
    description: "Separated elongation",
    translations: {
      english: { label: "Madd Munfasil", description: "Separated elongation" },
      pashto: { label: "مد منفصل", description: "د جلا مد" },
      dari: { label: "مد منفصل", description: "تمدید جداگانه" },
    },
  },
  madd_6: {
    color: "#A78BFA",
    backgroundColor: "rgba(167, 139, 250, 0.12)",
    label: "Madd 6",
    description: "Lengthening of six counts",
    translations: {
      english: { label: "Madd 6", description: "Lengthening of six counts" },
      pashto: { label: "مد ٦", description: "د شپږ پورته مد" },
      dari: { label: "مد ۶", description: "بلند کردن به شش مقدار" },
    },
  },
  lam_shamsiyyah: {
    color: "#60A5FA",
    backgroundColor: "rgba(96, 165, 250, 0.12)",
    label: "Lam Shamsiyyah",
    description: "Sun letter assimilation with the lam",
    translations: {
      english: { label: "Lam Shamsiyyah", description: "Sun letter assimilation with the lam" },
      pashto: { label: "لم شمسۍ", description: "د لام سره د شمسۍ تله" },
      dari: { label: "لام شمسیه", description: "مخلوط شدن حرف آفتاب با لام" },
    },
  },
  ghunnah: {
    color: "#8B5CF6",
    backgroundColor: "rgba(139, 92, 246, 0.12)",
    label: "Ghunnah",
    description: "Nasal resonance",
    translations: {
      english: { label: "Ghunnah", description: "Nasal resonance" },
      pashto: { label: "غنه", description: "د بینی له لارې غږ" },
      dari: { label: "غنه", description: "طنین بینی" },
    },
  },
  ikhfa: {
    color: "#F97316",
    backgroundColor: "rgba(249, 115, 22, 0.12)",
    label: "Ikhfa",
    description: "Concealment",
    translations: {
      english: { label: "Ikhfa", description: "Concealment" },
      pashto: { label: "اخفاء", description: "پوشیده کول" },
      dari: { label: "اخفاء", description: "پنهان‌کردن" },
    },
  },
  ikhfashafawi: {
    color: "#F97316",
    backgroundColor: "rgba(249, 115, 22, 0.12)",
    label: "Ikhfa Shafawi",
    description: "Concealment with the lips",
    translations: {
      english: { label: "Ikhfa Shafawi", description: "Concealment with the lips" },
      pashto: { label: "اخفاء شفوی", description: "د لبونو سره پټ کول" },
      dari: { label: "اخفاء شفوی", description: "پنهان‌کردن با لب‌ها" },
    },
  },
  ikhfa_shafawi: {
    color: "#F97316",
    backgroundColor: "rgba(249, 115, 22, 0.12)",
    label: "Ikhfa Shafawi",
    description: "Concealment with the lips",
    translations: {
      english: { label: "Ikhfa Shafawi", description: "Concealment with the lips" },
      pashto: { label: "اخفاء شفوی", description: "د لبونو سره پټ کول" },
      dari: { label: "اخفاء شفوی", description: "پنهان‌کردن با لب‌ها" },
    },
  },
  idghaam_ghunnah: {
    color: "#EF4444",
    backgroundColor: "rgba(239, 68, 68, 0.12)",
    label: "Idgham with Ghunnah",
    description: "Merging with nasal resonance",
    translations: {
      english: { label: "Idgham with Ghunnah", description: "Merging with nasal resonance" },
      pashto: { label: "ادغام په غنه سره", description: "د غنه سره یوځای کېدل" },
      dari: { label: "ادغام با غنه", description: "یکی شدن همراه با غنه" },
    },
  },
  idghaam_no_ghunnah: {
    color: "#F43F5E",
    backgroundColor: "rgba(244, 63, 94, 0.12)",
    label: "Idgham without Ghunnah",
    description: "Merging without nasal resonance",
    translations: {
      english: { label: "Idgham without Ghunnah", description: "Merging without nasal resonance" },
      pashto: { label: "ادغام پرته غنه", description: "بې غنه یوځای کېدل" },
      dari: { label: "ادغام بدون غنه", description: "یکی شدن بدون غنه" },
    },
  },
  idghaam_shafawi: {
    color: "#FB7185",
    backgroundColor: "rgba(251, 113, 133, 0.12)",
    label: "Idgham Shafawi",
    description: "Labial merging",
    translations: {
      english: { label: "Idgham Shafawi", description: "Labial merging" },
      pashto: { label: "ادغام شفوی", description: "د لبونو سره یوځای کېدل" },
      dari: { label: "ادغام شفوی", description: "یکی شدن با لب‌ها" },
    },
  },
  iqlab: {
    color: "#EC4899",
    backgroundColor: "rgba(236, 72, 153, 0.12)",
    label: "Iqlab",
    description: "Voice change of noon to meem",
    translations: {
      english: { label: "Iqlab", description: "Voice change of noon to meem" },
      pashto: { label: "اقلاب", description: "د نون څخه دې میم ته بدلیدل" },
      dari: { label: "اقلاب", description: "تغییر صدای نون به میم" },
    },
  },
  qalqalah: {
    color: "#D97706",
    backgroundColor: "rgba(217, 119, 6, 0.12)",
    label: "Qalqalah",
    description: "Echoing of the stopping letter",
    translations: {
      english: { label: "Qalqalah", description: "Echoing of the stopping letter" },
      pashto: { label: "قلقله", description: "د وقف حرفونو د رنځ په څېر د غږ راځیر" },
      dari: { label: "قلقلة", description: "بازتاب صدای حرف وقف" },
    },
  },
  silent: {
    color: "#64748B",
    backgroundColor: "rgba(100, 116, 139, 0.12)",
    label: "Silent",
    description: "No sound emitted",
    translations: {
      english: { label: "Silent", description: "No sound emitted" },
      pashto: { label: "خاموش", description: "هیڅ غږ نه دی راځي" },
      dari: { label: "خاموش", description: "هیچ صدایی برنمی‌خیزد" },
    },
  },
  idghaam_mutajanisayn: {
    color: "#0EA5E9",
    backgroundColor: "rgba(14, 165, 233, 0.12)",
    label: "Idgham Mutajanisayn",
    description: "Merging of similar letters",
    translations: {
      english: { label: "Idgham Mutajanisayn", description: "Merging of similar letters" },
      pashto: { label: "ادغام متجانسین", description: "د ورته حروف یوځای کېدل" },
      dari: { label: "ادغام متجانسین", description: "یکی شدن حروف مشابه" },
    },
  },
  idghaam_mutaqaribayn: {
    color: "#06B6D4",
    backgroundColor: "rgba(6, 182, 212, 0.12)",
    label: "Idgham Mutaqaribayn",
    description: "Merging of close letters",
    translations: {
      english: { label: "Idgham Mutaqaribayn", description: "Merging of close letters" },
      pashto: { label: "ادغام متقاربین", description: "د نږدې حروف یوځای کېدل" },
      dari: { label: "ادغام متقاربین", description: "یکی شدن حروف نزدیک" },
    },
  },
};

const tajweedDataCache = new Map();

const clampIndex = (value, maxLength) => {
  if (!Number.isFinite(value)) return null;
  const numeric = Number(value);
  if (numeric < 0) return 0;
  if (maxLength <= 0) return 0;
  return Math.min(Math.trunc(numeric), maxLength);
};

const normalizeAnnotation = (annotation, textLength = 0) => {
  if (!annotation || typeof annotation !== "object") return null;

  const start = clampIndex(annotation.start, textLength);
  const end = clampIndex(annotation.end, textLength);

  if (start === null || end === null) return null;
  if (end <= start) return null;

  const rawRule = typeof annotation.rule === "string" ? annotation.rule.trim() : "";
  const rule = rawRule || "default";

  return { start, end, rule };
};

const getTajweedSource = () => {
  if (tajweedDataCache.has("source")) {
    return tajweedDataCache.get("source");
  }

  try {
    const data = require("../assets/tajweed/tajweed.hafs.uthmani-pause-sajdah.json");
    const source = Array.isArray(data) ? data : [];
    tajweedDataCache.set("source", source);
    return source;
  } catch {
    tajweedDataCache.set("source", []);
    return [];
  }
};

const getTajweedAnnotationsForAyah = (surahNumber, ayahNumber) => {
  const surah = Number(surahNumber);
  const ayah = Number(ayahNumber);

  if (!Number.isFinite(surah) || !Number.isFinite(ayah)) {
    return [];
  }

  const cacheKey = `${surah}:${ayah}`;
  if (tajweedDataCache.has(cacheKey)) {
    return tajweedDataCache.get(cacheKey);
  }

  const data = getTajweedSource();
  const match = data.find(
    (entry) => Number(entry?.surah) === surah && Number(entry?.ayah) === ayah,
  );
  const annotations = Array.isArray(match?.annotations)
    ? match.annotations
        .map((annotation) => ({ ...annotation }))
        .filter(Boolean)
    : [];

  tajweedDataCache.set(cacheKey, annotations);
  return annotations;
};

const buildTajweedSegments = (verseText, annotations = []) => {
  const text = String(verseText ?? "");

  if (!text) {
    return [{ text: "", rule: "plain" }];
  }

  const items = Array.isArray(annotations)
    ? annotations
        .map((annotation) => normalizeAnnotation(annotation, text.length))
        .filter(Boolean)
        .sort((a, b) => a.start - b.start || a.end - b.end)
    : [];

  if (items.length === 0) {
    return [{ text, rule: "plain" }];
  }

  const merged = [];
  items.forEach((annotation) => {
    const previous = merged[merged.length - 1];
    if (!previous) {
      merged.push({ ...annotation });
      return;
    }

    if (annotation.start <= previous.end) {
      previous.end = Math.max(previous.end, annotation.end);
      if (previous.rule === "default" && annotation.rule !== "default") {
        previous.rule = annotation.rule;
      }
      return;
    }

    merged.push({ ...annotation });
  });

  const segments = [];
  let cursor = 0;

  merged.forEach((annotation) => {
    if (annotation.start > cursor) {
      segments.push({ text: text.slice(cursor, annotation.start), rule: "plain" });
    }

    const end = Math.min(annotation.end, text.length);
    if (end > annotation.start) {
      segments.push({
        text: text.slice(annotation.start, end),
        rule: annotation.rule || "default",
      });
      cursor = end;
    }
  });

  if (cursor < text.length) {
    segments.push({ text: text.slice(cursor), rule: "plain" });
  }

  return segments.length > 0 ? segments : [{ text, rule: "plain" }];
};

const normalizeTajweedLanguage = (language) => {
  if (!language) return "english";
  const lang = String(language).trim().toLowerCase();
  if (lang === "pa" || lang === "pashto") return "pashto";
  if (lang === "da" || lang === "dari" || lang === "fa" || lang === "persian") return "dari";
  if (lang === "en" || lang === "english") return "english";
  return "english";
};

const getLightThemeRuleColor = (color) => {
  const hex = String(color || "").replace("#", "");
  if (!/^[\da-f]{6}$/i.test(hex)) return color;

  const rgb = [0, 2, 4].map((offset) =>
    Number.parseInt(hex.slice(offset, offset + 2), 16),
  );
  const luminance = (channels) =>
    channels
      .map((channel) => {
        const value = channel / 255;
        return value <= 0.04045
          ? value / 12.92
          : ((value + 0.055) / 1.055) ** 2.4;
      })
      .reduce(
        (sum, value, index) =>
          sum + value * [0.2126, 0.7152, 0.0722][index],
        0,
      );

  for (let shade = 1; shade >= 0.35; shade -= 0.05) {
    const adjusted = rgb.map((channel) => Math.round(channel * shade));
    if (1.05 / (luminance(adjusted) + 0.05) >= 5) {
      return `#${adjusted.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
    }
  }

  return color;
};

const getTajweedRuleMeta = (rule, baseColors = {}, language = "english") => {
  const safeRule = String(rule || "default");
  const style = TAJWEED_RULES[safeRule] || TAJWEED_RULES.default;
  const localized = style.translations?.[normalizeTajweedLanguage(language)] || {};
  const isNeutralRule = safeRule === "default" || safeRule === "plain";
  const color = isNeutralRule
    ? baseColors.text || baseColors.onSurface || style.color
    : baseColors.dark
      ? style.color || baseColors.accent || "#1F2937"
      : getLightThemeRuleColor(
          style.color || baseColors.accent || "#1F2937",
        );

  return {
    ...style,
    color,
    backgroundColor:
      safeRule === "plain"
        ? "transparent"
        : safeRule === "default"
          ? baseColors.dark
            ? "rgba(255,255,255,0.08)"
            : "rgba(31,41,55,0.08)"
          : style.backgroundColor || "transparent",
    borderColor:
      isNeutralRule || !style.color ? "transparent" : `${color}55`,
    label: localized.label || style.label || safeRule.replace(/_/g, " "),
    description:
      localized.description || style.description || "Tajweed rule",
  };
};

const getTajweedStyleForRule = (rule, baseColors = {}, language = "english") => {
  const meta = getTajweedRuleMeta(rule, baseColors, language);
  return {
    color: meta.color,
    backgroundColor: meta.backgroundColor,
    borderColor: meta.borderColor,
    label: meta.label,
    description: meta.description,
  };
};

module.exports = {
  TAJWEED_RULES,
  normalizeTajweedLanguage,
  getTajweedAnnotationsForAyah,
  buildTajweedSegments,
  getTajweedRuleMeta,
  getTajweedStyleForRule,
  normalizeAnnotation,
};
