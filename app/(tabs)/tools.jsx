import { Link } from "expo-router";
import React, { useState } from "react";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Animated,
} from "react-native";
import { useTheme } from "react-native-paper";
import { FontAwesome5, MaterialIcons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useAppLanguageStore } from "../../components/store/store";
import {
  isRTL,
  getTextAlignment,
  getWritingDirection,
  getFlexDirection,
  getMarginStyle,
} from "../../components/utils/rtlUtils";

const getCardData = (t) => [
  {
    title: t("Hadith"),
    description: t("Explore sacred narrations"),
    icon: <FontAwesome5 name="book" size={32} color="#ffffff" />,
    href: { pathname: "HadithBooks" },
    backgroundColor: "#2563eb",
  },
  {
    title: t("Verse & Hadith of the Day"),
    description: t("Learn verses and hadiths of the day"),
    icon: <MaterialIcons name="lightbulb-outline" size={32} color="#ffffff" />,
    href: { pathname: "IslamicHistory" },
    backgroundColor: "#16a34a",
  },

  {
    title: t("Tasbih"),
    description: t("Practice remembrance"),
    icon: <FontAwesome5 name="praying-hands" size={32} color="#ffffff" />,
    href: { pathname: "Tazbih" },
    backgroundColor: "#db2777",
  },
];

const Tools = () => {
  const theme = useTheme();
  const { t } = useTranslation();
  const { language } = useAppLanguageStore();
  const isRTLMode = isRTL(language);

  return (
    <View
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      <View style={[styles.grid, isRTLMode && styles.gridRTL]}>
        {getCardData(t).map((card, idx) => (
          <Card
            key={card.title}
            card={card}
            theme={theme}
            isRTL={isRTLMode}
            language={language}
          />
        ))}
      </View>
    </View>
  );
};

const Card = ({ card, theme, isRTL, language }) => {
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

  // Dynamic styles based on language
  const cardStyle = [
    styles.card,
    isRTL && { flexDirection: getFlexDirection(language) },
    {
      transform: [{ scale: scaleAnim }],
      backgroundColor: card.backgroundColor,
    },
  ];

  const iconWrapStyle = [
    styles.iconWrap,
    isRTL && getMarginStyle(language, "right", 16),
    !isRTL && getMarginStyle(language, "right", 16),
  ];

  const textContainerStyle = [
    styles.textContainer,
    isRTL && { alignItems: "flex-end" },
  ];

  const titleStyle = [
    styles.cardTitle,
    {
      color: "#ffffff",
      textAlign: getTextAlignment(language),
      writingDirection: getWritingDirection(language),
    },
  ];

  const descriptionStyle = [
    styles.cardDescription,
    {
      color: "rgba(255, 255, 255, 0.8)",
      textAlign: getTextAlignment(language),
      writingDirection: getWritingDirection(language),
    },
  ];

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
        <Animated.View style={cardStyle}>
          <View style={iconWrapStyle}>{card.icon}</View>
          <View style={textContainerStyle}>
            <Text
              style={titleStyle}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.7}
            >
              {card.title}
            </Text>
            <Text style={descriptionStyle} numberOfLines={2}>
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
  gridRTL: {
    // RTL-specific grid styles if needed
  },
  card: {
    width: "100%",
    borderRadius: 12,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
    marginBottom: 12,
    minHeight: 100,
  },
  iconWrap: {
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    borderRadius: 12,
    padding: 16,
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
