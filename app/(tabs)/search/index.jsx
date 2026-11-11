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
  interpolateColor,
  Easing,
} from "react-native-reanimated";
import { LegendList } from "@legendapp/list/react-native";
import { Icon, Text, useTheme } from "react-native-paper";
import { MaterialIcons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  createEmbedder,
  EMBEDDING_GEMMA_2_TEXT_270M,
  ModelRegistry,
} from "react-native-litert-lm";

import { useAppLanguageStore } from "../../../components/store/store";
import {
  getTextAlignment,
  getWritingDirection,
  isRTL,
} from "../../../components/utils/rtlUtils";
import {
  buildSearchCorpus,
  loadEmbeddingIndex,
  searchSemantic,
  MIN_QUERY_LENGTH,
} from "../../../components/searchEngine";
import {
  getSearchLanguageForAppLocale,
  normalizeSearchLanguage,
  SEARCH_LANGUAGES,
} from "../../../components/searchQueryLanguage";

// ─── Constants ──────────────────────────────────────────────────────────────

const GEMMA_MODEL_LABEL = "EmbeddingGemma 2 Text (270M)";
const GEMMA_STATE_KEY = "holyquran:embeddinggemma-v2-state";
const MODEL_DISMISS_KEY = "holyquran:smartsearch-banner-dismissed";
const SEARCH_LANGUAGE_KEY = "holyquran:search-language";
const GEMMA_MODEL_TOTAL_BYTES = 165 * 1024 * 1024; // ~165 MB
const DEBOUNCE_MS = 160;
const SEARCH_TIMEOUT_MS = 12000;
const CHIP_TIMING = { duration: 140, easing: Easing.out(Easing.quad) };
const SEARCH_LANGUAGE_LABELS = {
  english: "English",
  pashto: "Pashto",
  dari: "Dari",
  arabic: "Arabic",
};

const getCachedGemmaModelTotalBytes = () => {
  try {
    if (!ModelRegistry.isCached(EMBEDDING_GEMMA_2_TEXT_270M)) {
      return GEMMA_MODEL_TOTAL_BYTES;
    }
    const path = ModelRegistry.getFilePath(EMBEDDING_GEMMA_2_TEXT_270M);
    const size = Number(ModelRegistry.getFileSizeBytes(path));
    if (Number.isFinite(size) && size > 0) return size;
  } catch {
    // fall back
  }
  return GEMMA_MODEL_TOTAL_BYTES;
};

// ─── Utils ──────────────────────────────────────────────────────────────────

const withAlpha = (color, alpha) => {
  "worklet";

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

const formatBytes = (value) => {
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const unitIndex = Math.min(
    units.length - 1,
    Math.floor(Math.log(value) / Math.log(1024)),
  );
  const size = value / 1024 ** unitIndex;
  return `${size.toFixed(size >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
};

const formatSpeed = (bytesPerSecond) => {
  if (!Number.isFinite(bytesPerSecond) || bytesPerSecond <= 0) return "0 B/s";
  if (bytesPerSecond < 1024) return `${Math.round(bytesPerSecond)} B/s`;
  if (bytesPerSecond < 1024 * 1024)
    return `${(bytesPerSecond / 1024).toFixed(1)} KB/s`;
  return `${(bytesPerSecond / (1024 * 1024)).toFixed(2)} MB/s`;
};

const formatEta = (remainingBytes, bytesPerSecond) => {
  if (
    !Number.isFinite(remainingBytes) ||
    remainingBytes <= 0 ||
    !Number.isFinite(bytesPerSecond) ||
    bytesPerSecond <= 0
  ) {
    return null;
  }
  const seconds = remainingBytes / bytesPerSecond;
  if (seconds < 60) return `~${Math.ceil(seconds)}s left`;
  if (seconds < 3600) return `~${Math.ceil(seconds / 60)}m left`;
  return `~${(seconds / 3600).toFixed(1)}h left`;
};

const waitForUi = (ms = 16) =>
  new Promise((resolve) => setTimeout(resolve, ms));

// ─── Model persistence ──────────────────────────────────────────────────────

const readGemmaState = async () => {
  try {
    const raw = await AsyncStorage.getItem(GEMMA_STATE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
};

const writeGemmaState = async (state) => {
  try {
    await AsyncStorage.setItem(GEMMA_STATE_KEY, JSON.stringify(state));
  } catch (error) {
    console.warn("[Search] failed to persist model state", error);
  }
};

const readDismissFlag = async () => {
  try {
    return (await AsyncStorage.getItem(MODEL_DISMISS_KEY)) === "1";
  } catch {
    return false;
  }
};

const writeDismissFlag = async (dismissed) => {
  try {
    await AsyncStorage.setItem(MODEL_DISMISS_KEY, dismissed ? "1" : "0");
  } catch {
    // ignore
  }
};

// ─── UI components ──────────────────────────────────────────────────────────

const FilterChip = memo(({ label, active, onPress, colors, icon }) => {
  const progress = useSharedValue(active ? 1 : 0);
  const inactiveBackground = withAlpha(colors.accent, 0);
  const activeBackground = withAlpha(colors.accent, 0.92);
  const inactiveBorder = withAlpha(colors.accent, 0.28);
  const activeBorder = withAlpha(colors.accent, 1);

  useEffect(() => {
    progress.value = withTiming(active ? 1 : 0, CHIP_TIMING);
  }, [active, progress]);

  const animatedChipStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      progress.value,
      [0, 1],
      [inactiveBackground, activeBackground],
    ),
    borderColor: interpolateColor(
      progress.value,
      [0, 1],
      [inactiveBorder, activeBorder],
    ),
  }));

  return (
    <Animated.View style={[styles.chip, animatedChipStyle]}>
      <Pressable
        onPress={() => {
          safeHaptic(() =>
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light),
          );
          onPress?.();
        }}
        style={({ pressed }) => [
          styles.chipPressable,
          { transform: [{ scale: pressed ? 0.96 : 1 }] },
        ]}
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

const QuranResultCard = memo(
  ({ item, colors, onPress, textAlign, writingDirection, t }) => (
    <Pressable
      onPress={() => onPress(item)}
      style={({ pressed }) => [
        styles.resultCard,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          opacity: pressed ? 0.93 : 1,
          transform: [{ scale: pressed ? 0.985 : 1 }],
        },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${t("Quran")} ${item.surahName} ${t("Ayah")} ${item.ayah}`}
    >
      <View style={styles.resultBadgeRow}>
        <View
          style={[
            styles.typeBadge,
            { backgroundColor: withAlpha(colors.accent, 0.13) },
          ]}
        >
          <Icon
            source="book-open-page-variant"
            size={13}
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
            { color: colors.secondary, textAlign, writingDirection },
          ]}
          numberOfLines={3}
        >
          {item.translation}
        </Text>
      ) : null}

      <View
        style={[
          styles.cardAccent,
          { backgroundColor: withAlpha(colors.accent, 0.55) },
        ]}
      />
    </Pressable>
  ),
);
QuranResultCard.displayName = "QuranResultCard";

