import { Link } from "expo-router";
import React from "react";
import { StyleSheet, View, Text } from "react-native";
import { useTheme } from "react-native-paper";

const Tools = () => {
  const theme = useTheme();
  return (
    <View
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      <View style={styles.row}>
        <Link
          href={{ pathname: "PashtoNamaz" }}
          style={[styles.card, { backgroundColor: theme.colors.primary }]}
        >
          <Text style={[styles.cardText, { color: theme.colors.textColor }]}>
            Hadith
          </Text>
        </Link>
        <Link
          href={{ pathname: "DailyDua" }}
          style={[styles.card, { backgroundColor: theme.colors.primary }]}
        >
          <Text style={[styles.cardText, { color: theme.colors.textColor }]}>
            Islam history
          </Text>
        </Link>
      </View>
      <View style={styles.row}>
        <Link
          href={{ pathname: "AllahNames" }}
          style={[styles.card, { backgroundColor: theme.colors.primary }]}
        >
          <Text style={[styles.cardText, { color: theme.colors.textColor }]}>
            Allah Names
          </Text>
        </Link>
        <Link
          href={{ pathname: "Tazbih" }}
          style={[styles.card, { backgroundColor: theme.colors.primary }]}
        >
          <Text style={[styles.cardText, { color: theme.colors.textColor }]}>
            Tazbih
          </Text>
        </Link>
      </View>
    </View>
  );
};

export default Tools;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 20,
    paddingHorizontal: 20,
    backgroundColor: "#f0f2f5",
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: "100%",
    marginBottom: 20,
  },
  card: {
    width: "47%",
    height: 150,
    padding: 20,
    borderRadius: 15,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 10,
    },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 10,
    justifyContent: "center",
    alignItems: "center",
    transition: "transform 0.2s",
  },
  cardText: {
    fontSize: 20,
    color: "#ffffff",
    fontWeight: "bold",
    textAlign: "center",
  },
});
