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
import { useHadithTranslationStore } from "../../components/store/store";
import { useAppAlert } from "../../components/AppAlertProvider";
import BookmarkCard from "../../components/BookmarkCard";

const getHadithBookmarkKey = (item, index = 0) => {
  const collection = item?.collection || "hadith";
  const book = item?.reference?.book || item?.bookName || "book";
  const hadith =
    item?.reference?.hadith || item?.hadithnumber || item?.id || "unknown";
  const createdAt = item?.createdAt || index;

  return [collection, book, hadith, createdAt, index]
    .map((value) => String(value).replace(/[^a-zA-Z0-9_-]/g, "_"))
    .join(":");
};

const HadithBookmark = () => {
  const [bookmarks, setBookmarks] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const theme = useTheme();
  const { t } = useTranslation();
  const { showAlert } = useAppAlert();
  const { translationLanguage: hadithLanguage } = useHadithTranslationStore();
  const router = useRouter();

  const loadBookmarks = useCallback(async () => {
    try {
      const storedBookmarks =
        JSON.parse(await AsyncStorage.getItem("hadithBookmarks")) || [];
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

  const deleteBookmark = useCallback(async (item) => {
    try {
      const itemIndex = bookmarks.indexOf(item);
      const itemKey = getHadithBookmarkKey(item, itemIndex);
      const updatedBookmarks = bookmarks.filter(
        (bookmark, index) => getHadithBookmarkKey(bookmark, index) !== itemKey,
      );
      await AsyncStorage.setItem(
        "hadithBookmarks",
        JSON.stringify(updatedBookmarks),
      );
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
          onPress: () => deleteBookmark(item),
        },
      ]);
    },
    [deleteBookmark, showAlert, t],
  );

  const handleNavigate = useCallback((item) => {
    if (item.collection === "jawami_al_kalim") {
      router.push("/JawamiAlKalim");
      return;
    }

    const bookNumber = item.reference?.book;
    const hadithNumber = item.reference?.hadith || item.hadithnumber;
    if (bookNumber === undefined || hadithNumber === undefined) return;

    router.push({
      pathname: "/Hadiths",
      params: {
        collection: item.collection || "bukhari",
        bookNumber: String(bookNumber),
        bookName: item.bookName || "",
        hadithNumber: String(hadithNumber),
      },
    });
  }, [router]);

  const renderItem = useCallback(
    ({ item }) => (
      <BookmarkCard
        item={item}
        kind="hadith"
        language={item.language || hadithLanguage}
        theme={theme}
        onNavigate={handleNavigate}
        onDelete={handleDelete}
        t={t}
      />
    ),
    [hadithLanguage, handleDelete, handleNavigate, t, theme],
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
            {t("add_hadith_bookmarks_hint")}
          </Text>
        </View>
      ) : (
        <LegendList
          data={bookmarks}
          renderItem={renderItem}
          keyExtractor={(item, idx) => getHadithBookmarkKey(item, idx)}
          contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
          ItemSeparatorComponent={ItemSeparator}
          recycleItems={true}
          estimatedItemSize={120}
          drawDistance={280}
          refreshing={refreshing}
          onRefresh={onRefresh}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
};

export default HadithBookmark;

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
