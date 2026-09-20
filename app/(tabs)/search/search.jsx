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
  withSpring,
  withTiming,
  FadeIn,
  FadeOut,
  FadeInDown,
  cancelAnimation,
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
  getArabicVersesForSurah,
  getSurahNames,
  getSurahByIndex,
} from "../../../components/quranData";
import { getHadithId, getHadithsByBook } from "../../../components/hadithData";

// Optional: Jawami collection if present in the project
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

const PRESS_SPRING_IN = { damping: 18, stiffness: 420, mass: 0.45 };
const PRESS_SPRING_OUT = { damping: 16, stiffness: 300, mass: 0.5 };

const SURAH_LIST = getSurahNames();
const MAX_RESULTS = 80;
const DEBOUNCE_MS = 280;

// Normalize Arabic for better matching (strip common diacritics)
const normalizeArabic = (text) => {
  if (!text || typeof text !== "string") return "";
  return text
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/[آأإٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .toLowerCase()
    .trim();
};

const normalizeQuery = (q) => {
  if (!q || typeof q !== "string") return "";
  return normalizeArabic(q).toLowerCase().trim();
};

// ─── Search engines (client-side over existing data) ─────────────────────────

const searchQuran = (query, translationLanguage) => {
  const q = normalizeQuery(query);
  if (!q || q.length < 2) return [];

  const translationData = getQuranVerses(translationLanguage) || [];
  const results = [];

  // Build a quick Arabic lookup by id
  const arabicById = new Map();
  for (let s = 1; s <= 114; s++) {
    const verses = getArabicVersesForSurah(s) || [];
    for (const v of verses) {
      arabicById.set(v.id, v);
    }
  }

  for (const item of translationData) {
    if (results.length >= MAX_RESULTS) break;

    const arabic = arabicById.get(item.id);
    const arabicText = arabic?.verse || "";
    const translationText = item.verse || "";
    const surahMeta =
      getSurahByIndex?.(item.surah) ||
      SURAH_LIST.find((s) => s.index === item.surah);

    const haystack = normalizeArabic(
      `${arabicText} ${translationText} ${surahMeta?.name || ""} ${surahMeta?.tname || ""} ${item.ayah || ""}`,
    );

    if (haystack.includes(q)) {
      results.push({
        type: "quran",
        id: `quran-${item.id}`,
        verseId: item.id,
        surahId: item.surah,
        ayah: item.ayah || arabic?.ayah,
        arabic: arabicText,
        translation: translationText,
        surahName: surahMeta?.name || `Surah ${item.surah}`,
        surahTname: surahMeta?.tname || "",
      });
    }
  }

  return results;
};

const searchHadiths = (query, hadithLanguage) => {
  const q = normalizeQuery(query);
  if (!q || q.length < 2) return [];

  const results = [];
  const collections = [
    { key: "bukhari", books: 97 },
    { key: "muslim", books: 56 },
  ];

  for (const col of collections) {
    if (results.length >= MAX_RESULTS) break;

    // Search a reasonable range of books (performance guard)
    const maxBooks = Math.min(col.books, 40);
    for (let book = 1; book <= maxBooks; book++) {
      if (results.length >= MAX_RESULTS) break;
      let hadiths = [];
      try {
        hadiths = getHadithsByBook(col.key, hadithLanguage, String(book)) || [];
      } catch {
        continue;
      }

      for (const h of hadiths) {
        if (results.length >= MAX_RESULTS) break;
        const text = h.text || "";
        const id = getHadithId(h);
        const haystack = normalizeArabic(
          `${text} ${id} ${h.reference?.book || ""} ${h.reference?.hadith || ""}`,
        );
        if (haystack.includes(q)) {
          results.push({
            type: "hadith",
            id: `hadith-${col.key}-${id}`,
            collection: col.key,
            bookNumber: String(book),
            hadithId: id,
            text,
            bookName: h.bookName || `Book ${book}`,
          });
        }
      }
    }
  }

  // Jawami al-Kalim
  if (Array.isArray(jawamiHadiths) && results.length < MAX_RESULTS) {
    for (const item of jawamiHadiths) {
      if (results.length >= MAX_RESULTS) break;
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
      const haystack = normalizeArabic(textParts);
      if (haystack.includes(q)) {
        results.push({
          type: "hadith",
          id: `jawami-${item.id}`,
          collection: "jawami_al_kalim",
          bookNumber: null,
          hadithId: String(item.id),
          text: item.english || item.pashto || item.dari || item.arabic || "",
          arabic: item.arabic,
          bookName: "Jawami al-Kalim",
        });
      }
    }
  }

  return results;
};

// ─── Filter chip ────────────────────────────────────────────────────────────

const FilterChip = memo(({ label, active, onPress, colors }) => {
  const scale = useSharedValue(1);

  const pressStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={pressStyle}>
      <Pressable
        onPress={() => {
          safeHaptic(() =>
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light),
          );
          onPress?.();
        }}
        onPressIn={() => {
          cancelAnimation(scale);
          scale.value = withSpring(0.94, PRESS_SPRING_IN);
        }}
        onPressOut={() => {
          cancelAnimation(scale);
          scale.value = withSpring(1, PRESS_SPRING_OUT);
        }}
        style={[
          styles.chip,
          {
            backgroundColor: active ? colors.accent : colors.surface,
            borderColor: active ? colors.accent : colors.border,
          },
        ]}
        accessibilityRole="button"
        accessibilityState={{ selected: active }}
      >
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

// ─── Result cards ───────────────────────────────────────────────────────────

const QuranResultCard = memo(({ item, colors, onPress, rtl, t }) => {
  return (
    <Pressable
      onPress={() => onPress(item)}
      style={({ pressed }) => [
        styles.resultCard,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          opacity: pressed ? 0.92 : 1,
        },
      ]}
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
        <Text style={[styles.metaText, { color: colors.secondary }]}>
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
              textAlign: rtl ? "right" : "left",
              writingDirection: rtl ? "rtl" : "ltr",
            },
          ]}
          numberOfLines={3}
        >
          {item.translation}
        </Text>
      ) : null}
    </Pressable>
  );
});
QuranResultCard.displayName = "QuranResultCard";

