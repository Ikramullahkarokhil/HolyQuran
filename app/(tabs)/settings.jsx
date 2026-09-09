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
import { IconButton, useTheme } from "react-native-paper";
import { useTranslation } from "react-i18next";
import {
  useQuranTranslationStore,
  useHadithTranslationStore,
  useAppLanguageStore,
} from "../../components/store/store";
import useThemeStore from "../../components/store/useThemeStore";
import {
  isRTL,
  getTextAlignment,
  getWritingDirection,
  getFlexDirection,
  getMarginStyle,
} from "../../components/utils/rtlUtils";

const colorWithAlpha = (color, alpha = 0.6) => {
  if (typeof color !== "string") {
    return color;
  }

  const normalized = color.trim().toLowerCase();
  if (normalized === "black") {
    return `rgba(0, 0, 0, ${alpha})`;
  }
  if (normalized === "white") {
    return `rgba(255, 255, 255, ${alpha})`;
  }

  if (normalized.startsWith("#")) {
    const hex = normalized.replace("#", "");
    const trimmedHex = hex.length === 8 ? hex.slice(0, 6) : hex;
    if (trimmedHex.length === 6) {
      const alphaHex = Math.round(alpha * 255)
        .toString(16)
        .padStart(2, "0");
      return `#${trimmedHex}${alphaHex}`;
    }
  }

  return color;
};

// ─── Extracted & Memoized Components (Improves Performance) ──────────────────