const HadithResultCard = memo(
  ({ item, colors, onPress, textAlign, writingDirection, t }) => {
    const collectionName =
      item.collection === "jawami_al_kalim"
        ? t("Jawami al-Kalim")
        : t(item.collectionName);
    const bookName =
      item.collection === "jawami_al_kalim"
        ? collectionName
        : `${collectionName} · ${item.bookName}`;

    return (
      <Pressable
        onPress={() => onPress(item)}
        style={({ pressed }) => [
          styles.resultCard,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
            opacity: pressed ? 0.93 : 1,
            transform: [{ scale: pressed ? 0.985 : 1 }],
          },
        ]}
        accessibilityRole="button"
        accessibilityLabel={`${t("Hadith")} ${bookName} ${item.hadithId || ""}`}
      >
        <View style={styles.resultBadgeRow}>
          <View
            style={[
              styles.typeBadge,
              { backgroundColor: withAlpha("#8B5CF6", 0.13) },
            ]}
          >
            <Icon source="message-text" size={13} color="#8B5CF6" />
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

        <Text
          style={[
            styles.translationText,
            { color: colors.secondary, textAlign, writingDirection },
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
    );
  },
);
HadithResultCard.displayName = "HadithResultCard";

const EmptyState = memo(({ colors, t }) => (
  <Animated.View entering={FadeIn.duration(320)} style={styles.emptyState}>
    <View
      style={[
        styles.emptyIconWrap,
        { backgroundColor: withAlpha(colors.accent, 0.11) },
      ]}
    >
      <MaterialIcons name="manage-search" size={40} color={colors.accent} />
    </View>
    <Text style={[styles.emptyTitle, { color: colors.text }]}>
      {t("Search Quran & Hadith") || "Search Quran & Hadith"}
    </Text>
    <Text style={[styles.emptyDesc, { color: colors.secondary }]}>
      {t("AI search across all translations & hadiths by meaning.") ||
        "AI search across all translations & hadiths by meaning."}
    </Text>
  </Animated.View>
));
EmptyState.displayName = "EmptyState";

const NoResultsState = memo(({ colors, t }) => (
  <Animated.View entering={FadeIn.duration(280)} style={styles.emptyState}>
    <View
      style={[
        styles.emptyIconWrap,
        { backgroundColor: withAlpha(colors.secondary, 0.09) },
      ]}
    >
      <MaterialIcons name="search-off" size={40} color={colors.secondary} />
    </View>
    <Text style={[styles.emptyTitle, { color: colors.text }]}>
      {t("No results found") || "No results found"}
    </Text>
    <Text style={[styles.emptyDesc, { color: colors.secondary }]}>
      {t("Try a different keyword or switch filter.") ||
        "Try a different keyword or switch filter."}
    </Text>
  </Animated.View>
));
NoResultsState.displayName = "NoResultsState";

const SearchErrorState = memo(({ colors, t, message }) => (
  <Animated.View entering={FadeIn.duration(280)} style={styles.emptyState}>
    <View
      style={[
        styles.emptyIconWrap,
        { backgroundColor: withAlpha(colors.error, 0.1) },
      ]}
    >
      <MaterialIcons name="error-outline" size={40} color={colors.error} />
    </View>
    <Text style={[styles.emptyTitle, { color: colors.text }]}>
      {t("Search unavailable") || "Search unavailable"}
    </Text>
    <Text style={[styles.emptyDesc, { color: colors.secondary }]}>
      {message ||
        t("Search could not be completed. Try again.") ||
        "Search could not be completed. Try again."}
    </Text>
  </Animated.View>
));
SearchErrorState.displayName = "SearchErrorState";

const ModelRequiredState = memo(({ colors, t }) => (
  <Animated.View entering={FadeIn.duration(280)} style={styles.emptyState}>
    <View
      style={[
        styles.emptyIconWrap,
        { backgroundColor: withAlpha(colors.accent, 0.11) },
      ]}
    >
      <MaterialIcons name="auto-awesome" size={40} color={colors.accent} />
    </View>
    <Text style={[styles.emptyTitle, { color: colors.text }]}>
      {t("Smart search required") || "Smart search required"}
    </Text>
    <Text style={[styles.emptyDesc, { color: colors.secondary }]}>
      {t("Download the model above to search by meaning.") ||
        "Download the model above to search by meaning."}
    </Text>
  </Animated.View>
));
ModelRequiredState.displayName = "ModelRequiredState";

const LoadingState = memo(({ colors, t, label }) => (
  <Animated.View entering={FadeIn.duration(200)} style={styles.loadingState}>
    <ActivityIndicator size="large" color={colors.accent} />
    <Text style={[styles.loadingText, { color: colors.secondary }]}>
      {label || t("Searching…") || "Searching…"}
    </Text>
  </Animated.View>
));
LoadingState.displayName = "LoadingState";

// Thin progress bar that appears under the search bar while searching
const SearchProgressBar = memo(({ visible, colors }) => {
  const progress = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      progress.value = 0;
      progress.value = withTiming(0.72, {
        duration: 900,
        easing: Easing.out(Easing.quad),
      });
    } else {
      progress.value = withTiming(0, { duration: 180 });
    }
  }, [visible, progress]);

  const barStyle = useAnimatedStyle(() => ({
    width: `${progress.value * 100}%`,
    opacity: progress.value > 0.01 ? 1 : 0,
  }));

  if (!visible) return null;

  return (
    <View style={styles.progressTrack}>
      <Animated.View
        style={[
          styles.progressFill,
          { backgroundColor: colors.accent },
          barStyle,
        ]}
      />
    </View>
  );
});
SearchProgressBar.displayName = "SearchProgressBar";

