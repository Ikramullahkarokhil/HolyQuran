import { Link } from "expo-router";
import React, { useState } from "react";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Animated,
  Dimensions,
} from "react-native";
import { useTheme } from "react-native-paper";
import { FontAwesome5, FontAwesome, Ionicons } from "@expo/vector-icons";

const { width: screenWidth } = Dimensions.get("window");

const cardData = [
  {
    title: "Hadith",
    description: "Explore sacred narrations",
    icon: <FontAwesome5 name="book" size={32} color="#ffffff" />,
    href: { pathname: "HadithBooks" },
    backgroundColor: "#2563eb",
  },
  {
    title: "Islamic History",
    description: "Learn historical events",
    icon: <Ionicons name="time-outline" size={32} color="#ffffff" />,
    href: { pathname: "IslamicHistory" },
    backgroundColor: "#16a34a",
  },
  {
    title: "Allah Names",
    description: "Discover divine names",
    icon: <FontAwesome name="star" size={32} color="#ffffff" />,
    href: { pathname: "AllahNames" },
    backgroundColor: "#eab308",
  },
  {
    title: "Tasbih",
    description: "Practice remembrance",
    icon: <FontAwesome5 name="praying-hands" size={32} color="#ffffff" />,
    href: { pathname: "Tazbih" },
    backgroundColor: "#db2777",
  },
];

const Tools = () => {
  const theme = useTheme();
  return (
    <View
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      <View style={styles.grid}>
        {cardData.map((card, idx) => (
          <Card key={card.title} card={card} theme={theme} />
        ))}
      </View>
    </View>
  );
};

const Card = ({ card, theme }) => {
  const [scaleAnim] = useState(new Animated.Value(1));

  const handlePressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.95,
      friction: 8,
      tension: 40,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      friction: 8,
      tension: 40,
      useNativeDriver: true,
    }).start();
  };

  return (
    <Link
      href={card.href}
      asChild
      accessibilityRole="button"
      accessibilityLabel={`Navigate to ${card.title}: ${card.description}`}
    >
      <TouchableOpacity
        activeOpacity={0.9}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
      >
        <Animated.View
          style={[
            styles.card,
            {
              transform: [{ scale: scaleAnim }],
              backgroundColor: card.backgroundColor,
            },
          ]}
        >
          <View style={styles.iconWrap}>{card.icon}</View>
          <View style={styles.textContainer}>
            <Text
              style={[styles.cardTitle, { color: "#ffffff" }]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.7}
            >
              {card.title}
            </Text>
            <Text
              style={[
                styles.cardDescription,
                { color: "rgba(255, 255, 255, 0.8)" },
              ]}
              numberOfLines={2}
            >
              {card.description}
            </Text>
          </View>
        </Animated.View>
      </TouchableOpacity>
    </Link>
  );
};

export default Tools;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 10,

    backgroundColor: "#f5f5f5",
  },
  grid: {
    flexDirection: "column",
  },
  card: {
    width: "100%",
    borderRadius: 12,
    // minWidth: 330, // removed fixed minWidth for responsiveness
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
    marginBottom: 12,
    // flex: 1, // Removed to prevent vertical overlapping
    minHeight: 100, // Added minimum height for better visibility
  },
  iconWrap: {
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    borderRadius: 12,
    padding: 16,
    marginRight: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  textContainer: {
    flex: 1,
    justifyContent: "center",
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "600",
    letterSpacing: 0.3,
    fontFamily: "System",
  },
  cardDescription: {
    fontSize: 14,
    fontWeight: "400",
    marginTop: 4,
    opacity: 0.8,
    fontFamily: "System",
  },
});
