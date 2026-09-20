import React, {
  useState,
  useMemo,
  useCallback,
  useEffect,
  useRef,
  memo,
} from "react";
import {
  StyleSheet,
  View,
  Pressable,
  Share,
  StatusBar,
  Platform,
  Text,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  withSpring,
  Easing,
  runOnJS,
  FadeIn,
  FadeOut,
  FadeInDown,
  FadeOutDown,
  interpolate,
  Extrapolation,
  useAnimatedReaction,
  cancelAnimation,
} from "react-native-reanimated";
import { AnimatedLegendList } from "@legendapp/list/reanimated";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { useTheme, Icon } from "react-native-paper";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useTranslation } from "react-i18next";
import {
  useFocusEffect,
  useLocalSearchParams,
  useNavigation,
  useRouter,
} from "expo-router";
import {
  LongPressGestureHandler,
  State,
  GestureHandlerRootView,
} from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHadithTranslationStore } from "../../components/store/store";
import FloatingLanguagePickerModal from "../../components/FloatingLanguagePickerModal";
import GeneralModal from "../../components/GeneralModal";
import { useAppAlert } from "../../components/AppAlertProvider";
import { getHadithId, getHadithsByBook } from "../../components/hadithData";

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

const safeHaptic = (fn) => {
  try {
    const result = fn();
    if (result && typeof result.catch === "function") result.catch(() => {});
  } catch {
    // no-op
  }
};

const HEADER_EXPANDED = 56;
const ENTER_SPRING = { damping: 22, stiffness: 180, mass: 0.9 };
const COMPACT_SPRING = { damping: 26, stiffness: 240, mass: 0.75 };
const PRESS_SPRING_IN = { damping: 18, stiffness: 420, mass: 0.45 };
const PRESS_SPRING_OUT = { damping: 16, stiffness: 300, mass: 0.5 };

const DIRECTION_THRESHOLD = 8;
const IDLE_RESET_MS = 180;

// ─── Mini action pill ───────────────────────────────────────────────────────

const MiniPill = memo(
  ({
    onPress,
    icon,
    disabled = false,
    filled = false,
    active = false,
    haptic = true,
    accessibilityLabel,
    colors,
    size = 38,
  }) => {
    const scale = useSharedValue(1);

    const pressStyle = useAnimatedStyle(() => ({
      transform: [{ scale: scale.value }],
    }));

    const handlePressIn = useCallback(() => {
      cancelAnimation(scale);
      scale.value = withSpring(0.88, PRESS_SPRING_IN);
    }, [scale]);

    const handlePressOut = useCallback(() => {
      cancelAnimation(scale);
      scale.value = withSpring(1, PRESS_SPRING_OUT);
    }, [scale]);

    const handlePress = useCallback(() => {
      if (disabled) return;
      if (haptic) {
        safeHaptic(() =>
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light),
        );
      }
      onPress?.();
    }, [disabled, haptic, onPress]);

    return (
      <Animated.View style={pressStyle}>
        <Pressable
          onPress={handlePress}
          disabled={disabled}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel}
          accessibilityState={{ disabled: disabled || active }}
          style={({ pressed }) => [
            styles.miniPill,
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              backgroundColor: filled ? colors.accent : colors.surface,
              borderColor: filled ? colors.accent : colors.border,
              shadowColor: filled ? colors.accent : colors.shadow,
            },
            active &&
              !filled && { backgroundColor: withAlpha(colors.accent, 0.16) },
            pressed && { opacity: filled ? 0.88 : 0.78 },
            disabled && { opacity: 0.32 },
          ]}
        >
          <Icon
            source={icon}
            size={size >= 40 ? 19 : 17}
            color={filled ? "#fff" : colors.text}
          />
        </Pressable>
      </Animated.View>
    );
  },
);
MiniPill.displayName = "MiniPill";

// ─── Collapsible floating header ────────────────────────────────────────────