// ─── Smart-search model / index panels ──────────────────────────────────────

const SmartSearchCard = memo(
  ({
    status,
    progress,
    bytes,
    total,
    speed,
    stage,
    etaLabel,
    onDownload,
    onCancel,
    onDismiss,
    colors,
    t,
    rtl,
  }) => {
    const isDownloading = status === "downloading";
    const isPreparing = status === "loading";
    const isError = status === "error";
    const isStopped = status === "stopped";

    const title = isDownloading
      ? t("Downloading smart search model") || "Downloading smart search model"
      : isPreparing
        ? t("Preparing smart search") || "Preparing smart search"
        : isError
          ? t("Smart search unavailable") || "Smart search unavailable"
          : isStopped
            ? t("Download paused") || "Download paused"
            : t("Enable Smart Search") || "Enable Smart Search";

    const description = isDownloading
      ? t("AI search works offline on this device.") ||
        "AI search works offline on this device."
      : isPreparing
        ? t("Loading the model…") || "Loading the model…"
        : t(
            "Search the Quran & hadith by meaning, not just exact words — fully on-device.",
          ) ||
          "Search the Quran & hadith by meaning, not just exact words — fully on-device.";

    const statusLabel = isDownloading
      ? `${Math.round(progress)}%`
      : isPreparing
        ? "…"
        : isError
          ? "Error"
          : isStopped
            ? "Paused"
            : "165 MB";

    const rowDirection = rtl ? "row-reverse" : "row";
    const contentAlign = rtl ? "right" : "left";

    return (
      <Animated.View
        entering={FadeIn.duration(260)}
        style={[
          styles.modelCard,
          { backgroundColor: colors.surface, borderColor: colors.border },
        ]}
      >
        <View style={[styles.modelCardHeader, { flexDirection: rowDirection }]}>
          <View
            style={[
              styles.modelIconWrap,
              { backgroundColor: withAlpha(colors.accent, 0.12) },
            ]}
          >
            <MaterialIcons
              name={isError ? "error-outline" : "auto-awesome"}
              size={22}
              color={isError ? colors.error : colors.accent}
            />
          </View>
          <View style={styles.modelCardText}>
            <Text
              style={[
                styles.modelCardTitle,
                { color: colors.text, textAlign: contentAlign },
              ]}
            >
              {title}
            </Text>
            <Text
              style={[
                styles.modelCardDesc,
                { color: colors.secondary, textAlign: contentAlign },
              ]}
              numberOfLines={3}
            >
              {description}
            </Text>
          </View>
        </View>

        {(isDownloading || isPreparing || isStopped || isError) && (
          <View
            style={[
              styles.modelProgressCard,
              { backgroundColor: withAlpha(colors.accent, 0.07) },
            ]}
          >
            <View
              style={[
                styles.modelProgressHeader,
                { flexDirection: rowDirection },
              ]}
            >
              <Text
                style={[
                  styles.modelProgressLabel,
                  { color: colors.text, textAlign: contentAlign },
                ]}
                numberOfLines={1}
              >
                {GEMMA_MODEL_LABEL}
              </Text>
              <View
                style={[
                  styles.modelStatusPill,
                  { backgroundColor: withAlpha(colors.accent, 0.14) },
                ]}
              >
                <Text
                  style={[styles.modelStatusText, { color: colors.accent }]}
                >
                  {statusLabel}
                </Text>
              </View>
            </View>

            <View
              style={[
                styles.modelProgressTrack,
                { backgroundColor: withAlpha(colors.secondary, 0.16) },
              ]}
            >
              <View
                style={[
                  styles.modelProgressFill,
                  {
                    width: `${Math.max(0, Math.min(100, progress))}%`,
                    backgroundColor: isError ? colors.error : colors.primary,
                  },
                ]}
              />
            </View>

            <View
              style={[
                styles.modelProgressFooter,
                { flexDirection: rowDirection },
              ]}
            >
              <Text
                style={[
                  styles.modelProgressMeta,
                  { color: colors.secondary, textAlign: contentAlign },
                ]}
                numberOfLines={2}
              >
                {stage}
                {etaLabel && isDownloading ? ` · ${etaLabel}` : ""}
                {isDownloading && total > 0
                  ? `\n${formatBytes(bytes)} / ${formatBytes(total)}`
                  : ""}
              </Text>
              {isDownloading ? (
                <Text style={[styles.modelSpeed, { color: colors.accent }]}>
                  {formatSpeed(speed)}
                </Text>
              ) : null}
            </View>
          </View>
        )}

        <View style={[styles.modelActionRow, { flexDirection: rowDirection }]}>
          {isDownloading || isPreparing ? (
            <Pressable
              onPress={isDownloading ? onCancel : undefined}
              disabled={isPreparing}
              style={({ pressed }) => [
                styles.modelAction,
                {
                  backgroundColor: pressed
                    ? withAlpha(colors.accent, 0.16)
                    : withAlpha(colors.accent, 0.1),
                  borderColor: withAlpha(colors.accent, 0.32),
                  opacity: isPreparing ? 0.55 : 1,
                  flex: 1,
                },
              ]}
            >
              <Text style={[styles.modelActionText, { color: colors.accent }]}>
                {isPreparing
                  ? t("Preparing…") || "Preparing…"
                  : t("Cancel") || "Cancel"}
              </Text>
            </Pressable>
          ) : (
            <Pressable
              onPress={onDownload}
              style={({ pressed }) => [
                styles.modelAction,
                styles.modelActionPrimary,
                {
                  backgroundColor: pressed
                    ? withAlpha(colors.accent, 0.85)
                    : colors.accent,
                  flex: 1,
                },
              ]}
            >
              <Text style={[styles.modelActionPrimaryText]}>
                {isError
                  ? t("Try again") || "Try again"
                  : isStopped
                    ? t("Resume download") || "Resume download"
                    : t("Download model") || "Download model"}
              </Text>
            </Pressable>
          )}

          {!isDownloading && !isPreparing && (
            <Pressable
              onPress={onDismiss}
              style={({ pressed }) => [
                styles.modelAction,
                {
                  backgroundColor: pressed
                    ? withAlpha(colors.secondary, 0.12)
                    : withAlpha(colors.secondary, 0.06),
                  borderColor: colors.border,
                },
              ]}
            >
              <Text
                style={[styles.modelActionText, { color: colors.secondary }]}
              >
                {t("Not now") || "Not now"}
              </Text>
            </Pressable>
          )}
        </View>
      </Animated.View>
    );
  },
);
SmartSearchCard.displayName = "SmartSearchCard";

