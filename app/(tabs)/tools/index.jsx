import { Link } from "expo-router";
import React, { useMemo, useCallback, memo } from "react";
import {
  StyleSheet,
  View,
  Text,
  Pressable,
  Platform,
  ScrollView,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from "react-native-reanimated";
import { useTheme, Icon } from "react-native-paper";
import { useTranslation } from "react-i18next";
import { useAppLanguageStore } from "../../../components/store/store";
import {
  getTextAlignment,
  getWritingDirection,
  getFlexDirection,
} from "../../../components/utils/rtlUtils";

// ─── Card config (icon name only – no JSX in data) ──────────────────────────

const getCardData = (t) => [
  {
    id: "hadith",
    title: t("Hadith"),
    description: t("Explore sacred narrations"),
    icon: "book-open-variant",
    href: { pathname: "HadithCollections" },
    accent: "#2563eb",
  },
  {
    id: "daily",
    title: t("Verse & Hadith of the Day"),
    description: t("Learn verses and hadiths of the day"),
    icon: "lightbulb-outline",
    href: { pathname: "IslamicHistory" },
    accent: "#16a34a",
  },
  {
    id: "tasbih",
    title: t("Tasbih"),
    description: t("Practice remembrance"),
    icon: "hands-pray",
    href: { pathname: "Tazbih" },
    accent: "#db2777",
  },
  {
    id: "quiz",
    title: t("Quran Challenge"),
    description: t("Test your Quran knowledge"),
    icon: "brain",
    href: { pathname: "QuranQuiz" },
    accent: "#7c3aed",
  },
];

// ─── Memoized tool card ─────────────────────────────────────────────────────

const ToolCard = memo(
  ({ card, flexDir, textAlign, writingDir }) => {
    const scale = useSharedValue(1);

    const animatedStyle = useAnimatedStyle(() => ({
      transform: [{ scale: scale.value }],
    }));

    const onPressIn = useCallback(() => {
      // Reanimated shared values are intentionally mutable.
      // eslint-disable-next-line react-hooks/immutability
      scale.value = withSpring(0.97, {
        damping: 18,
        stiffness: 320,
      });
    }, [scale]);

    const onPressOut = useCallback(() => {
      // Reanimated shared values are intentionally mutable.
      // eslint-disable-next-line react-hooks/immutability
      scale.value = withSpring(1, {
        damping: 14,
        stiffness: 280,
      });
    }, [scale]);

    return (
      <Link
        href={card.href}
        asChild
        accessibilityRole="button"
        accessibilityLabel={`${card.title}: ${card.description}`}
      >
        <Pressable
          onPressIn={onPressIn}
          onPressOut={onPressOut}
          android_ripple={{
            color: "rgba(255,255,255,0.18)",
            borderless: false,
            foreground: true,
          }}
        >
          <Animated.View
            style={[
              styles.card,
              {
                backgroundColor: card.accent,
                flexDirection: flexDir,
              },
              animatedStyle,
            ]}
          >
            <View style={styles.iconWrap}>
              <Icon source={card.icon} size={28} color="#ffffff" />
            </View>

            <View
              style={[
                styles.textContainer,
                textAlign === "right" && styles.textContainerRtl,
              ]}
            >
              <Text
                style={[
                  styles.cardTitle,
                  {
                    textAlign,
                    writingDirection: writingDir,
                  },
                ]}
                numberOfLines={2}
              >
                {card.title}
              </Text>
              <Text
                style={[
                  styles.cardDescription,
                  {
                    textAlign,
                    writingDirection: writingDir,
                  },
                ]}
                numberOfLines={2}
              >
                {card.description}
              </Text>
            </View>

            <View style={styles.chevronWrap}>
              <Icon
                source={
                  textAlign === "right" ? "chevron-left" : "chevron-right"
                }
                size={22}
                color="rgba(255,255,255,0.75)"
              />
            </View>
          </Animated.View>
        </Pressable>
      </Link>
    );
  },
  (prev, next) =>
    prev.card.id === next.card.id &&
    prev.card.title === next.card.title &&
    prev.card.description === next.card.description &&
    prev.flexDir === next.flexDir &&
    prev.textAlign === next.textAlign,
);
ToolCard.displayName = "ToolCard";

// ─── Main screen ────────────────────────────────────────────────────────────

const Tools = () => {
  const theme = useTheme();
  const { t } = useTranslation();
  const { language } = useAppLanguageStore();

  const flexDir = getFlexDirection(language);
  const textAlign = getTextAlignment(language);
  const writingDir = getWritingDirection(language);

  const cards = useMemo(() => getCardData(t), [t]);

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.grid}>
        {cards.map((card) => (
          <ToolCard
            key={card.id}
            card={card}
            flexDir={flexDir}
            textAlign={textAlign}
            writingDir={writingDir}
          />
        ))}
      </View>
    </ScrollView>
  );
};

export default Tools;

// ─── Styles (aligned with Home / Settings cards) ────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 32,
  },
  grid: {
    flexDirection: "column",
    gap: 12,
  },
  card: {
    width: "100%",
    borderRadius: 16,
    paddingVertical: 18,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    minHeight: 96,
    gap: 14,
    overflow: "hidden",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.12,
        shadowRadius: 10,
      },
      android: {
        elevation: 3,
      },
    }),
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  textContainer: {
    flex: 1,
    justifyContent: "center",
    gap: 4,
  },
  textContainerRtl: {
    alignItems: "flex-end",
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: "700",
    letterSpacing: 0.2,
    color: "#ffffff",
  },
  cardDescription: {
    fontSize: 13.5,
    fontWeight: "400",
    lineHeight: 19,
    color: "rgba(255, 255, 255, 0.82)",
  },
  chevronWrap: {
    opacity: 0.9,
  },
});
