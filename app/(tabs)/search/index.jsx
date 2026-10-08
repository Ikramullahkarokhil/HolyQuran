import React, {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Pressable,
  StyleSheet,
  TextInput,
  View,
  Platform,
  StatusBar,
  Keyboard,
  ActivityIndicator,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  FadeIn,
  FadeInUp,
  cancelAnimation,
  interpolateColor,
} from "react-native-reanimated";
import { LegendList } from "@legendapp/list/react-native";
import { Icon, Text, useTheme } from "react-native-paper";
import { MaterialIcons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useRouter, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";

import {
  useAppLanguageStore,
  useQuranTranslationStore,
  useHadithTranslationStore,
} from "../../../components/store/store";
import {
  getTextAlignment,
  getWritingDirection,
  isRTL,
} from "../../../components/utils/rtlUtils";
import {
  getQuranVerses,
  getArabicVersesById,
  getSurahNames,
  getSurahByIndex,
} from "../../../components/quranData";
import { getAllHadiths, getHadithId } from "../../../components/hadithData";

// Optional: Jawami collection
let jawamiHadiths = [];
try {
  jawamiHadiths = require("../../../assets/Hadiths/jawami_al_kalim.json");
} catch {
  jawamiHadiths = [];
}

// ─── Utils ──────────────────────────────────────────────────────────────────

const withAlpha = (color, alpha) => {
  if (!color || typeof color !== "string") {
    return `rgba(37, 135, 216, ${alpha})`;
  }
  if (color.startsWith("#")) {
    const raw = color.replace("#", "");
    const normalized =
      raw.length === 3
        ? raw
            .split("")
            .map((c) => c + c)
            .join("")
        : raw;
    if (normalized.length !== 6) return `rgba(37, 135, 216, ${alpha})`;
    const r = Number.parseInt(normalized.slice(0, 2), 16);
    const g = Number.parseInt(normalized.slice(2, 4), 16);
    const b = Number.parseInt(normalized.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  return `rgba(37, 135, 216, ${alpha})`;
};

const safeHaptic = (fn) => {
  try {
    const result = fn();
    if (result && typeof result.catch === "function") result.catch(() => {});
  } catch {
    // no-op
  }
};

const PRESS_TIMING_IN = { duration: 70 };
const PRESS_TIMING_OUT = { duration: 90 };
const CHIP_TIMING = { duration: 110 };

const SURAH_LIST = getSurahNames();
const MAX_RESULTS = 80;
const DEBOUNCE_MS = 120;
const MIN_QUERY_LENGTH = 2;

const quranSearchIndexCache = new Map();
const hadithSearchIndexCache = new Map();
const jawamiSearchIndexCache = new Map();

// Normalize Arabic for better matching
const normalizeArabic = (text) => {
  if (!text || typeof text !== "string") return "";
  return text
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/\u0640/g, "")
    .replace(/[آأإٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/[ىی]/g, "ي")
    .replace(/[کك]/g, "ك")
    .replace(/[^\w\u0600-\u06FF\s]/g, " ")
    .toLowerCase()
    .trim();
};

const normalizeQuery = (q) => {
  if (!q || typeof q !== "string") return "";
  return normalizeArabic(q).toLowerCase().trim();
};

const PASHTO_SEARCH_MARKERS = [
  "او",
  "په",
  "چې",
  "څه",
  "دوی",
  "موږ",
  "له",
  "ته",
  "لپاره",
  "کوم",
  "دی",
  "ده",
].map(normalizeArabic);
const DARI_SEARCH_MARKERS = [
  "از",
  "در",
  "این",
  "است",
  "برای",
  "به",
  "با",
  "را",
  "من",
  "ما",
  "می",
].map(normalizeArabic);

const getSearchTokens = (text) =>
  normalizeArabic(text).split(/\s+/).filter(Boolean);

const getEditDistance = (left, right, maxDistance) => {
  if (Math.abs(left.length - right.length) > maxDistance)
    return maxDistance + 1;

  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex++) {
    const current = [leftIndex];
    let rowMinimum = current[0];

    for (let rightIndex = 1; rightIndex <= right.length; rightIndex++) {
      const cost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      const value = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + cost,
      );
      current.push(value);
      rowMinimum = Math.min(rowMinimum, value);
    }

    if (rowMinimum > maxDistance) return maxDistance + 1;
    previous = current;
  }

  return previous[right.length];
};

const getMatchScore = (
  searchText,
  query,
  searchTokens = getSearchTokens(searchText),
  queryTokens = getSearchTokens(query),
) => {
  if (!searchText || !query) return 0;
  if (!queryTokens.length || !searchTokens.length) return 0;

  let score = 0;
  for (const queryToken of queryTokens) {
    if (searchTokens.includes(queryToken)) {
      score += 30;
      continue;
    }

    if (searchTokens.some((token) => token.startsWith(queryToken))) {
      score += 20;
      continue;
    }

    if (queryToken.length < 4) return 0;
    const maxDistance = queryToken.length < 7 ? 1 : 2;
    if (
      !searchTokens.some(
        (token) => getEditDistance(queryToken, token, maxDistance) <= maxDistance,
      )
    )
      return 0;
    score += 10;
  }

  if (score === queryTokens.length * 30) score += 50;
  if (searchText.includes(query)) score += 100;
  return score;
};

const createSearchIndex = (items) => {
  const tokenPostings = new Map();
  const tokensByLength = new Map();

  items.forEach((item, itemIndex) => {
    const itemTokens = new Set(item.searchTokens);

    for (const token of itemTokens) {
      let posting = tokenPostings.get(token);
      if (!posting) {
        posting = [];
        tokenPostings.set(token, posting);
        const tokens = tokensByLength.get(token.length) || [];
        tokens.push(token);
        tokensByLength.set(token.length, tokens);
      }
      posting.push(itemIndex);
    }
  });

  const sortedTokens = [...tokenPostings.keys()].sort();
  return { items, tokenPostings, tokensByLength, sortedTokens };
};

const getCandidatePostings = (index, queryToken) => {
  let low = 0;
  let high = index.sortedTokens.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (index.sortedTokens[middle] < queryToken) low = middle + 1;
    else high = middle;
  }

  const prefixMatches = new Set();
  for (let tokenIndex = low; tokenIndex < index.sortedTokens.length; tokenIndex++) {
    const token = index.sortedTokens[tokenIndex];
    if (!token.startsWith(queryToken)) break;
    for (const itemIndex of index.tokenPostings.get(token)) {
      prefixMatches.add(itemIndex);
    }
  }
  if (prefixMatches.size) return [...prefixMatches].sort((a, b) => a - b);
  if (queryToken.length < 4) return [];

  const maxDistance = queryToken.length < 7 ? 1 : 2;
  const matchingItems = new Set();
  for (
    let tokenLength = Math.max(1, queryToken.length - maxDistance);
    tokenLength <= queryToken.length + maxDistance;
    tokenLength++
  ) {
    for (const token of index.tokensByLength.get(tokenLength) || []) {
      if (getEditDistance(queryToken, token, maxDistance) <= maxDistance) {
        for (const itemIndex of index.tokenPostings.get(token)) {
          matchingItems.add(itemIndex);
        }
      }
    }
  }
  return [...matchingItems].sort((a, b) => a - b);
};

