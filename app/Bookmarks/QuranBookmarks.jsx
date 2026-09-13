import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
} from "react-native";
import { LegendList } from "@legendapp/list/react-native";
import { useTheme } from "react-native-paper";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { useAppAlert } from "../../components/AppAlertProvider";
import BookmarkCard from "../../components/BookmarkCard";
import { useQuranTranslationStore } from "../../components/store/store";
import ArabicQuran from "../../assets/QuranData/ArabicQuran.json";
import SurahNames from "../../assets/QuranData/SurahNames.json";

const versesById = new Map(
  Object.values(ArabicQuran?.quran?.["quran-uthmani-hafs"] || {}).map(
    (verse) => [verse.id, verse],
  ),
);

const QuranBookmark = () => {
  const [bookmarks, setBookmarks] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const theme = useTheme();
  const { t } = useTranslation();
  const { showAlert } = useAppAlert();
  const { translationLanguage } = useQuranTranslationStore();
  const router = useRouter();

  const loadBookmarks = useCallback(async () => {
    try {
      const storedBookmarks =
        JSON.parse(await AsyncStorage.getItem("bookmarks")) || [];
      setBookmarks(
        storedBookmarks.sort(
          (first, second) => (second.createdAt || 0) - (first.createdAt || 0),
        ),
      );
    } catch (_error) {
      showAlert(t("Error"), t("Failed to load bookmarks"));
    }
  }, [showAlert, t]);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadBookmarks();
    }, 0);
    return () => clearTimeout(timer);
  }, [loadBookmarks]);

  const deleteBookmark = useCallback(async (id) => {
    try {
      const updatedBookmarks = bookmarks.filter(
        (bookmark) => bookmark.id !== id,
      );
      await AsyncStorage.setItem("bookmarks", JSON.stringify(updatedBookmarks));
      setBookmarks(updatedBookmarks);
    } catch (_error) {
      showAlert(t("Error"), t("Failed to delete bookmark"));
    }
  }, [bookmarks, showAlert, t]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadBookmarks();
    setRefreshing(false);
  };

  const handleDelete = useCallback(
    (item) => {
      showAlert(t("delete_bookmark"), t("delete_bookmark_confirm"), [
        { text: t("cancel"), style: "cancel" },
        {
          text: t("delete"),
          style: "destructive",
          onPress: () => deleteBookmark(item.id),
        },
      ]);
    },
    [deleteBookmark, showAlert, t],
  );

  const handleNavigate = useCallback((item) => {
    const sourceVerse = versesById.get(item.id);
    const surahId =
      item.surahNumber || item.surah || item.surahId || sourceVerse?.surah;
    const surahName = item.surahName || SurahNames[surahId - 1];

    if (!surahName) return;

    router.push({
      pathname: "/SurahDetails",
      params: {
        surahName,
        ayahId: String(item.id),
      },
    });
  }, [router]);

  const renderItem = useCallback(
    ({ item }) => (
      <BookmarkCard
        item={item}
        kind="quran"
        language={translationLanguage}
        theme={theme}
        onNavigate={handleNavigate}
        onDelete={handleDelete}
        t={t}
      />
    ),
    [handleDelete, handleNavigate, t, theme, translationLanguage],
  );

  return (
    <View
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      {bookmarks.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons
            name="bookmark-outline"
            size={64}
            color={theme.colors.activeColor}
            style={{ marginBottom: 16 }}
          />
          <Text style={[styles.emptyText, { color: theme.colors.textColor }]}>
            {t("no_bookmarks")}
          </Text>
          <Text
            style={[styles.emptySubText, { color: theme.colors.inactiveColor }]}
          >
            {t("add_bookmarks_hint")}
          </Text>
        </View>
      ) : (
        <LegendList
          data={bookmarks}
          renderItem={renderItem}
          keyExtractor={(item) => item.id.toString()}
          contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
          ItemSeparatorComponent={ItemSeparator}
          recycleItems={true}
          estimatedItemSize={120}
          drawDistance={260}
          refreshing={refreshing}
          onRefresh={onRefresh}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
};

export default QuranBookmark;

const ItemSeparator = () => <View style={styles.separator} />;

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  separator: {
    height: 12,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  emptyText: {
    fontSize: 22,
    fontWeight: "700",
    marginBottom: 8,
    textAlign: "center",
  },
  emptySubText: {
    fontSize: 16,
    textAlign: "center",
  },
});