const FloatingPillHeader = memo(
  ({
    title,
    canGoPrev,
    canGoNext,
    onPrev,
    onNext,
    onPins,
    onTranslate,
    onBack,
    colors,
    labels,
    scrollY,
  }) => {
    const insets = useSafeAreaInsets();

    const enterProgress = useSharedValue(0);
    const compactProgress = useSharedValue(0);
    const lastScrollY = useSharedValue(0);
    const lastDirection = useSharedValue(0);
    const lastChangeTime = useSharedValue(0);

    useEffect(() => {
      enterProgress.value = withSpring(1, ENTER_SPRING);
      return () => {
        cancelAnimation(enterProgress);
        cancelAnimation(compactProgress);
      };
    }, [enterProgress, compactProgress]);

    useAnimatedReaction(
      () => scrollY.value,
      (y, prevY) => {
        if (prevY == null) {
          lastScrollY.value = y;
          return;
        }
        const delta = y - lastScrollY.value;
        if (Math.abs(delta) < DIRECTION_THRESHOLD) return;

        const now = Date.now();
        const direction = delta > 0 ? 1 : -1;

        if (
          lastDirection.value !== 0 &&
          direction !== lastDirection.value &&
          now - lastChangeTime.value < IDLE_RESET_MS
        ) {
          lastScrollY.value = y;
          return;
        }

        lastDirection.value = direction;
        lastChangeTime.value = now;

        if (direction > 0) {
          compactProgress.value = withSpring(1, COMPACT_SPRING);
        } else {
          compactProgress.value = withSpring(0, COMPACT_SPRING);
        }
        lastScrollY.value = y;
      },
      [],
    );

    const headerStyle = useAnimatedStyle(() => {
      const enterY = interpolate(
        enterProgress.value,
        [0, 1],
        [-24, 0],
        Extrapolation.CLAMP,
      );
      const enterOpacity = interpolate(
        enterProgress.value,
        [0, 0.4, 1],
        [0, 0.85, 1],
        Extrapolation.CLAMP,
      );
      return {
        opacity: enterOpacity,
        transform: [{ translateY: enterY }],
      };
    });

    // Symmetric growth – identical left/right margins
    const titleStyle = useAnimatedStyle(() => {
      const p = compactProgress.value;
      return {
        flexGrow: interpolate(p, [0, 1], [1, 1.28], Extrapolation.CLAMP),
        maxWidth: interpolate(p, [0, 1], [230, 360], Extrapolation.CLAMP),
        marginHorizontal: interpolate(p, [0, 1], [4, 6], Extrapolation.CLAMP),
      };
    });

    // Pure scale + opacity + width – no directional translate so margins stay equal
    const secondaryStyle = useAnimatedStyle(() => {
      const p = compactProgress.value;
      return {
        opacity: interpolate(p, [0, 0.35, 1], [1, 0.2, 0], Extrapolation.CLAMP),
        transform: [
          { scale: interpolate(p, [0, 1], [1, 0.72], Extrapolation.CLAMP) },
        ],
        width: interpolate(p, [0, 1], [38, 0], Extrapolation.CLAMP),
        marginHorizontal: 0,
        overflow: "hidden",
      };
    });

    return (
      <Animated.View
        style={[
          styles.pillHeaderWrapper,
          { paddingTop: insets.top + 6 },
          headerStyle,
        ]}
        pointerEvents="box-none"
      >
        <View style={styles.pillRow}>
          <MiniPill
            onPress={onBack}
            icon="arrow-left"
            accessibilityLabel={labels.back}
            colors={colors}
            size={38}
          />

          <MiniPill
            onPress={onPrev}
            disabled={!canGoPrev}
            icon="chevron-left"
            accessibilityLabel={labels.prev}
            colors={colors}
            size={38}
          />

          <Animated.View style={[styles.titleCapsuleWrapper, titleStyle]}>
            <View
              style={[
                styles.titleCapsuleInner,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                  shadowColor: colors.shadow,
                },
              ]}
            >
              <Text
                style={[styles.pillTitle, { color: colors.text }]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.75}
              >
                {title}
              </Text>
            </View>
          </Animated.View>

          <MiniPill
            onPress={onNext}
            disabled={!canGoNext}
            icon="chevron-right"
            accessibilityLabel={labels.next}
            colors={colors}
            size={38}
          />

          <Animated.View style={secondaryStyle} pointerEvents="box-none">
            <MiniPill
              onPress={onPins}
              icon="pin-outline"
              accessibilityLabel={labels.pins}
              colors={colors}
              size={38}
            />
          </Animated.View>

          <Animated.View style={secondaryStyle} pointerEvents="box-none">
            <MiniPill
              onPress={onTranslate}
              icon="translate"
              accessibilityLabel={labels.translate}
              colors={colors}
              size={38}
            />
          </Animated.View>
        </View>
      </Animated.View>
    );
  },
);
FloatingPillHeader.displayName = "FloatingPillHeader";

// ─── Memoized row ───────────────────────────────────────────────────────────

