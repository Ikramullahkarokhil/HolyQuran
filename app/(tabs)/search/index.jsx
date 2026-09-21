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
const DEBOUNCE_MS = 90;
const MIN_QUERY_LENGTH = 2;

const quranSearchIndexCache = new Map();
const hadithSearchIndexCache = new Map();

// Normalize Arabic for better matching
const normalizeArabic = (text) => {
  if (!text || typeof text !== "string") return "";
  return text
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/[آأإٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/[^\w\u0600-\u06FF\s]/g, " ")
    .toLowerCase()
    .trim();
};

const normalizeQuery = (q) => {
  if (!q || typeof q !== "string") return "";
  return normalizeArabic(q).toLowerCase().trim();
};

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
  if (searchText.includes(query)) return 100;

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

    if (queryToken.length < 4) continue;
    const maxDistance = queryToken.length < 7 ? 1 : 2;
    if (
      searchTokens.some(
        (token) =>
          getEditDistance(queryToken, token, maxDistance) <= maxDistance,
      )
    ) {
      score += 10;
    }
  }

  return score === queryTokens.length * 30 ? score + 50 : score;
};

const searchIndex = (index, query) => {
  const queryTokens = getSearchTokens(query);
  const scored = [];
  for (let i = 0; i < index.length; i++) {
    const item = index[i];
    const score = getMatchScore(
      item.searchText,
      query,
      item.searchTokens,
      queryTokens,
    );
    if (score > 0) {
      scored.push({ item, score });
    }
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, MAX_RESULTS).map(({ item }) => item);
};

// ─── Search engines ─────────────────────────────────────────────────────────

const buildQuranSearchIndex = (translationLanguage) => {
  const cacheKey = String(translationLanguage || "english");
  if (quranSearchIndexCache.has(cacheKey)) {
    return quranSearchIndexCache.get(cacheKey);
  }

  const arabicById = getArabicVersesById();
  const index = getQuranVerses(translationLanguage).map((item) => {
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

  quranSearchIndexCache.set(cacheKey, index);
  return index;
};

const searchQuran = (query, translationLanguage) => {
  const q = normalizeQuery(query);
  if (!q || q.length < MIN_QUERY_LENGTH) return [];
  return searchIndex(buildQuranSearchIndex(translationLanguage), q);
};

const buildHadithSearchIndex = (hadithLanguage) => {
  const cacheKey = String(hadithLanguage || "english");
  if (hadithSearchIndexCache.has(cacheKey)) {
    return hadithSearchIndexCache.get(cacheKey);
  }

  const index = [];
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
      index.push({
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

  if (Array.isArray(jawamiHadiths)) {
    for (const [itemIndex, item] of jawamiHadiths.entries()) {
      const textParts = [
        item.arabic,
        item.english,
        item.pashto,
        item.dari,
        item.title?.english,
        item.title?.pashto,
        item.title?.dari,
        item.source?.english,
      ]
        .filter(Boolean)
        .join(" ");
      const searchText = normalizeArabic(textParts);
      index.push({
        type: "hadith",
        id: `jawami-${item.id}-${itemIndex}`,
        collection: "jawami_al_kalim",
        bookNumber: null,
        hadithId: String(item.id),
        text: item.english || item.pashto || item.dari || item.arabic || "",
        arabic: item.arabic,
        bookName: "Jawami al-Kalim",
        searchText,
        searchTokens: getSearchTokens(searchText),
      });
    }
  }

  hadithSearchIndexCache.set(cacheKey, index);
  return index;
};

const searchHadiths = (query, hadithLanguage) => {
  const q = normalizeQuery(query);
  if (!q || q.length < MIN_QUERY_LENGTH) return [];
  return searchIndex(buildHadithSearchIndex(hadithLanguage), q);
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
          accessibilityLabel={`${t("Hadith")} ${item.bookName} ${item.hadithId || ""}`}
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
              {item.bookName}
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
      {t("Type at least 2 characters to search verses and hadiths.") ||
        "Type at least 2 characters to search verses and hadiths."}
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
  const hadithRtl = isRTL(hadithLang);
  const textAlign = getTextAlignment(language);
  const writingDirection = getWritingDirection(language);

  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [filter, setFilter] = useState("all"); // all | quran | hadith
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState([]);
  const [isFocused, setIsFocused] = useState(false);

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
    if (!q || q.length < MIN_QUERY_LENGTH) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setResults([]);
      setIsSearching(false);
      return;
    }

    const gen = ++searchGen.current;
    setIsSearching(true);

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
          primaryResults = searchHadiths(q, hadithLang);
        }

        if (gen === searchGen.current && isMounted.current) {
          setResults(primaryResults.slice(0, MAX_RESULTS));
          if (filter !== "all") setIsSearching(false);
        }

        if (filter !== "all") return;

        hadithTimer = setTimeout(() => {
          if (gen !== searchGen.current || !isMounted.current) return;

          try {
            const hadithResults = searchHadiths(q, hadithLang);
            if (gen === searchGen.current && isMounted.current) {
              setResults(mergeSearchResults(quranResults, hadithResults));
              setIsSearching(false);
            }
          } catch (err) {
            if (gen === searchGen.current && isMounted.current) {
              console.warn("[Search] hadith search failed", err);
              setResults(quranResults.slice(0, MAX_RESULTS));
              setIsSearching(false);
            }
          }
        }, 0);
      } catch (err) {
        if (gen === searchGen.current && isMounted.current) {
          console.warn("[Search] search failed", err);
          setResults([]);
          setIsSearching(false);
        }
      }
    }, 0);

    return () => {
      clearTimeout(timer);
      if (hadithTimer) clearTimeout(hadithTimer);
    };
  }, [debouncedQuery, filter, quranLang, hadithLang]);

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
          textAlign={hadithRtl ? "right" : "left"}
          writingDirection={hadithRtl ? "rtl" : "ltr"}
          t={t}
          index={index}
        />
      );
    },
    [colors, handleQuranPress, handleHadithPress, quranRtl, hadithRtl, t],
  );

  const keyExtractor = useCallback((item) => item.id, []);
  const getItemType = useCallback((item) => item.type, []);

  const showEmptyState =
    !debouncedQuery || debouncedQuery.length < MIN_QUERY_LENGTH;
  const showNoResults =
    !isSearching &&
    debouncedQuery.length >= MIN_QUERY_LENGTH &&
    results.length === 0;
  const showLoading = isSearching && results.length === 0;

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