const postingContains = (posting, itemIndex) => {
  let low = 0;
  let high = posting.length - 1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    if (posting[middle] === itemIndex) return true;
    if (posting[middle] < itemIndex) low = middle + 1;
    else high = middle - 1;
  }
  return false;
};

const searchIndex = (index, query) => {
  const queryTokens = [...new Set(getSearchTokens(query))];
  if (!queryTokens.length) return [];

  const postings = queryTokens
    .map((token) => getCandidatePostings(index, token))
    .sort((a, b) => a.length - b.length);
  if (postings.some((posting) => posting.length === 0)) return [];

  const scored = [];
  for (const itemIndex of postings[0]) {
    if (!postings.every((posting) => postingContains(posting, itemIndex)))
      continue;
    const item = index.items[itemIndex];
    const score = getMatchScore(
      item.searchText,
      query,
      item.searchTokens,
      queryTokens,
    );
    if (score > 0) {
      scored.push({ item, score, itemIndex });
    }
  }
  scored.sort((a, b) => b.score - a.score || a.itemIndex - b.itemIndex);
  return scored.slice(0, MAX_RESULTS).map(({ item }) => item);
};

// ─── Search engines ─────────────────────────────────────────────────────────

const buildQuranSearchIndex = (translationLanguage) => {
  const cacheKey = String(translationLanguage || "english");
  if (quranSearchIndexCache.has(cacheKey)) {
    return quranSearchIndexCache.get(cacheKey);
  }

  const arabicById = getArabicVersesById();
  const items = getQuranVerses(translationLanguage).map((item) => {
    const arabic = arabicById.get(item.id);
    const surahMeta =
      getSurahByIndex(item.surah) ||
      SURAH_LIST.find((surah) => surah.index === item.surah);
    const arabicText = arabic?.verse || "";
    const translationText = item.verse || "";

    const searchText = normalizeArabic(
      `${arabicText} ${translationText} ${surahMeta?.name || ""} ${surahMeta?.tname || ""} ${item.ayah || ""}`,
    );

    return {
      type: "quran",
      id: `quran-${item.id}`,
      verseId: item.id,
      surahId: item.surah,
      ayah: item.ayah || arabic?.ayah,
      arabic: arabicText,
      translation: translationText,
      surahName: surahMeta?.name || `Surah ${item.surah}`,
      surahTname: surahMeta?.tname || "",
      searchText,
      searchTokens: getSearchTokens(searchText),
    };
  });

  const index = createSearchIndex(items);
  quranSearchIndexCache.set(cacheKey, index);
  return index;
};

