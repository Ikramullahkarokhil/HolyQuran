import React, { useMemo, useCallback, useRef, useState } from "react";
import { View, Text, StyleSheet, Alert, Share, Pressable } from "react-native";
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
import {
  ActionSheetProvider,
  connectActionSheet,
  useActionSheet,
} from "@expo/react-native-action-sheet";
import * as Clipboard from "expo-clipboard";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQuranTranslationStore } from "../../components/store/store";
import {
  useLocalSearchParams,
  useFocusEffect,
  useNavigation,
} from "expo-router";
import { IconButton, useTheme } from "react-native-paper";
import { useTranslation } from "react-i18next";

const SurahDetails = () => {
  const { surahName } = useLocalSearchParams();
  const navigation = useNavigation();
  const theme = useTheme();
  const { t } = useTranslation();
  const { translationLanguage } = useQuranTranslationStore();
  const { showActionSheetWithOptions } = useActionSheet();
  const listRef = useRef(null);
  const lastSavedScrollOffset = useRef(null);
  const [showScrollTop, setShowScrollTop] = useState(false);

  const surahNames = useMemo(() => SurahNames, []);

  const resolvedSurahName = useMemo(() => {
    if (!surahName || typeof surahName !== "string") return null;
    return decodeURIComponent(surahName);
  }, [surahName]);

  const getScrollStorageKey = useCallback(() => {
    if (!resolvedSurahName) return null;
    return `surah_details_scroll_${resolvedSurahName}`;
  }, [resolvedSurahName]);

  const saveScrollOffset = useCallback(
    async (offsetY) => {
      if (!resolvedSurahName) return;

      const safeOffset = Math.max(0, Math.round(offsetY || 0));
      const key = getScrollStorageKey();
      if (!key) return;

      if (
        lastSavedScrollOffset.current !== null &&
        Math.abs(lastSavedScrollOffset.current - safeOffset) < 25
      ) {
        return;
      }

      lastSavedScrollOffset.current = safeOffset;
      await AsyncStorage.setItem(key, String(safeOffset));
    },
    [getScrollStorageKey, resolvedSurahName],
  );

  const restoreScrollOffset = useCallback(async () => {
    if (!resolvedSurahName) return;

    const key = getScrollStorageKey();
    if (!key) return;

    const rawOffset = await AsyncStorage.getItem(key);
    const savedOffset = Number(rawOffset || 0);

    if (!Number.isFinite(savedOffset) || savedOffset <= 20) {
      return;
    }

    setTimeout(() => {
      try {
        listRef.current?.scrollToOffset({
          offset: savedOffset,
          animated: false,
        });
      } catch (e) {
        console.log("SurahDetails scroll restore failed:", e);
      }
    }, 120);
  }, [getScrollStorageKey, resolvedSurahName]);

  const currentSurahIndex = useMemo(() => {
    return surahNames.findIndex((name) => name === resolvedSurahName);
  }, [resolvedSurahName, surahNames]);

  const getTranslationData = useCallback((language) => {
    switch (language) {
      case "pashto":
        return PashtoQuran;
      case "dari":
        return DariQuran;
      case "english":
        return EnglishQuran;
      default:
        return PashtoQuran;
    }
  }, []);

  const translationData = useMemo(
    () => getTranslationData(translationLanguage),
    [translationLanguage, getTranslationData],
  );

  // ---- VERSES (Arabic) ----
  const verses = useMemo(() => {
    if (!resolvedSurahName) return [];

    const surahId = surahNames.indexOf(resolvedSurahName) + 1;
    if (surahId <= 0) return [];

    const allAyahs = Object.values(
      ArabicQuran?.quran?.["quran-uthmani-hafs"] || {},
    );

    return allAyahs.filter((item) => item.surah === surahId);
  }, [resolvedSurahName, surahNames]);

  // ---- TRANSLATION VERSES ----
  const translationVerses = useMemo(() => {
    if (!resolvedSurahName || !translationData) return [];

    const surahId = surahNames.indexOf(resolvedSurahName) + 1;
    if (surahId <= 0) return [];

    const all = Object.values(
      translationData?.quran?.["quran-uthmani-hafs"] || {},
    );

    return all.filter((item) => item.surah === surahId);
  }, [resolvedSurahName, translationData, surahNames]);

  // ---- Header navigation ----
  useFocusEffect(
    useCallback(() => {
      if (!resolvedSurahName) return;

      const setNavButton = (direction) => {
        const targetIndex = currentSurahIndex + direction;
        const targetName = surahNames[targetIndex] || resolvedSurahName;

        return (
          <IconButton
            icon={`chevron-${direction === -1 ? "left" : "right"}`}
            iconColor={theme.colors.textColor}
            size={28}
            onPress={() => navigation.setParams({ surahName: targetName })}
          />
        );
      };

      navigation.setOptions({
        title: `${t("سورة")} ${resolvedSurahName}`,
        headerShown: true,
        headerTitleStyle: { color: theme.colors.textColor },
        headerLeft: () => setNavButton(-1),
        headerRight: () => setNavButton(1),
      });

      restoreScrollOffset();
    }, [
      resolvedSurahName,
      currentSurahIndex,
      theme.colors.textColor,
      surahNames,
      navigation,
      t,
      restoreScrollOffset,
    ]),
  );

  // ---- Long press actions ----
  const handleLongPress = useCallback(
    async (verse) => {
      const options = [t("Bookmark"), t("Copy"), t("Share"), t("Cancel")];
      const cancelButtonIndex = 3;

      try {
        const existing =
          JSON.parse(await AsyncStorage.getItem("bookmarks")) || [];

        const isBookmarked = existing.some((b) => b.id === verse.id);

        if (isBookmarked) {
          Alert.alert(
            t("Already Bookmarked"),
            `${verse.verse}\n\n${verse.translationVerse}`,
          );
          return;
        }

        showActionSheetWithOptions(
          { options, cancelButtonIndex },
          async (buttonIndex) => {
            if (buttonIndex === 0) {
              const updated = [...existing, verse];
              await AsyncStorage.setItem("bookmarks", JSON.stringify(updated));
              Alert.alert(t("Bookmarked"));
            } else if (buttonIndex === 1) {
              await Clipboard.setStringAsync(
                `${verse.verse}\n\n${verse.translationVerse}`,
              );
              Alert.alert(t("Copied to Clipboard"));
            } else if (buttonIndex === 2) {
              Share.share({
                message: `${verse.verse}\n\n${verse.translationVerse}`,
              });
            }
          },
        );
      } catch (e) {
        Alert.alert(t("Error"), t("Failed to save bookmark"));
      }
    },
    [showActionSheetWithOptions, t],
  );

  // ---- Render Item (FIXED) ----
  const renderItem = useCallback(
    ({ item }) => {
      const translationItem = translationVerses.find((v) => v.id === item.id);
      const translationVerse =
        translationItem?.verse || t("Translation not available");

      return (
        <LongPressGestureHandler
          onHandlerStateChange={({ nativeEvent }) => {
            if (nativeEvent.state === State.ACTIVE) {
              handleLongPress({
                id: item.id,
                verse: item.verse,
                translationVerse,
              });
            }
          }}
        >
          <Pressable
            android_ripple={{ color: theme.colors.riple }}
            style={({ pressed }) => [
              styles.item,
              {
                backgroundColor: pressed
                  ? theme.colors.inactiveColor + "18"
                  : theme.colors.surface,
              },
            ]}
          >
            {/* Arabic + Ayah number */}
            <View style={styles.verseRow}>
              <Text
                style={[styles.verseText, { color: theme.colors.textColor }]}
              >
                {item.verse}
              </Text>

              <View style={styles.ayahBadge}>
                <Text style={styles.ayahBadgeText}>{item.ayah}</Text>
              </View>
            </View>

            {/* Translation */}
            <Text
              style={[
                styles.translationText,
                { color: theme.colors.textColor },
              ]}
            >
              {translationVerse}
            </Text>
          </Pressable>
        </LongPressGestureHandler>
      );
    },
    [translationVerses, handleLongPress, theme.colors, t],
  );

  const handleScroll = useCallback(
    (e) => {
      const offsetY = e.nativeEvent.contentOffset.y || 0;
      setShowScrollTop(offsetY > 280);
      saveScrollOffset(offsetY);
    },
    [saveScrollOffset],
  );

  // ---- Empty / Error states ----
  if (!resolvedSurahName) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{t("Invalid Surah Name")}</Text>
      </View>
    );
  }

  if (verses.length === 0) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{t("No verses found")}</Text>
      </View>
    );
  }

  return (
    <View
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      <LegendList
        ref={listRef}
        data={verses}
        renderItem={renderItem}
        keyExtractor={(item) => String(item.id)}
        recycleItems={true}
        estimatedItemSize={120}
        drawDistance={600}
        ItemSeparatorComponent={() => <View style={styles.divider} />}
        showsVerticalScrollIndicator={false}
        onScroll={handleScroll}
        contentContainerStyle={styles.listContent}
      />

      {showScrollTop && (
        <Pressable
          style={styles.scrollTopBtn}
          onPress={() =>
            listRef.current?.scrollToOffset({ offset: 0, animated: true })
          }
        >
          <Text style={styles.scrollTopBtnText}>↑</Text>
        </Pressable>
      )}
    </View>
  );
};