const HadithItem = memo(
  ({
    item,
    index,
    isHighlighted,
    isPinned,
    isArabic,
    highlightProgress,
    colors,
    pinnedLabel,
    onLongPress,
  }) => {
    const pinId = getHadithId(item);

    const rippleStyle = useAnimatedStyle(() => {
      if (!isHighlighted) {
        return { opacity: 0, transform: [{ scale: 1 }] };
      }
      return {
        opacity: highlightProgress.value * 0.9,
        transform: [{ scale: 0.98 + highlightProgress.value * 0.02 }],
      };
    }, [isHighlighted]);

    const cardBg = isHighlighted
      ? withAlpha(colors.accent, 0.09)
      : colors.surface;

    const handleLongPressState = useCallback(
      ({ nativeEvent }) => {
        if (nativeEvent.state === State.ACTIVE) {
          onLongPress({ ...item, index });
        }
      },
      [item, index, onLongPress],
    );

    return (
      <LongPressGestureHandler
        onHandlerStateChange={handleLongPressState}
        minDurationMs={400}
      >
        <Animated.View
          style={[
            styles.hadithOuter,
            {
              backgroundColor: cardBg,
              borderColor: isHighlighted
                ? withAlpha(colors.accent, 0.42)
                : colors.border,
            },
          ]}
        >
          <Pressable
            android_ripple={{
              color: withAlpha(colors.accent, 0.1),
              borderless: false,
              foreground: true,
            }}
            style={({ pressed }) => [
              styles.hadithContainer,
              isHighlighted && {
                borderLeftColor: colors.accent,
                borderLeftWidth: 3,
              },
              pressed && {
                backgroundColor: withAlpha(colors.accent, 0.045),
              },
            ]}
          >
            {isHighlighted ? (
              <Animated.View
                pointerEvents="none"
                style={[
                  styles.hadithRipple,
                  { borderColor: withAlpha(colors.accent, 0.45) },
                  rippleStyle,
                ]}
              />
            ) : null}

            <View
              style={[
                styles.hadithBadgeRow,
                { flexDirection: isArabic ? "row-reverse" : "row" },
              ]}
            >
              {isPinned ? (
                <View
                  style={[
                    styles.inlinePinBadge,
                    { backgroundColor: colors.accent },
                  ]}
                >
                  <Icon source="pin" size={11} color="#fff" />
                  <Text style={styles.pinBadgeText}>{pinnedLabel}</Text>
                </View>
              ) : null}

              <View
                style={[
                  styles.hadithNumberBadge,
                  {
                    backgroundColor: withAlpha(colors.accent, 0.12),
                    borderColor: withAlpha(colors.accent, 0.45),
                  },
                ]}
              >
                <Text
                  style={[styles.hadithNumberText, { color: colors.accent }]}
                >
                  {pinId}
                </Text>
              </View>
            </View>

            <Text
              style={[
                styles.hadithText,
                {
                  color: colors.text,
                  textAlign: isArabic ? "right" : "left",
                  writingDirection: isArabic ? "rtl" : "ltr",
                },
              ]}
              selectable
            >
              {item.text}
            </Text>
          </Pressable>
        </Animated.View>
      </LongPressGestureHandler>
    );
  },
  (prev, next) =>
    getHadithId(prev.item) === getHadithId(next.item) &&
    prev.item.text === next.item.text &&
    prev.isHighlighted === next.isHighlighted &&
    prev.isPinned === next.isPinned &&
    prev.isArabic === next.isArabic &&
    prev.colors === next.colors &&
    prev.pinnedLabel === next.pinnedLabel &&
    prev.onLongPress === next.onLongPress &&
    prev.index === next.index,
);
HadithItem.displayName = "HadithItem";

// ─── Main screen ────────────────────────────────────────────────────────────