const searchQuran = (query, translationLanguage) => {
  const q = normalizeQuery(query);
  if (!q || q.length < MIN_QUERY_LENGTH) return [];
  return searchIndex(buildQuranSearchIndex(translationLanguage), q);
};

const getJawamiLanguages = (query, appLanguage, hadithLanguage) => {
  if (/[a-z]/i.test(query)) return ["english"];

  const queryTokens = getSearchTokens(query);
  const pashtoScore =
    (query.match(/[ټځڅډړږښڼۍېګ]/g)?.length || 0) +
    queryTokens.filter((token) =>
      PASHTO_SEARCH_MARKERS.some((word) => word.startsWith(token)),
    ).length;
  const dariScore =
    (query.match(/گ/g)?.length || 0) +
    queryTokens.filter((token) =>
      DARI_SEARCH_MARKERS.some((word) => word.startsWith(token)),
    ).length;
  if (pashtoScore > dariScore) return ["pashto"];
  if (dariScore > pashtoScore) return ["dari"];

  const normalizedAppLanguage = String(appLanguage || "").toLowerCase();
  if (normalizedAppLanguage === "pa" || normalizedAppLanguage === "pashto")
    return ["pashto"];
  if (
    normalizedAppLanguage === "da" ||
    normalizedAppLanguage === "dari" ||
    normalizedAppLanguage === "fa" ||
    normalizedAppLanguage === "persian"
  )
    return ["dari"];
  if (hadithLanguage === "arabic") return ["arabic"];
  return ["pashto", "dari"];
};

const buildHadithSearchIndex = (hadithLanguage) => {
  const cacheKey = String(hadithLanguage || "english");
  if (hadithSearchIndexCache.has(cacheKey)) {
    return hadithSearchIndexCache.get(cacheKey);
  }

  const items = [];
  for (const collection of ["bukhari", "muslim"]) {
    for (const [hadithIndex, hadith] of getAllHadiths(
      collection,
      hadithLanguage,
    ).entries()) {
      const id = getHadithId(hadith);
      const bookNumber = String(hadith?.reference?.book || "");
      const searchText = normalizeArabic(
        `${hadith.text || ""} ${id} ${hadith.reference?.book || ""} ${hadith.reference?.hadith || ""}`,
      );
      items.push({
        type: "hadith",
        id: `hadith-${collection}-${bookNumber}-${id}-${hadithIndex}`,
        collection,
        bookNumber,
        hadithId: id,
        text: hadith.text || "",
        bookName: hadith.bookName || `Book ${bookNumber}`,
        searchText,
        searchTokens: getSearchTokens(searchText),
      });
    }
  }

  const index = createSearchIndex(items);
  hadithSearchIndexCache.set(cacheKey, index);
  return index;
};

const buildJawamiSearchIndex = (language) => {
  if (jawamiSearchIndexCache.has(language)) {
    return jawamiSearchIndexCache.get(language);
  }

  const items = Array.isArray(jawamiHadiths)
    ? jawamiHadiths.map((item, itemIndex) => {
        const text = item[language] || "";
        const title = item.title?.[language] || "";
        const source = item.source?.[language] || "";
        const searchText = normalizeArabic(
          [text, title, source, item.id].filter(Boolean).join(" "),
        );
        return {
          type: "hadith",
          id: `jawami-${item.id}-${itemIndex}`,
          collection: "jawami_al_kalim",
          bookNumber: null,
          hadithId: String(item.id),
          text,
          bookName: "Jawami al-Kalim",
          contentLanguage: language,
          searchText,
          searchTokens: getSearchTokens(searchText),
        };
      })
    : [];

  const index = createSearchIndex(items);
  jawamiSearchIndexCache.set(language, index);
  return index;
};

const searchHadiths = (query, hadithLanguage, appLanguage) => {
  const q = normalizeQuery(query);
  if (!q || q.length < MIN_QUERY_LENGTH) return [];
  const jawamiLanguages = getJawamiLanguages(
    query,
    appLanguage,
    hadithLanguage,
  );
  const standardResults = searchIndex(
    buildHadithSearchIndex(hadithLanguage),
    q,
  );
  const jawamiResults = [];
  const seenJawamiIds = new Set();
  for (const language of jawamiLanguages) {
    for (const item of searchIndex(buildJawamiSearchIndex(language), q)) {
      if (seenJawamiIds.has(item.id)) continue;
      seenJawamiIds.add(item.id);
      jawamiResults.push(item);
    }
  }
  return mergeSearchResults(standardResults, jawamiResults);
};

