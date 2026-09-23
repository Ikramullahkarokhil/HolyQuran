import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Stack, useGlobalSearchParams, useRouter } from "expo-router";
import { initI18n, i18n } from "../components/i18n";
import { I18nextProvider, useTranslation } from "react-i18next";
import { StatusBar } from "expo-status-bar";
import { AppState, View, useColorScheme, Text, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
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
import { AppAlertProvider } from "../components/AppAlertProvider";
import {
  AudioPlayerProvider,
  useAudioPlayer,
} from "../components/AudioPlayerProvider";
import GlobalAudioPlayer from "../components/GlobalAudioPlayer";
import { requestAudioNotificationPermission } from "../components/requestAudioNotificationPermission";
import { getSurahByIndex } from "../components/quranData";

// Keep the splash screen visible while we fetch resources
SplashScreen.preventAutoHideAsync().catch(() => {
  // ignore – already prevented or not supported
});

const RootLayout = () => {
  const [appIsReady, setAppIsReady] = useState(false);
  const [error, setError] = useState(null);

  const colorScheme = useColorScheme();
  const isDarkTheme = useThemeStore((s) => s.isDarkTheme);
  const initializeTheme = useThemeStore((s) => s.initializeTheme);

  const initializeQuranTranslationLanguage = useQuranTranslationStore(
    (s) => s.initializeQuranTranslationLanguage,
  );
  const initializeHadithTranslationLanguage = useHadithTranslationStore(
    (s) => s.initializeHadithTranslationLanguage,
  );
  const initializeAppLanguage = useAppLanguageStore(
    (s) => s.initializeAppLanguage,
  );

  const { bookName } = useGlobalSearchParams();
  const theme = isDarkTheme ? darkTheme : lightTheme;

  // ---- One-time initialization ----
  useEffect(() => {
    let cancelled = false;

    async function prepare() {
      try {
        const savedLanguage = await initializeAppLanguage();

        await Promise.all([
          initI18n(savedLanguage),
          initializeTheme(colorScheme === "dark"),
          initializeQuranTranslationLanguage(),
          initializeHadithTranslationLanguage(),
        ]);
      } catch (e) {
        console.error("Initialization error:", e);
        if (!cancelled) setError(e);
      } finally {
        if (!cancelled) setAppIsReady(true);
      }
    }

    prepare();

    return () => {
      cancelled = true;
    };
    // Intentionally run once on mount.
    // colorScheme is only used as the *initial* value for theme init.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Audio notification permission (non-blocking) ----
  useEffect(() => {
    requestAudioNotificationPermission();

    const onChange = (nextState) => {
      if (nextState === "active") {
        requestAudioNotificationPermission();
      }
    };

    const subscription = AppState.addEventListener("change", onChange);
    return () => subscription.remove();
  }, []);

  const onLayoutRootView = useCallback(async () => {
    if (appIsReady) {
      try {
        await SplashScreen.hideAsync();
      } catch {
        // already hidden
      }
    }
  }, [appIsReady]);

  // Still loading
  if (!appIsReady) {
    return null;
  }

  // Init failed
  if (error) {
    const message =
      error instanceof Error ? error.message : "Unknown initialization error";

    return (
      <View
        style={[styles.container, { backgroundColor: theme.colors.background }]}
      >
        <Text style={[styles.errorText, { color: theme.colors.textColor }]}>
          Error initializing app: {message}
        </Text>
        <Text style={[styles.errorSubText, { color: theme.colors.textColor }]}>
          Please restart the application
        </Text>
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={styles.flex}>
      <View
        style={[styles.flex, { backgroundColor: theme.colors.background }]}
        onLayout={onLayoutRootView}
      >
        <ActionSheetProvider>
          <PaperProvider theme={theme}>
            <I18nextProvider i18n={i18n}>
              <AudioPlayerProvider>
                <AppAlertProvider>
                  <StatusBar style={isDarkTheme ? "light" : "dark"} />
                  <GlobalAudioDock />
                  <AppStack bookName={bookName} />
                </AppAlertProvider>
              </AudioPlayerProvider>
            </I18nextProvider>
          </PaperProvider>
        </ActionSheetProvider>
      </View>
    </GestureHandlerRootView>
  );
};

// ---------------------------------------------------------------------------
// Global floating audio player (only mounts when visible)
// ---------------------------------------------------------------------------
const GlobalAudioDock = React.memo(() => {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();

  const isDarkTheme = useThemeStore((s) => s.isDarkTheme);
  const theme = isDarkTheme ? darkTheme : lightTheme;

  const player = useAudioPlayer();
  const { activeAyah, isVisible, surahId, playingId, downloadingId } = player;
  const surahName = getSurahByIndex(surahId)?.name;

  const colors = useMemo(
    () => ({
      text: theme.colors.onSurface,
      secondary: theme.colors.onSurfaceVariant || theme.colors.textColor,
      accent: theme.colors.progressColor || theme.colors.primary,
      surface: theme.colors.surface,
      border: theme.colors.outlineVariant || theme.colors.border,
      shadow: "#000",
    }),
    [theme],
  );

  const labels = useMemo(
    () => ({
      ayah: t("Ayah") || "Ayah",
      quranAudio: t("Quran Audio") || "Quran Audio",
    }),
    [t],
  );

  const handleJumpToVerse = useCallback(() => {
    router.push({
      pathname: "/SurahDetails",
      params: {
        surahId: String(surahId),
        ayahId: String(activeAyah),
      },
    });
  }, [router, surahId, activeAyah]);

  // Early exit – no work when player is hidden
  if (!activeAyah || !isVisible || !surahId) {
    return null;
  }

  return (
    <GlobalAudioPlayer
      activeAyah={activeAyah}
      isPlaying={playingId === activeAyah}
      isDownloading={downloadingId === activeAyah}
      downloadProgress={player.downloadProgressMap.get(activeAyah) || 0}
      positionSec={player.positionSec}
      durationSec={player.durationMap.get(activeAyah) || 0}
      reciter={player.reciter}
      surahName={surahName}
      colors={colors}
      labels={labels}
      onPlay={() => player.playVerse(activeAyah)}
      onPause={player.pauseVerse}
      onSeek={player.seekTo}
      onSkip={player.skipBy}
      onClose={player.hidePlayer}
      onJumpToVerse={handleJumpToVerse}
      topOffset={insets.top + 8}
    />
  );
});

GlobalAudioDock.displayName = "GlobalAudioDock";

// ---------------------------------------------------------------------------
// Stack navigator (translation-aware)
// ---------------------------------------------------------------------------
const AppStack = React.memo(({ bookName }) => {
  const { t } = useTranslation();
  const isDarkTheme = useThemeStore((s) => s.isDarkTheme);
  const theme = isDarkTheme ? darkTheme : lightTheme;

  const screenOptions = useMemo(
    () => ({
      headerTitleAlign: "center",
      headerStyle: {
        backgroundColor: theme.colors.surface,
      },
      headerTitleStyle: {
        color: theme.colors.onSurface || theme.colors.textColor,
        fontSize: 20,
      },
      headerTintColor: theme.colors.onSurface || theme.colors.textColor,
    }),
    [theme],
  );

  const tabsOptions = useMemo(
    () => ({
      headerShown: true,
      headerTitle: t("holyQuran"),
      headerTitleAlign: "left",
      headerShadowVisible: false,
      headerStyle: { backgroundColor: theme.colors.surface },
      headerTitleStyle: {
        color: theme.colors.onSurface || theme.colors.textColor,
        fontSize: 20,
        fontWeight: "700",
      },
      headerTintColor: theme.colors.onSurface || theme.colors.textColor,
    }),
    [t, theme],
  );

  return (
    <Stack screenOptions={screenOptions}>
      <Stack.Screen name="(tabs)" options={tabsOptions} />
      <Stack.Screen
        name="HadithCollections/index"
        options={{ headerTitle: t("Hadith") }}
      />
      <Stack.Screen
        name="HadithBooks/index"
        options={{ headerTitle: t("Sahih Bukhari Hadiths") }}
      />
      <Stack.Screen
        name="JawamiAlKalim/index"
        options={{ headerTitle: t("Jawami al-Kalim") }}
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
      <Stack.Screen
        name="ReciterSelect/index"
        options={{
          headerTitle: "Reciter Selection",
          headerTitleStyle: { color: theme.colors.textColor },
        }}
      />
    </Stack>
  );
});

AppStack.displayName = "AppStack";

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
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
});

export default RootLayout;
