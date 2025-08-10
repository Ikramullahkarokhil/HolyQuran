import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Alert,
  TouchableOpacity,
  Animated,
  Dimensions,
} from "react-native";
import { useTheme } from "react-native-paper";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { useTranslation } from "react-i18next";

const Bookmark = () => {
  const [bookmarks, setBookmarks] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
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

  const loadBookmarks = async () => {
    try {
      const storedBookmarks =
        JSON.parse(await AsyncStorage.getItem("bookmarks")) || [];
      setBookmarks(storedBookmarks);
    } catch (error) {
      Alert.alert("Error", "Failed to load bookmarks");
    }
  };

  useEffect(() => {
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

  const onRefresh = async () => {
    setRefreshing(true);
    await loadBookmarks();
    setRefreshing(false);
  };

  // Swipe-to-delete animation
  const renderItem = ({ item, index }) => {
    const translateX = new Animated.Value(0);
    let swiped = false;

    const handleDelete = () => {
      if (!swiped) {
        Alert.alert(
          t('delete_bookmark', 'Delete Bookmark'),
          t('delete_bookmark_confirm', 'Are you sure you want to delete this bookmark?'),
          [
            { text: t('cancel', 'Cancel'), style: 'cancel' },
            {
              text: t('delete', 'Delete'),
              style: 'destructive',
              onPress: () => {
                swiped = true;
                Animated.timing(translateX, {
                  toValue: -Dimensions.get("window").width,
                  duration: 300,
                  useNativeDriver: true,
                }).start(() => deleteBookmark(item.id));
              },
            },
          ]
        );
      }
    };

    // Determine translation direction
    const lang = t('translation_language') || t('language') || 'en';
    const isEnglish = lang.startsWith('en');
    return (
      <Animated.View
        style={[
          styles.card,
          {
            backgroundColor: theme.colors.surface,
            shadowColor: theme.colors.activeIndicatorStyle || '#aaa',
            transform: [{ translateX }],
          },
        ]}
      >
        <TouchableOpacity
          activeOpacity={0.8}
          style={{ flex: 1 }}
          onPress={handleDelete}
        >
          <View style={styles.textContainer}>
            <Text
              style={[
                styles.verseText,
                { color: theme.colors.activeColor, textAlign: 'right', writingDirection: 'rtl' },
              ]}
            >
              {item.verse} <Text style={[styles.ayahText, { color: theme.colors.error } ]}>({item.id})</Text>
            </Text>
            <Text
              style={[
                styles.translationText,
                { color: theme.colors.textColor, textAlign: isEnglish ? 'left' : 'right', writingDirection: isEnglish ? 'ltr' : 'rtl' },
              ]}
            >
              {item.translationVerse}
            </Text>
          </View>
        </TouchableOpacity>
      </Animated.View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}> 
      {bookmarks.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="bookmark-outline" size={64} color={theme.colors.activeColor} style={{ marginBottom: 16 }} />
          <Text style={[styles.emptyText, { color: theme.colors.textColor }]}>{t("no_bookmarks", "No bookmarks yet!")}</Text>
          <Text style={[styles.emptySubText, { color: theme.colors.inactiveColor }]}>{t("add_bookmarks_hint", "Add your favorite verses to see them here.")}</Text>
        </View>
      ) : (
        <FlatList
          data={bookmarks}
          renderItem={renderItem}
          keyExtractor={(item) => item.id.toString()}
          contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
          ItemSeparatorComponent={() => <View style={{ height: 16 }} />}
          refreshing={refreshing}
          onRefresh={onRefresh}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
};

export default Bookmark;

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 18,
    padding: 18,
    marginBottom: 0,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 4,
    minHeight: 90,
  },
  textContainer: {
    flex: 1,
    marginRight: 12,
  },
  verseText: {
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 8,
    letterSpacing: 0.2,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  ayahText: {
    fontSize: 16,
    fontWeight: "600",
  },
  translationText: {
    fontSize: 16,
    fontWeight: "400",
    // textAlign and writingDirection set dynamically
  },
  deleteButton: {},
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
