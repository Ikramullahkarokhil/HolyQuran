import React, { useMemo, useCallback, useRef, useEffect, useState } from "react";
import { View, Text, StyleSheet, Alert, Share, FlatList, Pressable } from "react-native";
import ArabicQuran from "../../assets/QuranData/ArabicQuran.json";
import EnglishQuran from "../../assets/QuranData/EnglishQuran.json";
import PashtoQuran from "../../assets/QuranData/PashtoQuran.json";
import DariQuran from "../../assets/QuranData/PersianQuran.json";
import SurahNames from "../../assets/QuranData/SurahNames.json";
import { LongPressGestureHandler, State, GestureHandlerRootView } from "react-native-gesture-handler";
import { ActionSheetProvider, connectActionSheet, useActionSheet } from "@expo/react-native-action-sheet";
import * as Clipboard from "expo-clipboard";
import AsyncStorage from "@react-native-async-storage/async-storage";
import useQuranTranslationStore from "../../components/store/store";
import { useNavigation } from "@react-navigation/native";
import { useGlobalSearchParams, useFocusEffect } from "expo-router";
import { IconButton, useTheme } from "react-native-paper";

const SurahDetails = () => {
  const { surahName } = useGlobalSearchParams();
  const navigation = useNavigation();
  const theme = useTheme();
  const { translationLanguage } = useQuranTranslationStore();
  const { showActionSheetWithOptions } = useActionSheet();
  const flatListRef = useRef(null);
  const [showScrollTop, setShowScrollTop] = useState(false);

  const surahNames = useMemo(() => SurahNames, []);

  const currentSurahIndex = useMemo(() => {
    return surahNames.findIndex((name) => name === surahName);
  }, [surahName, surahNames]);

  const getTranslationData = useMemo(() => {
    return (language) => {
      switch (language) {
        case "pashto": return PashtoQuran;
        case "dari": return DariQuran;
        case "english": return EnglishQuran;
        default: return PashtoQuran;
      }
    };
  }, []);

  const translationData = useMemo(
    () => getTranslationData(translationLanguage),
    [translationLanguage, getTranslationData]
  );

  const verses = useMemo(() => {
    if (!surahName) return [];
    const surahId = surahNames.indexOf(surahName) + 1;
    return Object.values(ArabicQuran.quran["quran-uthmani-hafs"]).filter(
      (item) => item.surah === surahId
    );
  }, [surahName, surahNames]);

  const translationVerses = useMemo(() => {
    if (!surahName || !translationData) return [];
    const surahId = surahNames.indexOf(surahName) + 1;
    return Object.values(translationData.quran["quran-uthmani-hafs"]).filter(
      (item) => item.surah === surahId
    );
  }, [surahName, translationData, surahNames]);


  useFocusEffect(
    useCallback(() => {
      if (surahName) {
        const setNavigationOptions = (direction) => {
          const targetSurahName = surahNames[currentSurahIndex + direction] || surahName;
          return (
            <IconButton
              icon={`chevron-${direction === -1 ? "left" : "right"}`}
              iconColor={theme.colors.textColor}
              size={30}
              onPress={() => navigation.setParams({ surahName: targetSurahName })}
            />
          );
        };

        navigation.setOptions({
          title: `سورة ${surahName}`,
          headerShown: true,
          headerTitleStyle: { color: theme.colors.textColor },
          headerLeft: () => setNavigationOptions(-1),
          headerRight: () => setNavigationOptions(1),
        });
      }
    }, [surahName, currentSurahIndex, theme.colors.textColor, surahNames, navigation])
  );

  const handleLongPress = useCallback(
    async (verse) => {
      const options = ["Bookmark", "Copy", "Share", "Cancel"];
      const cancelButtonIndex = 3;
      const { verse: verseText, translationVerse } = verse;

      try {
        const existingBookmarks = JSON.parse(await AsyncStorage.getItem("bookmarks")) || [];
        const isBookmarked = existingBookmarks.some((bookmark) => bookmark.id === verse.id);

        if (isBookmarked) {
          Alert.alert("Already Bookmarked", `${verseText}\n\n${translationVerse}`);
          return;
        }

        showActionSheetWithOptions(
          { options, cancelButtonIndex },
          async (buttonIndex) => {
            switch (buttonIndex) {
              case 0:
                const updatedBookmarks = [...existingBookmarks, verse];
                await AsyncStorage.setItem("bookmarks", JSON.stringify(updatedBookmarks));
                Alert.alert("Bookmarked", `${verseText}\n\n${translationVerse}`);
                break;
              case 1:
                Clipboard.setString(`${verseText}\n\n${translationVerse}`);
                Alert.alert("Copied to Clipboard", `${verseText}\n\n${translationVerse}`);
                break;
              case 2:
                Share.share({ message: `${verseText}\n\n${translationVerse}` });
                break;
              default:
                break;
            }
          }
        );
      } catch (error) {
        Alert.alert("Error", "Failed to save bookmark");
      }
    },
    [showActionSheetWithOptions]
  );

  const renderItem = useCallback(
    ({ item }) => {
      const translationItem = translationVerses.find((verse) => verse.id === item.id);
      const translationVerse = translationItem?.verse || "Translation not available";

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
            android_ripple={{ color: theme.colors.riple, borderless: false }}
            style={({ pressed }) => [
              styles.item,
              {
                backgroundColor: pressed
                  ? theme.colors.inactiveColor + "22"
                  : theme.colors.surface,
                borderBottomColor: theme.colors.inactiveColor,
              },
            ]}
          >
            <View style={styles.verseRow}>
              <Text style={[styles.verseText, { color: theme.colors.textColor }]}>
                <View style={styles.ayahBadge}>
                  <Text style={styles.ayahBadgeText}>{item.ayah}</Text>
                </View>{" "}
                {item.verse}
              </Text>
            </View>
            <Text style={[styles.translationText, { color: theme.colors.textColor }]}>
              {translationVerse}
            </Text>
           
          </Pressable>
        </LongPressGestureHandler>
      );
    },
    [handleLongPress, translationVerses, theme.colors.inactiveColor, theme.colors.textColor, theme.colors.surface, theme.colors.riple]
  );

  const getItemLayout = useCallback(
    (data, index) => ({
      length: 72,
      offset: 72 * index,
      index,
    }),
    []
  );

  const handleScroll = useCallback(
    (event) => {
      const y = event.nativeEvent.contentOffset.y;
      setShowScrollTop(y > 200);
    },
    []
  );

  if (!surahName) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Invalid Surah Name</Text>
      </View>
    );
  }


  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <FlatList
        ref={flatListRef}
        data={verses}
        renderItem={renderItem}
        keyExtractor={(item) => item.id.toString()}
        initialNumToRender={10}
        maxToRenderPerBatch={10}
        windowSize={5}
        removeClippedSubviews={true}
        updateCellsBatchingPeriod={50}
        ItemSeparatorComponent={() =>  <View style={styles.divider} />}
        onScroll={handleScroll}
        // getItemLayout={getItemLayout}
      />
      {showScrollTop && (
        <Pressable
          style={styles.scrollTopBtn}
          android_ripple={{ color: theme.colors.riple }}
          onPress={() => flatListRef.current?.scrollToOffset({ offset: 0, animated: true })}
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  errorText: {
    fontSize: 18,
    color: "red",
  },
  item: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: 0,
    width: "100%",
    borderRadius: 12,
    marginBottom: 0,
    elevation: 0,
    shadowColor: "transparent",
  },
  verseRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  verseText: {
    fontSize: 22,
    fontWeight: "bold",
    flex: 1,
    textAlign: "right",
  },
  ayahBadge: {
    backgroundColor: "#2196f3",
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 2,
    marginLeft: 10,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#2196f3",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
   
  },
  ayahBadgeText: {
    fontSize: 15,
    color: "#fff",
    fontWeight: "bold",
    letterSpacing: 0.5,
  },
  divider: {
    height: 1,
    backgroundColor: "#e0e0e0",
    
    opacity: 0.7,
  },
  translationText: {
    fontSize: 18,
    marginTop: 2,
    textAlign: "right",
    opacity: 0.92,
  },
  scrollTopBtn: {
    position: "absolute",
    bottom: 32,
    right: 18,
    backgroundColor: "#2196f3",
    borderRadius: 28,
    width: 56,
    height: 56,
    alignItems: "center",
    justifyContent: "center",
    elevation: 7,
    shadowColor: "#2196f3",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
  },
  scrollTopBtnText: {
    color: "#fff",
    fontSize: 30,
    fontWeight: "bold",
    marginTop: -2,
  },
});