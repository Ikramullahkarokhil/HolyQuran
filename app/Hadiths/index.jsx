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
import * as Clipboard from "expo-clipboard";
import {
  useTheme,
  Text,
  IconButton,
  Icon,
} from "react-native-paper";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useTranslation } from "react-i18next";
import {
  useFocusEffect,
  useLocalSearchParams,
  useNavigation,
} from "expo-router";
import {
  LongPressGestureHandler,
  State,
  GestureHandlerRootView,
} from "react-native-gesture-handler";
import { useHadithTranslationStore } from "../../components/store/store";
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

// Cache JSON loads so language switches don’t re-parse from disk every time
let _arabicCache = null;
let _englishCache = null;

const getHadithsData = (language) => {
  if (language === "arabic") {
    if (!_arabicCache) {
      _arabicCache = require("../../assets/Hadiths/sahih_bukhari_arabic.json");
    }
    return _arabicCache;
  }
  if (!_englishCache) {
    _englishCache = require("../../assets/Hadiths/sahih_bukhari_english.json");
  }
  return _englishCache;
};

const getHadithId = (item) =>
  String(item?.reference?.hadith || item?.hadithnumber || "");

// ─── Memoized row ───────────────────────────────────────────────────────────

const HadithItem = memo(
  ({
    item,
    index,
    isHighlighted,
    isPinned,
    isArabic,
    highlightProgress,
    progressColor,
    onSurface,
    backgroundColor,
    buttonText,
    pinnedLabel,
    onLongPress,
  }) => {
    const pinId = getHadithId(item);

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
            onLongPress({ ...item, index });
          }
        }}
      >
        <View
          style={[
            styles.hadithOuter,
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
              styles.hadithContainer,
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
                  styles.hadithRipple,
                  { borderColor: progressColor },
                  rippleStyle,
                ]}
              />
            ) : null}

            <View style={styles.hadithBadgeRow}>
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
                  styles.hadithNumberBadge,
                  {
                    backgroundColor: withAlpha(progressColor, 0.12),
                    borderColor: progressColor,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.hadithNumberText,
                    { color: progressColor },
                  ]}
                >
                  {pinId}
                </Text>
              </View>
            </View>

            <Text
              style={[
                styles.hadithText,
                {
                  color: onSurface,
                  textAlign: isArabic ? "right" : "left",
                  writingDirection: isArabic ? "rtl" : "ltr",
                },
              ]}
              selectable
            >
              {item.text}
            </Text>
          </Pressable>
        </View>
      </LongPressGestureHandler>
    );
  },
  (prev, next) =>
    getHadithId(prev.item) === getHadithId(next.item) &&
    prev.item.text === next.item.text &&
    prev.isHighlighted === next.isHighlighted &&
    prev.isPinned === next.isPinned &&
    prev.isArabic === next.isArabic &&
    prev.progressColor === next.progressColor &&
    prev.onSurface === next.onSurface &&
    prev.backgroundColor === next.backgroundColor &&
    prev.buttonText === next.buttonText &&
    prev.pinnedLabel === next.pinnedLabel &&
    prev.onLongPress === next.onLongPress &&
    prev.index === next.index,
);
HadithItem.displayName = "HadithItem";

// ─── Main screen ────────────────────────────────────────────────────────────

