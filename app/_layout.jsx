import React, { useCallback, useEffect, useState } from "react";
import { Stack } from "expo-router";
import { initI18n, i18n } from "../components/i18n";
import { I18nextProvider } from "react-i18next";
import { StatusBar } from "expo-status-bar";
import { View, useColorScheme, Text } from "react-native";
import useThemeStore from "../components/store/useThemeStore";
import { darkTheme, lightTheme } from "../components/Theme";
import { PaperProvider } from "react-native-paper";
import useQuranTranslationStore from "../components/store/store";
import { ActionSheetProvider } from "@expo/react-native-action-sheet";
import * as NavigationBar from "expo-navigation-bar";
import * as SplashScreen from "expo-splash-screen";

// Keep the splash screen visible while we fetch resources
SplashScreen.preventAutoHideAsync();

const RootLayout = () => {
  const [appIsReady, setAppIsReady] = useState(false);
  const [error, setError] = useState(null);
  const colorScheme = useColorScheme();
  const { isDarkTheme, themeMode, initializeTheme } = useThemeStore();
  const { initializeTranslationLanguage } = useQuranTranslationStore();

  const theme = isDarkTheme ? darkTheme : lightTheme;

  useEffect(() => {
    async function prepare() {
      try {
        // Initialize all resources in parallel
        await Promise.all([
          initI18n(),
          initializeTheme(colorScheme === "dark"),
          initializeTranslationLanguage(),
        ]);
      } catch (e) {
        console.error("Initialization error:", e);
        setError(e);
      } finally {
        setAppIsReady(true);
      }
    }

    prepare();
  }, []);

  const onLayoutRootView = useCallback(async () => {
    if (appIsReady) {
      await SplashScreen.hideAsync();
    }
  }, [appIsReady]);

  if (!appIsReady) {
    return null;
  }

  if (error) {
    return (
      <View
        style={[styles.container, { backgroundColor: theme.colors.background }]}
      >
        <Text style={[styles.errorText, { color: theme.colors.textColor }]}>
          Error initializing app: {error.message}
        </Text>
        <Text style={[styles.errorSubText, { color: theme.colors.textColor }]}>
          Please restart the application
        </Text>
      </View>
    );
  }

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: theme.colors.background,
      }}
      onLayout={onLayoutRootView}
    >
      <ActionSheetProvider>
        <PaperProvider theme={theme}>
          <I18nextProvider i18n={i18n}>
            <StatusBar style={isDarkTheme ? "light" : "dark"} />
            <Stack
              screenOptions={{
                headerTitleAlign: "center",
                headerStyle: {
                  backgroundColor: theme.colors.primary,
                },
                headerTitleStyle: {
                  color: theme.colors.textColor,
                  fontSize: 20,
                },
                headerTintColor: theme.colors.textColor,
              }}
            >
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
              <Stack.Screen
                name="Hadiths/index"
                options={{ headerTitle: "Sahih Bukhari Hadiths" }}
              />
            </Stack>
          </I18nextProvider>
        </PaperProvider>
      </ActionSheetProvider>
    </View>
  );
};

const styles = {
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  errorText: {
    fontSize: 16,
    textAlign: "center",
    marginHorizontal: 20,
  },
  errorSubText: {
    fontSize: 14,
    marginTop: 10,
  },
};

export default RootLayout;
