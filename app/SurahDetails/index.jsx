import React, { useMemo, useCallback, useRef, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Alert,
  Share,
  FlatList,
  Pressable,
} from "react-native";
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
import useQuranTranslationStore from "../../components/store/store";
import { useNavigation } from "@react-navigation/native";
import { useGlobalSearchParams } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { IconButton, useTheme } from "react-native-paper";

const SurahDetails = () => {
  const { surahName } = useGlobalSearchParams();
  const navigation = useNavigation();
  const theme = useTheme();
  const { translationLanguage } = useQuranTranslationStore();
  const { showActionSheetWithOptions } = useActionSheet();
  const flatListRef = useRef(null);

  const surahNames = useMemo(() => SurahNames, []);

  const currentSurahIndex = useMemo(() => {
    return surahNames.findIndex((name) => name === surahName);
  }, [surahName, surahNames]);

  useEffect(() => {
    if (flatListRef.current) {
      flatListRef.current.scrollToOffset({ offset: 0, animated: true });
    }
  }, [surahName]);

  useFocusEffect(
    useCallback(() => {
      if (surahName) {
        const setNavigationOptions = (direction) => {
          const targetSurahName =
            surahNames[currentSurahIndex + direction] || surahName;
          return (
            <IconButton
              icon={`chevron-${direction === -1 ? "left" : "right"}`}
              iconColor={theme.colors.textColor}
              size={30}
              onPress={() => {
                navigation.setParams({ surahName: targetSurahName });
              }}
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
    }, [
      surahName,
      currentSurahIndex,
      theme.colors.textColor,
      surahNames,
      navigation,
    ])
  );

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

  const handleLongPress = useCallback(
    async (verse) => {
      const options = ["Bookmark", "Copy", "Share", "Cancel"];
      const cancelButtonIndex = 3;
      const { verse: verseText, translationVerse } = verse;

      try {
        const existingBookmarks =
          JSON.parse(await AsyncStorage.getItem("bookmarks")) || [];
        const isBookmarked = existingBookmarks.some(
          (bookmark) => bookmark.id === verse.id
        );

        if (isBookmarked) {
          Alert.alert(
            "Already Bookmarked",
            `${verseText}\n\n${translationVerse}`
          );
          return;
        }

        showActionSheetWithOptions(
          {
            options,
            cancelButtonIndex,
          },
          async (buttonIndex) => {
            switch (buttonIndex) {
              case 0:
                const updatedBookmarks = [...existingBookmarks, verse];
                await AsyncStorage.setItem(
                  "bookmarks",
                  JSON.stringify(updatedBookmarks)
                );
                Alert.alert(
                  "Bookmarked",
                  `${verseText}\n\n${translationVerse}`
                );
                break;
              case 1:
                Clipboard.setString(`${verseText}\n\n${translationVerse}`);
                Alert.alert(
                  "Copied to Clipboard",
                  `${verseText}\n\n${translationVerse}`
                );
                break;
              case 2:
                Share.share({
                  message: `${verseText}\n\n${translationVerse}`,
                });
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
      const translationItem = translationVerses.find(
        (verse) => verse.id === item.id
      );
      const translationVerse =
        translationItem?.verse || "Translation not available";

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
            android_ripple={{
              color: "#A3A3A3",
              borderless: false,
            }}
            style={[
              styles.item,
              { borderBottomColor: theme.colors.inactiveColor },
            ]}
          >
            <Text style={[styles.verseText, { color: theme.colors.textColor }]}>
              {item.verse}.<Text style={styles.ayahText}> ({item.ayah})</Text>
            </Text>
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
    [
      handleLongPress,
      translationVerses,
      theme.colors.inactiveColor,
      theme.colors.textColor,
    ]
  );

  if (!surahName) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Invalid Surah Name</Text>
      </View>
    );
  }

  return (
    <View
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
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
      />
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
    padding: 20,
    borderBottomWidth: 1,
    width: "100%",
  },
  verseText: {
    fontSize: 20,
    fontWeight: "bold",
  },
  ayahText: {
    fontSize: 18,
    color: "red",
  },
  translationText: {
    fontSize: 18,
    marginTop: 5,
    textAlign: "right",
  },
});
