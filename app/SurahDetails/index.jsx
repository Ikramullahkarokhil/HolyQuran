import React, {
  useMemo,
  useCallback,
  useRef,
  useState,
  useEffect,
  memo,
} from "react";
import {
  View,
  Text,
  StyleSheet,
  Share,
  Pressable,
  Platform,
  StatusBar,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  Easing,
  runOnJS,
} from "react-native-reanimated";
import { LegendList } from "@legendapp/list/react-native";
import ArabicQuran from "../../assets/QuranData/ArabicQuran.json";
import EnglishQuran from "../../assets/QuranData/EnglishQuran.json";
import PashtoQuran from "../../assets/QuranData/PashtoQuran.json";
import DariQuran from "../../assets/QuranData/PersianQuran.json";
import SurahNames from "../../assets/QuranData/SurahNames.json";
import {
  LongPressGestureHandler,
  State,
  GestureHandlerRootView,
} from "react-native-gesture-handler";
import * as Clipboard from "expo-clipboard";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQuranTranslationStore } from "../../components/store/store";
import {
  useLocalSearchParams,
  useFocusEffect,
  useNavigation,
} from "expo-router";
import { Icon, IconButton, useTheme } from "react-native-paper";
import { useTranslation } from "react-i18next";
import FloatingLanguagePickerModal from "../../components/FloatingLanguagePickerModal";
import GeneralModal from "../../components/GeneralModal";
import { useAppAlert } from "../../components/AppAlertProvider";

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
            .map((char) => char + char)
            .join("")
        : raw;
    if (normalized.length !== 6) {
      return `rgba(37, 135, 216, ${alpha})`;
    }
    const r = Number.parseInt(normalized.slice(0, 2), 16);
    const g = Number.parseInt(normalized.slice(2, 4), 16);
    const b = Number.parseInt(normalized.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  return `rgba(37, 135, 216, ${alpha})`;
};

const SURAH_NAMES = SurahNames;

const getTranslationData = (language) => {
  switch (language) {
    case "pashto":
      return PashtoQuran;
    case "dari":
      return DariQuran;
    case "english":
    default:
      return EnglishQuran;
  }
};

// Pre-index Arabic ayahs by surah once at module load
const ARABIC_BY_SURAH = (() => {
  const map = new Map();
  try {
    const all = Object.values(
      ArabicQuran?.quran?.["quran-uthmani-hafs"] || {},
    );
    for (const item of all) {
      const list = map.get(item.surah);
      if (list) list.push(item);
      else map.set(item.surah, [item]);
    }
  } catch {
    // ignore
  }
  return map;
})();

// ─── Memoized verse row ─────────────────────────────────────────────────────