const HadithsScreen = () => {
  const theme = useTheme();
  const navigation = useNavigation();
  const { t } = useTranslation();
  const { showAlert } = useAppAlert();
  const { bookNumber, bookName, hadithNumber } = useLocalSearchParams();
  const {
    translationLanguage: hadithLanguage,
    setTranslationLanguage,
  } = useHadithTranslationStore();

  const listRef = useRef(null);
  const lastSavedScrollOffset = useRef(null);

  const [showScrollTop, setShowScrollTop] = useState(false);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [actionHadith, setActionHadith] = useState(null);
  const [actionIsBookmarked, setActionIsBookmarked] = useState(false);
  const [pins, setPins] = useState([]);
  const [pinsVisible, setPinsVisible] = useState(false);
  const [highlightedHadithId, setHighlightedHadithId] = useState(null);

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

  const isArabic = hadithLanguage === "arabic";
  const pinnedLabel = t("Pinned");

  const pinsStorageKey = useMemo(
    () => `hadith_details_pins_${bookNumber}`,
    [bookNumber],
  );

  const getScrollStorageKey = useCallback(() => {
    if (!bookNumber) return null;
    return `hadith_details_scroll_${bookNumber}`;
  }, [bookNumber]);

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(pinsStorageKey)
      .then((value) => {
        const storedPins = JSON.parse(value || "[]");
        if (active) setPins(Array.isArray(storedPins) ? storedPins : []);
      })
      .catch(() => {
        if (active) setPins([]);
      });
    return () => {
      active = false;
    };
  }, [pinsStorageKey]);

  const hadiths = useMemo(() => {
    const data = getHadithsData(hadithLanguage);
    const book = String(bookNumber);
    return data.filter((h) => String(h.reference?.book) === book);
  }, [bookNumber, hadithLanguage]);

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

  const saveScrollOffset = useCallback(
    async (offsetY) => {
      const key = getScrollStorageKey();
      if (!key) return;
      const safeOffset = Math.max(0, Math.round(offsetY || 0));
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
    [getScrollStorageKey],
  );

  const restoreScrollOffset = useCallback(async () => {
    if (targetHadithNumber !== null) return;
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
  }, [getScrollStorageKey, targetHadithNumber]);

  const clearHighlight = useCallback(() => {
    setHighlightedHadithId(null);
  }, []);

  useEffect(() => {
    if (currentHadithIndex < 0) return;

    const timer = setTimeout(() => {
      listRef.current?.scrollToIndex({
        index: currentHadithIndex,
        animated: false,
        viewPosition: 0.5,
      });
      setHighlightedHadithId(targetHadithNumber);
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
    currentHadithIndex,
    highlightProgress,
    targetHadithNumber,
  ]);

  const handleBookmark = useCallback(
    async (item) => {
      try {
        const existing = await AsyncStorage.getItem("hadithBookmarks");
        const hadithBookmarks = existing ? JSON.parse(existing) : [];
        const already = hadithBookmarks.some(
          (b) =>
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
          bookName,
          language: hadithLanguage,
          createdAt: Date.now(),
        });
        await AsyncStorage.setItem(
          "hadithBookmarks",
          JSON.stringify(hadithBookmarks),
        );
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
    [bookName, hadithLanguage, showAlert, t],
  );

  const hadithLanguageOptions = useMemo(
    () => [
      { label: "English", value: "english" },
      { label: "العربية", value: "arabic" },
    ],
    [],
  );

  const handleHadithTranslationPicker = useCallback(() => {
    setPickerVisible(true);
  }, []);

  const handleLongPress = useCallback(async (item) => {
    try {
      const existing =
        JSON.parse(await AsyncStorage.getItem("hadithBookmarks")) || [];
      const isBookmarked = existing.some(
        (b) =>
          String(b.reference?.hadith) ===
          String(item.reference?.hadith || item.hadithnumber),
      );
      setActionHadith(item);
      setActionIsBookmarked(isBookmarked);
    } catch {
      setActionHadith(item);
      setActionIsBookmarked(false);
    }
  }, []);

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
    listRef.current?.scrollToIndex({ index: pin.index, animated: true });
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
          onPress: () =>
            savePins(pins.filter((item) => item.id !== pin.id)),
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
            await Share.share({ message: actionHadith.text });
          } catch {
            showAlert(t("Error"), t("Could not share"));
          }
        },
      },
      {
        label: isPinned ? t("Remove pin") : t("Pin this location"),
        value: "pin",
        icon: isPinned ? "pin-off-outline" : "pin-outline",
        onPress: () => toggleHadithPin(actionHadith, actionIndex),
      },
    ];
  }, [
    actionHadith,
    actionIsBookmarked,
    handleBookmark,
    hadiths,
    pinnedHadithIds,
    showAlert,
    t,
    toggleHadithPin,
  ]);

  const renderHeaderLeft = useCallback(() => {
    const canGoPrev = currentHadithIndex > 0;
    return (
      <IconButton
        icon="chevron-left"
        iconColor={onSurface}
        size={26}
        disabled={!canGoPrev}
        onPress={() => {
          if (!canGoPrev) return;
          const targetHadith = hadiths[currentHadithIndex - 1];
          navigation.setParams({
            hadithNumber: getHadithId(targetHadith),
          });
        }}
        style={styles.headerIcon}
      />
    );
  }, [currentHadithIndex, hadiths, navigation, onSurface]);

  const renderHeaderRight = useCallback(() => {
    const canGoNext =
      currentHadithIndex >= 0 && currentHadithIndex < hadiths.length - 1;
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
          onPress={handleHadithTranslationPicker}
          style={styles.headerIcon}
        />
        <IconButton
          icon="chevron-right"
          iconColor={onSurface}
          size={26}
          disabled={!canGoNext}
          onPress={() => {
            if (!canGoNext) return;
            const targetHadith = hadiths[currentHadithIndex + 1];
            navigation.setParams({
              hadithNumber: getHadithId(targetHadith),
            });
          }}
          style={styles.headerIcon}
        />
      </View>
    );
  }, [
    currentHadithIndex,
    hadiths,
    handleHadithTranslationPicker,
    navigation,
    onSurface,
    t,
  ]);

  useFocusEffect(
    useCallback(() => {
      const titleNumber =
        targetHadithNumber ||
        (currentHadithIndex >= 0
          ? getHadithId(hadiths[currentHadithIndex])
          : "1");

      navigation.setOptions({
        headerShown: true,
        title: `${t("Hadith")} #${titleNumber}`,
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
      currentHadithIndex,
      hadiths,
      navigation,
      onSurface,
      outlineVariant,
      renderHeaderLeft,
      renderHeaderRight,
      restoreScrollOffset,
      surfaceColor,
      t,
      targetHadithNumber,
    ]),
  );

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
          progressColor={progressColor}
          onSurface={onSurface}
          backgroundColor={backgroundColor}
          buttonText={buttonText}
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
      progressColor,
      onSurface,
      backgroundColor,
      buttonText,
      pinnedLabel,
      handleLongPress,
    ],
  );

  const keyExtractor = useCallback(
    (item, idx) => `${getHadithId(item)}-${idx}`,
    [],
  );

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

  const ListEmptyComponent = useCallback(
    () => (
      <View
        style={[styles.centered, { backgroundColor: backgroundColor }]}
      >
        <Text style={[styles.errorText, { color: onSurfaceVariant }]}>
          {t("No hadiths found for this book")}
        </Text>
      </View>
    ),
    [backgroundColor, onSurfaceVariant, t],
  );

  return (
    <GestureHandlerRootView style={styles.root}>
      <View
        style={[styles.container, { backgroundColor: backgroundColor }]}
      >
        <StatusBar
          barStyle={theme.dark ? "light-content" : "dark-content"}
          backgroundColor={surfaceColor}
        />

        <LegendList
          ref={listRef}
          extraData={`${hadithLanguage}|${highlightedHadithId}|${pins.length}`}
          data={hadiths}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          recycleItems
          estimatedItemSize={110}
          drawDistance={400}
          ItemSeparatorComponent={ItemSeparator}
          showsVerticalScrollIndicator={false}
          onScroll={handleScroll}
          scrollEventThrottle={32}
          contentContainerStyle={styles.listContent}
          removeClippedSubviews={Platform.OS === "android"}
          ListEmptyComponent={ListEmptyComponent}
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
            actionIsBookmarked
              ? t("Already Bookmarked")
              : t("Choose an action")
          }
          description={actionHadith?.text}
          options={hadithActionOptions}
          onClose={() => setActionHadith(null)}
        />
        <GeneralModal
          visible={pinsVisible}
          title={t("Pinned locations")}
          description={pins.length === 0 ? t("No pins yet") : undefined}
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
    paddingVertical: 48,
  },
  listContent: {
    paddingTop: 8,
    paddingBottom: 40,
  },
  hadithOuter: {
    borderRadius: 12,
    overflow: "hidden",
  },
  hadithContainer: {
    position: "relative",
    paddingVertical: 18,
    paddingHorizontal: 20,
    borderRadius: 12,
  },
  hadithRipple: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 2,
    borderRadius: 12,
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
  },
  hadithNumberBadge: {
    minWidth: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },
  hadithNumberText: {
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  inlinePinBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 12,
  },
  pinBadgeText: {
    color: "#ffffff",
    fontSize: 11,
    fontWeight: "700",
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
    opacity: 0.75,
  },
});