const mergeSearchResults = (quranResults, hadithResults) => {
  const merged = [];
  const maxLen = Math.max(quranResults.length, hadithResults.length);
  for (let index = 0; index < maxLen; index++) {
    if (index < quranResults.length) merged.push(quranResults[index]);
    if (index < hadithResults.length) merged.push(hadithResults[index]);
  }
  return merged.slice(0, MAX_RESULTS);
};

// ─── Filter chip (modern, springy, accessible) ──────────────────────────────

const FilterChip = memo(({ label, active, onPress, colors, icon }) => {
  const scale = useSharedValue(1);
  const progress = useSharedValue(active ? 1 : 0);
  const backgroundColors = [
    withAlpha(colors.accent, active ? 0.82 : 0),
    withAlpha(colors.accent, active ? 1 : 0.18),
  ];
  const borderColors = [
    withAlpha(colors.accent, 0.35),
    withAlpha(colors.accent, 1),
  ];

  useEffect(() => {
    progress.value = withTiming(active ? 1 : 0, CHIP_TIMING);
  }, [active, progress]);

  const pressStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const animatedChipStyle = useAnimatedStyle(() => {
    return {
      backgroundColor: interpolateColor(
        progress.value,
        [0, 1],
        backgroundColors,
      ),
      borderColor: interpolateColor(progress.value, [0, 1], borderColors),
    };
  });

  return (
    <Animated.View style={[styles.chip, pressStyle, animatedChipStyle]}>
      <Pressable
        onPress={() => {
          safeHaptic(() =>
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light),
          );
          onPress?.();
        }}
        onPressIn={() => {
          cancelAnimation(scale);
          // eslint-disable-next-line react-hooks/immutability
          scale.value = withTiming(0.96, PRESS_TIMING_IN);
        }}
        onPressOut={() => {
          cancelAnimation(scale);
          // eslint-disable-next-line react-hooks/immutability
          scale.value = withTiming(1, PRESS_TIMING_OUT);
        }}
        style={styles.chipPressable}
        accessibilityRole="button"
        accessibilityState={{ selected: active }}
        accessibilityLabel={label}
      >
        {icon ? (
          <Icon
            source={icon}
            size={15}
            color={active ? "#fff" : colors.secondary}
            style={styles.chipIcon}
          />
        ) : null}
        <Text
          style={[styles.chipText, { color: active ? "#fff" : colors.text }]}
        >
          {label}
        </Text>
      </Pressable>
    </Animated.View>
  );
});
FilterChip.displayName = "FilterChip";

// ─── Result cards (elevated, modern, micro-interactions) ────────────────────

