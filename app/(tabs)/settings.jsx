import React from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  useColorScheme,
  ScrollView,
} from "react-native";
import { IconButton, useTheme } from "react-native-paper";
import { useTranslation } from "react-i18next";
import { useActionSheet } from "@expo/react-native-action-sheet";
import useQuranTranslationStore from "../../components/store/store";
import useThemeStore from "../../components/store/useThemeStore";

const Settings = () => {
  const theme = useTheme();
  const { t, i18n } = useTranslation();
  const { showActionSheetWithOptions } = useActionSheet();
  const { translationLanguage, setTranslationLanguage } =
    useQuranTranslationStore();
  const { themeMode, setThemeMode } = useThemeStore();
  const colorScheme = useColorScheme();

  const appLanguages = [
    { label: "English", value: "en" },
    { label: "پښتو", value: "pa" },
    { label: "دری", value: "da" },
  ];

  const quranLanguages = [
    { label: "English", value: "english" },
    { label: "پښتو", value: "pashto" },
    { label: "دری", value: "dari" },
  ];

  const getActionSheetStyles = () => ({
    textStyle: { color: theme.colors.textColor },
    titleTextStyle: {
      color: theme.colors.textColor,
      textAlign: "center",
      width: "100%",
      marginBottom: 8,
      fontSize: 16,
      fontWeight: "600",
    },
    containerStyle: {
      backgroundColor: theme.colors.primary,
    },
    messageTextStyle: {
      textAlign: "center",
      color: theme.colors.textColor,
    },
  });

  const handleAppLanguageSelect = () => {
    const options = [...appLanguages.map((lang) => lang.label), t("Cancel")];
    const cancelButtonIndex = options.length - 1;
    const styles = getActionSheetStyles();

    showActionSheetWithOptions(
      {
        options,
        cancelButtonIndex,
        title: t("Choose your preferred app language"),
        ...styles,
      },
      (selectedIndex) => {
        if (
          selectedIndex !== cancelButtonIndex &&
          selectedIndex !== undefined
        ) {
          i18n.changeLanguage(appLanguages[selectedIndex].value);
        }
      }
    );
  };

  const handleQuranLanguageSelect = () => {
    const options = [...quranLanguages.map((lang) => lang.label), t("Cancel")];
    const cancelButtonIndex = options.length - 1;
    const styles = getActionSheetStyles();

    showActionSheetWithOptions(
      {
        options,
        cancelButtonIndex,
        title: t("Choose Your Preferred Quran Translation"),
        ...styles,
      },
      (selectedIndex) => {
        if (
          selectedIndex !== cancelButtonIndex &&
          selectedIndex !== undefined
        ) {
          setTranslationLanguage(quranLanguages[selectedIndex].value);
        }
      }
    );
  };

  const handleThemeSelect = () => {
    const options = [t("System Default"), t("Light"), t("Dark"), t("Cancel")];
    const cancelButtonIndex = options.length - 1;
    const styles = getActionSheetStyles();

    showActionSheetWithOptions(
      {
        options,
        cancelButtonIndex,
        title: t("Select Theme"),
        ...styles,
      },
      async (selectedIndex) => {
        if (
          selectedIndex !== undefined &&
          selectedIndex !== cancelButtonIndex
        ) {
          const themeOptions = ["system", "light", "dark"];
          const selectedTheme = themeOptions[selectedIndex];

          if (selectedTheme === "system") {
            await setThemeMode("system", colorScheme === "dark");
          } else {
            await setThemeMode(selectedTheme);
          }
        }
      }
    );
  };

  const getThemeText = () => {
    switch (themeMode) {
      case "system":
        return t("System Default");
      case "light":
        return t("Light");
      case "dark":
        return t("Dark");
      default:
        return t("System Default");
    }
  };

  return (
    <ScrollView
      style={[styles.root, { backgroundColor: theme.colors.background }]}
      contentContainerStyle={styles.container}
      showsVerticalScrollIndicator={false}
    >
      {/* Language Section */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionIconWrap}>
            <IconButton
              icon="translate"
              size={22}
              iconColor={theme.colors.progressColor}
              style={styles.sectionIcon}
            />
          </View>
          <Text
            style={[styles.sectionTitle, { color: theme.colors.textColor }]}
          >
            {t("Language Settings")}
          </Text>
        </View>
        <View
          style={[
            styles.card,
            styles.cardGradient,
            { backgroundColor: theme.colors.primary },
          ]}
        >
          <View style={styles.cardHeader}>
            <IconButton
              icon="earth"
              size={18}
              iconColor={theme.colors.progressColor}
              style={styles.cardIcon}
            />
            <Text style={[styles.title, { color: theme.colors.textColor }]}>
              {t("App Language")}
            </Text>
          </View>
          <Pressable
            onPress={handleAppLanguageSelect}
            style={({ pressed }) => [
              styles.selector,
              { backgroundColor: theme.colors.background },
              pressed && styles.selectorPressed,
            ]}
          >
            <Text
              style={[styles.selectorText, { color: theme.colors.textColor }]}
            >
              {appLanguages.find((lang) => lang.value === i18n.language)
                ?.label || "English"}
            </Text>
            <IconButton icon="chevron-right" size={20} />
          </Pressable>
        </View>
        <View
          style={[
            styles.card,
            styles.cardGradient,
            { backgroundColor: theme.colors.primary },
          ]}
        >
          <View style={styles.cardHeader}>
            <IconButton
              icon="book-open-variant"
              size={18}
              iconColor={theme.colors.progressColor}
              style={styles.cardIcon}
            />
            <Text style={[styles.title, { color: theme.colors.textColor }]}>
              {t("Quran Translation")}
            </Text>
          </View>
          <Pressable
            onPress={handleQuranLanguageSelect}
            style={({ pressed }) => [
              styles.selector,
              { backgroundColor: theme.colors.background },
              pressed && styles.selectorPressed,
            ]}
          >
            <Text
              style={[styles.selectorText, { color: theme.colors.textColor }]}
            >
              {quranLanguages.find((lang) => lang.value === translationLanguage)
                ?.label || "English"}
            </Text>
            <IconButton icon="chevron-right" size={20} />
          </Pressable>
        </View>
      </View>
      {/* Appearance Section */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionIconWrap}>
            <IconButton
              icon="palette"
              size={22}
              iconColor={theme.colors.progressColor}
              style={styles.sectionIcon}
            />
          </View>
          <Text
            style={[styles.sectionTitle, { color: theme.colors.textColor }]}
          >
            {t("Appearance")}
          </Text>
        </View>
        <View
          style={[
            styles.card,
            styles.cardGradient,
            { backgroundColor: theme.colors.primary },
          ]}
        >
          <View style={styles.cardHeader}>
            <IconButton
              icon="theme-light-dark"
              size={18}
              iconColor={theme.colors.progressColor}
              style={styles.cardIcon}
            />
            <Text style={[styles.title, { color: theme.colors.textColor }]}>
              {t("Theme")}
            </Text>
          </View>
          <Pressable
            onPress={handleThemeSelect}
            style={({ pressed }) => [
              styles.selector,
              { backgroundColor: theme.colors.background },
              pressed && styles.selectorPressed,
            ]}
          >
            <Text
              style={[styles.selectorText, { color: theme.colors.textColor }]}
            >
              {getThemeText()}
            </Text>
            <IconButton icon="chevron-right" size={20} />
          </Pressable>
        </View>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  container: {
    padding: 16,
  },
  section: {
    marginBottom: 10,
    paddingHorizontal: 2,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
    gap: 8,
  },
  sectionIconWrap: {
    backgroundColor: "rgba(0,0,0,0.04)",
    borderRadius: 8,
    padding: 4,
    marginRight: 4,
  },
  sectionIcon: {
    margin: 0,
    padding: 0,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    opacity: 0.8,
    letterSpacing: 0.5,
  },
  card: {
    backgroundColor: "white",
    borderRadius: 18,
    padding: 14,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 6,
    minHeight: 80,
  },
  cardGradient: {
    // Subtle gradient effect
    backgroundColor: "white",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.04)",
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
    gap: 6,
  },
  cardIcon: {
    marginRight: 2,
    marginLeft: -4,
  },
  title: {
    fontSize: 14,
    fontWeight: "500",
    marginBottom: 0,
    letterSpacing: 0.1,
  },
  selector: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 10,
    borderRadius: 12,
    marginTop: 6,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.04)",
    transition: "background-color 0.2s",
  },
  selectorPressed: {
    backgroundColor: "rgba(0,0,0,0.07)",
  },
  selectorText: {
    fontSize: 13,
    fontWeight: "400",
  },
  themeContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 8,
  },
  themeText: {
    fontSize: 15,
  },
});

export default Settings;
