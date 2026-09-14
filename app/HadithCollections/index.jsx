import React, { memo, useCallback, useMemo } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { MaterialIcons } from "@expo/vector-icons";
import { Surface, Text, useTheme } from "react-native-paper";
import { useTranslation } from "react-i18next";
import { useAppLanguageStore } from "../../components/store/store";
import {
  getFlexDirection,
  getTextAlignment,
  getWritingDirection,
} from "../../components/utils/rtlUtils";

const colorAlphaCache = new Map();

const withAlpha = (color, alpha) => {
  if (!color || typeof color !== "string" || !color.startsWith("#")) {
    return `rgba(37, 135, 216, ${alpha})`;
  }
  const key = `${color}_${alpha}`;
  if (colorAlphaCache.has(key)) return colorAlphaCache.get(key);
  const hex = color.slice(1);
  if (hex.length !== 6) return `rgba(37, 135, 216, ${alpha})`;
  const result = `rgba(${parseInt(hex.slice(0, 2), 16)},${parseInt(
    hex.slice(2, 4),
    16,
  )},${parseInt(hex.slice(4, 6), 16)},${alpha})`;
  colorAlphaCache.set(key, result);
  return result;
};

const getLocalizedNumber = (value, language) => {
  const number = Number(value).toLocaleString("en-US");
  if (language === "pa" || language === "da") {
    return number.replace(/[0-9]/g, (digit) => "۰۱۲۳۴۵۶۷۸۹"[digit]);
  }
  return number;
};

const CollectionCard = memo(
  ({
    item,
    progressColor,
    isRtl,
    language,
    textAlign,
    writingDirection,
    flexDirection,
    t,
  }) => {
    const theme = useTheme();
    const available = item.available;
    const iconColor = available ? progressColor : theme.colors.onSurfaceDisabled;
    const titleColor = available
      ? theme.colors.onSurface
      : theme.colors.onSurfaceDisabled;
    const descriptionColor = available
      ? theme.colors.onSurfaceVariant
      : theme.colors.onSurfaceDisabled;
    const arrowIcon = available
      ? isRtl
        ? "arrow-back-ios"
        : "arrow-forward-ios"
      : "lock-outline";

    return (
      <Surface
        elevation={available ? 1 : 0}
        style={[
          styles.card,
          {
            backgroundColor: available
              ? theme.colors.surface
              : theme.colors.surfaceDisabled || withAlpha(theme.colors.onSurface, 0.04),
            borderColor: available
              ? withAlpha(progressColor, 0.25)
              : theme.colors.outlineVariant,
          },
        ]}
      >
        <Pressable
          disabled={!available}
          onPress={item.onPress}
          accessibilityRole="button"
          accessibilityState={{ disabled: !available }}
          accessibilityLabel={item.title}
          accessibilityHint={
            available ? t("Open collection") : t("Collection unavailable")
          }
          android_ripple={{ color: withAlpha(progressColor, 0.12), borderless: false }}
          style={({ pressed }) => [
            styles.cardPressable,
            { flexDirection, opacity: pressed ? 0.82 : 1 },
          ]}
        >
          {available ? (
            <View style={[styles.accent, { backgroundColor: progressColor }]} />
          ) : null}
          <View
            style={[
              styles.collectionIcon,
              { backgroundColor: withAlpha(progressColor, available ? 0.12 : 0.06) },
            ]}
          >
            <MaterialIcons name={item.icon} size={22} color={iconColor} />
          </View>
          <View
            style={[
              styles.cardBody,
              { alignItems: textAlign === "right" ? "flex-end" : "flex-start" },
            ]}
          >
            <View style={styles.titleRow}>
              <Text
                variant="titleMedium"
                numberOfLines={1}
                style={[styles.title, { color: titleColor, textAlign, writingDirection }]}
              >
                {item.title}
              </Text>
              {!available ? (
                <View
                  style={[
                    styles.badge,
                    { backgroundColor: withAlpha(theme.colors.onSurfaceVariant, 0.12) },
                  ]}
                >
                  <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
                    {t("Soon")}
                  </Text>
                </View>
              ) : null}
            </View>
            <Text
              variant="bodySmall"
              numberOfLines={2}
              style={[styles.description, { color: descriptionColor, textAlign, writingDirection }]}
            >
              {available ? item.description : t("Coming soon")}
            </Text>
            {item.hadithCount ? (
              <View
                style={[
                  styles.statsRow,
                  { flexDirection: isRtl ? "row-reverse" : "row" },
                ]}
              >
                <MaterialIcons name="format-list-numbered" size={15} color={iconColor} />
                <Text
                  variant="labelSmall"
                  style={[styles.statsText, { color: iconColor, writingDirection }]}
                >
                  {getLocalizedNumber(item.hadithCount, language)} {t("hadiths")}
                  {item.bookCount
                    ? `  ·  ${getLocalizedNumber(item.bookCount, language)} ${t("books")}`
                    : ""}
                </Text>
              </View>
            ) : null}
          </View>
          <MaterialIcons name={arrowIcon} size={18} color={iconColor} />
        </Pressable>
      </Surface>
    );
  },
);

