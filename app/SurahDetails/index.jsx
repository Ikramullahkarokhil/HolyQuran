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
  LayoutAnimation,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  Easing,
  runOnJS,
  FadeIn,
  FadeOut,
} from "react-native-reanimated";
import { LegendList } from "@legendapp/list/react-native";
import {
  getArabicVersesForSurah,
  getQuranVerses,
  getSurahNames,
} from "../../components/quranData";
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
import { getPashtoTafseerForSurah } from "../../components/tafseerData";

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

const SURAH_NAMES = getSurahNames();

const getTranslationData = (language) => getQuranVerses(language);

// ─── Memoized verse row ─────────────────────────────────────────────────────

const VerseItem = memo(
  ({
    item,
    index,
    translationVerse,
    tafseerText,
    isPashtoTranslation,
    isRtlText,
    isTafseerExpanded,
    onToggleTafseer,
    isHighlighted,
    isPinned,
    highlightProgress,
    progressColor,
    onSurface,
    onSurfaceVariant,
    backgroundColor,
    surfaceColor,
    buttonText,
    pinnedLabel,
    onLongPress,
  }) => {
    const rippleStyle = useAnimatedStyle(() => {
      if (!isHighlighted) {
        return { opacity: 0, transform: [{ scale: 1 }] };
      }
      return {
        opacity: highlightProgress.value * 0.85,
        transform: [
          {
            scale: 0.97 + highlightProgress.value * 0.03,
          },
        ],
      };
    }, [isHighlighted]);

    const cardBg = isHighlighted
      ? withAlpha(progressColor, 0.1)
      : surfaceColor;

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
        minDurationMs={420}
      >
        <Animated.View
          entering={FadeIn.duration(220)}
          style={[
            styles.verseOuter,
            {
              backgroundColor: cardBg,
              borderColor: isHighlighted
                ? withAlpha(progressColor, 0.35)
                : "transparent",
            },
          ]}
        >
          <Pressable
            android_ripple={{
              color: withAlpha(progressColor, 0.14),
              borderless: false,
              foreground: true,
            }}
            style={({ pressed }) => [
              styles.verseContainer,
              isHighlighted && {
                borderLeftColor: progressColor,
                borderLeftWidth: 3.5,
              },
              pressed && {
                backgroundColor: withAlpha(progressColor, 0.06),
              },
            ]}
          >
            {isHighlighted ? (
              <Animated.View
                pointerEvents="none"
                style={[
                  styles.ayahRipple,
                  { borderColor: withAlpha(progressColor, 0.55) },
                  rippleStyle,
                ]}
              />
            ) : null}

            {/* Header row: pin + ayah number */}
            {isPinned ? (
              <View style={styles.badgeRow}>
                <View
                  style={[
                    styles.inlinePinBadge,
                    { backgroundColor: progressColor },
                  ]}
                >
                  <Icon
                    source="pin"
                    size={13}
                    color={buttonText || "#ffffff"}
                  />
                  <Text style={styles.pinBadgeText}>{pinnedLabel}</Text>
                </View>
              </View>
            ) : null}

            {/* Arabic text */}
            <View style={styles.arabicRow}>
              <Text
                style={[styles.arabicText, { color: onSurface }]}
                selectable
              >
                <Text
                  style={[styles.ayahNumberInline, { color: progressColor }]}
                >
                  {item.ayah}:
                </Text>{" "}
                {item.verse}
              </Text>
         
            </View>

            {/* Translation */}
            <Text
              style={[
                styles.translationText,
                {
                  color: onSurfaceVariant || onSurface,
                  textAlign: isRtlText ? "right" : "left",
                  writingDirection: isRtlText ? "rtl" : "ltr",
                },
              ]}
              selectable
            >
              {translationVerse}
            </Text>

            {/* Tafseer toggle (Pashto only) */}
            {isPashtoTranslation ? (
              <Pressable
                onPress={() => {
                  LayoutAnimation.configureNext(
                    LayoutAnimation.Presets.easeInEaseOut,
                  );
                  onToggleTafseer(item.id);
                }}
                style={({ pressed }) => [
                  styles.tafseerToggle,
                  {
                    opacity: pressed ? 0.7 : 1,
                    borderTopColor: withAlpha(progressColor, 0.18),
                  },
                ]}
                accessibilityRole="button"
                accessibilityState={{ expanded: isTafseerExpanded }}
                hitSlop={8}
              >
                <View style={styles.tafseerToggleLabel}>
                  <Icon
                    source={
                      isTafseerExpanded ? "chevron-up" : "chevron-down"
                    }
                    size={18}
                    color={progressColor}
                  />
                  <Text
                    style={[
                      styles.tafseerInlineLabel,
                      { color: progressColor },
                    ]}
                  >
                    تفسیر
                  </Text>
                </View>

                {isTafseerExpanded && tafseerText ? (
                  <Animated.View entering={FadeIn.duration(180)}>
                    <Text
                      selectable
                      style={[
                        styles.tafseerInlineText,
                        { color: onSurfaceVariant || onSurface },
                      ]}
                    >
                      {tafseerText}
                    </Text>
                  </Animated.View>
                ) : null}
              </Pressable>
            ) : null}
          </Pressable>
        </Animated.View>
      </LongPressGestureHandler>
    );
  },
  (prev, next) =>
    prev.item.id === next.item.id &&
    prev.item.verse === next.item.verse &&
    prev.item.ayah === next.item.ayah &&
    prev.translationVerse === next.translationVerse &&
    prev.tafseerText === next.tafseerText &&
    prev.isPashtoTranslation === next.isPashtoTranslation &&
    prev.isRtlText === next.isRtlText &&
    prev.isTafseerExpanded === next.isTafseerExpanded &&
    prev.onToggleTafseer === next.onToggleTafseer &&
    prev.isHighlighted === next.isHighlighted &&
    prev.isPinned === next.isPinned &&
    prev.progressColor === next.progressColor &&
    prev.onSurface === next.onSurface &&
    prev.onSurfaceVariant === next.onSurfaceVariant &&
    prev.backgroundColor === next.backgroundColor &&
    prev.surfaceColor === next.surfaceColor &&
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
  const { showAlert, showToast } = useAppAlert();
  const { translationLanguage, setTranslationLanguage } =
    useQuranTranslationStore();

  const listRef = useRef(null);
  const lastSavedScrollOffset = useRef(null);
  const isMounted = useRef(true);

  const [showScrollTop, setShowScrollTop] = useState(false);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [actionVerse, setActionVerse] = useState(null);
  const [actionIsBookmarked, setActionIsBookmarked] = useState(false);
  const [pins, setPins] = useState([]);
  const [pinsVisible, setPinsVisible] = useState(false);
  const [highlightedAyahId, setHighlightedAyahId] = useState(null);
  const [expandedTafseerIds, setExpandedTafseerIds] = useState(
    () => new Set(),
  );

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
    try {
      return decodeURIComponent(surahName);
    } catch {
      return surahName;
    }
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

  // Cleanup on unmount
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  // Load pins
  useEffect(() => {
    let active = true;
    const loadPins = async () => {
      const key = getPinsStorageKey();
      if (!key) return;
      try {
        const raw = await AsyncStorage.getItem(key);
        const storedPins = JSON.parse(raw || "[]");
        if (active && isMounted.current) {
          setPins(Array.isArray(storedPins) ? storedPins : []);
        }
      } catch {
        if (active && isMounted.current) setPins([]);
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

      // Throttle writes
      if (
        lastSavedScrollOffset.current !== null &&
        Math.abs(lastSavedScrollOffset.current - safeOffset) < 40
      ) {
        return;
      }
      lastSavedScrollOffset.current = safeOffset;

      try {
        await AsyncStorage.setItem(key, String(safeOffset));
      } catch {
        // non-critical
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
      if (!Number.isFinite(savedOffset) || savedOffset <= 32) return;

      // Double rAF + short delay for list to settle
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setTimeout(() => {
            if (!isMounted.current) return;
            try {
              listRef.current?.scrollToOffset({
                offset: savedOffset,
                animated: false,
              });
            } catch {
              // non-critical
            }
          }, 90);
        });
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

  // O(1) surah lookup
  const verses = useMemo(() => {
    if (surahId <= 0) return [];
    return getArabicVersesForSurah(surahId);
  }, [surahId]);

  const targetAyahIndex = useMemo(() => {
    if (targetAyahId === null) return -1;
    return verses.findIndex((verse) => verse.id === targetAyahId);
  }, [targetAyahId, verses]);

  const clearHighlight = useCallback(() => {
    if (isMounted.current) setHighlightedAyahId(null);
  }, []);

  // Deep-link / target ayah highlight + scroll
  useEffect(() => {
    if (targetAyahIndex < 0) return;

    const timer = setTimeout(() => {
      if (!isMounted.current) return;
      try {
        listRef.current?.scrollToIndex({
          index: targetAyahIndex,
          animated: false,
          viewPosition: 0.42,
        });
      } catch {
        // fallback
      }

      setHighlightedAyahId(targetAyahId);
      highlightProgress.value = 0;
      highlightProgress.value = withSequence(
        withTiming(1, {
          duration: 280,
          easing: Easing.out(Easing.cubic),
        }),
        withTiming(0, {
          duration: 1600,
          easing: Easing.inOut(Easing.quad),
        }),
      );
    }, 140);

    const clearHighlightTimer = setTimeout(() => {
      runOnJS(clearHighlight)();
    }, 2800);

    return () => {
      clearTimeout(timer);
      clearTimeout(clearHighlightTimer);
    };
  }, [clearHighlight, highlightProgress, targetAyahId, targetAyahIndex]);

  // Translation map – rebuild only when language or surah changes
  const translationMap = useMemo(() => {
    const map = new Map();
    if (surahId <= 0) return map;
    const data = getTranslationData(translationLanguage);
    for (const v of data) {
      if (v.surah === surahId) map.set(v.id, v.verse);
    }
    return map;
  }, [surahId, translationLanguage]);

  const isPashtoTranslation =
    translationLanguage === "pashto" || translationLanguage === "pa";
  const isRtlTranslationLanguage =
    translationLanguage === "pashto" ||
    translationLanguage === "pa" ||
    translationLanguage === "dari";

  const surahTafseerVerses = useMemo(() => {
    if (!isPashtoTranslation || surahId <= 0) return [];
    return getPashtoTafseerForSurah(surahId);
  }, [isPashtoTranslation, surahId]);

  const tafseerByAyah = useMemo(
    () =>
      new Map(
        (isPashtoTranslation ? surahTafseerVerses || [] : []).map((item) => [
          item.ayah,
          item.text,
        ]),
      ),
    [isPashtoTranslation, surahTafseerVerses],
  );

  const toggleTafseer = useCallback((verseId) => {
    setExpandedTafseerIds((currentIds) => {
      const nextIds = new Set(currentIds);
      if (nextIds.has(verseId)) nextIds.delete(verseId);
      else nextIds.add(verseId);
      return nextIds;
    });
  }, []);

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
        accessibilityLabel={t("Previous Surah")}
      />
    );
  }, [currentSurahIndex, navigation, onSurface, t]);

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
          accessibilityLabel={t("Select translation language")}
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
          accessibilityLabel={t("Next Surah")}
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
          fontSize: 17.5,
          fontWeight: "600",
          letterSpacing: 0.25,
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
          JSON.parse((await AsyncStorage.getItem("bookmarks")) || "[]") ||
          [];
        const isBookmarked = existing.some((b) => b.id === verse.id);
        if (!isMounted.current) return;
        setActionVerse({
          ...verse,
          surahName: resolvedSurahName,
        });
        setActionIsBookmarked(isBookmarked);
      } catch {
        showAlert(t("Error"), t("Failed to load bookmark status"));
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
    try {
      listRef.current?.scrollToIndex({
        index: pin.index,
        animated: true,
        viewPosition: 0.35,
      });
    } catch {
      // fallback
    }
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
          try {
            const existing =
              JSON.parse(
                (await AsyncStorage.getItem("bookmarks")) || "[]",
              ) || [];
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
            setActionVerse(null);
            showToast(t("Bookmarked"));
          } catch {
            showAlert(t("Error"), t("Failed to save bookmark"));
          }
        },
      },
      {
        label: t("Copy"),
        value: "copy",
        icon: "content-copy",
        onPress: async () => {
          try {
            await Clipboard.setStringAsync(message);
            setActionVerse(null);
            showToast(t("Copied to Clipboard"));
          } catch {
            showAlert(t("Error"), t("Failed to copy"));
          }
        },
      },
      {
        label: t("Share"),
        value: "share",
        icon: "share-variant",
        onPress: () => {
          setActionVerse(null);
          Share.share({ message }).catch(() => {});
          showToast(t("Shared"));
        },
      },
      {
        label: isPinned ? t("Remove pin") : t("Pin this location"),
        value: "pin",
        icon: isPinned ? "pin-off-outline" : "pin-outline",
        onPress: () => {
          const nextPinned = !pinnedVerseIds.has(actionVerse.id);
          toggleVersePin(actionVerse, actionVerse.index);
          setActionVerse(null);
          showToast(nextPinned ? t("Pinned") : t("Pin removed"));
        },
      },
    ];
  }, [
    actionIsBookmarked,
    actionVerse,
    pinnedVerseIds,
    resolvedSurahName,
    showAlert,
    showToast,
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
          tafseerText={tafseerByAyah.get(item.ayah)}
          isPashtoTranslation={isPashtoTranslation}
          isRtlText={isRtlTranslationLanguage}
          isTafseerExpanded={expandedTafseerIds.has(item.id)}
          onToggleTafseer={toggleTafseer}
          isHighlighted={highlightedAyahId === item.id}
          isPinned={pinnedVerseIds.has(item.id)}
          highlightProgress={highlightProgress}
          progressColor={progressColor}
          onSurface={onSurface}
          onSurfaceVariant={onSurfaceVariant}
          backgroundColor={backgroundColor}
          surfaceColor={surfaceColor}
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
      surfaceColor,
      buttonText,
      pinnedLabel,
      handleLongPress,
      tafseerByAyah,
      isPashtoTranslation,
      isRtlTranslationLanguage,
      expandedTafseerIds,
      toggleTafseer,
    ],
  );

  const keyExtractor = useCallback((item) => String(item.id), []);

  const handleScroll = useCallback(
    (e) => {
      const offsetY = e.nativeEvent.contentOffset.y || 0;
      setShowScrollTop(offsetY > 380);
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

  // Empty / error states
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
        extraData={`${translationLanguage}|${highlightedAyahId}|${pins.length}|${Array.from(expandedTafseerIds).join(",")}`}
        data={verses}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        recycleItems
        estimatedItemSize={118}
        drawDistance={520}
        ItemSeparatorComponent={ItemSeparator}
        showsVerticalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={24}
        contentContainerStyle={styles.listContent}
        removeClippedSubviews={Platform.OS === "android"}
        maintainVisibleContentPosition={{
          minIndexForVisible: 0,
        }}
      />

      {showScrollTop && (
        <Animated.View
          entering={FadeIn.duration(200)}
          exiting={FadeOut.duration(160)}
          style={styles.scrollTopWrapper}
        >
          <Pressable
            style={({ pressed }) => [
              styles.scrollTopBtn,
              {
                backgroundColor: primaryColor,
                shadowColor: primaryColor,
                opacity: pressed ? 0.88 : 1,
                transform: [{ scale: pressed ? 0.94 : 1 }],
              },
            ]}
            onPress={scrollToTop}
            android_ripple={{ color: "#ffffff40", borderless: true }}
            accessibilityLabel={t("Scroll to top")}
            accessibilityRole="button"
          >
            <Icon source="arrow-up" size={22} color="#ffffff" />
          </Pressable>
        </Animated.View>
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
        writingDirection={isRtlTranslationLanguage ? "rtl" : "ltr"}
        options={verseActionOptions}
        onClose={() => setActionVerse(null)}
      />

      <GeneralModal
        visible={pinsVisible}
        title={t("Pinned locations")}
        description={pins.length === 0 ? t("No pins yet") : undefined}
        writingDirection={isRtlTranslationLanguage ? "rtl" : "ltr"}
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
    paddingHorizontal: 28,
  },
  listContent: {
    paddingTop: 12,
    paddingBottom: 48,
    paddingHorizontal: 12,
  },
  verseOuter: {
    borderRadius: 16,
    overflow: "hidden",
    marginVertical: 7,
    borderWidth: StyleSheet.hairlineWidth,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06,
        shadowRadius: 3,
      },
      android: {
        elevation: 1,
      },
    }),
  },
  verseContainer: {
    position: "relative",
    paddingVertical: 20,
    paddingHorizontal: 16,
    borderRadius: 16,
  },
  ayahRipple: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 1.5,
    borderRadius: 16,
  },
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  inlinePinBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 20,
  },
  pinBadgeText: {
    color: "#ffffff",
    fontSize: 11,
    fontWeight: "500",
    letterSpacing: 0.2,
  },
  ayahNumber: {
    minWidth: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  ayahNumberText: {
    fontSize: 11,
    fontWeight: "500",
    letterSpacing: 0.3,
  },
  arabicRow: {
    position: "relative",
    width: "100%",
    marginBottom: 10,
  },
  ayahNumberInline: {
    fontWeight: "500",
    fontSize: 20,
  },
 
  arabicText: {
    flex: 1,
    fontSize: 22,
    fontWeight: "500",
    textAlign: "right",
    lineHeight: 35,
    writingDirection: "rtl",
    letterSpacing: 0.2,
  },
  translationText: {
    fontSize: 15.5,
    lineHeight: 27,
    opacity: 0.9,
  },
  tafseerToggle: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  tafseerToggleLabel: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "flex-start",
    gap: 4,
  },
  tafseerInlineLabel: {
    fontSize: 13,
    fontWeight: "700",
    textAlign: "right",
    writingDirection: "rtl",
    letterSpacing: 0.3,
  },
  tafseerInlineText: {
    marginTop: 8,
    fontSize: 14.5,
    lineHeight: 26,
    textAlign: "right",
    writingDirection: "rtl",
  },
  separator: {
    height: 0,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
  },
  headerIcon: {
    margin: 0,
  },
  scrollTopWrapper: {
    position: "absolute",
    bottom: 28,
    right: 18,
  },
  scrollTopBtn: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: "center",
    justifyContent: "center",
    elevation: 7,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
  },
  errorText: {
    fontSize: 16,
    fontWeight: "500",
    textAlign: "center",
    lineHeight: 24,
  },
});