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
  ScrollView,
  Share,
  StyleSheet,
  TextInput,
  View,
  Platform,
  StatusBar,
  Text,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  Easing,
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
import { Icon, useTheme } from "react-native-paper";
import { MaterialIcons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useFocusEffect, useNavigation, useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  useAppLanguageStore,
  useHadithTranslationStore,
} from "../../components/store/store";
import FloatingLanguagePickerModal from "../../components/FloatingLanguagePickerModal";
import GeneralModal from "../../components/GeneralModal";
import { useAppAlert } from "../../components/AppAlertProvider";
import dummyHadiths from "../../assets/Hadiths/jawami_al_kalim.json";

// ─── Utils ──────────────────────────────────────────────────────────────────

const LANGUAGE_FIELDS = {
  en: "english",
  english: "english",
  pa: "pashto",
  pashto: "pashto",
  da: "dari",
  dari: "dari",
};

const RTL_LANGUAGES = new Set(["pa", "pashto", "da", "dari"]);

const getLocalizedText = (item, language) => {
  if (!item || typeof item !== "object") return "";
  const preferredField = LANGUAGE_FIELDS[language] || LANGUAGE_FIELDS.en;
  const fallbackFields = [preferredField, "english", "pashto", "dari"];
  return (
    fallbackFields
      .map((field) => item[field])
      .find((value) => typeof value === "string" && value.trim()) || ""
  );
};

const getWritingDirection = (language) =>
  RTL_LANGUAGES.has(language) ? "rtl" : "ltr";

const getLocalizedNumber = (number, language) => {
  if (language === "en" || language === "english") return String(number);
  return String(number).replace(/[0-9]/g, (digit) => "۰۱۲۳۴۵۶۷۸۹"[digit]);
};

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
      // eslint-disable-next-line react-hooks/immutability
      scale.value = withSpring(0.88, PRESS_SPRING_IN);
    }, [scale]);

    const handlePressOut = useCallback(() => {
      cancelAnimation(scale);
      // eslint-disable-next-line react-hooks/immutability
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
  ({ title, onPins, onTranslate, onBack, colors, labels, scrollY }) => {
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
          // eslint-disable-next-line react-hooks/immutability
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
        maxWidth: interpolate(p, [0, 1], [240, 380], Extrapolation.CLAMP),
        marginHorizontal: interpolate(p, [0, 1], [4, 6], Extrapolation.CLAMP),
      };
    });

    // Pure scale + opacity + width – no directional translate
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

// ─── Memoized card ──────────────────────────────────────────────────────────

const HadithCard = memo(
  ({ item, language, colors, t, isPinned, onLongPress }) => {
    const writingDirection = getWritingDirection(language);
    const textAlign = writingDirection === "rtl" ? "right" : "left";
    const title = getLocalizedText(item.title, language);
    const translation = getLocalizedText(item, language);
    const source = getLocalizedText(item.source, language);
    const number = getLocalizedNumber(item.id, language);
    const translationLabel = t("Translation");
    const sourceLabel = t("Source");

    return (
      <Pressable
        onLongPress={() => {
          safeHaptic(() => Haptics.selectionAsync());
          onLongPress(item);
        }}
        delayLongPress={380}
        style={({ pressed }) => [
          styles.card,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
            opacity: pressed ? 0.92 : 1,
          },
        ]}
      >
        {isPinned ? (
          <View style={[styles.pinBadge, { backgroundColor: colors.accent }]}>
            <Icon source="pin" size={11} color="#fff" />
            <Text style={styles.pinBadgeText}>{t("Pinned")}</Text>
          </View>
        ) : null}

        <Text
          style={[
            styles.cardTitle,
            { color: colors.text, textAlign, writingDirection },
          ]}
        >
          {number} - {title}
        </Text>

        <Text
          selectable
          style={[
            styles.arabic,
            {
              color: colors.accent,
              textAlign: "right",
              writingDirection: "rtl",
            },
          ]}
        >
          {item.arabic}
        </Text>

        <Text
          selectable
          style={[
            styles.translation,
            { color: colors.text, textAlign, writingDirection },
          ]}
        >
          <Text style={[styles.labelText, { writingDirection, textAlign }]}>
            {translationLabel}:{" "}
          </Text>
          <Text style={[styles.contentText, { writingDirection, textAlign }]}>
            {translation}
          </Text>
        </Text>

        <Text
          style={[
            styles.source,
            { color: colors.secondary, textAlign, writingDirection },
          ]}
        >
          <Text
            style={[
              styles.sourceLabel,
              {
                color: colors.accent,
                writingDirection,
                textAlign,
              },
            ]}
          >
            {sourceLabel}:{" "}
          </Text>
          <Text style={[styles.contentText, { writingDirection, textAlign }]}>
            {source}
          </Text>
        </Text>
      </Pressable>
    );
  },
  (prev, next) =>
    prev.item.id === next.item.id &&
    prev.language === next.language &&
    prev.isPinned === next.isPinned &&
    prev.colors === next.colors &&
    prev.t === next.t &&
    prev.onLongPress === next.onLongPress,
);
HadithCard.displayName = "HadithCard";