const IndexingBanner = memo(
  ({ done, total, error, onRetry, colors, t, rtl }) => {
    const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
    const rowDirection = rtl ? "row-reverse" : "row";

    return (
      <Animated.View
        entering={FadeIn.duration(260)}
        style={[
          styles.modelCard,
          { backgroundColor: colors.surface, borderColor: colors.border },
        ]}
      >
        <View style={[styles.modelCardHeader, { flexDirection: rowDirection }]}>
          <View
            style={[
              styles.modelIconWrap,
              {
                backgroundColor: withAlpha(
                  error ? colors.error : colors.accent,
                  0.12,
                ),
              },
            ]}
          >
            <MaterialIcons
              name={error ? "error-outline" : "auto-awesome"}
              size={22}
              color={error ? colors.error : colors.accent}
            />
          </View>
          <View style={styles.modelCardText}>
            <Text
              style={[
                styles.modelCardTitle,
                {
                  color: colors.text,
                  textAlign: rtl ? "right" : "left",
                },
              ]}
            >
              {error
                ? t("Search index unavailable") || "Search index unavailable"
                : t("Loading bundled search index") ||
                  "Loading bundled search index"}
            </Text>
            <Text
              style={[
                styles.modelCardDesc,
                {
                  color: colors.secondary,
                  textAlign: rtl ? "right" : "left",
                },
              ]}
            >
              {error
                ? t(
                    "Bundled search index is missing or invalid. Rebuild it on your computer and include both search-index assets.",
                  ) ||
                  "Bundled search index is missing or invalid. Rebuild it on your computer and include both search-index assets."
                : t("Loading the bundled Quran and hadith search index.") ||
                  "Loading the bundled Quran and hadith search index."}
            </Text>
          </View>
        </View>

        {!error && (
          <View
            style={[
              styles.modelProgressCard,
              { backgroundColor: withAlpha(colors.accent, 0.07) },
            ]}
          >
            <View
              style={[
                styles.modelProgressTrack,
                { backgroundColor: withAlpha(colors.secondary, 0.16) },
              ]}
            >
              <View
                style={[
                  styles.modelProgressFill,
                  {
                    width: `${pct}%`,
                    backgroundColor: colors.primary,
                  },
                ]}
              />
            </View>
            <Text
              style={[
                styles.indexProgressText,
                { color: colors.secondary, textAlign: rtl ? "right" : "left" },
              ]}
            >
              {done.toLocaleString()} / {total.toLocaleString()} · {pct}%
            </Text>
          </View>
        )}

        {error && (
          <Pressable
            onPress={onRetry}
            style={({ pressed }) => [
              styles.modelAction,
              styles.modelActionPrimary,
              {
                backgroundColor: pressed
                  ? withAlpha(colors.accent, 0.85)
                  : colors.accent,
                marginTop: 14,
              },
            ]}
          >
            <Text style={[styles.modelActionPrimaryText]}>
              {t("Rebuild index") || "Rebuild index"}
            </Text>
          </Pressable>
        )}
      </Animated.View>
    );
  },
);
IndexingBanner.displayName = "IndexingBanner";

const SmartSearchDismissedRow = memo(({ onEnable, colors, t, rtl }) => (
  <Pressable
    onPress={onEnable}
    style={({ pressed }) => [
      styles.dismissedRow,
      {
        backgroundColor: colors.surface,
        borderColor: colors.border,
        opacity: pressed ? 0.92 : 1,
        flexDirection: rtl ? "row-reverse" : "row",
      },
    ]}
    accessibilityRole="button"
    accessibilityLabel={t("Enable Smart Search") || "Enable Smart Search"}
  >
    <MaterialIcons name="auto-awesome" size={16} color={colors.accent} />
    <Text
      style={[
        styles.dismissedRowText,
        { color: colors.secondary, textAlign: rtl ? "right" : "left" },
      ]}
    >
      {t("Smart search is off — tap to enable") ||
        "Smart search is off — tap to enable"}
    </Text>
    <MaterialIcons name="chevron-right" size={18} color={colors.secondary} />
  </Pressable>
));
SmartSearchDismissedRow.displayName = "SmartSearchDismissedRow";