const RadioGroup = memo(
  ({ options, selectedValue, onSelect, theme, language, isRTLMode }) => {
    return (
      <View
        style={[
          styles.radioRow,
          isRTLMode && { flexDirection: getFlexDirection(language) },
          { backgroundColor: colorWithAlpha(theme.colors.outline, 0.08) },
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
                {
                  borderWidth: isSelected ? 1 : 0,
                  borderColor: isSelected
                    ? theme.colors.progressColor
                    : "transparent",
                },
                isSelected && {
                  backgroundColor: colorWithAlpha(
                    theme.colors.progressColor,
                    0.12,
                  ),
                },
                !isSelected && {
                  backgroundColor: colorWithAlpha(theme.colors.primary, 0.58),
                },
                pressed &&
                  !isSelected && {
                    backgroundColor: colorWithAlpha(theme.colors.outline, 0.15),
                  },
                pressed && isSelected && { opacity: 0.86 },
              ]}
              accessibilityRole="radio"
              accessibilityState={{ selected: isSelected }}
            >
              {opt.icon && (
                <IconButton
                  icon={opt.icon}
                  size={18}
                  iconColor={
                    isSelected
                      ? theme.colors.progressColor
                      : colorWithAlpha(theme.colors.textColor, 0.6)
                  }
                  style={styles.chipIcon}
                />
              )}
              <Text
                style={[
                  styles.chipLabel,
                  {
                    color: isSelected
                      ? theme.colors.progressColor
                      : colorWithAlpha(theme.colors.textColor, 0.8),
                    fontWeight: isSelected ? "700" : "500",
                    textAlign: getTextAlignment(language),
                    writingDirection: getWritingDirection(language),
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
);
RadioGroup.displayName = "RadioGroup";

const SectionHeader = memo(({ icon, title, theme, language, isRTLMode }) => (
  <View
    style={[
      styles.sectionHeader,
      isRTLMode && { flexDirection: getFlexDirection(language) },
    ]}
  >
    <View
      style={[
        styles.sectionIconWrap,
        { backgroundColor: colorWithAlpha(theme.colors.progressColor, 0.12) },
        isRTLMode && getMarginStyle(language, "right", 12),
      ]}
    >
      <IconButton
        icon={icon}
        size={20}
        iconColor={theme.colors.progressColor}
        style={styles.sectionIcon}
      />
    </View>
    <Text
      style={[
        styles.sectionTitle,
        {
          color: theme.colors.progressColor,
          textAlign: getTextAlignment(language),
          writingDirection: getWritingDirection(language),
        },
      ]}
    >
      {title}
    </Text>
  </View>
));
SectionHeader.displayName = "SectionHeader";

const SettingCard = memo(
  ({ icon, title, children, theme, language, isRTLMode }) => (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.colors.primary,
          borderColor: colorWithAlpha(theme.colors.outline, 0.1),
        },
      ]}
    >
      <View
        style={[
          styles.cardHeader,
          isRTLMode && { flexDirection: getFlexDirection(language) },
        ]}
      >
        <IconButton
          icon={icon}
          size={22}
          iconColor={theme.colors.progressColor}
          style={[
            styles.cardIcon,
            isRTLMode && getMarginStyle(language, "right", 8),
          ]}
        />
        <Text
          style={[
            styles.cardTitle,
            {
              color: theme.colors.textColor,
              textAlign: getTextAlignment(language),
              writingDirection: getWritingDirection(language),
            },
          ]}
        >
          {title}
        </Text>
      </View>
      {children}
    </View>
  ),
);
SettingCard.displayName = "SettingCard";

// ─── Main Component ──────────────────────────────────────────────────────────

const Settings = () => {
  const theme = useTheme();
  const { t, i18n } = useTranslation();

  const { translationLanguage, setTranslationLanguage } =
    useQuranTranslationStore();
  const {
    translationLanguage: hadithTranslationLanguage,
    setTranslationLanguage: setHadithTranslationLanguage,
  } = useHadithTranslationStore();
  const { themeMode, setThemeMode } = useThemeStore();
  const { language, setLanguage } = useAppLanguageStore();

  const colorScheme = useColorScheme();
  const isRTLMode = isRTL(language);

  // ─── Options ───────────────────────────────────────────────────────────────
  const appLanguages = useMemo(
    () => [
      { label: "English", value: "en", icon: "language-html5" },
      { label: "پښتو", value: "pa", icon: "web" },
      { label: "دری", value: "da", icon: "translate" },
    ],
    [],
  );

  const quranLanguages = useMemo(
    () => [
      { label: "English", value: "english", icon: "book-open-page-variant" },
      { label: "پښتو", value: "pashto", icon: "web" },
      { label: "دری", value: "dari", icon: "translate" },
    ],
    [],
  );

  const hadithLanguages = useMemo(
    () => [
      { label: "English", value: "english", icon: "book-open-variant" },
      { label: "العربية", value: "arabic", icon: "script-text" },
    ],
    [],
  );

  const themeOptions = useMemo(
    () => [
      { label: t("System"), value: "system", icon: "theme-light-dark" },
      { label: t("Light"), value: "light", icon: "white-balance-sunny" },
      { label: t("Dark"), value: "dark", icon: "moon-waning-crescent" },
    ],
    [t],
  );

  // ─── Handlers (stable) ─────────────────────────────────────────────────────
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

  return (
    <ScrollView
      style={[styles.root, { backgroundColor: theme.colors.background }]}
      contentContainerStyle={styles.container}
      showsVerticalScrollIndicator={false}
    >
      {/* ── Language Settings ─────────────────────────────────────────────── */}
      <View style={styles.section}>
        <SectionHeader
          icon="translate"
          title={t("Language Settings")}
          theme={theme}
          language={language}
          isRTLMode={isRTLMode}
        />

        <SettingCard
          icon="earth"
          title={t("App Language")}
          theme={theme}
          language={language}
          isRTLMode={isRTLMode}
        >
          <RadioGroup
            options={appLanguages}
            selectedValue={language}
            onSelect={handleAppLanguage}
            theme={theme}
            language={language}
            isRTLMode={isRTLMode}
          />
        </SettingCard>

        <SettingCard
          icon="book-open-variant"
          title={t("Quran Translation")}
          theme={theme}
          language={language}
          isRTLMode={isRTLMode}
        >
          <RadioGroup
            options={quranLanguages}
            selectedValue={translationLanguage}
            onSelect={handleQuranLanguage}
            theme={theme}
            language={language}
            isRTLMode={isRTLMode}
          />
        </SettingCard>

        <SettingCard
          icon="book-open-page-variant"
          title={t("Hadith Translation")}
          theme={theme}
          language={language}
          isRTLMode={isRTLMode}
        >
          <RadioGroup
            options={hadithLanguages}
            selectedValue={hadithTranslationLanguage}
            onSelect={handleHadithLanguage}
            theme={theme}
            language={language}
            isRTLMode={isRTLMode}
          />
        </SettingCard>
      </View>

      {/* ── Appearance ────────────────────────────────────────────────────── */}
      <View style={styles.section}>
        <SectionHeader
          icon="palette"
          title={t("Appearance")}
          theme={theme}
          language={language}
          isRTLMode={isRTLMode}
        />

        <SettingCard
          icon="theme-light-dark"
          title={t("Theme")}
          theme={theme}
          language={language}
          isRTLMode={isRTLMode}
        >
          <RadioGroup
            options={themeOptions}
            selectedValue={themeMode}
            onSelect={handleTheme}
            theme={theme}
            language={language}
            isRTLMode={isRTLMode}
          />
        </SettingCard>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  container: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 40,
  },
  section: {
    marginBottom: 32,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
    gap: 12,
  },
  sectionIconWrap: {
    borderRadius: 12,
    padding: 2,
  },
  sectionIcon: {
    margin: 0,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  card: {
    borderRadius: 20,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.03,
        shadowRadius: 8,
      },
      android: { elevation: 1 },
    }),
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
    gap: 8,
  },
  cardIcon: {
    margin: 0,
    marginLeft: -8,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "600",
    letterSpacing: 0.2,
  },
  radioRow: {
    flexDirection: "row",
    borderRadius: 14,
    padding: 4,
    gap: 4,
  },
  radioChip: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderRadius: 10,
    minHeight: 46,
  },
  chipIcon: {
    margin: 0,
    marginRight: -4,
  },
  chipLabel: {
    fontSize: 14,
    letterSpacing: 0.2,
  },
});

export default Settings;