const QuranResultCard = memo(
  ({ item, colors, onPress, textAlign, writingDirection, t, index }) => {
    const scale = useSharedValue(1);

    const pressStyle = useAnimatedStyle(() => ({
      transform: [{ scale: scale.value }],
    }));

    return (
      <Animated.View style={pressStyle}>
        <Pressable
          onPress={() => onPress(item)}
          onPressIn={() => {
            cancelAnimation(scale);
            // eslint-disable-next-line react-hooks/immutability
            scale.value = withTiming(0.985, PRESS_TIMING_IN);
          }}
          onPressOut={() => {
            cancelAnimation(scale);
            // eslint-disable-next-line react-hooks/immutability
            scale.value = withTiming(1, PRESS_TIMING_OUT);
          }}
          style={({ pressed }) => [
            styles.resultCard,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              opacity: pressed ? 0.94 : 1,
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel={`${t("Quran")} ${item.surahName} ${t("Ayah")} ${item.ayah}`}
        >
          <View style={styles.resultBadgeRow}>
            <View
              style={[
                styles.typeBadge,
                { backgroundColor: withAlpha(colors.accent, 0.14) },
              ]}
            >
              <Icon
                source="book-open-page-variant"
                size={14}
                color={colors.accent}
              />
              <Text style={[styles.typeBadgeText, { color: colors.accent }]}>
                {t("Quran")}
              </Text>
            </View>
            <Text
              style={[styles.metaText, { color: colors.secondary }]}
              numberOfLines={1}
            >
              {item.surahName} · {t("Ayah")} {item.ayah}
            </Text>
          </View>

          {item.arabic ? (
            <Text
              style={[styles.arabicText, { color: colors.text }]}
              numberOfLines={3}
            >
              {item.arabic}
            </Text>
          ) : null}

          {item.translation ? (
            <Text
              style={[
                styles.translationText,
                {
                  color: colors.secondary,
                  textAlign,
                  writingDirection,
                },
              ]}
              numberOfLines={3}
            >
              {item.translation}
            </Text>
          ) : null}

          {/* Subtle accent bar */}
          <View
            style={[
              styles.cardAccent,
              { backgroundColor: withAlpha(colors.accent, 0.55) },
            ]}
          />
        </Pressable>
      </Animated.View>
    );
  },
);
QuranResultCard.displayName = "QuranResultCard";

const HadithResultCard = memo(
  ({ item, colors, onPress, textAlign, writingDirection, t, index }) => {
    const scale = useSharedValue(1);
    const bookName =
      item.collection === "jawami_al_kalim"
        ? t("Jawami al-Kalim")
        : item.bookName;

    const pressStyle = useAnimatedStyle(() => ({
      transform: [{ scale: scale.value }],
    }));

    return (
      <Animated.View style={pressStyle}>
        <Pressable
          onPress={() => onPress(item)}
          onPressIn={() => {
            cancelAnimation(scale);
            // eslint-disable-next-line react-hooks/immutability
            scale.value = withTiming(0.985, PRESS_TIMING_IN);
          }}
          onPressOut={() => {
            cancelAnimation(scale);
            // eslint-disable-next-line react-hooks/immutability
            scale.value = withTiming(1, PRESS_TIMING_OUT);
          }}
          style={({ pressed }) => [
            styles.resultCard,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              opacity: pressed ? 0.94 : 1,
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel={`${t("Hadith")} ${bookName} ${item.hadithId || ""}`}
        >
          <View style={styles.resultBadgeRow}>
            <View
              style={[
                styles.typeBadge,
                { backgroundColor: withAlpha("#8B5CF6", 0.14) },
              ]}
            >
              <Icon source="message-text" size={14} color="#8B5CF6" />
              <Text style={[styles.typeBadgeText, { color: "#8B5CF6" }]}>
                {t("Hadith")}
              </Text>
            </View>
            <Text
              style={[styles.metaText, { color: colors.secondary }]}
              numberOfLines={1}
            >
              {bookName}
              {item.hadithId ? ` · #${item.hadithId}` : ""}
            </Text>
          </View>

          {item.arabic ? (
            <Text
              style={[styles.arabicText, { color: colors.text }]}
              numberOfLines={2}
            >
              {item.arabic}
            </Text>
          ) : null}

          <Text
            style={[
              styles.translationText,
              {
                color: colors.secondary,
                textAlign,
                writingDirection,
              },
            ]}
            numberOfLines={4}
          >
            {item.text}
          </Text>

          <View
            style={[
              styles.cardAccent,
              { backgroundColor: withAlpha("#8B5CF6", 0.55) },
            ]}
          />
        </Pressable>
      </Animated.View>
    );
  },
);
HadithResultCard.displayName = "HadithResultCard";

// ─── Empty / Loading / No-results states ────────────────────────────────────

const EmptyState = memo(({ colors, rtl, textAlign, writingDirection, t }) => (
  <Animated.View entering={FadeIn.duration(320)} style={styles.emptyState}>
    <View
      style={[
        styles.emptyIconWrap,
        { backgroundColor: withAlpha(colors.accent, 0.12) },
      ]}
    >
      <MaterialIcons name="manage-search" size={42} color={colors.accent} />
    </View>
    <Text
      style={[
        styles.emptyTitle,
        { color: colors.text, textAlign, writingDirection },
      ]}
    >
      {t("Search Quran & Hadith") || "Search Quran & Hadith"}
    </Text>
    <Text
      style={[
        styles.emptyDesc,
        { color: colors.secondary, textAlign, writingDirection },
      ]}
    >
      {t("Search multiple words or part of a word. Type at least 2 characters.") ||
        "Search multiple words or part of a word. Type at least 2 characters."}
    </Text>
  </Animated.View>
));
EmptyState.displayName = "EmptyState";

const NoResultsState = memo(
  ({ colors, rtl, textAlign, writingDirection, t }) => (
    <Animated.View entering={FadeIn.duration(280)} style={styles.emptyState}>
      <View
        style={[
          styles.emptyIconWrap,
          { backgroundColor: withAlpha(colors.secondary, 0.1) },
        ]}
      >
        <MaterialIcons name="search-off" size={42} color={colors.secondary} />
      </View>
      <Text
        style={[
          styles.emptyTitle,
          { color: colors.text, textAlign, writingDirection },
        ]}
      >
        {t("No results found") || "No results found"}
      </Text>
      <Text
        style={[
          styles.emptyDesc,
          { color: colors.secondary, textAlign, writingDirection },
        ]}
      >
        {t("Try a different keyword or switch filter.") ||
          "Try a different keyword or switch filter."}
      </Text>
    </Animated.View>
  ),
);
NoResultsState.displayName = "NoResultsState";

const SearchErrorState = memo(({ colors, textAlign, writingDirection, t }) => (
  <Animated.View entering={FadeIn.duration(280)} style={styles.emptyState}>
    <View
      style={[
        styles.emptyIconWrap,
        { backgroundColor: withAlpha(colors.error, 0.1) },
      ]}
    >
      <MaterialIcons name="error-outline" size={42} color={colors.error} />
    </View>
    <Text
      style={[
        styles.emptyTitle,
        { color: colors.text, textAlign, writingDirection },
      ]}
    >
      {t("Search unavailable") || "Search unavailable"}
    </Text>
    <Text
      style={[
        styles.emptyDesc,
        { color: colors.secondary, textAlign, writingDirection },
      ]}
    >
      {t("Search could not be completed. Try changing your search.") ||
        "Search could not be completed. Try changing your search."}
    </Text>
  </Animated.View>
));
SearchErrorState.displayName = "SearchErrorState";

const LoadingState = memo(({ colors, t }) => (
  <Animated.View entering={FadeIn.duration(200)} style={styles.loadingState}>
    <ActivityIndicator size="large" color={colors.accent} />
    <Text style={[styles.loadingText, { color: colors.secondary }]}>
      {t("Searching…") || "Searching…"}
    </Text>
  </Animated.View>
));
LoadingState.displayName = "LoadingState";

// ─── Main screen ────────────────────────────────────────────────────────────

const Search = () => {
  const theme = useTheme();
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { language } = useAppLanguageStore();
  const { translationLanguage: quranLang } = useQuranTranslationStore();
  const { translationLanguage: hadithLang } = useHadithTranslationStore();

  const rtl = isRTL(language);
  const quranRtl = isRTL(quranLang);
  const textAlign = getTextAlignment(language);
  const writingDirection = getWritingDirection(language);

  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [filter, setFilter] = useState("all"); // all | quran | hadith
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState([]);
  const [searchError, setSearchError] = useState(null);
  const [isFocused, setIsFocused] = useState(false);
  const normalizedQuery = normalizeQuery(query);
  const normalizedDebouncedQuery = normalizeQuery(debouncedQuery);
  const isQueryPending = query.trim() !== debouncedQuery;

  const inputRef = useRef(null);
  const debounceTimer = useRef(null);
  const searchGen = useRef(0);
  const isMounted = useRef(true);

  const colors = useMemo(
    () => ({
      text: theme.colors.onSurface,
      secondary:
        theme.colors.onSurfaceVariant ||
        withAlpha(theme.colors.onSurface, 0.65),
      accent: theme.colors.progressColor || theme.colors.primary,
      surface: theme.colors.surface,
      background: theme.colors.background,
      border:
        theme.colors.outlineVariant ||
        (theme.dark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)"),
      shadow: theme.dark ? "#000" : "#000",
      primary: theme.colors.primary,
      buttonText: theme.colors.buttonText || "#fff",
      error: theme.colors.error,
      elevated: theme.dark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)",
    }),
    [theme],
  );

  // Cleanup on unmount
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, []);

  // Debounce query (snappier + reliable cancel)
  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      if (isMounted.current) {
        setDebouncedQuery(query.trim());
      }
    }, DEBOUNCE_MS);
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [query]);

  // Search Quran first so all-mode queries can render before the larger Hadith index finishes.
  useEffect(() => {
    const q = debouncedQuery;
    if (normalizeQuery(q).length < MIN_QUERY_LENGTH) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setResults([]);
      setIsSearching(false);
      setSearchError(null);
      return;
    }

    const gen = ++searchGen.current;
    setResults([]);
    setIsSearching(true);
    setSearchError(null);

    let hadithTimer;
    const timer = setTimeout(() => {
      if (gen !== searchGen.current || !isMounted.current) return;

      try {
        let quranResults = [];
        let primaryResults = [];

        if (filter === "all" || filter === "quran") {
          quranResults = searchQuran(q, quranLang);
          primaryResults = quranResults;
        } else {
          primaryResults = searchHadiths(q, hadithLang, language);
        }

        if (gen === searchGen.current && isMounted.current) {
          setResults(primaryResults.slice(0, MAX_RESULTS));
          if (filter !== "all") setIsSearching(false);
        }

        if (filter !== "all") return;

        hadithTimer = setTimeout(() => {
          if (gen !== searchGen.current || !isMounted.current) return;

          try {
            const hadithResults = searchHadiths(q, hadithLang, language);
            if (gen === searchGen.current && isMounted.current) {
              setResults(mergeSearchResults(quranResults, hadithResults));
              setIsSearching(false);
            }
          } catch (err) {
            if (gen === searchGen.current && isMounted.current) {
              console.warn("[Search] hadith search failed", err);
              setResults(quranResults.slice(0, MAX_RESULTS));
              setSearchError("partial");
              setIsSearching(false);
            }
          }
        }, 0);
      } catch (err) {
        if (gen === searchGen.current && isMounted.current) {
          console.warn("[Search] search failed", err);
          setResults([]);
          setSearchError("failed");
          setIsSearching(false);
        }
      }
    }, 0);

    return () => {
      clearTimeout(timer);
      if (hadithTimer) clearTimeout(hadithTimer);
    };
  }, [debouncedQuery, filter, quranLang, hadithLang, language]);

  useFocusEffect(
    useCallback(() => {
      // Optional auto-focus
      // inputRef.current?.focus();
      return () => {
        // Keep focus state clean
      };
    }, []),
  );

  const handleClear = useCallback(() => {
    safeHaptic(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
    setQuery("");
    setDebouncedQuery("");
    setResults([]);
    setSearchError(null);
    inputRef.current?.focus();
  }, []);

  const handleFilterChange = useCallback(
    (next) => {
      if (next === filter) return;
      safeHaptic(() => Haptics.selectionAsync());
      setFilter(next);
    },
    [filter],
  );

  const handleQuranPress = useCallback(
    (item) => {
      safeHaptic(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
      Keyboard.dismiss();
      router.push({
        pathname: "/SurahDetails",
        params: {
          surahId: String(item.surahId),
          surahName: item.surahName,
          ayahId: String(item.verseId),
        },
      });
    },
    [router],
  );

  const handleHadithPress = useCallback(
    (item) => {
      safeHaptic(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
      Keyboard.dismiss();

      if (item.collection === "jawami_al_kalim") {
        router.push({
          pathname: "/JawamiAlKalim",
          params: { hadithId: item.hadithId },
        });
        return;
      }

      router.push({
        pathname: "/Hadiths",
        params: {
          collection: item.collection,
          bookNumber: item.bookNumber,
          hadithNumber: item.hadithId,
        },
      });
    },
    [router],
  );

  const renderItem = useCallback(
    ({ item, index }) => {
      if (item.type === "quran") {
        return (
          <QuranResultCard
            item={item}
            colors={colors}
            onPress={handleQuranPress}
            textAlign={quranRtl ? "right" : "left"}
            writingDirection={quranRtl ? "rtl" : "ltr"}
            t={t}
            index={index}
          />
        );
      }
      return (
        <HadithResultCard
          item={item}
          colors={colors}
          onPress={handleHadithPress}
          textAlign={
            isRTL(item.contentLanguage || hadithLang) ? "right" : "left"
          }
          writingDirection={
            isRTL(item.contentLanguage || hadithLang) ? "rtl" : "ltr"
          }
          t={t}
          index={index}
        />
      );
    },
    [colors, handleQuranPress, handleHadithPress, quranRtl, hadithLang, t],
  );

  const keyExtractor = useCallback((item) => item.id, []);
  const getItemType = useCallback((item) => item.type, []);

  const showEmptyState = normalizedQuery.length < MIN_QUERY_LENGTH;
  const showNoResults =
    !isQueryPending &&
    !isSearching &&
    normalizedDebouncedQuery.length >= MIN_QUERY_LENGTH &&
    results.length === 0 &&
    searchError !== "failed";
  const showSearchError =
    !isQueryPending &&
    !isSearching &&
    (searchError === "failed" ||
      (searchError === "partial" && results.length === 0));
  const showLoading =
    normalizedQuery.length >= MIN_QUERY_LENGTH &&
    (isQueryPending || (isSearching && results.length === 0));

  const searchBarBorderColor = isFocused
    ? withAlpha(colors.accent, 0.55)
    : colors.border;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar
        barStyle={theme.dark ? "light-content" : "dark-content"}
        backgroundColor="transparent"
        translucent
      />

      {/* Search header */}
      <View
        style={[
          styles.searchHeader,
          {
            paddingTop: 12,
            backgroundColor: colors.background,
          },
        ]}
      >
        <Animated.View
          style={[
            styles.searchBar,
            {
              backgroundColor: colors.surface,
              borderColor: searchBarBorderColor,
              flexDirection: rtl ? "row-reverse" : "row",
            },
          ]}
        >
          <Icon
            source="magnify"
            size={22}
            color={isFocused ? colors.accent : colors.secondary}
            style={styles.searchIcon}
          />
          <TextInput
            ref={inputRef}
            value={query}
            onChangeText={setQuery}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            placeholder={t("Search Quran & Hadith") || "Search Quran & Hadith"}
            placeholderTextColor={colors.secondary}
            style={[
              styles.searchInput,
              {
                color: colors.text,
                textAlign,
                writingDirection,
              },
            ]}
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
            clearButtonMode="never"
            accessibilityLabel={
              t("Search Quran & Hadith") || "Search Quran & Hadith"
            }
          />
          {query.length > 0 ? (
            <Pressable
              onPress={handleClear}
              hitSlop={12}
              style={styles.clearBtn}
              accessibilityLabel={t("Clear") || "Clear"}
              accessibilityRole="button"
            >
              <Icon source="close-circle" size={20} color={colors.secondary} />
            </Pressable>
          ) : null}
        </Animated.View>

        {/* Filters */}
        <View
          style={[
            styles.chipRow,
            { flexDirection: rtl ? "row-reverse" : "row" },
          ]}
        >
          <FilterChip
            label={t("All") || "All"}
            active={filter === "all"}
            onPress={() => handleFilterChange("all")}
            colors={colors}
            icon="view-grid"
          />
          <FilterChip
            label={t("Quran") || "Quran"}
            active={filter === "quran"}
            onPress={() => handleFilterChange("quran")}
            colors={colors}
            icon="book-open-page-variant"
          />
          <FilterChip
            label={t("Hadith") || "Hadith"}
            active={filter === "hadith"}
            onPress={() => handleFilterChange("hadith")}
            colors={colors}
            icon="message-text"
          />
        </View>
      </View>

      {/* Content */}
      {showEmptyState ? (
        <EmptyState
          colors={colors}
          rtl={rtl}
          textAlign={textAlign}
          writingDirection={writingDirection}
          t={t}
        />
      ) : showLoading ? (
        <LoadingState colors={colors} t={t} />
      ) : showSearchError ? (
        <SearchErrorState
          colors={colors}
          textAlign={textAlign}
          writingDirection={writingDirection}
          t={t}
        />
      ) : showNoResults ? (
        <NoResultsState
          colors={colors}
          rtl={rtl}
          textAlign={textAlign}
          writingDirection={writingDirection}
          t={t}
        />
      ) : (
        <LegendList
          data={results}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          getItemType={getItemType}
          estimatedItemSize={148}
          drawDistance={320}
          recycleItems
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: insets.bottom + 28 },
          ]}
          ListHeaderComponent={
            <Animated.View entering={FadeInUp.duration(80)}>
              {searchError === "partial" ? (
                <Text
                  style={[
                    styles.searchWarning,
                    {
                      color: colors.error,
                      textAlign,
                      writingDirection,
                    },
                  ]}
                >
                  {t("Hadith search failed; showing Quran results only.") ||
                    "Hadith search failed; showing Quran results only."}
                </Text>
              ) : null}
              <Text
                style={[
                  styles.resultCount,
                  {
                    color: colors.secondary,
                    textAlign,
                    writingDirection,
                  },
                ]}
              >
                {results.length} {t("results") || "results"}
              </Text>
            </Animated.View>
          }
        />
      )}
    </View>
  );
};

