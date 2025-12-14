import React, { useCallback, useEffect, useState } from "react";
import { Stack, useGlobalSearchParams } from "expo-router";
import { initI18n, i18n } from "../components/i18n";
import { I18nextProvider } from "react-i18next";
import { StatusBar } from "expo-status-bar";
import { View, useColorScheme, Text } from "react-native";
import useThemeStore from "../components/store/useThemeStore";
import { darkTheme, lightTheme } from "../components/Theme";
import { PaperProvider } from "react-native-paper";
import {
  useQuranTranslationStore,
  useHadithTranslationStore,
  useAppLanguageStore,
} from "../components/store/store";
import { ActionSheetProvider } from "@expo/react-native-action-sheet";
import * as SplashScreen from "expo-splash-screen";
import { useTranslation } from "react-i18next";

// Keep the splash screen visible while we fetch resources
SplashScreen.preventAutoHideAsync();

const RootLayout = () => {
  const [appIsReady, setAppIsReady] = useState(false);
  const [error, setError] = useState(null);
  const colorScheme = useColorScheme();
  const { isDarkTheme, themeMode, initializeTheme } = useThemeStore();
  const { initializeQuranTranslationLanguage } = useQuranTranslationStore();
  const { initializeHadithTranslationLanguage } = useHadithTranslationStore();
  const { initializeAppLanguage } = useAppLanguageStore();
  const { bookName } = useGlobalSearchParams();

  const theme = isDarkTheme ? darkTheme : lightTheme;

  useEffect(() => {
    async function prepare() {
      try {
        // Initialize all resources in parallel
        const savedLanguage = await initializeAppLanguage();
        await Promise.all([
          initI18n(savedLanguage),
          initializeTheme(colorScheme === "dark"),
          initializeQuranTranslationLanguage(),
          initializeHadithTranslationLanguage(),
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
            <AppStack bookName={bookName} />
          </I18nextProvider>
        </PaperProvider>
      </ActionSheetProvider>
    </View>
  );
};

// Separate component that uses translation hook
const AppStack = ({ bookName }) => {
  const { t } = useTranslation();
  const theme = useThemeStore((state) =>
    state.isDarkTheme ? darkTheme : lightTheme,
  );

  return (
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
        name="HadithBooks/index"
        options={{ headerTitle: t("Sahih Bukhari Hadiths") }}
      />
      <Stack.Screen name="Hadiths/index" options={{ headerTitle: bookName }} />
      <Stack.Screen
        name="Bookmarks/index"
        options={{
          headerTitle: t("Bookmarks"),
          headerShadowVisible: false,
        }}
      />
      <Stack.Screen
        name="Tazbih/index"
        options={{
          headerTitle: "",

          headerTitleStyle: { color: theme.colors.textColor },
        }}
      />
    </Stack>
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