// ─── Main screen ────────────────────────────────────────────────────────────

const JawamiAlKalim = () => {
  const theme = useTheme();
  const navigation = useNavigation();
  const router = useRouter();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { showAlert, showToast } = useAppAlert();
  const appLanguage = useAppLanguageStore((state) => state.language);
  const { translationLanguage: contentLanguage, setTranslationLanguage } =
    useHadithTranslationStore();

  const [searchQuery, setSearchQuery] = useState("");
  const [pickerVisible, setPickerVisible] = useState(false);
  const [actionHadith, setActionHadith] = useState(null);
  const [actionIsBookmarked, setActionIsBookmarked] = useState(false);
  const [pins, setPins] = useState([]);
  const [pinsVisible, setPinsVisible] = useState(false);
  const [infoVisible, setInfoVisible] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [lastReadIndex, setLastReadIndex] = useState(null);
  const [lastReadId, setLastReadId] = useState(null);
  const [showLastReadBtn, setShowLastReadBtn] = useState(false);

  const listRef = useRef(null);
  const isMounted = useRef(true);
  const showScrollTopRef = useRef(false);
  const currentTopIndexRef = useRef(0);
  const lastSavedIndexRef = useRef(null);
  const indexSaveTimer = useRef(null);

  const scrollY = useSharedValue(0);

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
      pins: t("Pinned locations"),
      translate: t("Select translation language"),
    }),
    [t],
  );

  const writingDirection = getWritingDirection(appLanguage);
  const textAlign = writingDirection === "rtl" ? "right" : "left";
  const inactiveColor =
    theme.colors.inactiveColor || theme.colors.onSurfaceVariant;

  const pageT = useCallback((key, options) => t(key, options), [t]);

  const getScrollStorageKey = useCallback(() => "jawami_al_kalim_scroll", []);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      if (indexSaveTimer.current) clearTimeout(indexSaveTimer.current);
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      navigation.setOptions({ headerShown: false });
    }, [navigation]),
  );

  // Load pins + last-read position
  useEffect(() => {
    let active = true;

    AsyncStorage.getItem("jawami_al_kalim_pins")
      .then((value) => {
        const storedPins = JSON.parse(value || "[]");
        if (active && isMounted.current) {
          setPins(Array.isArray(storedPins) ? storedPins : []);
        }
      })
      .catch(() => {
        if (active && isMounted.current) setPins([]);
      });

    const loadLastRead = async () => {
      try {
        const raw = await AsyncStorage.getItem(getScrollStorageKey());
        if (!raw) return;
        const parsed = JSON.parse(raw);
        const idx = Number(parsed?.index);
        if (active && isMounted.current && Number.isFinite(idx) && idx > 2) {
          setLastReadIndex(idx);
          setLastReadId(parsed?.id != null ? String(parsed.id) : null);
          setShowLastReadBtn(true);
        }
      } catch {}
    };
    loadLastRead();

    return () => {
      active = false;
    };
  }, [getScrollStorageKey]);

  const filteredHadiths = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return dummyHadiths;

    return dummyHadiths.filter((item) => {
      const searchable = [
        item.arabic,
        item.english,
        item.pashto,
        item.dari,
        item.title?.english,
        item.title?.pashto,
        item.title?.dari,
        item.source?.english,
        item.source?.pashto,
        item.source?.dari,
      ]
        .join(" ")
        .toLowerCase();

      return searchable.includes(query) || String(item.id).includes(query);
    });
  }, [searchQuery]);

  const savePins = useCallback((nextPins) => {
    setPins(nextPins);
    AsyncStorage.setItem(
      "jawami_al_kalim_pins",
      JSON.stringify(nextPins),
    ).catch(() => {});
  }, []);

  const toggleHadithPin = useCallback(
    (item) => {
      const pinId = String(item.id);
      const isPinned = pins.some((pin) => pin.id === pinId);
      const nextPins = isPinned
        ? pins.filter((pin) => pin.id !== pinId)
        : [
            ...pins,
            {
              id: pinId,
              index: dummyHadiths.findIndex((h) => h.id === item.id),
              hadith: pinId,
            },
          ];
      savePins(nextPins);
    },
    [pins, savePins],
  );

  const handleBookmark = useCallback(
    async (item) => {
      try {
        const existing = JSON.parse(
          (await AsyncStorage.getItem("hadithBookmarks")) || "[]",
        );
        const hadithNumber = String(item.id);
        const already = existing.some(
          (bookmark) =>
            bookmark.collection === "jawami_al_kalim" &&
            String(bookmark.hadithnumber) === hadithNumber,
        );

        if (already) {
          showAlert(pageT("Already Bookmarked"));
          return;
        }

        existing.push({
          ...item,
          collection: "jawami_al_kalim",
          hadithnumber: hadithNumber,
          bookName: pageT("Jawami al-Kalim"),
          text: getLocalizedText(item, contentLanguage),
          language: contentLanguage,
          createdAt: Date.now(),
        });

        await AsyncStorage.setItem("hadithBookmarks", JSON.stringify(existing));
        setActionHadith(null);
        safeHaptic(() =>
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
        );
        showToast?.(pageT("Bookmarked")) ??
          showAlert(
            pageT("Bookmarked"),
            pageT("Hadith #{{number}} added to bookmarks", {
              number: hadithNumber,
            }),
          );
      } catch {
        showAlert(pageT("Error"), pageT("Could not bookmark hadith"));
      }
    },
    [contentLanguage, pageT, showAlert, showToast],
  );

  const handleLongPress = useCallback(async (item) => {
    try {
      const existing = JSON.parse(
        (await AsyncStorage.getItem("hadithBookmarks")) || "[]",
      );
      const isBookmarked = existing.some(
        (bookmark) =>
          bookmark.collection === "jawami_al_kalim" &&
          String(bookmark.hadithnumber) === String(item.id),
      );
      if (!isMounted.current) return;
      setActionIsBookmarked(isBookmarked);
    } catch {
      if (!isMounted.current) return;
      setActionIsBookmarked(false);
    }
    setActionHadith(item);
  }, []);

  const goToHadithPin = useCallback((pin) => {
    setPinsVisible(false);
    try {
      listRef.current?.scrollToIndex?.({
        index: pin.index,
        animated: true,
        viewPosition: 0.2,
      });
    } catch {}
  }, []);

  const pinOptions = useMemo(
    () =>
      pins.map((pin) => ({
        label: `${pageT("Hadith")} #${pin.hadith}`,
        value: pin.id,
        icon: "pin",
        onPress: () => goToHadithPin(pin),
        secondaryAction: {
          label: pageT("Remove pin"),
          icon: "pin-off-outline",
          onPress: () => savePins(pins.filter((item) => item.id !== pin.id)),
        },
      })),
    [goToHadithPin, pageT, pins, savePins],
  );

  const actionOptions = useMemo(() => {
    if (!actionHadith) return [];

    const isPinned = pins.some((pin) => pin.id === String(actionHadith.id));
    const message = [
      actionHadith.arabic,
      getLocalizedText(actionHadith, contentLanguage),
      getLocalizedText(actionHadith.source, contentLanguage),
    ]
      .filter(Boolean)
      .join("\n\n");

    return [
      {
        label: actionIsBookmarked
          ? pageT("Already Bookmarked")
          : pageT("Bookmark"),
        value: "bookmark",
        icon: "bookmark-outline",
        disabled: actionIsBookmarked,
        onPress: () => handleBookmark(actionHadith),
      },
      {
        label: pageT("Copy"),
        value: "copy",
        icon: "content-copy",
        onPress: async () => {
          try {
            await Clipboard.setStringAsync(message);
            setActionHadith(null);
            safeHaptic(() =>
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light),
            );
            showToast?.(pageT("Copied to Clipboard")) ??
              showAlert(pageT("Copied to Clipboard"));
          } catch {
            showAlert(pageT("Error"), pageT("Could not copy"));
          }
        },
      },
      {
        label: pageT("Share"),
        value: "share",
        icon: "share-variant",
        onPress: async () => {
          try {
            setActionHadith(null);
            await Share.share({ message });
            showToast?.(pageT("Shared"));
          } catch {
            showAlert(pageT("Error"), pageT("Could not share"));
          }
        },
      },
      {
        label: isPinned ? pageT("Remove pin") : pageT("Pin this location"),
        value: "pin",
        icon: isPinned ? "pin-off-outline" : "pin-outline",
        onPress: () => {
          const nextPinned = !isPinned;
          toggleHadithPin(actionHadith);
          setActionHadith(null);
          safeHaptic(() => Haptics.selectionAsync());
          showToast?.(nextPinned ? pageT("Pinned") : pageT("Pin removed"));
        },
      },
    ];
  }, [
    actionHadith,
    actionIsBookmarked,
    contentLanguage,
    handleBookmark,
    pins,
    showAlert,
    showToast,
    pageT,
    toggleHadithPin,
  ]);

  const translationOptions = useMemo(
    () => [
      { label: t("English"), value: "english", icon: "translate" },
      { label: t("Pashto"), value: "pashto", icon: "translate" },
      { label: t("Dari"), value: "dari", icon: "translate" },
    ],
    [t],
  );

  const handleBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)/home");
  }, [router]);

  const handlePins = useCallback(() => setPinsVisible(true), []);
  const handleTranslate = useCallback(() => setPickerVisible(true), []);

  const renderItem = useCallback(
    ({ item }) => (
      <HadithCard
        item={item}
        language={contentLanguage}
        colors={colors}
        t={pageT}
        isPinned={pins.some((pin) => pin.id === String(item.id))}
        onLongPress={handleLongPress}
      />
    ),
    [contentLanguage, colors, handleLongPress, pageT, pins],
  );

  const keyExtractor = useCallback((item) => String(item.id), []);

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

  const viewabilityConfig = useMemo(
    () => ({
      itemVisiblePercentThreshold: 50,
      minimumViewTime: 80,
    }),
    [],
  );

  const handleViewableItemsChanged = useCallback(
    ({ viewableItems }) => {
      if (!viewableItems || viewableItems.length === 0) return;

      // Only track position when not searching
      if (searchQuery.trim()) return;

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
          const id = filteredHadiths[topIndex]?.id ?? null;
          await AsyncStorage.setItem(
            key,
            JSON.stringify({ index: topIndex, id }),
          );
        } catch {}
      }, 450);
    },
    [
      getScrollStorageKey,
      lastReadIndex,
      showLastReadBtn,
      searchQuery,
      filteredHadiths,
    ],
  );

  const scrollToTop = useCallback(() => {
    safeHaptic(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
    listRef.current?.scrollToOffset?.({ offset: 0, animated: true });
  }, []);

  const goToLastRead = useCallback(() => {
    if (lastReadIndex == null) return;
    if (lastReadIndex >= filteredHadiths.length) {
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
  }, [lastReadIndex, filteredHadiths.length]);

  const listTopPadding = insets.top + 8 + HEADER_EXPANDED + 14;

  const listExtraData = useMemo(
    () => `${contentLanguage}|${pins.length}|${searchQuery}`,
    [contentLanguage, pins.length, searchQuery],
  );

  const listHeader = useMemo(
    () => (
      <View style={styles.listHeader}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={pageT("Jawami al-Kalim")}
          onPress={() => setInfoVisible(true)}
          style={({ pressed }) => [
            styles.infoButton,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              opacity: pressed ? 0.9 : 1,
            },
          ]}
        >
          <View
            style={[
              styles.infoButtonContent,
              {
                flexDirection:
                  writingDirection === "rtl" ? "row-reverse" : "row",
              },
            ]}
          >
            <View
              style={[
                styles.infoIcon,
                { backgroundColor: withAlpha(colors.accent, 0.12) },
              ]}
            >
              <MaterialIcons
                name="info-outline"
                size={22}
                color={colors.accent}
              />
            </View>
            <Text
              style={[
                styles.infoTitle,
                {
                  color: colors.text,
                  textAlign,
                  writingDirection,
                },
              ]}
            >
              {pageT("Jawami al-Kalim")}
            </Text>
            <MaterialIcons
              name={
                writingDirection === "rtl" ? "chevron-left" : "chevron-right"
              }
              size={22}
              color={colors.secondary}
            />
          </View>
        </Pressable>

        <View style={styles.searchWrap}>
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder={pageT("Search hadiths")}
            placeholderTextColor={inactiveColor}
            returnKeyType="search"
            style={[
              styles.search,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
                color: colors.text,
                textAlign,
                writingDirection,
              },
            ]}
          />
          <MaterialIcons
            name="search"
            size={21}
            color={inactiveColor}
            style={[
              styles.searchIcon,
              writingDirection === "rtl" ? styles.searchIconRtl : null,
            ]}
          />
        </View>
      </View>
    ),
    [colors, inactiveColor, pageT, searchQuery, textAlign, writingDirection],
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar
        barStyle={theme.dark ? "light-content" : "dark-content"}
        backgroundColor="transparent"
        translucent
      />

      <FloatingPillHeader
        title={pageT("Jawami al-Kalim")}
        onPins={handlePins}
        onTranslate={handleTranslate}
        onBack={handleBack}
        colors={colors}
        labels={labels}
        scrollY={scrollY}
      />

      <View style={styles.listFlex}>
        <AnimatedLegendList
          ref={listRef}
          data={filteredHadiths}
          extraData={listExtraData}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          ListHeaderComponent={listHeader}
          ListEmptyComponent={
            <View style={styles.empty}>
              <MaterialIcons
                name="search-off"
                size={42}
                color={inactiveColor}
              />
              <Text style={[styles.emptyText, { color: colors.text }]}>
                {pageT("No results found")}
              </Text>
            </View>
          }
          contentContainerStyle={[
            styles.listContent,
            {
              paddingTop: listTopPadding,
              paddingBottom: insets.bottom + 72,
            },
          ]}
          estimatedItemSize={300}
          drawDistance={500}
          recycleItems
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          onScroll={onScroll}
          scrollEventThrottle={16}
          onViewableItemsChanged={handleViewableItemsChanged}
          viewabilityConfig={viewabilityConfig}
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
            accessibilityLabel={pageT("Scroll to top")}
          >
            <Icon source="arrow-up" size={22} color="#fff" />
          </Pressable>
        </Animated.View>
      )}

      {showLastReadBtn && lastReadIndex != null && !searchQuery.trim() && (
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
              lastReadId != null
                ? `${pageT("Continue reading") || "Continue reading"} — ${pageT("Hadith")} #${lastReadId}`
                : pageT("Continue reading") || "Continue reading"
            }
          >
            <Icon source="bookmark-outline" size={18} color={colors.accent} />
            <Text
              style={[styles.lastReadText, { color: colors.text }]}
              numberOfLines={1}
            >
              {lastReadId != null
                ? `${pageT("Continue reading") || "Continue reading"} · ${pageT("Hadith")} #${lastReadId}`
                : pageT("Continue reading") || "Continue reading"}
            </Text>
            <Icon source="chevron-down" size={18} color={colors.secondary} />
          </Pressable>
        </Animated.View>
      )}

      <FloatingLanguagePickerModal
        visible={pickerVisible}
        title={pageT("Select Hadith translation language")}
        options={translationOptions}
        selectedValue={contentLanguage}
        onSelect={(value) => {
          setTranslationLanguage(value);
          setPickerVisible(false);
        }}
        onClose={() => setPickerVisible(false)}
        theme={theme}
      />

      <GeneralModal
        visible={infoVisible}
        title={pageT("Jawami al-Kalim")}
        writingDirection={writingDirection}
        textAlign={textAlign}
        onClose={() => setInfoVisible(false)}
      >
        <ScrollView
          bounces={false}
          contentContainerStyle={styles.infoModalContent}
          showsVerticalScrollIndicator={false}
        >
          <Text
            style={[
              styles.infoModalText,
              {
                color: colors.secondary,
                textAlign,
                writingDirection,
              },
            ]}
          >
            {pageT("Jawami al-Kalim introduction")}
          </Text>
          <View
            style={[
              styles.infoModalObjective,
              {
                flexDirection:
                  writingDirection === "rtl" ? "row-reverse" : "row",
                borderColor: colors.border,
              },
            ]}
          >
            <MaterialIcons
              name="lightbulb-outline"
              size={20}
              color={colors.accent}
            />
            <Text
              style={[
                styles.infoModalObjectiveText,
                {
                  color: colors.accent,
                  textAlign,
                  writingDirection,
                },
              ]}
            >
              {pageT("Jawami al-Kalim objective")}
            </Text>
          </View>
        </ScrollView>
      </GeneralModal>

      <GeneralModal
        visible={Boolean(actionHadith)}
        title={pageT("Hadith #{{number}} Actions", {
          number: actionHadith?.id || "",
        })}
        description={
          actionHadith
            ? getLocalizedText(actionHadith, contentLanguage)
            : undefined
        }
        writingDirection={writingDirection}
        options={actionOptions}
        onClose={() => setActionHadith(null)}
      />

      <GeneralModal
        visible={pinsVisible}
        title={pageT("Pinned locations")}
        description={pins.length === 0 ? pageT("No pins yet") : undefined}
        writingDirection={writingDirection}
        options={pinOptions}
        onClose={() => setPinsVisible(false)}
      />
    </View>
  );
};

