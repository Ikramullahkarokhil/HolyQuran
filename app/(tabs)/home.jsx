import React, { useState, useEffect, useMemo } from "react";
import { StyleSheet, Text, View, FlatList, TouchableOpacity, Animated } from "react-native";
import { IconButton, useTheme } from "react-native-paper";
import { loadSurahNames } from "../../components/utils";
import ArabicQuran from "../../assets/QuranData/ArabicQuran.json";
import { useRouter } from "expo-router";

const Home = () => {
  const [surahNames, setSurahNames] = useState([]);
  const [loading, setLoading] = useState(true);
  const theme = useTheme();
  const fadeAnim = useState(new Animated.Value(0))[0];
  const router = useRouter()

  useEffect(() => {
    const fetchSurahNames = async () => {
      try {
        setLoading(true);
        const names = await loadSurahNames();
        if (names && Array.isArray(names)) {
          setSurahNames(names);
        } else {
          console.error('Invalid surah names format:', names);
        }
      } catch (error) {
        console.error('Error loading surah names:', error);
      } finally {
        setLoading(false);
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 300, // Reduced duration for lighter animation
          useNativeDriver: true,
        }).start();
      }
    };

    fetchSurahNames().catch(err => {
      console.error("Unhandled error in fetchSurahNames:", err);
    });
  }, []);

  handleBookmarks = () => {
    router.navigate("/Bookmarks");
  }

  handleSurahPress =(item, currentSurahName) => {
    router.navigate({
              pathname: "SurahDetails",
              params: {
                surahId: item.surah,
                surahName: currentSurahName,
              },
            })
  }

  const versesPerSurah = useMemo(() => {
    try {
      if (!ArabicQuran?.quran?.["quran-uthmani-hafs"]) {
        console.error('Invalid Quran data structure');
        return {};
      }

      const versesPerSurah = {};
      const quranData = ArabicQuran.quran["quran-uthmani-hafs"];

      for (const verseId in quranData) {
        const verse = quranData[verseId];
        if (verse && verse.surah) {
          const surahId = verse.surah;
          versesPerSurah[surahId] = (versesPerSurah[surahId] || 0) + 1;
        }
      }

      return versesPerSurah;
    } catch (error) {
      console.error('Error calculating verses:', error);
      return {};
    }
  }, []);

  const renderItem = ({ item }) => {
    if (!theme?.colors || !surahNames[item.surah - 1]) {
      console.error('Theme or surah name not initialized properly');
      return null;
    }

    const currentSurahName = surahNames[item.surah - 1];

    return (
      <Animated.View style={[styles.itemContainer, { opacity: fadeAnim }]}>
        <View style={[styles.card, { backgroundColor: theme.colors.surface }]}>
          
            <TouchableOpacity style={styles.item} onPress={() => handleSurahPress(item, currentSurahName)}>
              <Text style={[styles.verses, { color: theme.colors.accent }]}>
                {versesPerSurah[item.surah] || 0} آيات
              </Text>
              <View style={styles.surahContainer}>
                <Text style={[styles.surahNumber, { color: theme.colors.textColor }]}>
                  {item.surah}
                </Text>
                <Text style={[styles.surahName, { color: theme.colors.textColor }]}>
                  سورة {currentSurahName}
                </Text>
              </View>
            </TouchableOpacity>
          
        </View>
      </Animated.View>
    );
  };

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: theme?.colors?.background }]}>
        <Text style={styles.loadingText}>جاري التحميل...</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme?.colors?.background }]}>
      <Animated.View style={{ opacity: fadeAnim, flex: 1 }}>
        <FlatList
          data={Array.from({ length: 114 }, (_, index) => ({ surah: index + 1 }))}
          renderItem={renderItem}
          keyExtractor={(item) => item.surah.toString()}
          initialNumToRender={12} // Increased for smoother initial load
          maxToRenderPerBatch={6} // Slightly increased for performance
          windowSize={3} // Reduced to lower memory usage
          contentContainerStyle={styles.list}
          removeClippedSubviews={true}
          getItemLayout={(data, index) => ({
            length: 80, // Approximate item height for better scroll performance
            offset: 80 * index,
            index,
          })}
        />
      </Animated.View>
     
        <TouchableOpacity style={[styles.floatingButton, { backgroundColor: theme.colors.primary }]} onPress={handleBookmarks}>
          <IconButton
            icon="heart"
            iconColor={theme.colors.error}
            size={30}
            style={styles.floatingButtonIcon}
          />
        </TouchableOpacity>
     
    </View>
  );
};

export default Home;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f6fa",
  },
  list: {
    padding: 10,
  },
  itemContainer: {
    marginBottom: 10,
    borderRadius: 15,
    overflow: 'hidden',
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 }, // Reduced shadow for performance
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 5,
  },
  card: {
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "#e0e0e0",
    paddingVertical: 15,
    paddingHorizontal: 10
  },
  item: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 10,
  },
  surahContainer: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  surahName: {
    fontSize: 22,
    fontWeight: '600',
    textAlign: 'right',
    marginRight: 10,
    fontFamily: 'Amiri-Regular', // Ensure you have this font or use a similar Arabic font
  },
  surahNumber: {
    fontSize: 18,
    fontWeight: '500',
    color: '#666',
    marginRight: 10,
  },
  verses: {
    fontSize: 16,
    fontWeight: '500',
    textAlign: 'left',
  },
  loadingText: {
    fontSize: 18,
    textAlign: 'center',
    marginTop: 20,
    fontFamily: 'Amiri-Regular',
  },
  floatingButton: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    borderRadius: 30,
    elevation: 8,
    borderWidth: 1,
    borderColor: "#fff",
  },
  floatingButtonIcon: {
    margin: 0,
  },
});