const VerseItem = memo(
  ({
    item,
    index,
    translationVerse,
    isHighlighted,
    isPinned,
    highlightProgress,
    progressColor,
    onSurface,
    onSurfaceVariant,
    backgroundColor,
    buttonText,
    pinnedLabel,
    onLongPress,
  }) => {
    const rippleStyle = useAnimatedStyle(() => {
      if (!isHighlighted) {
        return { opacity: 0, transform: [{ scale: 1 }] };
      }
      return {
        opacity: highlightProgress.value,
        transform: [
          {
            scale: 0.96 + highlightProgress.value * 0.06,
          },
        ],
      };
    }, [isHighlighted]);

    return (
      <LongPressGestureHandler
        onHandlerStateChange={({ nativeEvent }) => {
          if (nativeEvent.state === State.ACTIVE) {
            onLongPress({
              id: item.id,
              verse: item.verse,
              translationVerse,
              ayah: item.ayah,
              index,
              surah: item.surah,
            });
          }
        }}
      >
        <View
          style={[
            styles.verseOuter,
            {
              backgroundColor: isHighlighted
                ? withAlpha(progressColor, 0.12)
                : backgroundColor,
            },
          ]}
        >
          <Pressable
            android_ripple={{
              color: withAlpha(progressColor, 0.18),
              borderless: false,
              foreground: true,
            }}
            style={({ pressed }) => [
              styles.verseContainer,
              isHighlighted && {
                borderLeftColor: progressColor,
                borderLeftWidth: 3,
              },
              pressed && {
                backgroundColor: withAlpha(progressColor, 0.08),
              },
            ]}
          >
            {isHighlighted ? (
              <Animated.View
                pointerEvents="none"
                style={[
                  styles.ayahRipple,
                  { borderColor: progressColor },
                  rippleStyle,
                ]}
              />
            ) : null}

            <View style={styles.badgeRow}>
              {isPinned ? (
                <View
                  style={[
                    styles.inlinePinBadge,
                    { backgroundColor: progressColor },
                  ]}
                >
                  <Icon
                    source="pin"
                    size={14}
                    color={buttonText || "#ffffff"}
                  />
                  <Text style={styles.pinBadgeText}>{pinnedLabel}</Text>
                </View>
              ) : null}
              <View
                style={[
                  styles.ayahNumber,
                  {
                    backgroundColor: withAlpha(progressColor, 0.12),
                    borderColor: progressColor,
                  },
                ]}
              >
                <Text
                  style={[styles.ayahNumberText, { color: progressColor }]}
                >
                  {item.ayah}
                </Text>
              </View>
            </View>

            <View style={styles.arabicRow}>
              <Text
                style={[styles.arabicText, { color: onSurface }]}
                selectable
              >
                {item.verse}
              </Text>
            </View>

            <Text
              style={[
                styles.translationText,
                { color: onSurfaceVariant || onSurface },
              ]}
              selectable
            >
              {translationVerse}
            </Text>
          </Pressable>
        </View>
      </LongPressGestureHandler>
    );
  },
  (prev, next) =>
    prev.item.id === next.item.id &&
    prev.item.verse === next.item.verse &&
    prev.item.ayah === next.item.ayah &&
    prev.translationVerse === next.translationVerse &&
    prev.isHighlighted === next.isHighlighted &&
    prev.isPinned === next.isPinned &&
    prev.progressColor === next.progressColor &&
    prev.onSurface === next.onSurface &&
    prev.onSurfaceVariant === next.onSurfaceVariant &&
    prev.backgroundColor === next.backgroundColor &&
    prev.buttonText === next.buttonText &&
    prev.pinnedLabel === next.pinnedLabel &&
    prev.onLongPress === next.onLongPress &&
    prev.index === next.index,
);
VerseItem.displayName = "VerseItem";

// ─── Main screen ────────────────────────────────────────────────────────────

