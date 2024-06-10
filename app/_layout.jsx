import React, { useEffect, useState } from "react";
import { Stack } from "expo-router";
import { initI18n, i18n } from "../components/i18n";
import { I18nextProvider } from "react-i18next";
import { StatusBar } from "expo-status-bar";
import * as NavigationBar from "expo-navigation-bar";
import { ActivityIndicator, View } from "react-native";
import useThemeStore from "../components/store/useThemeStore";
import { darkTheme, lightTheme } from "../components/Theme";
import { PaperProvider } from "react-native-paper";
import useQuranTranslationStore from "../components/store/store";

const rootLayout = () => {
  const [isInitialized, setIsInitialized] = useState(false);
  const { isDarkTheme, initializeTheme } = useThemeStore();
  const { initializeTranslationLanguage } = useQuranTranslationStore();

  useEffect(() => {
    const initialize = async () => {
      await initI18n();
      await initializeTheme();
      await initializeTranslationLanguage();
      setIsInitialized(true);
    };

    initialize();
  }, []);

  const theme = isDarkTheme ? darkTheme : lightTheme;
  NavigationBar.setBackgroundColorAsync(theme.colors.primary);

  if (!isInitialized) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <PaperProvider theme={theme}>
      <I18nextProvider i18n={i18n}>
        <StatusBar
          style={isDarkTheme ? "light" : "dark"}
          backgroundColor={theme.colors.primary}
        />
        <Stack
          screenOptions={{
            headerTitleAlign: "center",
            headerTitleStyle: { fontSize: 26 },
            headerStyle: { backgroundColor: theme.colors.primary },
            headerShown: false,
            animation: "ios",
          }}
        >
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        </Stack>
      </I18nextProvider>
    </PaperProvider>
  );
};

export default rootLayout;
