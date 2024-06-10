import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Alert,
  TouchableOpacity,
} from "react-native";
import { useTheme } from "react-native-paper";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { useTranslation } from "react-i18next";

const Bookmark = () => {
  const [bookmarks, setBookmarks] = useState([]);
  const theme = useTheme();
  const { t } = useTranslation();
  const navigation = useNavigation();

  useFocusEffect(
    useCallback(() => {
      navigation.setOptions({
        title: t("bookmarks"),
        headerShown: true,
        headerTitleStyle: { color: theme.colors.textColor },
      });
    }, [])
  );

  useEffect(() => {
    const loadBookmarks = async () => {
      try {
        const storedBookmarks =
          JSON.parse(await AsyncStorage.getItem("bookmarks")) || [];
        setBookmarks(storedBookmarks);
      } catch (error) {
        Alert.alert("Error", "Failed to load bookmarks");
      }
    };

    loadBookmarks();
  }, []);

  const deleteBookmark = async (id) => {
    try {
      const updatedBookmarks = bookmarks.filter(
        (bookmark) => bookmark.id !== id
      );
      setBookmarks(updatedBookmarks);
      await AsyncStorage.setItem("bookmarks", JSON.stringify(updatedBookmarks));
    } catch (error) {
      Alert.alert("Error", "Failed to delete bookmark");
    }
  };

  const renderItem = ({ item }) => (
    <View style={[styles.item, { backgroundColor: theme.colors.background }]}>
      <View style={styles.textContainer}>
        <Text style={[styles.verseText, { color: theme.colors.textColor }]}>
          {item.verse} <Text style={styles.ayahText}>({item.id})</Text>
        </Text>
        <Text
          style={[styles.translationText, { color: theme.colors.textColor }]}
        >
          {item.translationVerse}
        </Text>
      </View>
      <TouchableOpacity onPress={() => deleteBookmark(item.id)}>
        <Ionicons name="trash-bin" size={24} color="red" />
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={bookmarks}
        renderItem={renderItem}
        keyExtractor={(item) => item.id.toString()}
      />
    </View>
  );
};

export default Bookmark;

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  item: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: "#ccc",
  },
  textContainer: {
    flex: 1,
  },
  verseText: {
    fontSize: 22,
    fontWeight: "bold",
    marginBottom: 10,
  },
  ayahText: {
    fontSize: 18,
    color: "red",
  },
  translationText: {
    fontSize: 18,
    color: "#555",
  },
});
