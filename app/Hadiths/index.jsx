import {
  StyleSheet,
  View,
  FlatList,
  Dimensions,
  Pressable,
  Share,
  Alert,
  ToastAndroid,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import React, { useState, useMemo } from "react";
import { useTheme, Text, ActivityIndicator } from "react-native-paper";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useActionSheet } from "@expo/react-native-action-sheet";
import { useTranslation } from "react-i18next";
import hadithsData from "../../assets/Hadiths/sahih_bukhari_english.json";
import { useLocalSearchParams } from "expo-router";

const { width } = Dimensions.get("window");

const HadithsScreen = () => {
  const theme = useTheme();
  const { t } = useTranslation();
  const { bookNumber, bookName } = useLocalSearchParams();
  const [loading, setLoading] = useState(true);
  const { showActionSheetWithOptions } = useActionSheet();

  // Filter hadiths for the selected book
  const hadiths = useMemo(() => {
    return hadithsData.filter(
      (h) => String(h.reference.book) === String(bookNumber)
    );
  }, [bookNumber]);

  // Handle bookmarking
  const handleBookmark = async (item) => {
    try {
      const existing = await AsyncStorage.getItem("hadithBookmarks");
      let hadithBookmarks = existing ? JSON.parse(existing) : [];
      // Avoid duplicates
      if (
        !hadithBookmarks.some(
          (b) => b.reference?.hadith === item.reference?.hadith
        )
      ) {
        const itemWithBookName = { ...item, bookName };
        hadithBookmarks.push(itemWithBookName);
        await AsyncStorage.setItem(
          "hadithBookmarks",
          JSON.stringify(hadithBookmarks)
        );

        ToastAndroid.show(
          t(`Hadith #${item.reference.hadith} added to bookmarks`),
          ToastAndroid.SHORT
        );
      } else {
        ToastAndroid.show(
          t(`Hadith #${item.reference.hadith} Already bookmarked`),
          ToastAndroid.SHORT
        );
      }
    } catch (e) {
      Alert.alert(t("Error"), t("Could not bookmark hadith"));
    }
  };

  // ActionSheet for copy/share/bookmark
  const handleLongPress = (item) => {
    const options = [t("Copy"), t("Share"), t("Bookmark"), t("Cancel")];
    const cancelButtonIndex = 3;
    showActionSheetWithOptions(
      {
        options,
        cancelButtonIndex,
        title: t(`Hadith #${item.reference.hadith} Actions`),
      },
      async (selectedIndex) => {
        if (selectedIndex === 0) {
          // Copy
          try {
            await Clipboard.setStringAsync(item.text);
            ToastAndroid.show(
              t(`Hadith #${item.reference.hadith} copied to clipboard`),
              ToastAndroid.SHORT
            );
          } catch (e) {
            Alert.alert(t("Error"), t("Could not copy"));
          }
        } else if (selectedIndex === 1) {
          // Share
          try {
            await Share.share({ message: item.text });
          } catch (e) {
            Alert.alert(t("Error"), t("Could not share"));
          }
        } else if (selectedIndex === 2) {
          // Bookmark
          handleBookmark(item);
        }
      }
    );
  };

  // Card renderer for FlatList (using View and Pressable)
  function renderHadithCard({ item }) {
    return (
      <Pressable
        style={({ pressed }) => [
          styles.card,
          { backgroundColor: theme.colors.primary, opacity: pressed ? 0.7 : 1 },
        ]}
        onLongPress={() => handleLongPress(item)}
      >
        <View style={styles.cardContent}>
          <Text
            style={[styles.hadithNumber, { color: theme.colors.textColor }]}
            variant="labelMedium"
          >
            {t("Hadith")} #{item.reference?.hadith || item.hadithnumber}
          </Text>
          <Text
            style={[styles.hadithText, { color: theme.colors.inactiveColor }]}
            variant="bodyMedium"
          >
            {item.text}
          </Text>
        </View>
      </Pressable>
    );
  }

  // Simulate loading for smoother UX
  React.useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 300);
    return () => clearTimeout(timer);
  }, [bookNumber]);

  if (loading) {
    return (
      <View
        style={[
          styles.loadingContainer,
          { backgroundColor: theme.colors.primary },
        ]}
      >
        <ActivityIndicator size="large" color={theme.colors.progressColor} />
      </View>
    );
  }

  // ListEmptyComponent as a regular function
  function ListEmptyComponent() {
    return (
      <View
        style={[
          styles.emptyContainer,
          { backgroundColor: theme.colors.background },
        ]}
      >
        <Text
          variant="bodyLarge"
          style={{
            textAlign: "center",
            opacity: 0.7,
            color: theme.colors.primary,
          }}
        >
          {t("No hadiths found for this book")}
        </Text>
      </View>
    );
  }

  return (
    <View
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      <FlatList
        data={hadiths}
        renderItem={renderHadithCard}
        keyExtractor={(item, idx) =>
          `${item.reference?.hadith || item.hadithnumber}-${idx}`
        }
        contentContainerStyle={styles.listContainer}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={ListEmptyComponent}
        initialNumToRender={20}
        maxToRenderPerBatch={20}
        windowSize={10}
        removeClippedSubviews={true}
      />
    </View>
  );
};

export default HadithsScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  header: {
    margin: 16,
    color: "#fff",
    fontWeight: "bold",
    fontSize: 22,
  },
  listContainer: {
    paddingVertical: 10,
  },
  card: {
    marginBottom: 12,
    borderRadius: 8,
    elevation: 10,
    marginHorizontal: 10,
    padding: 16,
  },
  cardContent: {
    flexDirection: "column",
  },
  hadithNumber: {
    marginBottom: 4,
    fontWeight: "bold",
  },
  hadithText: {
    fontSize: 16,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 32,
  },
});