const ConnectedSurahDetails = connectActionSheet(SurahDetails);

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ActionSheetProvider>
        <ConnectedSurahDetails />
      </ActionSheetProvider>
    </GestureHandlerRootView>
  );
}

// ====================== STYLES ======================
const styles = StyleSheet.create({
  container: {
    flex: 1, // ← CRITICAL: no justifyContent / alignItems here
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  listContent: {
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
  item: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginHorizontal: 8,
    marginBottom: 4,
  },
  verseRow: {
    flexDirection: "row-reverse", // Arabic: text on right, number on left
    alignItems: "flex-start",
    gap: 12,
  },
  verseText: {
    flex: 1,
    fontSize: 23,
    fontWeight: "600",
    textAlign: "right",
    lineHeight: 40,
  },
  ayahBadge: {
    backgroundColor: "#2196F3",
    borderRadius: 14,
    minWidth: 30,
    height: 28,
    paddingHorizontal: 8,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 6,
  },
  ayahBadgeText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "700",
  },
  translationText: {
    fontSize: 16,
    marginTop: 10,
    textAlign: "right",
    lineHeight: 26,
    opacity: 0.9,
  },
  divider: {
    height: 1,
    backgroundColor: "#e0e0e0",
    opacity: 0.5,
    marginHorizontal: 16,
  },
  scrollTopBtn: {
    position: "absolute",
    bottom: 28,
    right: 20,
    backgroundColor: "#2196F3",
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    elevation: 6,
  },
  scrollTopBtnText: {
    color: "#fff",
    fontSize: 26,
    fontWeight: "bold",
  },
  errorText: {
    fontSize: 17,
    color: "#c62828",
  },
});
