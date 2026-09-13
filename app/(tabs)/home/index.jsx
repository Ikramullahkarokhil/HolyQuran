import React, { useState, useEffect, useMemo, useCallback, memo } from "react";
import {
  StyleSheet,
  Text,
  View,
  Pressable,
  ActivityIndicator,
  Platform,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from "react-native-reanimated";
import { LegendList } from "@legendapp/list/react-native";
import { IconButton } from "react-native-paper";
import { loadSurahNames } from "../../../components/utils";
import ArabicQuran from "../../../assets/QuranData/ArabicQuran.json";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import useThemeStore from "../../../components/store/useThemeStore";
import { useAppLanguageStore } from "../../../components/store/store";
import { darkTheme, lightTheme } from "../../../components/Theme";

// ─── Precomputed verse counts (module scope – runs once) ────────────────────

const VERSES_PER_SURAH = (() => {
  try {
    const quranData = ArabicQuran?.quran?.["quran-uthmani-hafs"];
    if (!quranData) return {};
    const counts = {};
    for (const verseId in quranData) {
      const surah = quranData[verseId]?.surah;
      if (surah) counts[surah] = (counts[surah] || 0) + 1;
    }
    return counts;
  } catch {
    return {};
  }
})();

// ─── Localized labels helper ────────────────────────────────────────────────

const getLocalizedHomeTexts = (language) => {
  switch (language) {
    case "pa":
      return { surahLabel: "سورة", verseLabel: "آیتونه" };
    case "da":
      return { surahLabel: "سورة", verseLabel: "آیات" };
    case "en":
    default:
      return { surahLabel: "سورة", verseLabel: "verses" };
  }
};

// ─── Memoized list item ─────────────────────────────────────────────────────

const SurahItem = memo(
  ({
    surahNumber,
    surahName,
    verseCount,
    surahLabel,
    verseLabel,
    primaryColor,
    textColor,
    backgroundColor,
    progressColor,
    onPress,
  }) => {
    return (
      <View
        style={[
          styles.itemShadowContainer,
          {
            backgroundColor: primaryColor,
            borderRadius: 16,
            overflow: "hidden",
          },
        ]}
      >
        <Pressable
          android_ripple={{
            color: "rgba(37,135,216,0.18)",
            borderless: false,
            foreground: true,
          }}
          style={({ pressed }) => [
            styles.card,
            { opacity: pressed ? 0.92 : 1 },
          ]}
          onPress={onPress}
        >
          <View style={styles.itemContent}>
            <Text style={[styles.verses, { color: textColor }]}>
              {verseCount} {verseLabel}
            </Text>

            <View style={styles.surahContainer}>
              <Text style={[styles.surahName, { color: textColor }]}>
                {surahLabel} {surahName}
              </Text>

              <View
                style={[
                  styles.numberBadge,
                  { backgroundColor },
                ]}
              >
                <Text
                  style={[
                    styles.surahNumber,
                    { color: progressColor || textColor },
                  ]}
                >
                  {surahNumber}
                </Text>
              </View>
            </View>
          </View>
        </Pressable>
      </View>
    );
  },
  // Custom equality: only re-render when visible props change
  (prev, next) =>
    prev.surahNumber === next.surahNumber &&
    prev.surahName === next.surahName &&
    prev.verseCount === next.verseCount &&
    prev.surahLabel === next.surahLabel &&
    prev.verseLabel === next.verseLabel &&
    prev.primaryColor === next.primaryColor &&
    prev.textColor === next.textColor &&
    prev.backgroundColor === next.backgroundColor &&
    prev.progressColor === next.progressColor &&
    prev.onPress === next.onPress,
);
SurahItem.displayName = "SurahItem";

// ─── Main component ─────────────────────────────────────────────────────────

const Home = () => {
  const [surahNames, setSurahNames] = useState([]);
  const [loading, setLoading] = useState(true);

  const isDarkTheme = useThemeStore((state) => state.isDarkTheme);
  const theme = isDarkTheme ? darkTheme : lightTheme;
  const appLanguage = useAppLanguageStore((state) => state.language);
  const { t } = useTranslation();
  const router = useRouter();

  // Reanimated fade-in
  const opacity = useSharedValue(0);
  const animatedListStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    flex: 1,
  }));

  // Stable theme tokens (primitives) so items don’t re-render on object identity
  const primaryColor = theme.colors.primary;
  const textColor = theme.colors.textColor;
  const backgroundColor = theme.colors.background;
  const progressColor = theme.colors.progressColor;

  const { surahLabel, verseLabel } = useMemo(
    () => getLocalizedHomeTexts(appLanguage),
    [appLanguage],
  );

  // Load names once
  useEffect(() => {
    let cancelled = false;

    const fetchSurahNames = async () => {
      try {
        setLoading(true);
        const names = await loadSurahNames();
        if (!cancelled && Array.isArray(names)) {
          setSurahNames(names);
        }
      } catch (error) {
        console.error("Error loading surah names:", error);
      } finally {
        if (!cancelled) {
          setLoading(false);
          opacity.value = withTiming(1, {
            duration: 320,
            easing: Easing.out(Easing.cubic),
          });
        }
      }
    };

    fetchSurahNames();
    return () => {
      cancelled = true;
    };
  }, [opacity]);

  // Flatten list data once names are ready – renderItem becomes O(1) lookups
  const listData = useMemo(() => {
    if (!surahNames.length) return [];

    return Array.from({ length: 114 }, (_, index) => {
      const surah = index + 1;
      return {
        surah,
        name: surahNames[index] || "",
        verseCount: VERSES_PER_SURAH[surah] || 0,
      };
    });
  }, [surahNames]);

  const handleBookmarks = useCallback(() => {
    router.push("/Bookmarks");
  }, [router]);

  // Stable press handler factory – avoids recreating closures per row on every render
  const createSurahPressHandler = useCallback(
    (surah, name) => () => {
      router.navigate({
        pathname: "/SurahDetails",
        params: {
          surahId: surah,
          surahName: name,
        },
      });
    },
    [router],
  );

  // Cache press handlers by surah number so memo comparison stays stable
  const pressHandlers = useMemo(() => {
    const map = new Map();
    for (const row of listData) {
      map.set(row.surah, createSurahPressHandler(row.surah, row.name));
    }
    return map;
  }, [listData, createSurahPressHandler]);

  const renderItem = useCallback(
    ({ item }) => {
      if (!item.name) return null;

      return (
        <SurahItem
          surahNumber={item.surah}
          surahName={item.name}
          verseCount={item.verseCount}
          surahLabel={surahLabel}
          verseLabel={verseLabel}
          primaryColor={primaryColor}
          textColor={textColor}
          backgroundColor={backgroundColor}
          progressColor={progressColor}
          onPress={pressHandlers.get(item.surah)}
        />
      );
    },
    [
      surahLabel,
      verseLabel,
      primaryColor,
      textColor,
      backgroundColor,
      progressColor,
      pressHandlers,
    ],
  );

  const keyExtractor = useCallback((item) => String(item.surah), []);

  if (loading) {
    return (
      <View
        style={[
          styles.loadingContainer,
          { backgroundColor: theme.colors.background },
        ]}
      >
        <ActivityIndicator
          size="large"
          color={theme.colors.progressColor || "#888"}
        />
        <Text style={[styles.loadingText, { color: theme.colors.textColor }]}>
          {t("جاري التحميل...")}
        </Text>
      </View>
    );
  }

  return (
    <View
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      <Animated.View style={animatedListStyle}>
        <LegendList
          data={listData}
          extraData={{
            theme: isDarkTheme ? "dark" : "light",
            primaryColor,
            backgroundColor,
            textColor,
            progressColor,
          }}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          recycleItems
          estimatedItemSize={80}
          drawDistance={350}
          contentContainerStyle={styles.listContainer}
          showsVerticalScrollIndicator={false}
          // Avoid remounting the whole list on theme/language change;
          // items already receive updated color/label primitives.
        />
      </Animated.View>

      <Pressable
        style={({ pressed }) => [
          styles.floatingButton,
          { backgroundColor: theme.colors.primary },
          pressed && { opacity: 0.8, transform: [{ scale: 0.96 }] },
        ]}
        onPress={handleBookmarks}
      >
        <IconButton
          icon="bookmark"
          iconColor={theme.colors.progressColor || theme.colors.textColor}
          size={26}
          style={styles.floatingButtonIcon}
        />
      </Pressable>
    </View>
  );
};

export default Home;

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    fontSize: 16,
    marginTop: 16,
    fontWeight: "500",
    fontFamily: "Amiri-Regular",
  },
  listContainer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 90,
  },
  itemShadowContainer: {
    marginBottom: 12,
    borderRadius: 16,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  card: {
    borderRadius: 16,
    overflow: "hidden",
  },
  itemContent: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 16,
    paddingHorizontal: 16,
    minHeight: 76,
  },
  surahContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
  },
  surahName: {
    fontSize: 20,
    fontWeight: "600",
    textAlign: "right",
    marginRight: 14,
    fontFamily: "Amiri-Regular",
  },
  numberBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.04,
        shadowRadius: 3,
      },
      android: {
        elevation: 1,
      },
    }),
  },
  surahNumber: {
    fontSize: 15,
    fontWeight: "700",
  },
  verses: {
    fontSize: 14,
    fontWeight: "500",
    opacity: 0.7,
  },
  floatingButton: {
    position: "absolute",
    bottom: 24,
    right: 24,
    width: 50,
    height: 50,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 10,
      },
      android: {
        elevation: 6,
      },
    }),
  },
  floatingButtonIcon: {
    margin: 0,
  },
});