const SurahDetails = () => {
  const { surahName, ayahId } = useLocalSearchParams();
  const navigation = useNavigation();
  const theme = useTheme();
  const { t } = useTranslation();
  const { showAlert } = useAppAlert();
  const { translationLanguage, setTranslationLanguage } =
    useQuranTranslationStore();

  const listRef = useRef(null);
  const lastSavedScrollOffset = useRef(null);

  const [showScrollTop, setShowScrollTop] = useState(false);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [actionVerse, setActionVerse] = useState(null);
  const [actionIsBookmarked, setActionIsBookmarked] = useState(false);
  const [pins, setPins] = useState([]);
  const [pinsVisible, setPinsVisible] = useState(false);
  const [highlightedAyahId, setHighlightedAyahId] = useState(null);

  // Reanimated highlight progress (UI thread)
  const highlightProgress = useSharedValue(0);

  // Theme primitives
  const progressColor = theme.colors.progressColor;
  const onSurface = theme.colors.onSurface;
  const onSurfaceVariant =
    theme.colors.onSurfaceVariant || theme.colors.onSurface;
  const backgroundColor = theme.colors.background;
  const surfaceColor = theme.colors.surface;
  const outlineVariant =
    theme.colors.outlineVariant || "rgba(0,0,0,0.08)";
  const buttonText = theme.colors.buttonText;
  const primaryColor = theme.colors.primary;

  const resolvedSurahName = useMemo(() => {
    if (!surahName || typeof surahName !== "string") return null;
    return decodeURIComponent(surahName);
  }, [surahName]);

  const targetAyahId = useMemo(() => {
    const value = Array.isArray(ayahId) ? ayahId[0] : ayahId;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }, [ayahId]);

  const getScrollStorageKey = useCallback(() => {
    if (!resolvedSurahName) return null;
    return `surah_details_scroll_${resolvedSurahName}`;
  }, [resolvedSurahName]);

  const getPinsStorageKey = useCallback(() => {
    if (!resolvedSurahName) return null;
    return `surah_details_pins_${resolvedSurahName}`;
  }, [resolvedSurahName]);

  useEffect(() => {
    let active = true;
    const loadPins = async () => {
      const key = getPinsStorageKey();
      if (!key) return;
      try {
        const storedPins = JSON.parse(
          (await AsyncStorage.getItem(key)) || "[]",
        );
        if (active) setPins(Array.isArray(storedPins) ? storedPins : []);
      } catch {
        if (active) setPins([]);
      }
    };
    loadPins();
    return () => {
      active = false;
    };
  }, [getPinsStorageKey]);

  const saveScrollOffset = useCallback(
    async (offsetY) => {
      if (!resolvedSurahName) return;
      const safeOffset = Math.max(0, Math.round(offsetY || 0));
      const key = getScrollStorageKey();
      if (!key) return;
      if (
        lastSavedScrollOffset.current !== null &&
        Math.abs(lastSavedScrollOffset.current - safeOffset) < 30
      ) {
        return;
      }
      lastSavedScrollOffset.current = safeOffset;
      try {
        await AsyncStorage.setItem(key, String(safeOffset));
      } catch {
        // ignore
      }
    },
    [getScrollStorageKey, resolvedSurahName],
  );

  const restoreScrollOffset = useCallback(async () => {
    if (!resolvedSurahName || targetAyahId !== null) return;
    const key = getScrollStorageKey();
    if (!key) return;
    try {
      const rawOffset = await AsyncStorage.getItem(key);
      const savedOffset = Number(rawOffset || 0);
      if (!Number.isFinite(savedOffset) || savedOffset <= 24) return;

      requestAnimationFrame(() => {
        setTimeout(() => {
          try {
            listRef.current?.scrollToOffset({
              offset: savedOffset,
              animated: false,
            });
          } catch {
            // non-critical
          }
        }, 80);
      });
    } catch {
      // ignore
    }
  }, [getScrollStorageKey, resolvedSurahName, targetAyahId]);

  const currentSurahIndex = useMemo(
    () => SURAH_NAMES.findIndex((name) => name === resolvedSurahName),
    [resolvedSurahName],
  );

  const surahId = useMemo(() => {
    if (!resolvedSurahName) return -1;
    const idx = SURAH_NAMES.indexOf(resolvedSurahName);
    return idx >= 0 ? idx + 1 : -1;
  }, [resolvedSurahName]);

  // O(1) surah lookup from pre-indexed map
  const verses = useMemo(() => {
    if (surahId <= 0) return [];
    return ARABIC_BY_SURAH.get(surahId) || [];
  }, [surahId]);

  const targetAyahIndex = useMemo(() => {
    if (targetAyahId === null) return -1;
    return verses.findIndex((verse) => verse.id === targetAyahId);
  }, [targetAyahId, verses]);

  const clearHighlight = useCallback(() => {
    setHighlightedAyahId(null);
  }, []);

  useEffect(() => {
    if (targetAyahIndex < 0) return;

    const timer = setTimeout(() => {
      listRef.current?.scrollToIndex({
        index: targetAyahIndex,
        animated: false,
        viewPosition: 0.5,
      });
      setHighlightedAyahId(targetAyahId);
      highlightProgress.value = 0;
      highlightProgress.value = withSequence(
        withTiming(1, {
          duration: 260,
          easing: Easing.out(Easing.cubic),
        }),
        withTiming(0, {
          duration: 1500,
          easing: Easing.inOut(Easing.quad),
        }),
      );
    }, 120);

    const clearHighlightTimer = setTimeout(() => {
      runOnJS(clearHighlight)();
    }, 2600);

    return () => {
      clearTimeout(timer);
      clearTimeout(clearHighlightTimer);
    };
  }, [
    clearHighlight,
    highlightProgress,
    targetAyahId,
    targetAyahIndex,
  ]);

  // Translation map – rebuild only when language or surah changes
  const translationMap = useMemo(() => {
    const map = new Map();
    if (surahId <= 0) return map;
    const data = getTranslationData(translationLanguage);
    const all = Object.values(
      data?.quran?.["quran-uthmani-hafs"] || {},
    );
    for (const v of all) {
      if (v.surah === surahId) map.set(v.id, v.verse);
    }
    return map;
  }, [surahId, translationLanguage]);

  const quranLanguageOptions = useMemo(
    () => [
      { label: "English", value: "english" },
      { label: "پښتو", value: "pashto" },
      { label: "دری", value: "dari" },
    ],
    [],
  );

  const handleQuranTranslationPicker = useCallback(() => {
    setPickerVisible(true);
  }, []);

  const renderHeaderLeft = useCallback(() => {
    const canGoPrev = currentSurahIndex > 0;
    return (
      <IconButton
        icon="chevron-left"
        iconColor={onSurface}
        size={26}
        disabled={!canGoPrev}
        onPress={() => {
          if (!canGoPrev) return;
          const targetName = SURAH_NAMES[currentSurahIndex - 1];
          navigation.setParams({
            surahName: targetName,
            ayahId: undefined,
          });
        }}
        style={styles.headerIcon}
      />
    );
  }, [currentSurahIndex, navigation, onSurface]);

  const renderHeaderRight = useCallback(() => {
    const canGoNext = currentSurahIndex < SURAH_NAMES.length - 1;
    return (
      <View style={styles.headerRight}>
        <IconButton
          icon="pin-outline"
          iconColor={onSurface}
          size={22}
          onPress={() => setPinsVisible(true)}
          style={styles.headerIcon}
          accessibilityLabel={t("Pinned locations")}
        />
        <IconButton
          icon="translate"
          iconColor={onSurface}
          size={22}
          onPress={handleQuranTranslationPicker}
          style={styles.headerIcon}
        />
        <IconButton
          icon="chevron-right"
          iconColor={onSurface}
          size={26}
          disabled={!canGoNext}
          onPress={() => {
            if (!canGoNext) return;
            const targetName = SURAH_NAMES[currentSurahIndex + 1];
            navigation.setParams({
              surahName: targetName,
              ayahId: undefined,
            });
          }}
          style={styles.headerIcon}
        />
      </View>
    );
  }, [
    currentSurahIndex,
    handleQuranTranslationPicker,
    navigation,
    onSurface,
    t,
  ]);

  useFocusEffect(
    useCallback(() => {
      if (!resolvedSurahName) return;

      navigation.setOptions({
        headerShown: true,
        title: `${t("سورة")} ${resolvedSurahName}`,
        headerTitleAlign: "center",
        headerTitleStyle: {
          color: onSurface,
          fontSize: 18,
          fontWeight: "600",
          letterSpacing: 0.3,
        },
        headerStyle: {
          backgroundColor: surfaceColor,
          elevation: 0,
          shadowOpacity: 0,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: outlineVariant,
        },
        headerLeft: renderHeaderLeft,
        headerRight: renderHeaderRight,
        headerTintColor: onSurface,
      });

      restoreScrollOffset();
    }, [
      resolvedSurahName,
      onSurface,
      surfaceColor,
      outlineVariant,
      navigation,
      t,
      restoreScrollOffset,
      renderHeaderLeft,
      renderHeaderRight,
    ]),
  );

  const handleLongPress = useCallback(
    async (verse) => {
      try {
        const existing =
          JSON.parse(await AsyncStorage.getItem("bookmarks")) || [];
        const isBookmarked = existing.some((b) => b.id === verse.id);
        setActionVerse({
          ...verse,
          surahName: resolvedSurahName,
        });
        setActionIsBookmarked(isBookmarked);
      } catch {
        showAlert(t("Error"), t("Failed to save bookmark"));
      }
    },
    [resolvedSurahName, showAlert, t],
  );

  const savePins = useCallback(
    (nextPins) => {
      setPins(nextPins);
      const key = getPinsStorageKey();
      if (key) {
        AsyncStorage.setItem(key, JSON.stringify(nextPins)).catch(() => {});
      }
    },
    [getPinsStorageKey],
  );

  const toggleVersePin = useCallback(
    (verse, index) => {
      const isPinned = pins.some((pin) => pin.id === verse.id);
      const nextPins = isPinned
        ? pins.filter((pin) => pin.id !== verse.id)
        : [
            ...pins,
            {
              id: verse.id,
              index,
              ayah: verse.ayah,
            },
          ];
      savePins(nextPins);
    },
    [pins, savePins],
  );

  const goToVersePin = useCallback((pin) => {
    listRef.current?.scrollToIndex({ index: pin.index, animated: true });
    setPinsVisible(false);
  }, []);

  const pinnedVerseIds = useMemo(
    () => new Set(pins.map((pin) => pin.id)),
    [pins],
  );

  const pinnedLabel = t("Pinned");
  const translationFallback = t("Translation not available");

  const pinOptions = useMemo(
    () =>
      pins.map((pin) => ({
        label: `${t("Ayah")} ${pin.ayah}`,
        value: String(pin.id),
        icon: "pin",
        onPress: () => goToVersePin(pin),
        secondaryAction: {
          label: t("Remove pin"),
          icon: "pin-off-outline",
          onPress: () =>
            savePins(pins.filter((item) => item.id !== pin.id)),
        },
      })),
    [goToVersePin, pins, savePins, t],
  );

  const verseActionOptions = useMemo(() => {
    if (!actionVerse) return [];

    const message = `${actionVerse.verse}\n\n${actionVerse.translationVerse}`;
    const isPinned = pinnedVerseIds.has(actionVerse.id);

    return [
      {
        label: actionIsBookmarked ? t("Already Bookmarked") : t("Bookmark"),
        value: "bookmark",
        icon: "bookmark-outline",
        disabled: actionIsBookmarked,
        onPress: async () => {
          const existing =
            JSON.parse(await AsyncStorage.getItem("bookmarks")) || [];
          const bookmark = {
            ...actionVerse,
            surahName: actionVerse.surahName || resolvedSurahName,
            surahNumber: actionVerse.surah || surahId,
            ayahNumber: actionVerse.ayah,
            createdAt: Date.now(),
          };
          await AsyncStorage.setItem(
            "bookmarks",
            JSON.stringify([...existing, bookmark]),
          );
          showAlert(t("Bookmarked"));
        },
      },
      {
        label: t("Copy"),
        value: "copy",
        icon: "content-copy",
        onPress: async () => {
          await Clipboard.setStringAsync(message);
          showAlert(t("Copied to Clipboard"));
        },
      },
      {
        label: t("Share"),
        value: "share",
        icon: "share-variant",
        onPress: () => Share.share({ message }),
      },
      {
        label: isPinned ? t("Remove pin") : t("Pin this location"),
        value: "pin",
        icon: isPinned ? "pin-off-outline" : "pin-outline",
        onPress: () => toggleVersePin(actionVerse, actionVerse.index),
      },
    ];
  }, [
    actionIsBookmarked,
    actionVerse,
    pinnedVerseIds,
    resolvedSurahName,
    showAlert,
    surahId,
    t,
    toggleVersePin,
  ]);

  const renderItem = useCallback(
    ({ item, index }) => {
      const translationVerse =
        translationMap.get(item.id) || translationFallback;

      return (
        <VerseItem
          item={item}
          index={index}
          translationVerse={translationVerse}
          isHighlighted={highlightedAyahId === item.id}
          isPinned={pinnedVerseIds.has(item.id)}
          highlightProgress={highlightProgress}
          progressColor={progressColor}
          onSurface={onSurface}
          onSurfaceVariant={onSurfaceVariant}
          backgroundColor={backgroundColor}
          buttonText={buttonText}
          pinnedLabel={pinnedLabel}
          onLongPress={handleLongPress}
        />
      );
    },
    [
      translationMap,
      translationFallback,
      highlightedAyahId,
      pinnedVerseIds,
      highlightProgress,
      progressColor,
      onSurface,
      onSurfaceVariant,
      backgroundColor,
      buttonText,
      pinnedLabel,
      handleLongPress,
    ],
  );

  const keyExtractor = useCallback((item) => String(item.id), []);

  const handleScroll = useCallback(
    (e) => {
      const offsetY = e.nativeEvent.contentOffset.y || 0;
      setShowScrollTop(offsetY > 320);
      saveScrollOffset(offsetY);
    },
    [saveScrollOffset],
  );

  const scrollToTop = useCallback(() => {
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
  }, []);

  const ItemSeparator = useCallback(
    () => (
      <View
        style={[styles.separator, { backgroundColor: outlineVariant }]}
      />
    ),
    [outlineVariant],
  );

  if (!resolvedSurahName) {
    return (
      <View
        style={[styles.centered, { backgroundColor: backgroundColor }]}
      >
        <Text style={[styles.errorText, { color: theme.colors.error }]}>
          {t("Invalid Surah Name")}
        </Text>
      </View>
    );
  }

  if (verses.length === 0) {
    return (
      <View
        style={[styles.centered, { backgroundColor: backgroundColor }]}
      >
        <Text style={[styles.errorText, { color: theme.colors.error }]}>
          {t("No verses found")}
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: backgroundColor }]}>
      <StatusBar
        barStyle={theme.dark ? "light-content" : "dark-content"}
        backgroundColor={surfaceColor}
      />

      <LegendList
        ref={listRef}
        extraData={`${translationLanguage}|${highlightedAyahId}|${pins.length}`}
        data={verses}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        recycleItems
        estimatedItemSize={120}
        drawDistance={400}
        ItemSeparatorComponent={ItemSeparator}
        showsVerticalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={32}
        contentContainerStyle={styles.listContent}
        removeClippedSubviews={Platform.OS === "android"}
      />

      {showScrollTop && (
        <Pressable
          style={[
            styles.scrollTopBtn,
            {
              backgroundColor: primaryColor,
              shadowColor: primaryColor,
            },
          ]}
          onPress={scrollToTop}
          android_ripple={{ color: "#ffffff40", borderless: true }}
        >
          <Text style={styles.scrollTopBtnText}>↑</Text>
        </Pressable>
      )}

      <FloatingLanguagePickerModal
        visible={pickerVisible}
        title={t("Select Quran translation language")}
        options={quranLanguageOptions}
        selectedValue={translationLanguage}
        onSelect={setTranslationLanguage}
        onClose={() => setPickerVisible(false)}
        theme={theme}
      />
      <GeneralModal
        visible={Boolean(actionVerse)}
        title={
          actionIsBookmarked
            ? t("Already Bookmarked")
            : t("Choose an action")
        }
        description={
          actionVerse
            ? `${actionVerse.verse}\n\n${actionVerse.translationVerse}`
            : undefined
        }
        options={verseActionOptions}
        onClose={() => setActionVerse(null)}
      />
      <GeneralModal
        visible={pinsVisible}
        title={t("Pinned locations")}
        description={pins.length === 0 ? t("No pins yet") : undefined}
        options={pinOptions}
        onClose={() => setPinsVisible(false)}
      />
    </View>
  );
};

