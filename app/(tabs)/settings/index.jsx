import React, { useCallback, useMemo, memo } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  useColorScheme,
  ScrollView,
  Platform,
} from "react-native";
import { Icon, useTheme } from "react-native-paper";
import { useTranslation } from "react-i18next";
import {
  useQuranTranslationStore,
  useHadithTranslationStore,
  useAppLanguageStore,
} from "../../../components/store/store";
import useThemeStore from "../../../components/store/useThemeStore";
import { useReciterStore } from "../../../components/store/useReciterStore";
import { getReciterById } from "../../../components/reciters.js";
import {
  getTextAlignment,
  getWritingDirection,
  getFlexDirection,
} from "../../../components/utils/rtlUtils";
import { useRouter } from "expo-router";

// ─── Shared alpha helper ────────────────────────────────────────────────────

const withAlpha = (color, alpha) => {
  if (!color || typeof color !== "string") {
    return `rgba(37, 135, 216, ${alpha})`;
  }
  if (color.startsWith("#")) {
    const raw = color.replace("#", "");
    const normalized =
      raw.length === 3
        ? raw
            .split("")
            .map((c) => c + c)
            .join("")
        : raw.length === 8
          ? raw.slice(0, 6)
          : raw;
    if (normalized.length !== 6) {
      return `rgba(37, 135, 216, ${alpha})`;
    }
    const r = Number.parseInt(normalized.slice(0, 2), 16);
    const g = Number.parseInt(normalized.slice(2, 4), 16);
    const b = Number.parseInt(normalized.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  const lower = color.trim().toLowerCase();
  if (lower === "black") return `rgba(0,0,0,${alpha})`;
  if (lower === "white") return `rgba(255,255,255,${alpha})`;
  return `rgba(37, 135, 216, ${alpha})`;
};

// ─── Radio chip group ───────────────────────────────────────────────────────

const RadioGroup = memo(
  ({
    options,
    selectedValue,
    onSelect,
    progressColor,
    textColor,
    primaryColor,
    outlineColor,
    flexDir,
    textAlign,
    writingDir,
  }) => {
    return (
      <View
        style={[
          styles.radioRow,
          {
            flexDirection: flexDir,
            backgroundColor: withAlpha(outlineColor || "#000", 0.06),
          },
        ]}
      >
        {options.map((opt) => {
          const isSelected = selectedValue === opt.value;
          return (
            <Pressable
              key={opt.value}
              onPress={() => onSelect(opt.value)}
              style={({ pressed }) => [
                styles.radioChip,
                isSelected
                  ? {
                      backgroundColor: withAlpha(progressColor, 0.14),
                      borderColor: progressColor,
                      borderWidth: StyleSheet.hairlineWidth * 2,
                    }
                  : {
                      backgroundColor: withAlpha(primaryColor, 0.35),
                      borderColor: "transparent",
                      borderWidth: StyleSheet.hairlineWidth * 2,
                    },
                pressed && { opacity: 0.88 },
              ]}
              accessibilityRole="radio"
              accessibilityState={{ selected: isSelected }}
              accessibilityLabel={opt.label}
            >
              {opt.icon ? (
                <Icon
                  source={opt.icon}
                  size={18}
                  color={
                    isSelected ? progressColor : withAlpha(textColor, 0.55)
                  }
                />
              ) : null}
              <Text
                style={[
                  styles.chipLabel,
                  {
                    color: isSelected
                      ? progressColor
                      : withAlpha(textColor, 0.82),
                    fontWeight: isSelected ? "700" : "500",
                    textAlign,
                    writingDirection: writingDir,
                  },
                ]}
                numberOfLines={1}
              >
                {opt.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    );
  },
  (prev, next) =>
    prev.selectedValue === next.selectedValue &&
    prev.onSelect === next.onSelect &&
    prev.progressColor === next.progressColor &&
    prev.textColor === next.textColor &&
    prev.primaryColor === next.primaryColor &&
    prev.outlineColor === next.outlineColor &&
    prev.flexDir === next.flexDir &&
    prev.options === next.options,
);
RadioGroup.displayName = "RadioGroup";

// ─── Section header ─────────────────────────────────────────────────────────

const SectionHeader = memo(
  ({ icon, title, progressColor, flexDir, textAlign, writingDir }) => (
    <View style={[styles.sectionHeader, { flexDirection: flexDir }]}>
      <View
        style={[
          styles.sectionIconWrap,
          { backgroundColor: withAlpha(progressColor, 0.12) },
        ]}
      >
        <Icon source={icon} size={18} color={progressColor} />
      </View>
      <Text
        style={[
          styles.sectionTitle,
          {
            color: progressColor,
            textAlign,
            writingDirection: writingDir,
          },
        ]}
      >
        {title}
      </Text>
    </View>
  ),
  (prev, next) =>
    prev.icon === next.icon &&
    prev.title === next.title &&
    prev.progressColor === next.progressColor &&
    prev.flexDir === next.flexDir,
);
SectionHeader.displayName = "SectionHeader";

// ─── Setting card ───────────────────────────────────────────────────────────

const SettingCard = memo(
  ({
    icon,
    title,
    children,
    primaryColor,
    progressColor,
    textColor,
    outlineColor,
    flexDir,
    textAlign,
    writingDir,
  }) => (
    <View
      style={[
        styles.card,
        {
          backgroundColor: primaryColor,
          borderColor: withAlpha(outlineColor || "#000", 0.08),
        },
      ]}
    >
      <View style={[styles.cardHeader, { flexDirection: flexDir }]}>
        <View
          style={[
            styles.cardIconWrap,
            { backgroundColor: withAlpha(progressColor, 0.12) },
          ]}
        >
          <Icon source={icon} size={18} color={progressColor} />
        </View>
        <Text
          style={[
            styles.cardTitle,
            {
              color: textColor,
              textAlign,
              writingDirection: writingDir,
            },
          ]}
        >
          {title}
        </Text>
      </View>
      {children}
    </View>
  ),
  (prev, next) =>
    prev.icon === next.icon &&
    prev.title === next.title &&
    prev.primaryColor === next.primaryColor &&
    prev.progressColor === next.progressColor &&
    prev.textColor === next.textColor &&
    prev.outlineColor === next.outlineColor &&
    prev.flexDir === next.flexDir &&
    prev.children === next.children,
);
SettingCard.displayName = "SettingCard";

// ─── Main ───────────────────────────────────────────────────────────────────

const Settings = () => {
  const theme = useTheme();
  const { t, i18n } = useTranslation();

  const router = useRouter();

  const { translationLanguage, setTranslationLanguage } =
    useQuranTranslationStore();
  const {
    translationLanguage: hadithTranslationLanguage,
    setTranslationLanguage: setHadithTranslationLanguage,
  } = useHadithTranslationStore();
  const { themeMode, setThemeMode } = useThemeStore();
  const { language, setLanguage } = useAppLanguageStore();
  const { reciterId } = useReciterStore();

  const currentReciter = useMemo(() => getReciterById(reciterId), [reciterId]);

  const colorScheme = useColorScheme();
  const progressColor = theme.colors.progressColor;
  const textColor = theme.colors.textColor || theme.colors.onSurface;
  const primaryColor = theme.colors.primary;
  const backgroundColor = theme.colors.background;
  const outlineColor = theme.colors.outline || theme.colors.outlineVariant;

  const flexDir = getFlexDirection(language);
  const textAlign = getTextAlignment(language);
  const writingDir = getWritingDirection(language);

  const appLanguages = useMemo(
    () => [
      { label: t("English"), value: "en", icon: "translate" },
      { label: t("Pashto"), value: "pa", icon: "web" },
      { label: t("Dari"), value: "da", icon: "script-text" },
    ],
    [t],
  );

  const quranLanguages = useMemo(
    () => [
      { label: t("English"), value: "english", icon: "book-open-page-variant" },
      { label: t("Pashto"), value: "pashto", icon: "web" },
      { label: t("Dari"), value: "dari", icon: "translate" },
    ],
    [t],
  );

  const hadithLanguages = useMemo(
    () => [
      { label: t("English"), value: "english", icon: "book-open-variant" },
      { label: t("Arabic"), value: "arabic", icon: "script-text" },
    ],
    [t],
  );

  const themeOptions = useMemo(
    () => [
      { label: t("System"), value: "system", icon: "theme-light-dark" },
      { label: t("Light"), value: "light", icon: "white-balance-sunny" },
      { label: t("Dark"), value: "dark", icon: "moon-waning-crescent" },
    ],
    [t],
  );

  const handleAppLanguage = useCallback(
    async (value) => {
      await setLanguage(value);
      i18n.changeLanguage(value);
    },
    [setLanguage, i18n],
  );

  const handleQuranLanguage = useCallback(
    (value) => {
      setTranslationLanguage(value);
    },
    [setTranslationLanguage],
  );

  const handleHadithLanguage = useCallback(
    (value) => {
      setHadithTranslationLanguage(value);
    },
    [setHadithTranslationLanguage],
  );

  const handleTheme = useCallback(
    async (value) => {
      if (value === "system") {
        await setThemeMode("system", colorScheme === "dark");
      } else {
        await setThemeMode(value);
      }
    },
    [setThemeMode, colorScheme],
  );

  const sharedRadioProps = useMemo(
    () => ({
      progressColor,
      textColor,
      primaryColor,
      outlineColor,
      flexDir,
      textAlign,
      writingDir,
    }),
    [
      progressColor,
      textColor,
      primaryColor,
      outlineColor,
      flexDir,
      textAlign,
      writingDir,
    ],
  );

  const sharedCardProps = useMemo(
    () => ({
      primaryColor,
      progressColor,
      textColor,
      outlineColor,
      flexDir,
      textAlign,
      writingDir,
    }),
    [
      primaryColor,
      progressColor,
      textColor,
      outlineColor,
      flexDir,
      textAlign,
      writingDir,
    ],
  );

  return (
    <ScrollView
      style={[styles.root, { backgroundColor }]}
      contentContainerStyle={styles.container}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      {/* Audio Settings */}
      <View style={styles.section}>
        <SectionHeader
          icon="account-voice"
          title={t("Audio Settings")}
          progressColor={progressColor}
          flexDir={flexDir}
          textAlign={textAlign}
          writingDir={writingDir}
        />

        <SettingCard
          icon="account-music"
          title={t("Default Reciter")}
          {...sharedCardProps}
        >
          {/* <Link href={"/ReciterSelect"} asChild accessibilityRole="button"> */}
          <Pressable
            onPress={() => router.navigate("/ReciterSelect")}
            style={({ pressed }) => [
              styles.navRow,
              {
                flexDirection: flexDir,
                backgroundColor: withAlpha(outlineColor || "#000", 0.06),
              },
              pressed && { opacity: 0.8 },
            ]}
          >
            <View style={styles.navRowContent}>
              <Text
                style={[
                  styles.navRowTitle,
                  {
                    color: textColor,
                    textAlign,
                    writingDirection: writingDir,
                  },
                ]}
              >
                {currentReciter?.name || "Alafasy"}
              </Text>
              <Text
                style={[
                  styles.navRowSubtitle,
                  {
                    color: withAlpha(textColor, 0.6),
                    textAlign,
                    writingDirection: writingDir,
                  },
                ]}
              >
                {currentReciter?.bitrate || "128kbps"}
              </Text>
            </View>
            <Icon
              source={
                flexDir === "row-reverse" ? "chevron-left" : "chevron-right"
              }
              size={22}
              color={withAlpha(textColor, 0.5)}
            />
          </Pressable>
          {/* </Link> */}
        </SettingCard>
      </View>

      {/* Language */}
      <View style={styles.section}>
        <SectionHeader
          icon="translate"
          title={t("Language Settings")}
          progressColor={progressColor}
          flexDir={flexDir}
          textAlign={textAlign}
          writingDir={writingDir}
        />

        <SettingCard
          icon="earth"
          title={t("App Language")}
          {...sharedCardProps}
        >
          <RadioGroup
            options={appLanguages}
            selectedValue={language}
            onSelect={handleAppLanguage}
            {...sharedRadioProps}
          />
        </SettingCard>

        <SettingCard
          icon="book-open-variant"
          title={t("Quran Translation")}
          {...sharedCardProps}
        >
          <RadioGroup
            options={quranLanguages}
            selectedValue={translationLanguage}
            onSelect={handleQuranLanguage}
            {...sharedRadioProps}
          />
        </SettingCard>

        <SettingCard
          icon="book-open-page-variant"
          title={t("Hadith Translation")}
          {...sharedCardProps}
        >
          <RadioGroup
            options={hadithLanguages}
            selectedValue={hadithTranslationLanguage}
            onSelect={handleHadithLanguage}
            {...sharedRadioProps}
          />
        </SettingCard>
      </View>

      {/* Appearance */}
      <View style={styles.section}>
        <SectionHeader
          icon="palette"
          title={t("Appearance")}
          progressColor={progressColor}
          flexDir={flexDir}
          textAlign={textAlign}
          writingDir={writingDir}
        />

        <SettingCard
          icon="theme-light-dark"
          title={t("Theme")}
          {...sharedCardProps}
        >
          <RadioGroup
            options={themeOptions}
            selectedValue={themeMode}
            onSelect={handleTheme}
            {...sharedRadioProps}
          />
        </SettingCard>
      </View>
    </ScrollView>
  );
};

export default Settings;

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  container: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 40,
  },
  section: {
    marginBottom: 28,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 14,
    gap: 10,
  },
  sectionIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.7,
  },
  card: {
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    borderWidth: StyleSheet.hairlineWidth,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.04,
        shadowRadius: 8,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 14,
    gap: 10,
  },
  cardIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: "600",
    letterSpacing: 0.15,
  },
  radioRow: {
    flexDirection: "row",
    borderRadius: 12,
    padding: 4,
    gap: 4,
  },
  radioChip: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 11,
    paddingHorizontal: 6,
    borderRadius: 10,
    minHeight: 46,
  },
  chipLabel: {
    fontSize: 13.5,
    letterSpacing: 0.15,
  },
  navRow: {
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    alignItems: "center",
    justifyContent: "space-between",
  },
  navRowContent: {
    flex: 1,
    gap: 2,
  },
  navRowTitle: {
    fontSize: 15,
    fontWeight: "600",
  },
  navRowSubtitle: {
    fontSize: 12,
  },
});
