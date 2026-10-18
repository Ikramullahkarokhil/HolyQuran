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
import { getHadithCollectionStats } from "../../components/hadithData";

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
    return number.replace(/[0-9]/g, (digit) => "۰۱۲۳۴۵۶۷۸۹"[Number(digit)]);
  }
  return number;
};

const CollectionCard = memo(
  ({
    item,
    colors,
    isRtl,
    language,
    textAlign,
    writingDirection,
    flexDirection,
    t,
  }) => {
    const available = item.available;
    const iconColor = available ? colors.progress : colors.disabled;
    const titleColor = available ? colors.text : colors.disabled;
    const descriptionColor = available ? colors.secondary : colors.disabled;
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
              ? colors.surface
              : colors.disabledSurface,
            borderColor: available ? colors.cardBorder : colors.outline,
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
          android_ripple={{
            color: colors.ripple,
            borderless: false,
          }}
          style={({ pressed }) => [
            styles.cardPressable,
            {
              flexDirection,
              opacity: pressed && available ? 0.88 : 1,
              transform: [{ scale: pressed && available ? 0.985 : 1 }],
            },
          ]}
        >
          {available && (
            <View
              style={[styles.accent, { backgroundColor: colors.progress }]}
            />
          )}

          <View
            style={[
              styles.collectionIcon,
              {
                backgroundColor: available
                  ? colors.iconBackground
                  : colors.disabledIconBackground,
              },
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
                style={[
                  styles.title,
                  { color: titleColor, textAlign, writingDirection },
                ]}
              >
                {item.title}
              </Text>

              {!available && (
                <View
                  style={[
                    styles.badge,
                    { backgroundColor: withAlpha(colors.secondary, 0.12) },
                  ]}
                >
                  <Text
                    variant="labelSmall"
                    style={{ color: colors.secondary, fontWeight: "600" }}
                  >
                    {t("Soon")}
                  </Text>
                </View>
              )}
            </View>

            <Text
              variant="bodySmall"
              numberOfLines={2}
              style={[
                styles.description,
                { color: descriptionColor, textAlign, writingDirection },
              ]}
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
                <MaterialIcons
                  name="format-list-numbered"
                  size={14}
                  color={iconColor}
                />
                <Text
                  variant="labelSmall"
                  style={[
                    styles.statsText,
                    { color: iconColor, writingDirection },
                  ]}
                >
                  {getLocalizedNumber(item.hadithCount, language)}{" "}
                  {t("hadiths")}
                  {item.bookCount
                    ? `  ·  ${getLocalizedNumber(item.bookCount, language)} ${t(
                        "books",
                      )}`
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

  const colors = useMemo(
    () => ({
      progress: progressColor,
      text: theme.colors.onSurface,
      secondary: theme.colors.onSurfaceVariant,
      disabled: theme.colors.onSurfaceDisabled,
      surface: theme.colors.surface,
      background: theme.colors.background,
      outlineVariant: theme.colors.outlineVariant,
      outline: theme.colors.outlineVariant,
      cardBorder: withAlpha(progressColor, 0.22),
      ripple: withAlpha(progressColor, 0.14),
      iconBackground: withAlpha(progressColor, 0.12),
      disabledIconBackground: withAlpha(progressColor, 0.06),
      disabledSurface:
        theme.colors.surfaceDisabled || withAlpha(theme.colors.onSurface, 0.04),
    }),
    [progressColor, theme.colors],
  );

  const flexDirection = getFlexDirection(language);
  const textAlign = getTextAlignment(language);
  const writingDirection = getWritingDirection(language);
  const isRtl = textAlign === "right";

  const handleNavigateCollection = useCallback(
    (collection) => () =>
      router.push({ pathname: "/HadithBooks", params: { collection } }),
    [router],
  );

  const handleNavigateJawami = useCallback(
    () => router.push("/JawamiAlKalim"),
    [router],
  );

  // Pre-compute stats once
  const bukhariStats = useMemo(() => getHadithCollectionStats("bukhari"), []);
  const muslimStats = useMemo(() => getHadithCollectionStats("muslim"), []);
  const tirmidhiStats = useMemo(() => getHadithCollectionStats("tirmidhi"), []);
  const abiDawudStats = useMemo(
    () => getHadithCollectionStats("abi-dawud"),
    [],
  );
  const nasaiStats = useMemo(() => getHadithCollectionStats("an-nasai"), []);
  const ibnMajahStats = useMemo(
    () => getHadithCollectionStats("ibn-majah"),
    [],
  );

  const collections = useMemo(
    () => [
      {
        id: "bukhari",
        title: t("Sahih Bukhari"),
        description: t("Browse the complete Sahih Bukhari collection"),
        icon: "menu-book",
        hadithCount: bukhariStats.hadithCount,
        bookCount: bukhariStats.bookCount,
        available: true,
        onPress: handleNavigateCollection("bukhari"),
      },
      {
        id: "muslim",
        title: t("Sahih Muslim"),
        description: t("Browse the complete Sahih Muslim collection"),
        icon: "library-books",
        hadithCount: muslimStats.hadithCount,
        bookCount: muslimStats.bookCount,
        available: true,
        onPress: handleNavigateCollection("muslim"),
      },
      {
        id: "tirmidhi",
        title: t("Jami at-Tirmidhi"),
        description: t("Browse the complete Jami at-Tirmidhi collection"),
        icon: "menu-book",
        hadithCount: tirmidhiStats.hadithCount,
        bookCount: tirmidhiStats.bookCount,
        available: true,
        onPress: handleNavigateCollection("tirmidhi"),
      },
      {
        id: "abi-dawud",
        title: t("Sunan Abi Dawud"),
        description: t("Browse the complete Sunan Abi Dawud collection"),
        icon: "library-books",
        hadithCount: abiDawudStats.hadithCount,
        bookCount: abiDawudStats.bookCount,
        available: true,
        onPress: handleNavigateCollection("abi-dawud"),
      },
      {
        id: "an-nasai",
        title: t("Sunan an-Nasai"),
        description: t("Browse the complete Sunan an-Nasai collection"),
        icon: "menu-book",
        hadithCount: nasaiStats.hadithCount,
        bookCount: nasaiStats.bookCount,
        available: true,
        onPress: handleNavigateCollection("an-nasai"),
      },
      {
        id: "ibn-majah",
        title: t("Sunan Ibn Majah"),
        description: t("Browse the complete Sunan Ibn Majah collection"),
        icon: "library-books",
        hadithCount: ibnMajahStats.hadithCount,
        bookCount: ibnMajahStats.bookCount,
        available: true,
        onPress: handleNavigateCollection("ibn-majah"),
      },
      {
        id: "jawami-al-kalim",
        title: t("Jawami al-Kalim"),
        description: t("Explore concise Hadiths with deep meanings"),
        icon: "auto-awesome",
        hadithCount: 100,
        available: true,
        onPress: handleNavigateJawami,
      },
    ],
    [
      t,
      handleNavigateCollection,
      handleNavigateJawami,
      bukhariStats,
      muslimStats,
      tirmidhiStats,
      abiDawudStats,
      nasaiStats,
      ibnMajahStats,
    ],
  );

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      {/* Intro Card */}
      <Surface
        elevation={0}
        style={[
          styles.introCard,
          {
            backgroundColor: colors.surface,
            borderColor: colors.outlineVariant,
          },
        ]}
      >
        <View
          style={[styles.introIcon, { backgroundColor: colors.iconBackground }]}
        >
          <MaterialIcons name="auto-awesome" size={22} color={progressColor} />
        </View>

        <View style={styles.introText}>
          <Text
            variant="titleSmall"
            style={[
              styles.introTitle,
              { color: colors.text, textAlign, writingDirection },
            ]}
          >
            {t("Choose a Hadith collection")}
          </Text>
          <Text
            variant="bodySmall"
            style={[
              styles.introDescription,
              {
                color: colors.secondary,
                textAlign,
                writingDirection,
              },
            ]}
          >
            {t("Choose a Hadith collection to read and study")}
          </Text>
        </View>
      </Surface>

      {/* Collections List */}
      <View style={styles.list}>
        {collections.map((item) => (
          <CollectionCard
            key={item.id}
            item={item}
            colors={colors}
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
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 32,
  },
  introCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 16,
    paddingHorizontal: 16,
    marginBottom: 18,
  },
  introIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  introText: {
    flex: 1,
    gap: 3,
  },
  introTitle: {
    fontWeight: "700",
    letterSpacing: -0.2,
  },
  introDescription: {
    lineHeight: 19,
    opacity: 0.92,
  },
  list: {
    gap: 11,
  },
  card: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  cardPressable: {
    alignItems: "center",
    gap: 12,
    paddingVertical: 15,
    paddingHorizontal: 14,
    minHeight: 80,
  },
  accent: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    width: 3.5,
    borderTopLeftRadius: 16,
    borderBottomLeftRadius: 16,
  },
  collectionIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  cardBody: {
    flex: 1,
    gap: 3,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  title: {
    fontWeight: "700",
    flexShrink: 1,
    letterSpacing: -0.15,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  description: {
    lineHeight: 18.5,
    opacity: 0.95,
  },
  statsRow: {
    alignItems: "center",
    gap: 5,
    marginTop: 6,
  },
  statsText: {
    fontWeight: "600",
    letterSpacing: 0.1,
  },
});
