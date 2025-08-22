import {
  StyleSheet,
  View,
  FlatList,
  Dimensions,
  Pressable,
  TextInput,
} from "react-native";
import React, { useEffect, useState, useMemo } from "react";
import { useNavigation } from "@react-navigation/native";
import { useTheme, Text, ActivityIndicator } from "react-native-paper";
import { useTranslation } from "react-i18next";
import bookNames from "../../assets/Hadiths/sahih_bukhari_books_names.json";
import { MaterialIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

const { width } = Dimensions.get("window");

const HadithsScreen = () => {
  const theme = useTheme();
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  // Use book names data directly
  const booksArray = useMemo(() => {
    return bookNames.map((book) => ({
      bookNumber: book.Book_Number,
      bookName: book.Book_Name,
      count: book.Hadith_Count,
    }));
  }, []);

  const filteredBooks = useMemo(() => {
    if (!searchQuery) return booksArray;
    const lowercaseQuery = searchQuery.toLowerCase();
    return booksArray.filter(
      (book) =>
        book.bookName.toLowerCase().includes(lowercaseQuery) ||
        book.bookNumber.toString().includes(lowercaseQuery)
    );
  }, [booksArray, searchQuery]);

  useEffect(() => {
    setLoading(false);
  }, []);

  const renderBookCard = ({ item }) => (
    <Pressable
      style={({ pressed }) => [
        styles.card,
        {
          opacity: pressed ? 0.9 : 1,
          transform: [{ scale: pressed ? 0.98 : 1 }],
          backgroundColor: theme.colors.primary,
        },
      ]}
      onPress={() => {
        router.navigate({
          pathname: "Hadiths",
          params: { bookNumber: item.bookNumber, bookName: item.bookName },
        });
      }}
      android_ripple={{ color: theme.colors.riple }}
    >
      <View style={styles.cardContent}>
        <Text
          style={[styles.bookName, { color: theme.colors.textColor }]}
          variant="titleMedium"
        >
          {item.bookNumber}: {item.bookName}
        </Text>
        <Text
          style={[styles.hadithCount, { color: theme.colors.inactiveColor }]}
          variant="bodyMedium"
        >
          {item.count} {t("hadiths")}
        </Text>
      </View>
    </Pressable>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={theme.colors.progressColor} />
      </View>
    );
  }

  return (
    <View
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      <View style={styles.searchContainer}>
        <TextInput
          placeholder={t("Search sahih bukhari books")}
          onChangeText={setSearchQuery}
          value={searchQuery}
          style={[
            styles.searchBar,
            {
              backgroundColor: theme.colors.primary,
              color: theme.colors.textColor,
            },
          ]}
          numberOfLines={1}
          placeholderTextColor={theme.colors.inactiveColor}
          cursorColor={theme.colors.progressColor}
        />
        <View
          style={[styles.searchIcon, { backgroundColor: theme.colors.primary }]}
        >
          <MaterialIcons
            name="search"
            size={24}
            color={theme.colors.inactiveColor}
          />
        </View>
      </View>
      <FlatList
        data={filteredBooks}
        renderItem={renderBookCard}
        keyExtractor={(item) => item.bookNumber.toString()}
        contentContainerStyle={styles.listContainer}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={() => (
          <View style={styles.emptyContainer}>
            <Text
              variant="bodyLarge"
              style={{ textAlign: "center", opacity: 0.7 }}
            >
              {searchQuery ? t("No results found") : t("Loading hadiths...")}
            </Text>
          </View>
        )}
        initialNumToRender={10}
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
  searchContainer: {
    position: "relative",
    margin: 10,
    marginTop: 15,
  },
  searchBar: {
    elevation: 8,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingLeft: 50,
    height: 50,
  },
  searchIcon: {
    position: "absolute",
    left: 8,
    top: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
    width: 40,
  },
  listContainer: {
    paddingBottom: 16,
  },
  card: {
    marginBottom: 12,
    borderRadius: 8,
    backgroundColor: "white",
    elevation: 8,

    margin: 10,
  },
  cardContent: {
    padding: 16,
  },
  bookTitle: {
    marginBottom: 4,
    fontWeight: "bold",
    color: "#2c3e50",
    fontSize: 18,
  },
  bookName: {
    marginBottom: 4,
    color: "#34495e",
    fontSize: 16,
    fontWeight: "bold",
  },
  hadithCount: {
    opacity: 0.7,
    color: "#34495e",
    fontSize: 14,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 32,
  },
});