const HadithResultCard = memo(({ item, colors, onPress, rtl, t }) => {
  return (
    <Pressable
      onPress={() => onPress(item)}
      style={({ pressed }) => [
        styles.resultCard,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          opacity: pressed ? 0.92 : 1,
        },
      ]}
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
        <Text style={[styles.metaText, { color: colors.secondary }]}>
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
            textAlign: rtl ? "right" : "left",
            writingDirection: rtl ? "rtl" : "ltr",
          },
        ]}
        numberOfLines={4}
      >
        {item.text}
      </Text>
    </Pressable>
  );
});
HadithResultCard.displayName = "HadithResultCard";

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
  const textAlign = getTextAlignment(language);
  const writingDirection = getWritingDirection(language);

  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [filter, setFilter] = useState("all"); // all | quran | hadith
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState([]);

  const inputRef = useRef(null);
  const debounceTimer = useRef(null);
  const searchGen = useRef(0);

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
    }),
    [theme],
  );

  // Debounce query
  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      setDebouncedQuery(query.trim());
    }, DEBOUNCE_MS);
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [query]);

  // Run search
  useEffect(() => {
    const q = debouncedQuery;
    if (!q || q.length < 2) {
      setResults([]);
      setIsSearching(false);
      return;
    }

    const gen = ++searchGen.current;
    setIsSearching(true);

    // Yield to UI thread then search
    const timer = setTimeout(() => {
      if (gen !== searchGen.current) return;

      let quranResults = [];
      let hadithResults = [];

      if (filter === "all" || filter === "quran") {
        quranResults = searchQuran(q, quranLang);
      }
      if (filter === "all" || filter === "hadith") {
        hadithResults = searchHadiths(q, hadithLang);
      }

      // Interleave slightly so both types appear early
      const merged = [];
      const maxLen = Math.max(quranResults.length, hadithResults.length);
      for (let i = 0; i < maxLen; i++) {
        if (i < quranResults.length) merged.push(quranResults[i]);
        if (i < hadithResults.length) merged.push(hadithResults[i]);
      }

      if (gen === searchGen.current) {
        setResults(merged.slice(0, MAX_RESULTS));
        setIsSearching(false);
      }
    }, 16);

    return () => clearTimeout(timer);
  }, [debouncedQuery, filter, quranLang, hadithLang]);

  useFocusEffect(
    useCallback(() => {
      // optional: auto-focus search on enter
      // inputRef.current?.focus();
    }, []),
  );

  const handleClear = useCallback(() => {
    setQuery("");
    setDebouncedQuery("");
    setResults([]);
    inputRef.current?.focus();
  }, []);

  const handleQuranPress = useCallback(
    (item) => {
      safeHaptic(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
      Keyboard.dismiss();
      router.push({
        pathname: "/(tabs)/quran/surah-details", // adjust to your actual route
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
          pathname: "/(tabs)/hadith/jawami", // adjust to your route
          params: { hadithId: item.hadithId },
        });
        return;
      }

      router.push({
        pathname: "/(tabs)/hadith/hadiths", // adjust to your route
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
    ({ item }) => {
      if (item.type === "quran") {
        return (
          <QuranResultCard
            item={item}
            colors={colors}
            onPress={handleQuranPress}
            rtl={rtl}
            t={t}
          />
        );
      }
      return (
        <HadithResultCard
          item={item}
          colors={colors}
          onPress={handleHadithPress}
          rtl={rtl}
          t={t}
        />
      );
    },
    [colors, handleQuranPress, handleHadithPress, rtl, t],
  );

  const keyExtractor = useCallback((item) => item.id, []);

  const showEmptyState = !debouncedQuery || debouncedQuery.length < 2;
  const showNoResults =
    !isSearching && debouncedQuery.length >= 2 && results.length === 0;

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
            paddingTop: insets.top + 10,
            backgroundColor: colors.background,
          },
        ]}
      >
        <View
          style={[
            styles.searchBar,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              flexDirection: rtl ? "row-reverse" : "row",
            },
          ]}
        >
          <Icon
            source="magnify"
            size={22}
            color={colors.secondary}
            style={styles.searchIcon}
          />
          <TextInput
            ref={inputRef}
            value={query}
            onChangeText={setQuery}
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
          />
          {query.length > 0 ? (
            <Pressable
              onPress={handleClear}
              hitSlop={10}
              style={styles.clearBtn}
              accessibilityLabel={t("Clear")}
            >
              <Icon source="close-circle" size={20} color={colors.secondary} />
            </Pressable>
          ) : null}
        </View>

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
            onPress={() => setFilter("all")}
            colors={colors}
          />
          <FilterChip
            label={t("Quran") || "Quran"}
            active={filter === "quran"}
            onPress={() => setFilter("quran")}
            colors={colors}
          />
          <FilterChip
            label={t("Hadith") || "Hadith"}
            active={filter === "hadith"}
            onPress={() => setFilter("hadith")}
            colors={colors}
          />
        </View>
      </View>

      {/* Content */}
      {showEmptyState ? (
        <View style={styles.emptyState}>
          <View
            style={[
              styles.emptyIconWrap,
              { backgroundColor: withAlpha(colors.accent, 0.12) },
            ]}
          >
            <MaterialIcons
              name="manage-search"
              size={40}
              color={colors.accent}
            />
          </View>
          <Text
            style={[
              styles.emptyTitle,
              {
                color: colors.text,
                textAlign,
                writingDirection,
              },
            ]}
          >
            {t("Search Quran & Hadith") || "Search Quran & Hadith"}
          </Text>
          <Text
            style={[
              styles.emptyDesc,
              {
                color: colors.secondary,
                textAlign,
                writingDirection,
              },
            ]}
          >
            {t("Type at least 2 characters to search verses and hadiths.") ||
              "Type at least 2 characters to search verses and hadiths."}
          </Text>
        </View>
      ) : isSearching && results.length === 0 ? (
        <View style={styles.loadingState}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={[styles.loadingText, { color: colors.secondary }]}>
            {t("Searching…") || "Searching…"}
          </Text>
        </View>
      ) : showNoResults ? (
        <View style={styles.emptyState}>
          <MaterialIcons name="search-off" size={44} color={colors.secondary} />
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
        </View>
      ) : (
        <LegendList
          data={results}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          estimatedItemSize={140}
          drawDistance={400}
          recycleItems
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: insets.bottom + 24 },
          ]}
          ListHeaderComponent={
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
    paddingHorizontal: 14,
    paddingBottom: 10,
    zIndex: 10,
  },
  searchBar: {
    alignItems: "center",
    height: 48,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    gap: 8,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06,
        shadowRadius: 4,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  searchIcon: {
    marginTop: 1,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    paddingVertical: 0,
    height: "100%",
  },
  clearBtn: {
    padding: 2,
  },
  chipRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
  },
  chipText: {
    fontSize: 13.5,
    fontWeight: "600",
    letterSpacing: 0.2,
  },

  listContent: {
    paddingHorizontal: 14,
    paddingTop: 4,
  },
  resultCount: {
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 10,
    opacity: 0.85,
  },

  resultCard: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    marginBottom: 10,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04,
        shadowRadius: 5,
      },
      android: {
        elevation: 1,
      },
    }),
  },
  resultBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
    gap: 8,
  },
  typeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  typeBadgeText: {
    fontSize: 11.5,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  metaText: {
    fontSize: 12.5,
    fontWeight: "500",
    flexShrink: 1,
  },
  arabicText: {
    fontSize: 18,
    lineHeight: 32,
    textAlign: "right",
    writingDirection: "rtl",
    marginBottom: 6,
    fontWeight: "500",
  },
  translationText: {
    fontSize: 14.5,
    lineHeight: 22,
    opacity: 0.92,
  },

  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 36,
  },
  emptyIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 18,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 8,
  },
  emptyDesc: {
    fontSize: 14.5,
    lineHeight: 22,
    textAlign: "center",
    opacity: 0.85,
    maxWidth: 300,
  },
  loadingState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  loadingText: {
    fontSize: 14.5,
    fontWeight: "500",
  },
});
