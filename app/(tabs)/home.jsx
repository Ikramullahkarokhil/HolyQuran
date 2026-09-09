import React, { useState, useEffect, useMemo, useCallback, memo } from "react";
import {
  StyleSheet,
  Text,
  View,
  Pressable,
  Animated,
  ActivityIndicator,
  Platform,
} from "react-native";
import { LegendList } from "@legendapp/list/react-native";
import { IconButton, useTheme } from "react-native-paper";
import { loadSurahNames } from "../../components/utils";
import ArabicQuran from "../../assets/QuranData/ArabicQuran.json";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";

// Helper for dynamic opacity on hex colors if needed
const getAlphaColor = (color = "#000000", opacity = 0.1) => {
  // Simple fallback for theme colors
  return color;
};

// ─── Extracted & Memoized List Item (Huge Performance Boost) ───────────────

const SurahItem = memo(
  ({ item, currentSurahName, verseCount, theme, t, onPress }) => {
    return (
      <View style={styles.itemShadowContainer}>
        <Pressable
          style={({ pressed }) => [
            styles.card,
            { backgroundColor: theme.colors.primary },
            pressed && {
              opacity: 0.7,
              backgroundColor: theme.colors.background,
            },
          ]}
          onPress={() => onPress(item, currentSurahName)}
        >
          <View style={styles.itemContent}>
            {/* Left Side: Verse Count */}
            <Text style={[styles.verses, { color: theme.colors.textColor }]}>
              {verseCount} {t("آيات")}
            </Text>

            {/* Right Side: Surah Info */}
            <View style={styles.surahContainer}>
              <Text
                style={[styles.surahName, { color: theme.colors.textColor }]}
              >
                {t("سورة")} {currentSurahName}
              </Text>

              {/* Modern Number Badge */}
              <View
                style={[
                  styles.numberBadge,
                  { backgroundColor: theme.colors.background }, // Assuming background is a subtle contrast
                ]}
              >
                <Text
                  style={[
                    styles.surahNumber,
                    {
                      color:
                        theme.colors.progressColor || theme.colors.textColor,
                    },
                  ]}
                >
                  {item.surah}
                </Text>
              </View>
            </View>
          </View>
        </Pressable>
      </View>
    );
  },
);

// ─── Main Component ────────────────────────────────────────────────────────

const Home = () => {
  const [surahNames, setSurahNames] = useState([]);
  const [loading, setLoading] = useState(true);
  const theme = useTheme();
  const { t } = useTranslation();
  const fadeAnim = useState(new Animated.Value(0))[0];
  const router = useRouter();

  useEffect(() => {
    const fetchSurahNames = async () => {
      try {
        setLoading(true);
        const names = await loadSurahNames();
        if (names && Array.isArray(names)) {
          setSurahNames(names);
        } else {
          console.error("Invalid surah names format:", names);
        }
      } catch (error) {
        console.error("Error loading surah names:", error);
      } finally {
        setLoading(false);
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 350,
          useNativeDriver: true,
        }).start();
      }
    };

    fetchSurahNames().catch((err) => {
      console.error("Unhandled error in fetchSurahNames:", err);
    });
  }, [fadeAnim]);

  // Memoize verses count calculation so it only runs once
  const versesPerSurah = useMemo(() => {
    try {
      if (!ArabicQuran?.quran?.["quran-uthmani-hafs"]) {
        return {};
      }
      const counts = {};
      const quranData = ArabicQuran.quran["quran-uthmani-hafs"];
      for (const verseId in quranData) {
        const verse = quranData[verseId];
        if (verse && verse.surah) {
          counts[verse.surah] = (counts[verse.surah] || 0) + 1;
        }
      }
      return counts;
    } catch (error) {
      console.error("Error calculating verses:", error);
      return {};
    }
  }, []);

  // Memoize static data list
  const listData = useMemo(
    () => Array.from({ length: 114 }, (_, index) => ({ surah: index + 1 })),
    [],
  );

  // Callbacks
  const handleBookmarks = useCallback(() => {
    router.push("/Bookmarks");
  }, [router]);

  const handleSurahPress = useCallback(
    (item, currentSurahName) => {
      router.navigate({
        pathname: "/SurahDetails",
        params: {
          surahId: item.surah,
          surahName: currentSurahName,
        },
      });
    },
    [router],
  );

  const renderItem = useCallback(
    ({ item }) => {
      if (!surahNames[item.surah - 1]) return null;

      const currentSurahName = surahNames[item.surah - 1];
      const verseCount = versesPerSurah[item.surah] || 0;

      return (
        <SurahItem
          item={item}
          currentSurahName={currentSurahName}
          verseCount={verseCount}
          theme={theme}
          t={t}
          onPress={handleSurahPress}
        />
      );
    },
    [surahNames, versesPerSurah, theme, t, handleSurahPress],
  );

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
      style={[styles.container, { backgroundColor: theme?.colors?.background }]}
    >
      <Animated.View style={{ opacity: fadeAnim, flex: 1 }}>
        <LegendList
          data={listData}
          renderItem={renderItem}
          keyExtractor={(item) => item.surah.toString()}
          recycleItems={true}
          estimatedItemSize={80}
          drawDistance={350}
          contentContainerStyle={styles.listContainer}
          showsVerticalScrollIndicator={false}
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
          icon="heart"
          iconColor={theme.colors.error || "#ff4757"}
          size={26}
          style={styles.floatingButtonIcon}
        />
      </Pressable>
    </View>
  );
};

export default Home;

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
    paddingBottom: 90, // Leave room for FAB
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
    overflow: "hidden", // Ensures ripple/press feedback stays inside border radius
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