export default JawamiAlKalim;

// ====================== STYLES ======================
const styles = StyleSheet.create({
  container: { flex: 1 },
  listFlex: { flex: 1 },
  listContent: {
    paddingHorizontal: 12,
  },
  listHeader: {
    marginBottom: 4,
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
    minWidth: 120,
    maxWidth: 240,
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

  infoButton: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
  },
  infoButtonContent: {
    alignItems: "center",
    gap: 10,
  },
  infoIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  infoTitle: {
    flex: 1,
    fontWeight: "700",
    fontSize: 16,
    minWidth: 0,
  },
  infoModalContent: { paddingTop: 12, paddingBottom: 4 },
  infoModalText: { fontSize: 16, lineHeight: 27 },
  infoModalObjective: {
    alignItems: "flex-start",
    gap: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: 18,
    paddingTop: 16,
  },
  infoModalObjectiveText: {
    flex: 1,
    fontSize: 15,
    lineHeight: 24,
    fontWeight: "700",
  },

  searchWrap: { position: "relative", marginBottom: 10 },
  search: {
    height: 48,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 44,
    fontSize: 15,
  },
  searchIcon: { position: "absolute", left: 14, top: 14 },
  searchIconRtl: { left: undefined, right: 14 },

  card: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
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
  pinBadge: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 16,
    marginBottom: 8,
  },
  pinBadgeText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.15,
  },
  cardTitle: {
    fontSize: 17,
    lineHeight: 26,
    fontWeight: "700",
    marginBottom: 12,
  },
  arabic: {
    fontSize: 22,
    lineHeight: 38,
    marginBottom: 12,
    fontWeight: "500",
  },
  translation: {
    fontSize: 15.5,
    lineHeight: 26,
    fontWeight: "500",
    marginBottom: 12,
  },
  labelText: { fontWeight: "700" },
  contentText: {},
  source: { fontSize: 14, lineHeight: 22, fontWeight: "500" },
  sourceLabel: { fontWeight: "700" },

  empty: { alignItems: "center", paddingVertical: 64 },
  emptyText: { marginTop: 12, fontSize: 16, fontWeight: "600" },

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
});