const HadithsScreen = () => {
  const theme = useTheme();
  const navigation = useNavigation();
  const router = useRouter();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { showAlert, showToast } = useAppAlert();
  const {
    bookNumber: bookNumberParam,
    bookName: bookNameParam,
    collection: collectionParam,
    hadithNumber,
  } = useLocalSearchParams();

  const bookNumber = Array.isArray(bookNumberParam)
    ? bookNumberParam[0]
    : bookNumberParam;
  const bookName = Array.isArray(bookNameParam)
    ? bookNameParam[0]
    : bookNameParam;
  const collectionValue = Array.isArray(collectionParam)
    ? collectionParam[0]
    : collectionParam;
  const collection = collectionValue === "muslim" ? "muslim" : "bukhari";

  const { translationLanguage: hadithLanguage, setTranslationLanguage } =
    useHadithTranslationStore();

  const listRef = useRef(null);
  const isMounted = useRef(true);
  const showScrollTopRef = useRef(false);
  const currentTopIndexRef = useRef(0);
  const lastSavedIndexRef = useRef(null);
  const indexSaveTimer = useRef(null);
  const scrollRetryTimer = useRef(null);

  const scrollY = useSharedValue(0);

  const [showScrollTop, setShowScrollTop] = useState(false);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [actionHadith, setActionHadith] = useState(null);
  const [actionIsBookmarked, setActionIsBookmarked] = useState(false);
  const [pins, setPins] = useState([]);
  const [pinsVisible, setPinsVisible] = useState(false);
  const [highlightedHadithId, setHighlightedHadithId] = useState(null);

  const [lastReadIndex, setLastReadIndex] = useState(null);
  const [lastReadHadithId, setLastReadHadithId] = useState(null);
  const [showLastReadBtn, setShowLastReadBtn] = useState(false);

  const highlightProgress = useSharedValue(0);

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

  const labels = useMemo(
    () => ({
      back: t("Back"),
      prev: t("Previous Hadith"),
      next: t("Next Hadith"),
      pins: t("Pinned locations"),
      translate: t("Select translation language"),
    }),
    [t],
  );

  const isArabic = hadithLanguage === "arabic";
  const pinnedLabel = t("Pinned");

  const pinsStorageKey = useMemo(
    () => `hadith_details_pins_${collection}_${bookNumber}`,
    [bookNumber, collection],
  );

  const getScrollStorageKey = useCallback(() => {
    if (!bookNumber) return null;
    return `hadith_details_scroll_${collection}_${bookNumber}`;
  }, [bookNumber, collection]);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      if (indexSaveTimer.current) clearTimeout(indexSaveTimer.current);
      if (scrollRetryTimer.current) clearTimeout(scrollRetryTimer.current);
    };
  }, []);

  // Reset when book / collection changes
  useEffect(() => {
    setHighlightedHadithId(null);
    setShowScrollTop(false);
    showScrollTopRef.current = false;
    currentTopIndexRef.current = 0;
    lastSavedIndexRef.current = null;
    setLastReadIndex(null);
    setLastReadHadithId(null);
    setShowLastReadBtn(false);
    setActionHadith(null);
    setActionIsBookmarked(false);
    setPinsVisible(false);
    scrollY.value = 0;
    cancelAnimation(highlightProgress);

    let active = true;
    const loadLastRead = async () => {
      const key = getScrollStorageKey();
      if (!key) return;
      try {
        const raw = await AsyncStorage.getItem(key);
        if (!raw) return;
        const parsed = JSON.parse(raw);
        const idx = Number(parsed?.index);
        if (active && isMounted.current && Number.isFinite(idx) && idx > 2) {
          setLastReadIndex(idx);
          setLastReadHadithId(parsed?.id != null ? String(parsed.id) : null);
          setShowLastReadBtn(true);
        }
      } catch {}
    };
    loadLastRead();

    return () => {
      active = false;
    };
  }, [bookNumber, collection, getScrollStorageKey, scrollY, highlightProgress]);

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(pinsStorageKey)
      .then((value) => {
        const storedPins = JSON.parse(value || "[]");
        if (active && isMounted.current) {
          setPins(Array.isArray(storedPins) ? storedPins : []);
        }
      })
      .catch(() => {
        if (active && isMounted.current) setPins([]);
      });
    return () => {
      active = false;
    };
  }, [pinsStorageKey]);

  useFocusEffect(
    useCallback(() => {
      navigation.setOptions({ headerShown: false });
    }, [navigation]),
  );

  const hadiths = useMemo(() => {
    return getHadithsByBook(collection, hadithLanguage, bookNumber);
  }, [bookNumber, collection, hadithLanguage]);

  const targetHadithNumber = useMemo(() => {
    const value = Array.isArray(hadithNumber) ? hadithNumber[0] : hadithNumber;
    return value != null ? String(value) : null;
  }, [hadithNumber]);

  const currentHadithIndex = useMemo(() => {
    if (!targetHadithNumber || hadiths.length === 0) return -1;
    return hadiths.findIndex(
      (item) => getHadithId(item) === targetHadithNumber,
    );
  }, [targetHadithNumber, hadiths]);

  const clearHighlight = useCallback(() => {
    if (isMounted.current) setHighlightedHadithId(null);
  }, []);

  // Reliable scroll-to-target with layout settle retries
  useEffect(() => {
    if (currentHadithIndex < 0 || !listRef.current) return;

    const doScroll = (animated) => {
      try {
        listRef.current?.scrollToIndex?.({
          index: currentHadithIndex,
          animated,
          viewPosition: 0.28,
        });
      } catch {
        // LegendList may throw if not yet measured
      }
    };

    doScroll(false);

    const timer = setTimeout(() => {
      if (!isMounted.current) return;
      doScroll(false);

      setHighlightedHadithId(targetHadithNumber);
      highlightProgress.value = 0;
      highlightProgress.value = withSequence(
        withTiming(1, { duration: 220, easing: Easing.out(Easing.cubic) }),
        withTiming(0, { duration: 1400, easing: Easing.inOut(Easing.quad) }),
      );
    }, 120);

    scrollRetryTimer.current = setTimeout(() => {
      if (!isMounted.current) return;
      doScroll(true);
    }, 420);

    const clearTimer = setTimeout(() => {
      runOnJS(clearHighlight)();
    }, 2600);

    return () => {
      clearTimeout(timer);
      clearTimeout(clearTimer);
      if (scrollRetryTimer.current) clearTimeout(scrollRetryTimer.current);
      cancelAnimation(highlightProgress);
    };
  }, [
    clearHighlight,
    currentHadithIndex,
    highlightProgress,
    targetHadithNumber,
  ]);

  const canGoPrev = currentHadithIndex > 0;
  const canGoNext =
    currentHadithIndex >= 0 && currentHadithIndex < hadiths.length - 1;

  const handlePrev = useCallback(() => {
    if (!canGoPrev) return;
    const target = hadiths[currentHadithIndex - 1];
    if (!target) return;
    safeHaptic(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
    navigation.setParams({ hadithNumber: getHadithId(target) });
  }, [canGoPrev, currentHadithIndex, hadiths, navigation]);

  const handleNext = useCallback(() => {
    if (!canGoNext) return;
    const target = hadiths[currentHadithIndex + 1];
    if (!target) return;
    safeHaptic(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
    navigation.setParams({ hadithNumber: getHadithId(target) });
  }, [canGoNext, currentHadithIndex, hadiths, navigation]);

  const handleBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)/home");
  }, [router]);

  const handlePins = useCallback(() => setPinsVisible(true), []);
  const handleTranslate = useCallback(() => setPickerVisible(true), []);

  const headerTitle = useMemo(() => {
    if (targetHadithNumber) {
      return `${t("Hadith")} #${targetHadithNumber}`;
    }
    if (bookName) return String(bookName);
    return t("Hadith");
  }, [targetHadithNumber, bookName, t]);

  const handleBookmark = useCallback(
    async (item) => {
      try {
        const existing = await AsyncStorage.getItem("hadithBookmarks");
        const hadithBookmarks = existing ? JSON.parse(existing) : [];
        const already = hadithBookmarks.some(
          (b) =>
            (b.collection || "bukhari") === collection &&
            String(b.reference?.book) === String(item.reference?.book) &&
            String(b.reference?.hadith) ===
              String(item.reference?.hadith || item.hadithnumber),
        );

        if (already) {
          showAlert(
            t("Already Bookmarked"),
            t("Hadith #{{number}} is already bookmarked", {
              number: item.reference?.hadith || item.hadithnumber,
            }),
          );
          return;
        }

        hadithBookmarks.push({
          ...item,
          collection,
          bookName,
          language: hadithLanguage,
          createdAt: Date.now(),
        });
        await AsyncStorage.setItem(
          "hadithBookmarks",
          JSON.stringify(hadithBookmarks),
        );
        setActionHadith(null);
        safeHaptic(() =>
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
        );
        showToast?.(t("Bookmarked")) ??
          showAlert(
            t("Bookmarked"),
            t("Hadith #{{number}} added to bookmarks", {
              number: item.reference?.hadith || item.hadithnumber,
            }),
          );
      } catch {
        showAlert(t("Error"), t("Could not bookmark hadith"));
      }
    },
    [bookName, collection, hadithLanguage, showAlert, showToast, t],
  );

  const hadithLanguageOptions = useMemo(
    () => [
      { label: "English", value: "english" },
      { label: "العربية", value: "arabic" },
    ],
    [],
  );

  const handleLongPress = useCallback(
    async (item) => {
      try {
        const existing =
          JSON.parse((await AsyncStorage.getItem("hadithBookmarks")) || "[]") ||
          [];
        const isBookmarked = existing.some(
          (b) =>
            (b.collection || "bukhari") === collection &&
            String(b.reference?.book) === String(item.reference?.book) &&
            String(b.reference?.hadith) ===
              String(item.reference?.hadith || item.hadithnumber),
        );
        if (!isMounted.current) return;
        safeHaptic(() => Haptics.selectionAsync());
        setActionHadith(item);
        setActionIsBookmarked(isBookmarked);
      } catch {
        if (!isMounted.current) return;
        setActionHadith(item);
        setActionIsBookmarked(false);
      }
    },
    [collection],
  );

  const savePins = useCallback(
    (nextPins) => {
      setPins(nextPins);
      AsyncStorage.setItem(pinsStorageKey, JSON.stringify(nextPins)).catch(
        () => {},
      );
    },
    [pinsStorageKey],
  );

  const toggleHadithPin = useCallback(
    (item, index) => {
      const pinId = getHadithId(item);
      const isPinned = pins.some((pin) => pin.id === pinId);
      const nextPins = isPinned
        ? pins.filter((pin) => pin.id !== pinId)
        : [...pins, { id: pinId, index, hadith: pinId }];
      savePins(nextPins);
    },
    [pins, savePins],
  );

  const goToHadithPin = useCallback((pin) => {
    try {
      listRef.current?.scrollToIndex?.({
        index: pin.index,
        animated: true,
        viewPosition: 0.28,
      });
    } catch {}
    setPinsVisible(false);
  }, []);

  const pinnedHadithIds = useMemo(
    () => new Set(pins.map((pin) => pin.id)),
    [pins],
  );

  const pinOptions = useMemo(
    () =>
      pins.map((pin) => ({
        label: `${t("Hadith")} #${pin.hadith}`,
        value: pin.id,
        icon: "pin",
        onPress: () => goToHadithPin(pin),
        secondaryAction: {
          label: t("Remove pin"),
          icon: "pin-off-outline",
          onPress: () => savePins(pins.filter((item) => item.id !== pin.id)),
        },
      })),
    [goToHadithPin, pins, savePins, t],
  );

  const hadithActionOptions = useMemo(() => {
    if (!actionHadith) return [];

    const pinId = getHadithId(actionHadith);
    const isPinned = pinnedHadithIds.has(pinId);
    const actionIndex =
      typeof actionHadith.index === "number"
        ? actionHadith.index
        : hadiths.findIndex((item) => getHadithId(item) === pinId);

    return [
      {
        label: actionIsBookmarked ? t("Already Bookmarked") : t("Bookmark"),
        value: "bookmark",
        icon: "bookmark-outline",
        disabled: actionIsBookmarked,
        onPress: () => handleBookmark(actionHadith),
      },
      {
        label: t("Copy"),
        value: "copy",
        icon: "content-copy",
        onPress: async () => {
          try {
            await Clipboard.setStringAsync(actionHadith.text);
            setActionHadith(null);
            safeHaptic(() =>
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light),
            );
            showToast?.(t("Copied to Clipboard")) ??
              showAlert(t("Copied to Clipboard"));
          } catch {
            showAlert(t("Error"), t("Could not copy"));
          }
        },
      },
      {
        label: t("Share"),
        value: "share",
        icon: "share-variant",
        onPress: async () => {
          try {
            setActionHadith(null);
            await Share.share({ message: actionHadith.text });
            showToast?.(t("Shared"));
          } catch {
            showAlert(t("Error"), t("Could not share"));
          }
        },
      },
      {
        label: isPinned ? t("Remove pin") : t("Pin this location"),
        value: "pin",
        icon: isPinned ? "pin-off-outline" : "pin-outline",
        onPress: () => {
          const nextPinned = !pinnedHadithIds.has(pinId);
          toggleHadithPin(actionHadith, actionIndex);
          setActionHadith(null);
          safeHaptic(() => Haptics.selectionAsync());
          showToast?.(nextPinned ? t("Pinned") : t("Pin removed"));
        },
      },
    ];
  }, [
    actionHadith,
    actionIsBookmarked,
    handleBookmark,
    hadiths,
    pinnedHadithIds,
    showAlert,
    showToast,
    t,
    toggleHadithPin,
  ]);

  const renderItem = useCallback(
    ({ item, index }) => {
      const pinId = getHadithId(item);
      return (
        <HadithItem
          item={item}
          index={index}
          isHighlighted={highlightedHadithId === pinId}
          isPinned={pinnedHadithIds.has(pinId)}
          isArabic={isArabic}
          highlightProgress={highlightProgress}
          colors={colors}
          pinnedLabel={pinnedLabel}
          onLongPress={handleLongPress}
        />
      );
    },
    [
      highlightedHadithId,
      pinnedHadithIds,
      isArabic,
      highlightProgress,
      colors,
      pinnedLabel,
      handleLongPress,
    ],
  );

  const keyExtractor = useCallback(
    (item, idx) => `${getHadithId(item)}-${idx}`,
    [],
  );

  const updateScrollTopVisibility = useCallback((offsetY) => {
    const shouldShow = offsetY > 420;
    if (shouldShow !== showScrollTopRef.current) {
      showScrollTopRef.current = shouldShow;
      setShowScrollTop(shouldShow);
    }
  }, []);

  const onScroll = useCallback(
    (event) => {
      const offsetY = event.nativeEvent.contentOffset.y || 0;
      updateScrollTopVisibility(offsetY);
    },
    [updateScrollTopVisibility],
  );

  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 50,
    minimumViewTime: 80,
  }).current;

  const handleViewableItemsChanged = useCallback(
    ({ viewableItems }) => {
      if (!viewableItems || viewableItems.length === 0) return;

      let topIndex = viewableItems[0]?.index;
      for (const v of viewableItems) {
        if (typeof v.index === "number" && v.index < topIndex) {
          topIndex = v.index;
        }
      }
      if (typeof topIndex !== "number") return;

      currentTopIndexRef.current = topIndex;

      if (
        lastReadIndex != null &&
        Math.abs(topIndex - lastReadIndex) <= 2 &&
        showLastReadBtn
      ) {
        setShowLastReadBtn(false);
      }

      const key = getScrollStorageKey();
      if (!key) return;
      if (lastSavedIndexRef.current === topIndex) return;

      if (indexSaveTimer.current) clearTimeout(indexSaveTimer.current);
      indexSaveTimer.current = setTimeout(async () => {
        lastSavedIndexRef.current = topIndex;
        try {
          const id = hadiths[topIndex] ? getHadithId(hadiths[topIndex]) : null;
          await AsyncStorage.setItem(
            key,
            JSON.stringify({ index: topIndex, id }),
          );
        } catch {}
      }, 450);
    },
    [getScrollStorageKey, lastReadIndex, showLastReadBtn, hadiths],
  );

  const scrollToTop = useCallback(() => {
    safeHaptic(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
    listRef.current?.scrollToOffset?.({ offset: 0, animated: true });
  }, []);

  const goToLastRead = useCallback(() => {
    if (lastReadIndex == null) return;
    if (lastReadIndex >= hadiths.length) {
      setShowLastReadBtn(false);
      return;
    }
    try {
      safeHaptic(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
      listRef.current?.scrollToIndex?.({
        index: lastReadIndex,
        animated: true,
        viewPosition: 0.12,
      });
      setShowLastReadBtn(false);
    } catch {}
  }, [lastReadIndex, hadiths.length]);

  const listTopPadding = insets.top + 8 + HEADER_EXPANDED + 14;

  const listExtraData = useMemo(
    () => `${hadithLanguage}|${highlightedHadithId ?? ""}|${pins.length}`,
    [hadithLanguage, highlightedHadithId, pins.length],
  );

  if (hadiths.length === 0) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <Icon source="book-alert-outline" size={40} color={colors.secondary} />
        <Text style={[styles.errorText, { color: colors.error }]}>
          {t("No hadiths found for this book")}
        </Text>
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={styles.root}>
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <StatusBar
          barStyle={theme.dark ? "light-content" : "dark-content"}
          backgroundColor="transparent"
          translucent
        />

        <FloatingPillHeader
          title={headerTitle}
          canGoPrev={canGoPrev}
          canGoNext={canGoNext}
          onPrev={handlePrev}
          onNext={handleNext}
          onPins={handlePins}
          onTranslate={handleTranslate}
          onBack={handleBack}
          colors={colors}
          labels={labels}
          scrollY={scrollY}
        />

        <View style={styles.listFlex}>
          <AnimatedLegendList
            key={`${collection}-${bookNumber}-${hadithLanguage}`}
            ref={listRef}
            extraData={listExtraData}
            data={hadiths}
            renderItem={renderItem}
            keyExtractor={keyExtractor}
            recycleItems
            estimatedItemSize={118}
            drawDistance={480}
            showsVerticalScrollIndicator={false}
            onScroll={onScroll}
            scrollEventThrottle={16}
            onViewableItemsChanged={handleViewableItemsChanged}
            viewabilityConfig={viewabilityConfig}
            contentContainerStyle={[
              styles.listContent,
              {
                paddingTop: listTopPadding,
                paddingBottom: insets.bottom + 72,
              },
            ]}
            removeClippedSubviews={Platform.OS === "android"}
            maintainVisibleContentPosition
            sharedValues={{ scrollOffset: scrollY }}
          />
        </View>

        {showScrollTop && (
          <Animated.View
            entering={FadeIn.duration(160)}
            exiting={FadeOut.duration(110)}
            style={[styles.scrollTopWrapper, { bottom: insets.bottom + 24 }]}
          >
            <Pressable
              style={({ pressed }) => [
                styles.scrollTopBtn,
                {
                  backgroundColor: colors.primary,
                  shadowColor: colors.primary,
                  opacity: pressed ? 0.9 : 1,
                  transform: [{ scale: pressed ? 0.94 : 1 }],
                },
              ]}
              onPress={scrollToTop}
              android_ripple={{ color: "#ffffff40", borderless: true }}
              accessibilityRole="button"
              accessibilityLabel={t("Scroll to top")}
            >
              <Icon source="arrow-up" size={22} color="#fff" />
            </Pressable>
          </Animated.View>
        )}

        {showLastReadBtn && lastReadIndex != null && (
          <Animated.View
            entering={FadeInDown.duration(220).easing(Easing.out(Easing.cubic))}
            exiting={FadeOutDown.duration(140).easing(Easing.in(Easing.quad))}
            style={[styles.lastReadWrapper, { bottom: insets.bottom + 22 }]}
            pointerEvents="box-none"
          >
            <Pressable
              onPress={goToLastRead}
              style={({ pressed }) => [
                styles.lastReadBtn,
                {
                  backgroundColor: colors.surface,
                  borderColor: withAlpha(colors.accent, 0.35),
                  shadowColor: colors.shadow,
                  opacity: pressed ? 0.92 : 1,
                  transform: [{ scale: pressed ? 0.97 : 1 }],
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel={
                lastReadHadithId != null
                  ? `${t("Continue reading") || "Continue reading"} — ${t("Hadith")} #${lastReadHadithId}`
                  : t("Continue reading") || "Continue reading"
              }
            >
              <Icon source="bookmark-outline" size={18} color={colors.accent} />
              <Text
                style={[styles.lastReadText, { color: colors.text }]}
                numberOfLines={1}
              >
                {lastReadHadithId != null
                  ? `${t("Continue reading") || "Continue reading"} · ${t("Hadith")} #${lastReadHadithId}`
                  : t("Continue reading") || "Continue reading"}
              </Text>
              <Icon source="chevron-down" size={18} color={colors.secondary} />
            </Pressable>
          </Animated.View>
        )}

        <FloatingLanguagePickerModal
          visible={pickerVisible}
          title={t("Select Hadith translation language")}
          options={hadithLanguageOptions}
          selectedValue={hadithLanguage}
          onSelect={setTranslationLanguage}
          onClose={() => setPickerVisible(false)}
          theme={theme}
        />

        <GeneralModal
          visible={Boolean(actionHadith)}
          title={
            actionIsBookmarked ? t("Already Bookmarked") : t("Choose an action")
          }
          description={actionHadith?.text}
          writingDirection={isArabic ? "rtl" : "ltr"}
          options={hadithActionOptions}
          onClose={() => setActionHadith(null)}
        />

        <GeneralModal
          visible={pinsVisible}
          title={t("Pinned locations")}
          description={pins.length === 0 ? t("No pins yet") : undefined}
          writingDirection={isArabic ? "rtl" : "ltr"}
          options={pinOptions}
          onClose={() => setPinsVisible(false)}
        />
      </View>
    </GestureHandlerRootView>
  );
};

export default HadithsScreen;

// ====================== STYLES ======================
const styles = StyleSheet.create({
  root: { flex: 1 },
  container: { flex: 1 },
  listFlex: { flex: 1 },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 28,
    gap: 10,
  },

  pillHeaderWrapper: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
    paddingHorizontal: 10,
    alignItems: "center",
  },
  pillRow: {
    width: "100%",
    maxWidth: 600,
    alignSelf: "center",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 5,
    paddingHorizontal: 2,
  },
  miniPill: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
    ...Platform.select({
      ios: {
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.12,
        shadowRadius: 6,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  titleCapsuleWrapper: {
    flex: 1,
    minWidth: 100,
    maxWidth: 230,
    marginHorizontal: 4,
  },
  titleCapsuleInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    minHeight: 40,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
    ...Platform.select({
      ios: {
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.12,
        shadowRadius: 6,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  pillTitle: {
    fontSize: 15.5,
    fontWeight: "700",
    flexShrink: 1,
    textAlign: "center",
    letterSpacing: 0.15,
  },

  listContent: {
    paddingHorizontal: 12,
  },

  hadithOuter: {
    borderRadius: 16,
    overflow: "hidden",
    marginVertical: 5,
    borderWidth: StyleSheet.hairlineWidth,
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
  hadithContainer: {
    position: "relative",
    paddingVertical: 16,
    paddingHorizontal: 14,
    borderRadius: 16,
  },
  hadithRipple: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 1.5,
    borderRadius: 16,
  },
  hadithBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  hadithText: {
    fontSize: 16,
    fontWeight: "500",
    lineHeight: 28,
    opacity: 0.95,
  },
  hadithNumberBadge: {
    minWidth: 32,
    height: 28,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  hadithNumberText: {
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.2,
  },
  inlinePinBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 16,
  },
  pinBadgeText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.15,
  },

  scrollTopWrapper: {
    position: "absolute",
    right: 16,
    zIndex: 15,
  },
  scrollTopBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    elevation: 6,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
  },

  lastReadWrapper: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 16,
    paddingHorizontal: 24,
  },
  lastReadBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 11,
    paddingHorizontal: 18,
    borderRadius: 28,
    borderWidth: StyleSheet.hairlineWidth,
    maxWidth: 300,
    ...Platform.select({
      ios: {
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.14,
        shadowRadius: 10,
      },
      android: {
        elevation: 5,
      },
    }),
  },
  lastReadText: {
    fontSize: 14.5,
    fontWeight: "600",
    letterSpacing: 0.2,
  },

  errorText: {
    fontSize: 16,
    fontWeight: "500",
    textAlign: "center",
    lineHeight: 24,
  },
});