CollectionCard.displayName = "CollectionCard";

const HadithCollections = () => {
  const theme = useTheme();
  const router = useRouter();
  const { t } = useTranslation();
  const language = useAppLanguageStore((state) => state.language);
  const progressColor = theme.colors.progressColor || theme.colors.primary;
  const flexDirection = getFlexDirection(language);
  const textAlign = getTextAlignment(language);
  const writingDirection = getWritingDirection(language);
  const isRtl = textAlign === "right";

  const handleNavigateBukhari = useCallback(() => router.push("/HadithBooks"), [router]);
  const handleNavigateJawami = useCallback(() => router.push("/JawamiAlKalim"), [router]);
  const collections = useMemo(
    () => [
      {
        id: "bukhari",
        title: t("Sahih Bukhari"),
        description: t("Browse the complete Sahih Bukhari collection"),
        icon: "menu-book",
        hadithCount: 7277,
        bookCount: 97,
        available: true,
        onPress: handleNavigateBukhari,
      },
      {
        id: "jawami-al-kalim",
        title: t("Jawami al-Kalim"),
        description: t("Explore concise Hadiths with deep meanings"),
        icon: "auto-stories",
        hadithCount: 100,
        available: true,
        onPress: handleNavigateJawami,
      },
      {
        id: "muslim",
        title: t("Sahih Muslim"),
        description: t("Browse the complete Sahih Muslim collection"),
        icon: "library-books",
        available: false,
      },
      {
        id: "other",
        title: t("Other Hadith Collections"),
        description: t("More authentic and trusted Hadith collections"),
        icon: "collections-bookmark",
        available: false,
      },
    ],
    [handleNavigateBukhari, handleNavigateJawami, t],
  );

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={[styles.header, { flexDirection }]}>
        <View style={[styles.headerIcon, { backgroundColor: progressColor }]}>
          <MaterialIcons name="menu-book" size={22} color="#ffffff" />
        </View>
        <Text
          variant="titleLarge"
          style={[styles.heading, { color: theme.colors.onSurface, textAlign, writingDirection }]}
        >
          {t("Hadith Collections")}
        </Text>
      </View>

      <Surface
        elevation={0}
        style={[
          styles.introCard,
          { backgroundColor: theme.colors.surface, borderColor: theme.colors.outlineVariant },
        ]}
      >
        <View style={[styles.introIcon, { backgroundColor: withAlpha(progressColor, 0.12) }]}>
          <MaterialIcons name="auto-awesome" size={21} color={progressColor} />
        </View>
        <View style={styles.introText}>
          <Text
            variant="titleSmall"
            style={[styles.introTitle, { color: theme.colors.onSurface, textAlign, writingDirection }]}
          >
            {t("Choose a Hadith collection")}
          </Text>
          <Text
            variant="bodySmall"
            style={[styles.introDescription, { color: theme.colors.onSurfaceVariant, textAlign, writingDirection }]}
          >
            {t("Choose a Hadith collection to read and study")}
          </Text>
        </View>
      </Surface>

      <View style={styles.list}>
        {collections.map((item) => (
          <CollectionCard
            key={item.id}
            item={item}
            progressColor={progressColor}
            isRtl={isRtl}
            language={language}
            textAlign={textAlign}
            writingDirection={writingDirection}
            flexDirection={flexDirection}
            t={t}
          />
        ))}
      </View>
    </ScrollView>
  );
};

export default memo(HadithCollections);

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 28 },
  header: { alignItems: "center", gap: 12, marginBottom: 16 },
  headerIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  heading: { flex: 1, fontWeight: "700" },
  introCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    marginBottom: 16,
  },
  introIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  introText: { flex: 1, gap: 2 },
  introTitle: { fontWeight: "700" },
  introDescription: { lineHeight: 18 },
  list: { gap: 10 },
  card: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, overflow: "hidden" },
  cardPressable: {
    alignItems: "center",
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 14,
    minHeight: 76,
  },
  accent: { position: "absolute", top: 0, bottom: 0, left: 0, width: 3.5 },
  collectionIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  cardBody: { flex: 1, gap: 2 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  title: { fontWeight: "700", flexShrink: 1 },
  badge: { paddingHorizontal: 7, paddingVertical: 1, borderRadius: 5 },
  description: { lineHeight: 18 },
  statsRow: { alignItems: "center", gap: 5, marginTop: 5 },
  statsText: { fontWeight: "700" },
});