const SmartSearchActivePill = memo(({ colors, t, rtl }) => (
  <View style={styles.activePillRow}>
    <View
      style={[
        styles.activePill,
        {
          backgroundColor: withAlpha(colors.accent, 0.1),
          flexDirection: rtl ? "row-reverse" : "row",
        },
      ]}
    >
      <MaterialIcons name="check-circle" size={14} color={colors.accent} />
      <Text style={[styles.activePillText, { color: colors.accent }]}>
        {t("Smart search active") || "Smart search active"}
      </Text>
    </View>
  </View>
));
SmartSearchActivePill.displayName = "SmartSearchActivePill";

// ─── Main screen ────────────────────────────────────────────────────────────

const Search = () => {
  const theme = useTheme();
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { language } = useAppLanguageStore();

  const rtl = isRTL(language);
  const [searchLanguage, setSearchLanguage] = useState(() =>
    getSearchLanguageForAppLocale(language),
  );
  const searchLanguageChanged = useRef(false);
  const textAlign = getTextAlignment(searchLanguage);
  const writingDirection = getWritingDirection(searchLanguage);

  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState([]);
  const [searchError, setSearchError] = useState(null);
  const [isFocused, setIsFocused] = useState(false);

  // Search index (corpus + embeddings)
  const [corpusReady, setCorpusReady] = useState(false);
  const [indexStatus, setIndexStatus] = useState("idle"); // idle | loading | ready | error
  const [indexProgress, setIndexProgress] = useState({ done: 0, total: 0 });
  const [indexRetry, setIndexRetry] = useState(0);

  // Model / runtime state
  const [modelStatus, setModelStatus] = useState("idle"); // idle | downloading | loading | ready | error | stopped
  const [modelProgress, setModelProgress] = useState(0);
  const [modelBytes, setModelBytes] = useState(0);
  const [modelSpeed, setModelSpeed] = useState(0);
  const [modelTotal, setModelTotal] = useState(GEMMA_MODEL_TOTAL_BYTES);
  const [modelStage, setModelStage] = useState("Model not downloaded");
  const [modelDismissed, setModelDismissed] = useState(false);

  const embedderRef = useRef(null);
  const corpusRef = useRef(null);
  const inputRef = useRef(null);
  const debounceTimer = useRef(null);
  const searchGen = useRef(0);
  const gemmaDownloadStartRef = useRef(0);
  const gemmaLastBytesRef = useRef(0);
  const gemmaLastSampleAtRef = useRef(0);
  const gemmaPauseRef = useRef(false);
  const gemmaDownloadSessionRef = useRef(0);
  const gemmaSpeedSamplesRef = useRef([]);

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(SEARCH_LANGUAGE_KEY)
      .then((savedLanguage) => {
        if (
          active &&
          !searchLanguageChanged.current &&
          normalizeSearchLanguage(savedLanguage)
        ) {
          setSearchLanguage(savedLanguage);
        }
      })
      .catch((error) => {
        console.error("[Search] failed to load search language", error);
      });

    return () => {
      active = false;
    };
  }, []);

  const handleSearchLanguageChange = useCallback((nextLanguage) => {
    if (!normalizeSearchLanguage(nextLanguage)) return;
    searchLanguageChanged.current = true;
    setSearchLanguage(nextLanguage);
    AsyncStorage.setItem(SEARCH_LANGUAGE_KEY, nextLanguage).catch((error) => {
      console.error("[Search] failed to save search language", error);
    });
  }, []);

  const modelReady = modelStatus === "ready";
  const searchReady = modelReady && corpusReady && indexStatus === "ready";

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
      primary: theme.colors.primary,
      error: theme.colors.error,
    }),
    [theme],
  );

  const clearSearchState = useCallback(() => {
    setResults([]);
    setIsSearching(false);
    setSearchError(null);
  }, []);

  // Bootstrap embedder + restore previous model state + build search corpus
  useEffect(() => {
    let active = true;

    (async () => {
      // 1. Embedder + persisted model state
      try {
        const embedder = createEmbedder();
        embedderRef.current = embedder;

        const [saved, dismissed] = await Promise.all([
          readGemmaState(),
          readDismissFlag(),
        ]);
        if (!active) return;

        setModelDismissed(dismissed);
        const cachedBytes = getCachedGemmaModelTotalBytes();
        setModelTotal(cachedBytes);

        if (
          saved?.ready &&
          ModelRegistry.isCached(EMBEDDING_GEMMA_2_TEXT_270M)
        ) {
          setModelStatus("loading");
          setModelStage("Loading EmbeddingGemma…");
          setModelProgress(88);
          setModelBytes(cachedBytes);
          try {
            await embedder.loadModel(EMBEDDING_GEMMA_2_TEXT_270M, {
              maxInputLength: 256,
            });
            if (!active) return;
            setModelStatus("ready");
            setModelProgress(100);
            setModelBytes(cachedBytes);
            setModelTotal(cachedBytes);
            setModelStage("Smart search ready");
          } catch (loadErr) {
            console.warn("[Search] previous model load failed", loadErr);
            if (!active) return;
            setModelStatus("idle");
            setModelStage("Model not downloaded");
            setModelBytes(0);
          }
        } else {
          setModelStatus("idle");
          setModelStage("Model not downloaded");
          setModelBytes(0);
        }
      } catch (err) {
        console.warn("[Search] embedder init failed", err);
        if (active) {
          setModelStatus("error");
          setModelStage("Runtime unavailable");
        }
      }

      // 2. Build the full search corpus in the background
      try {
        const corpus = await buildSearchCorpus();
        if (!active) return;
        corpusRef.current = corpus;
        setCorpusReady(true);
      } catch (err) {
        console.warn("[Search] corpus build failed", err);
      }
    })();

    return () => {
      active = false;
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      if (embedderRef.current) {
        try {
          if (typeof embedderRef.current.unload === "function") {
            embedderRef.current.unload();
          }
          if (typeof embedderRef.current.close === "function") {
            embedderRef.current.close();
          }
        } catch {
          // ignore
        }
        embedderRef.current = null;
      }
    };
  }, []);

  // Build (or load) the embedding index once the model + corpus are ready
  useEffect(() => {
    if (!modelReady || !corpusReady) return;

    let active = true;
    const timer = setTimeout(() => {
      setIndexStatus("loading");
      const corpus = corpusRef.current;
      if (!corpus) {
        setIndexStatus("error");
        return;
      }
      setIndexProgress({ done: 0, total: corpus.all.length });

      (async () => {
        try {
          await loadEmbeddingIndex(corpus, (done, total) => {
            if (active) setIndexProgress({ done, total });
          });
          if (!active) return;

          setIndexProgress({
            done: corpus.all.length,
            total: corpus.all.length,
          });
          setIndexStatus("ready");
        } catch (err) {
          console.warn("[Search] prebuilt index load failed", err);
          if (active) setIndexStatus("error");
        }
      })();
    }, 0);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [modelReady, corpusReady, indexRetry]);

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

  // Semantic search — race-safe
  useEffect(() => {
    const q = debouncedQuery;
    const gen = ++searchGen.current;

    if (!q || q.length < MIN_QUERY_LENGTH) {
      const t = setTimeout(() => clearSearchState(), 0);
      return () => clearTimeout(t);
    }

    if (!searchReady) {
      const t = setTimeout(() => {
        if (gen !== searchGen.current) return;
        setResults([]);
        setSearchError(null);
        setIsSearching(false);
      }, 0);
      return () => clearTimeout(t);
    }

    const corpus = corpusRef.current;
    let cancelled = false;

    const timer = setTimeout(() => {
      if (cancelled || gen !== searchGen.current) return;
      setIsSearching(true);
      setSearchError(null);

      (async () => {
        try {
          const hits = await Promise.race([
            searchSemantic(
              q,
              corpus,
              embedderRef.current,
              filter,
              searchLanguage,
            ),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error("timeout")), SEARCH_TIMEOUT_MS),
            ),
          ]);

          if (cancelled || gen !== searchGen.current) return;
          setResults(hits);
          setSearchError(null);
        } catch (err) {
          if (cancelled || gen !== searchGen.current) return;
          setResults([]);
          setSearchError(
            err?.message === "timeout"
              ? "Search timed out. Please try again."
              : "Search failed. Please try again.",
          );
        } finally {
          if (!cancelled && gen === searchGen.current) setIsSearching(false);
        }
      })();
    }, 0);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [debouncedQuery, filter, searchLanguage, searchReady, clearSearchState]);

  const handleClear = useCallback(() => {
    safeHaptic(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
    searchGen.current += 1;
    setQuery("");
    setDebouncedQuery("");
    setResults([]);
    setSearchError(null);
    setIsSearching(false);
    inputRef.current?.focus();
  }, []);

  const handleDownloadGemma = useCallback(async () => {
    if (modelStatus === "downloading" || modelStatus === "loading") return;

    const sessionId = ++gemmaDownloadSessionRef.current;
    const totalBytes = getCachedGemmaModelTotalBytes();

    safeHaptic(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
    gemmaPauseRef.current = false;
    setModelStatus("downloading");
    setModelStage(`Downloading model (${formatBytes(totalBytes)})…`);
    setModelSpeed(0);
    gemmaSpeedSamplesRef.current = [];
    gemmaDownloadStartRef.current = Date.now();
    gemmaLastBytesRef.current = Math.min(modelBytes, totalBytes);
    gemmaLastSampleAtRef.current = gemmaDownloadStartRef.current;
    setModelProgress(
      Math.round((gemmaLastBytesRef.current / totalBytes) * 100) || 0,
    );
    setModelTotal(totalBytes);

    try {
      const embedder = embedderRef.current || createEmbedder();
      embedderRef.current = embedder;

      await embedder.loadModel(
        EMBEDDING_GEMMA_2_TEXT_270M,
        { maxInputLength: 256 },
        (progress) => {
          if (
            gemmaPauseRef.current ||
            sessionId !== gemmaDownloadSessionRef.current
          ) {
            return;
          }

          const totalModelBytes = getCachedGemmaModelTotalBytes();
          const ratio = Math.min(1, Math.max(0, Number(progress) || 0));
          const now = Date.now();
          const nextBytes = Math.min(
            Math.round(ratio * totalModelBytes),
            totalModelBytes,
          );
          const deltaBytes = Math.max(0, nextBytes - gemmaLastBytesRef.current);
          const deltaMs = Math.max(250, now - gemmaLastSampleAtRef.current);
          const rawSpeed = deltaBytes > 0 ? deltaBytes / (deltaMs / 1000) : 0;
          const samples = gemmaSpeedSamplesRef.current;
          samples.push(rawSpeed);
          if (samples.length > 8) samples.shift();
          const rollingSpeed = samples.length
            ? samples.reduce(
                (sum, speed) => sum + (Number.isFinite(speed) ? speed : 0),
                0,
              ) / samples.length
            : rawSpeed;

          gemmaLastBytesRef.current = nextBytes;
          gemmaLastSampleAtRef.current = now;

          setModelProgress(Math.round(ratio * 100));
          setModelBytes(nextBytes);
          setModelTotal(totalModelBytes);
          setModelSpeed(rollingSpeed || 0);
          setModelStage(
            ratio >= 1
              ? "Finalizing download…"
              : `Downloading model (${formatBytes(totalModelBytes)})…`,
          );
        },
      );

      if (
        gemmaPauseRef.current ||
        sessionId !== gemmaDownloadSessionRef.current
      ) {
        setModelStatus("stopped");
        setModelStage("Download paused — tap to resume");
        setModelSpeed(0);
        return;
      }

      setModelStatus("loading");
      setModelStage("Preparing smart search…");
      setModelProgress(94);
      setModelSpeed(0);
      await waitForUi(40);

      await writeGemmaState({
        ready: true,
        readyAt: new Date().toISOString(),
        model: "embeddinggemma-2-text-270m",
      });

      const totalReadyBytes = getCachedGemmaModelTotalBytes();
      setModelBytes(totalReadyBytes);
      setModelTotal(totalReadyBytes);
      setModelProgress(100);
      setModelStatus("ready");
      setModelStage("Smart search ready");
      setModelSpeed(0);
    } catch (error) {
      if (
        gemmaPauseRef.current ||
        sessionId !== gemmaDownloadSessionRef.current
      ) {
        setModelStatus("stopped");
        setModelStage("Download paused — tap to resume");
        setModelSpeed(0);
        return;
      }
      console.warn("[Search] Gemma download/load failed", error);
      setModelStatus("error");
      setModelStage("Download failed — tap to retry");
      setModelProgress(0);
      setModelSpeed(0);
    }
  }, [modelStatus, modelBytes]);

  const handleCancelDownload = useCallback(async () => {
    if (modelStatus !== "downloading" && modelStatus !== "loading") return;

    gemmaDownloadSessionRef.current += 1;
    gemmaPauseRef.current = true;
    setModelStatus("stopped");
    setModelStage("Download paused — tap to resume");
    setModelSpeed(0);
    gemmaSpeedSamplesRef.current = [];

    try {
      if (
        embedderRef.current &&
        typeof embedderRef.current.unload === "function"
      ) {
        await embedderRef.current.unload();
      }
    } catch {
      // ignore
    }

    safeHaptic(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
  }, [modelStatus]);

  const handleDismissModel = useCallback(() => {
    setModelDismissed(true);
    writeDismissFlag(true);
    safeHaptic(() => Haptics.selectionAsync());
  }, []);

  const handleEnableModel = useCallback(() => {
    setModelDismissed(false);
    writeDismissFlag(false);
    safeHaptic(() => Haptics.selectionAsync());
  }, []);

  const handleRetryIndex = useCallback(() => {
    setIndexStatus("idle");
    setIndexProgress({ done: 0, total: 0 });
    setIndexRetry((retry) => retry + 1);
    safeHaptic(() => Haptics.selectionAsync());
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
          ayahId: String(item.ayah),
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
    ({ item }) => {
      if (item.type === "quran") {
        return (
          <QuranResultCard
            item={item}
            colors={colors}
            onPress={handleQuranPress}
            textAlign={isRTL(item.translationLanguage) ? "right" : "left"}
            writingDirection={isRTL(item.translationLanguage) ? "rtl" : "ltr"}
            t={t}
          />
        );
      }
      return (
        <HadithResultCard
          item={item}
          colors={colors}
          onPress={handleHadithPress}
          textAlign={isRTL(item.contentLanguage) ? "right" : "left"}
          writingDirection={isRTL(item.contentLanguage) ? "rtl" : "ltr"}
          t={t}
        />
      );
    },
    [colors, handleQuranPress, handleHadithPress, t],
  );

  const keyExtractor = useCallback((item) => item.id, []);
  const getItemType = useCallback((item) => item.type, []);

  const normalizedQuery = (query || "").trim();
  const isQueryPending = query.trim() !== debouncedQuery;
  const searchLanguageOptions = useMemo(
    () =>
      SEARCH_LANGUAGES.map((value) => ({
        label:
          t(SEARCH_LANGUAGE_LABELS[value]) || SEARCH_LANGUAGE_LABELS[value],
        value,
      })),
    [t],
  );

  const showEmptyState = normalizedQuery.length < MIN_QUERY_LENGTH;
  const showLoading =
    searchReady &&
    !isQueryPending &&
    isSearching &&
    results.length === 0 &&
    normalizedQuery.length >= MIN_QUERY_LENGTH;
  const showSearchError =
    searchReady && !isQueryPending && !isSearching && !!searchError;
  const showNoResults =
    searchReady &&
    !isQueryPending &&
    !isSearching &&
    debouncedQuery.length >= MIN_QUERY_LENGTH &&
    results.length === 0 &&
    !searchError;
  const showProgressBar =
    searchReady &&
    !isQueryPending &&
    isSearching &&
    normalizedQuery.length >= MIN_QUERY_LENGTH;

  const searchBarBorderColor = isFocused
    ? withAlpha(colors.accent, 0.55)
    : colors.border;

  const remainingBytes = Math.max(0, modelTotal - modelBytes);
  const etaLabel = formatEta(remainingBytes, modelSpeed);

  const indexLabel = !corpusReady
    ? `${t("Preparing search index") || "Preparing search index"}…`
    : indexStatus === "loading"
      ? `${t("Loading prebuilt search index") || "Loading prebuilt search index"}… ${Math.round(
          (indexProgress.done / Math.max(1, indexProgress.total)) * 100,
        )}%`
      : t("Loading prebuilt search index") || "Loading prebuilt search index…";

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={theme.dark ? "light-content" : "dark-content"} />

      <View
        style={[
          styles.searchHeader,
          {
            paddingTop: 8,
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

        <View style={styles.searchLanguageSection}>
          <Text style={{ color: colors.secondary, fontWeight: "600" }}>
            {t("Search language") || "Search language"}
          </Text>
          <View
            style={[
              styles.searchLanguageRow,
              { flexDirection: rtl ? "row-reverse" : "row" },
            ]}
          >
            {searchLanguageOptions.map((option) => (
              <FilterChip
                key={option.value}
                label={option.label}
                active={searchLanguage === option.value}
                onPress={() => handleSearchLanguageChange(option.value)}
                colors={colors}
              />
            ))}
          </View>
        </View>

        <SearchProgressBar visible={showProgressBar} colors={colors} />

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

        {searchReady ? (
          <SmartSearchActivePill colors={colors} t={t} rtl={rtl} />
        ) : modelDismissed && !modelReady ? (
          <SmartSearchDismissedRow
            onEnable={handleEnableModel}
            colors={colors}
            t={t}
            rtl={rtl}
          />
        ) : !modelReady ? (
          <SmartSearchCard
            status={modelStatus}
            progress={modelProgress}
            bytes={modelBytes}
            total={modelTotal}
            speed={modelSpeed}
            stage={modelStage}
            etaLabel={etaLabel}
            onDownload={handleDownloadGemma}
            onCancel={handleCancelDownload}
            onDismiss={handleDismissModel}
            colors={colors}
            t={t}
            rtl={rtl}
          />
        ) : (
          <IndexingBanner
            done={indexProgress.done}
            total={indexProgress.total}
            error={indexStatus === "error"}
            onRetry={handleRetryIndex}
            colors={colors}
            t={t}
            rtl={rtl}
          />
        )}
      </View>

      {showEmptyState ? (
        <EmptyState colors={colors} t={t} />
      ) : !modelReady ? (
        <ModelRequiredState colors={colors} t={t} />
      ) : !searchReady ? (
        <LoadingState colors={colors} t={t} label={indexLabel} />
      ) : showLoading ? (
        <LoadingState colors={colors} t={t} />
      ) : showSearchError ? (
        <SearchErrorState colors={colors} t={t} message={searchError} />
      ) : showNoResults ? (
        <NoResultsState colors={colors} t={t} />
      ) : (
        <LegendList
          data={results}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          getItemType={getItemType}
          estimatedItemSize={148}
          drawDistance={360}
          recycleItems
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: insets.bottom + 28 },
          ]}
          ListHeaderComponent={
            <Animated.View entering={FadeInUp.duration(90)}>
              <Text style={[styles.resultCount, { color: colors.secondary }]}>
                {`${results.length} ${t("results") || "results"}`}
              </Text>
            </Animated.View>
          }
        />
      )}
    </View>
  );
};

export default Search;

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
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
      android: { elevation: 3 },
    }),
  },
  searchIcon: { marginTop: 1 },
  searchInput: {
    flex: 1,
    fontSize: 16.5,
    paddingVertical: 0,
    height: "100%",
    letterSpacing: 0.15,
  },
  clearBtn: { padding: 4 },
  progressTrack: {
    height: 2.5,
    marginTop: 6,
    marginHorizontal: 4,
    borderRadius: 999,
    overflow: "hidden",
    backgroundColor: "transparent",
  },
  progressFill: {
    height: "100%",
    borderRadius: 999,
  },
  chipRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 14,
  },
  searchLanguageSection: {
    gap: 6,
    marginTop: 12,
  },
  searchLanguageRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
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
  chipIcon: { marginTop: 0.5 },
  chipText: {
    fontSize: 13.5,
    fontWeight: "600",
    letterSpacing: 0.25,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 4,
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
      android: { elevation: 2 },
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
    paddingHorizontal: 28,
    paddingBottom: 32,
  },
  emptyIconWrap: {
    width: 88,
    height: 88,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 18,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 8,
    letterSpacing: 0.18,
    textAlign: "center",
  },
  emptyDesc: {
    fontSize: 15,
    lineHeight: 23,
    textAlign: "center",
    opacity: 0.85,
    maxWidth: 320,
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
  modelCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 14,
    marginTop: 14,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.06,
        shadowRadius: 12,
      },
      android: { elevation: 2 },
    }),
  },
  modelCardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  modelIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  modelCardText: {
    flex: 1,
    gap: 3,
  },
  modelCardTitle: {
    fontSize: 15.5,
    fontWeight: "700",
    letterSpacing: 0.15,
  },
  modelCardDesc: {
    fontSize: 13,
    lineHeight: 19,
    opacity: 0.85,
  },
  modelProgressCard: {
    marginTop: 12,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  modelProgressHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  modelProgressLabel: {
    flex: 1,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.1,
  },
  modelStatusPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  modelStatusText: {
    fontSize: 11,
    fontWeight: "700",
  },
  modelProgressTrack: {
    height: 7,
    borderRadius: 999,
    overflow: "hidden",
    marginTop: 9,
  },
  modelProgressFill: {
    height: "100%",
    borderRadius: 999,
  },
  modelProgressFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 8,
    marginTop: 8,
  },
  modelProgressMeta: {
    flex: 1,
    fontSize: 11.5,
    fontWeight: "500",
    lineHeight: 16,
  },
  modelSpeed: {
    fontSize: 11.5,
    fontWeight: "700",
    letterSpacing: 0.12,
    marginTop: 1,
  },
  indexProgressText: {
    fontSize: 11.5,
    fontWeight: "600",
    marginTop: 8,
  },
  modelActionRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 14,
  },
  modelAction: {
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  modelActionPrimary: {
    borderWidth: 0,
  },
  modelActionText: {
    fontSize: 13.5,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  modelActionPrimaryText: {
    fontSize: 13.5,
    fontWeight: "700",
    letterSpacing: 0.2,
    color: "#fff",
  },
  dismissedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 14,
  },
  dismissedRowText: {
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
  },
  activePillRow: {
    flexDirection: "row",
    marginTop: 14,
  },
  activePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 6,
  },
  activePillText: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.15,
  },
});