export default function App() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <SurahDetails />
    </GestureHandlerRootView>
  );
}

// ====================== STYLES ======================
const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  listContent: {
    paddingTop: 8,
    paddingBottom: 40,
  },
  verseOuter: {
    borderRadius: 12,
    overflow: "hidden",
  },
  verseContainer: {
    position: "relative",
    paddingVertical: 18,
    paddingHorizontal: 20,
    borderRadius: 12,
  },
  ayahRipple: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 2,
    borderRadius: 12,
  },
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  inlinePinBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 12,
  },
  arabicRow: {
    flexDirection: "row-reverse",
    alignItems: "flex-start",
    width: "100%",
  },
  arabicText: {
    flex: 1,
    fontSize: 24,
    fontWeight: "500",
    textAlign: "right",
    lineHeight: 42,
    writingDirection: "rtl",
  },
  ayahNumber: {
    minWidth: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 4,
  },
  ayahNumberText: {
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  pinBadgeText: {
    color: "#ffffff",
    fontSize: 11,
    fontWeight: "700",
  },
  translationText: {
    fontSize: 15.5,
    marginTop: 12,
    textAlign: "right",
    lineHeight: 26,
    opacity: 0.88,
    writingDirection: "rtl",
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: 20,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
  },
  headerIcon: {
    margin: 0,
  },
  scrollTopBtn: {
    position: "absolute",
    bottom: 28,
    right: 20,
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    elevation: 6,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.28,
    shadowRadius: 5,
  },
  scrollTopBtnText: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "700",
    marginTop: -1,
  },
  errorText: {
    fontSize: 16,
    fontWeight: "500",
    textAlign: "center",
  },
});