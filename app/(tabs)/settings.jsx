import React, { useEffect } from "react";
import { StyleSheet, Text, View, Switch } from "react-native";
import { useTheme } from "react-native-paper";
import { useTranslation } from "react-i18next";
import SelectDropdown from "react-native-select-dropdown";
import useQuranTranslationStore from "../../components/store/store";
import useThemeStore from "../../components/store/useThemeStore";

const Settings = () => {
  const { t, i18n } = useTranslation();
  const { isDarkTheme, toggleTheme } = useThemeStore();
  const theme = useTheme();

  const handleThemeToggle = () => {
    toggleTheme();
  };
  const languages = [
    { label: "English", value: "en" },
    { label: "پښتو", value: "pa" },
    { label: "دری", value: "da" },
  ];

  const quranTranslation = [
    { label: "English", value: "english" },
    { label: "پښتو", value: "pashto" },
    { label: "دری", value: "dari" },
  ];

  const {
    translationLanguage,
    setTranslationLanguage,
    initializeTranslationLanguage,
  } = useQuranTranslationStore();

  useEffect(() => {
    initializeTranslationLanguage();
  }, []);

  const changeLanguage = (lng) => {
    i18n.changeLanguage(lng);
  };

  const defaultLanguageLabel =
    languages.find((lang) => lang.value === i18n.language)?.label || "";

  return (
    <View
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      <Text style={[styles.languageText, { color: theme.colors.textColor }]}>
        {t("language")}
      </Text>
      <SelectDropdown
        data={languages}
        onSelect={(selectedItem) => changeLanguage(selectedItem.value)}
        defaultButtonText={defaultLanguageLabel}
        buttonTextAfterSelection={(selectedItem) => selectedItem.label}
        rowTextForSelection={(item) => item.label}
        buttonStyle={styles.dropdownButton}
        buttonTextStyle={styles.dropdownButtonText}
        dropdownStyle={styles.dropdown}
        rowStyle={styles.dropdownRow}
        rowTextStyle={styles.dropdownRowText}
      />
      <View
        style={{
          borderBottomColor: theme.colors.primary,
          width: "100%",
          padding: 5,
          borderBottomWidth: 2,
        }}
      />
      <View style={styles.container}>
        <Text style={[styles.languageText, { color: theme.colors.textColor }]}>
          {t("quranTranslation")}
        </Text>
        <SelectDropdown
          data={quranTranslation}
          onSelect={(selectedItem) =>
            setTranslationLanguage(selectedItem.value)
          }
          defaultButtonText={
            quranTranslation.find((item) => item.value === translationLanguage)
              ?.label || "English"
          }
          buttonTextAfterSelection={(selectedItem) => selectedItem.label}
          rowTextForSelection={(item) => item.label}
          buttonStyle={styles.dropdownButton}
          buttonTextStyle={styles.dropdownButtonText}
          dropdownStyle={styles.dropdown}
          rowStyle={styles.dropdownRow}
          rowTextStyle={styles.dropdownRowText}
        />
        <Switch value={isDarkTheme} onValueChange={handleThemeToggle} />
      </View>
    </View>
  );
};

export default Settings;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    paddingTop: 15,
  },
  text: {
    fontSize: 18,
    marginBottom: 20,
    color: "#000",
  },
  dropdownButton: {
    width: "90%",
    height: 50,
    backgroundColor: "#444",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#ccc",
  },
  dropdownButtonText: {
    color: "#FFF",
    textAlign: "center",
    fontSize: 16,
  },
  dropdown: {
    backgroundColor: "#444",
    borderRadius: 8,
  },
  dropdownRow: {
    backgroundColor: "#444",
    borderBottomColor: "#ccc",
    height: 50,
  },
  dropdownRowText: {
    color: "#FFF",
    textAlign: "center",
    fontSize: 16,
  },
  languageText: {
    paddingBottom: 10,
    fontSize: 18,
  },
});
