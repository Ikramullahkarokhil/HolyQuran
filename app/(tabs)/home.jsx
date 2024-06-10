import React, { useState, useEffect, useMemo } from "react";
import { StyleSheet, Text, View, FlatList } from "react-native";
import { IconButton, useTheme } from "react-native-paper";
import { loadSurahNames } from "../../components/utils";
import ArabicQuran from "../../assets/QuranData/ArabicQuran.json";
import { Link } from "expo-router";

const Home = () => {
  const [surahNames, setSurahNames] = useState([]);
  const theme = useTheme();

  useEffect(() => {
    const fetchSurahNames = async () => {
      const names = await loadSurahNames();
      setSurahNames(names);
    };
    fetchSurahNames();
  }, []);

  const versesPerSurah = useMemo(() => {
    const calculateVersesPerSurah = (ArabicQuran) => {
      const versesPerSurah = {};

      for (const verseId in ArabicQuran.quran["quran-uthmani-hafs"]) {
        const verse = ArabicQuran.quran["quran-uthmani-hafs"][verseId];
        const surahId = verse.surah;

        if (!versesPerSurah[surahId]) {
          versesPerSurah[surahId] = 1;
        } else {
          versesPerSurah[surahId]++;
        }
      }

      return versesPerSurah;
    };

    return calculateVersesPerSurah(ArabicQuran);
  }, []);

  const renderItem = ({ item }) => (
    <View
      style={[styles.itemContainer, { backgroundColor: theme.colors.primary }]}
    >
      <Link
        href={{
          pathname: "SurahDetails",
          params: {
            surahId: item.surah,
            surahName: surahNames[item.surah - 1],
          },
        }}
        style={styles.item}
      >
        <View style={styles.surahContainer}>
          <Text style={[styles.surahName, { color: theme.colors.textColor }]}>
            <Text
              style={[styles.surahNumber, { color: theme.colors.textColor }]}
            >
              {item.surah}.{" "}
            </Text>
            سورة {surahNames[item.surah - 1]}
          </Text>
        </View>
        <Text style={styles.verses}>آ {versesPerSurah[item.surah]}</Text>
      </Link>
      <View style={styles.divider} />
    </View>
  );

  return (
    <View
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      <FlatList
        data={Array.from({ length: 114 }, (_, index) => ({ surah: index + 1 }))}
        renderItem={renderItem}
        keyExtractor={(item) => item.surah.toString()}
        initialNumToRender={10}
        contentContainerStyle={styles.list}
      />
      <Link
        href={{
          pathname: "Bookmarks",
        }}
        style={styles.floatingButton}
      >
        <IconButton icon="heart" iconColor="red" animated={true} size={45} />
      </Link>
    </View>
  );
};

export default Home;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8f9fa",
  },
  list: {
    padding: 15,
    // paddingHorizontal: 50,
  },
  itemContainer: {
    width: "100%",
    backgroundColor: "#ffffff",
    borderRadius: 10,
    marginBottom: 15,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 5,
    elevation: 3,
    paddingHorizontal: 40,
    paddingVertical: 5,
  },
  item: {
    paddingTop: 15,
    paddingBottom: 10,
    width: "100%",
    justifyContent: "center",
    alignItems: "center",
    paddingRight: 15,
  },
  surahName: {
    fontSize: 22,
    color: "#333",
    fontWeight: "bold",
    textAlign: "center",
  },
  surahNumber: {
    fontSize: 20,
    color: "#666",
    textAlign: "center",
  },
  surahContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  verses: {
    fontSize: 16,
    color: "red",
  },
  divider: {
    marginTop: 10,
    marginHorizontal: 20,
  },
  floatingButton: {
    position: "absolute",
    bottom: 15,
    right: 15,
    borderRadius: 30,
    elevation: 15,
  },
});
