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

const getCardData = (t) => [
  {
    id: "hadith",
    title: t("Hadith"),
    description: t("Explore sacred narrations"),
    icon: "book-open-variant",
    href: { pathname: "HadithCollections" },
    accent: "#2563eb",
    accentBackground: "rgba(37, 99, 235, 0.12)",
  },
  {
    id: "daily",
    title: t("Verse & Hadith of the Day"),
    description: t("Learn verses and hadiths of the day"),
    icon: "lightbulb-outline",
    href: { pathname: "IslamicHistory" },
    accent: "#16a34a",
    accentBackground: "rgba(22, 163, 74, 0.12)",
  },
  {
    id: "duas",
    title: t("Islamic duas"),
    description: t("Explore supplications from the Quran and Hadith"),
    icon: "hands-pray",
    href: { pathname: "QuranicDuas" },
    accent: "#12836b",
    accentBackground: "rgba(18, 131, 107, 0.12)",
  },
  {
    id: "tasbih",
    title: t("Tasbih"),
    description: t("Practice remembrance"),
    icon: "counter",
    href: { pathname: "Tazbih" },
    accent: "#db2777",
    accentBackground: "rgba(219, 39, 119, 0.12)",
  },
  {
    id: "qibla",
    title: t("Qibla Compass"),
    description: t("Find the direction of the Kaaba"),
    icon: "compass-outline",
    href: { pathname: "Qibla" },
    accent: "#12836b",
    accentBackground: "rgba(18, 131, 107, 0.12)",
  },
  {
    id: "quiz",
    title: t("Quran Challenge"),
    description: t("Test your Quran knowledge"),
    icon: "brain",
    href: { pathname: "QuranQuiz" },
    accent: "#7c3aed",
    accentBackground: "rgba(124, 58, 237, 0.12)",
  },
];

const ToolCard = memo(
  ({ card, flexDir, textAlign, writingDir, theme }) => {
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
            color: theme.colors.riple,
            borderless: false,
            foreground: true,
          }}
        >
          <Animated.View
            style={[
              styles.card,
              {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.outlineVariant,
                flexDirection: flexDir,
              },
              animatedStyle,
            ]}
          >
            <View
              style={[
                styles.iconWrap,
                { backgroundColor: card.accentBackground },
              ]}
            >
              <Icon source={card.icon} size={25} color={card.accent} />
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
                    color: theme.colors.onSurface,
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
                    color: theme.colors.onSurfaceVariant,
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
                color={theme.colors.inactiveColor}
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
    prev.textAlign === next.textAlign &&
    prev.writingDir === next.writingDir &&
    prev.theme === next.theme,
);
ToolCard.displayName = "ToolCard";

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
      contentContainerStyle={[styles.content, styles.contentGrow]}
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
            theme={theme}
          />
        ))}
      </View>
    </ScrollView>
  );
};

export default Tools;

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 32,
  },
  contentGrow: {
    flexGrow: 1,
  },
  grid: {
    flexDirection: "column",
    gap: 10,
  },
  intro: {
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 18,
    marginBottom: 18,
  },
  introIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  introTitle: {
    fontSize: 21,
    lineHeight: 28,
    fontWeight: "800",
    letterSpacing: 0.1,
  },
  introDescription: {
    fontSize: 14,
    lineHeight: 21,
    marginTop: 5,
  },
  card: {
    width: "100%",
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 14,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    minHeight: 84,
    gap: 13,
    overflow: "hidden",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.05,
        shadowRadius: 9,
      },
      android: {
        elevation: 1,
      },
    }),
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 15,
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
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 0.1,
  },
  cardDescription: {
    fontSize: 13,
    fontWeight: "400",
    lineHeight: 18,
  },
  chevronWrap: {
    opacity: 0.9,
  },
});
