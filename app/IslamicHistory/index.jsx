import { StyleSheet, Text, View } from "react-native";
import React from "react";
import { MaterialIcons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useTheme } from "react-native-paper";
import { useAppLanguageStore } from "../../components/store/store";
import {
  getTextAlignment,
  getWritingDirection,
  isRTL,
} from "../../components/utils/rtlUtils";

const IslamicHistory = () => {
  const theme = useTheme();
  const { t } = useTranslation();
  const { language } = useAppLanguageStore();
  const rtl = isRTL(language);

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View
        style={[
          styles.iconContainer,
          { backgroundColor: theme.colors.primary },
        ]}
      >
        <MaterialIcons
          name="auto-stories"
          size={44}
          color={theme.colors.buttonText || "#ffffff"}
        />
      </View>
      <Text
        style={[
          styles.title,
          {
            color: theme.colors.onSurface || theme.colors.textColor,
            textAlign: getTextAlignment(language),
            writingDirection: getWritingDirection(language),
          },
        ]}
      >
        {t("Verse & Hadith of the Day")}
      </Text>
      <Text
        style={[
          styles.description,
          {
            color: theme.colors.onSurfaceVariant || theme.colors.inactiveColor,
            textAlign: getTextAlignment(language),
            writingDirection: getWritingDirection(language),
          },
        ]}
      >
        {t("Coming soon")}
      </Text>
      <Text
        style={[
          styles.supportingText,
          {
            color: theme.colors.onSurfaceVariant || theme.colors.inactiveColor,
            textAlign: getTextAlignment(language),
            writingDirection: getWritingDirection(language),
          },
          rtl && styles.rtlText,
        ]}
      >
        {t("Daily verses and hadiths will be available here soon.")}
      </Text>
    </View>
  );
};

export default IslamicHistory;

const styles = StyleSheet.create({
  container: {
    justifyContent: "center",
    alignItems: "center",
    flex: 1,
    paddingHorizontal: 32,
  },
  iconContainer: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
    elevation: 5,
  },
  title: {
    fontSize: 21,
    fontWeight: "700",
    marginBottom: 10,
  },
  description: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 8,
  },
  supportingText: {
    maxWidth: 320,
    fontSize: 15,
    lineHeight: 23,
    opacity: 0.78,
  },
  rtlText: {
    writingDirection: "rtl",
  },
});