export default Search;

// ====================== STYLES ======================
const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  searchHeader: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    zIndex: 10,
  },
  searchBar: {
    alignItems: "center",
    height: 52,
    borderRadius: 18,
    borderWidth: 1.5,
    paddingHorizontal: 14,
    gap: 10,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
      },
      android: {
        elevation: 3,
      },
    }),
  },
  searchIcon: {
    marginTop: 1,
  },
  searchInput: {
    flex: 1,
    fontSize: 16.5,
    paddingVertical: 0,
    height: "100%",
    letterSpacing: 0.15,
  },
  clearBtn: {
    padding: 4,
  },
  chipRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 14,
  },
  chip: {
    borderRadius: 14,
    borderWidth: 1.2,
    overflow: "hidden",
  },
  chipPressable: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 8,
    gap: 6,
  },
  chipIcon: {
    marginTop: 0.5,
  },
  chipText: {
    fontSize: 13.5,
    fontWeight: "600",
    letterSpacing: 0.25,
  },

  listContent: {
    paddingHorizontal: 16,
    paddingTop: 6,
  },
  resultCount: {
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 12,
    opacity: 0.8,
    letterSpacing: 0.2,
  },
  searchWarning: {
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 8,
  },

  resultCard: {
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
    marginBottom: 12,
    overflow: "hidden",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  cardAccent: {
    position: "absolute",
    left: 0,
    top: 14,
    bottom: 14,
    width: 3.5,
    borderTopRightRadius: 4,
    borderBottomRightRadius: 4,
  },
  resultBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
    gap: 10,
  },
  typeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 12,
  },
  typeBadgeText: {
    fontSize: 11.5,
    fontWeight: "700",
    letterSpacing: 0.25,
  },
  metaText: {
    fontSize: 12.5,
    fontWeight: "500",
    flexShrink: 1,
  },
  arabicText: {
    fontSize: 18.5,
    lineHeight: 34,
    textAlign: "right",
    writingDirection: "rtl",
    marginBottom: 8,
    fontWeight: "500",
  },
  translationText: {
    fontSize: 14.5,
    lineHeight: 22.5,
    opacity: 0.92,
  },

  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 40,
  },
  emptyIconWrap: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 19,
    fontWeight: "700",
    marginBottom: 10,
    letterSpacing: 0.2,
  },
  emptyDesc: {
    fontSize: 15,
    lineHeight: 23,
    textAlign: "center",
    opacity: 0.85,
    maxWidth: 310,
  },
  loadingState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
  },
  loadingText: {
    fontSize: 15,
    fontWeight: "500",
  },
});
