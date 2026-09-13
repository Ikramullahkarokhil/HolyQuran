import React, {
  useState,
  useCallback,
  useLayoutEffect,
  useEffect,
} from "react";
import {
  StyleSheet,
  Text,
  Pressable,
  View,
  Vibration,
  ScrollView,
  ActivityIndicator,
  TextInput,
} from "react-native";
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useNavigation, useFocusEffect } from "expo-router";
import { Button, useTheme, IconButton } from "react-native-paper";
import { useTranslation } from "react-i18next";
import { AnimatedCircularProgress } from "react-native-circular-progress";
import { useAudioPlayer } from "expo-audio";
import AsyncStorage from "@react-native-async-storage/async-storage";
import recitations from "../../assets/recitations.json";

const soundModes = {
  sound: "volume-high",
  vibrate: "vibrate",
  silent: "volume-off",
};

const STORAGE_KEYS = {
  counter: "tazbih_counter",
  maxCount: "tazbih_max_count",
  soundMode: "tazbih_sound_mode",
  reciteIndex: "tazbih_recite_index",
  legacyCounter: "counter",
  legacyMaxCount: "maxCount",
  legacySoundMode: "soundMode",
  legacyReciteIndex: "reciteIndex",
};

const readStoredNumber = (value, fallback) => {
  if (value === null || value === undefined) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const Tazbih = () => {
  const navigation = useNavigation();
  const theme = useTheme();
  const { t } = useTranslation();

  const [counter, setCounter] = useState(0);
  const [reciteIndex, setReciteIndex] = useState(0);
  const [soundMode, setSoundMode] = useState("vibrate");
  const [maxCount, setMaxCount] = useState(100);
  const [tempMaxCount, setTempMaxCount] = useState(maxCount);
  const [showMaxCountModal, setShowMaxCountModal] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const counterAnim = useSharedValue(0);
  const modalAnim = useSharedValue(0);
  const [hasHydrated, setHasHydrated] = useState(false);

  const player = useAudioPlayer(require("../../assets/audio/screen-tap2.mp3"));

  const saveCounterToStorage = useCallback(async (nextCounter) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.counter, String(nextCounter));
      await AsyncStorage.setItem(STORAGE_KEYS.legacyCounter, String(nextCounter));
    } catch (error) {
      console.error("Failed to save counter to Async Storage", error);
    }
  }, []);

  const persistMaxCount = useCallback(async (nextMaxCount) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.maxCount, String(nextMaxCount));
      await AsyncStorage.setItem(STORAGE_KEYS.legacyMaxCount, String(nextMaxCount));
    } catch (error) {
      console.error("Failed to persist maxCount", error);
    }
  }, []);

  const persistSoundMode = useCallback(async (nextMode) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.soundMode, nextMode);
      await AsyncStorage.setItem(STORAGE_KEYS.legacySoundMode, nextMode);
    } catch (error) {
      console.error("Failed to persist sound mode", error);
    }
  }, []);

  const persistReciteIndex = useCallback(async (nextIndex) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.reciteIndex, String(nextIndex));
      await AsyncStorage.setItem(STORAGE_KEYS.legacyReciteIndex, String(nextIndex));
    } catch (error) {
      console.error("Failed to persist recite index", error);
    }
  }, []);

  const loadInitialValues = useCallback(async () => {
    try {
      const [counterValue, maxCountValue, soundModeValue, reciteIndexValue] =
        await Promise.all([
          AsyncStorage.getItem(STORAGE_KEYS.counter),
          AsyncStorage.getItem(STORAGE_KEYS.maxCount),
          AsyncStorage.getItem(STORAGE_KEYS.soundMode),
          AsyncStorage.getItem(STORAGE_KEYS.reciteIndex),
        ]);

      const fallbackCounterValue =
        counterValue ?? (await AsyncStorage.getItem(STORAGE_KEYS.legacyCounter));
      const fallbackMaxCountValue =
        maxCountValue ?? (await AsyncStorage.getItem(STORAGE_KEYS.legacyMaxCount));
      const fallbackSoundModeValue =
        soundModeValue ?? (await AsyncStorage.getItem(STORAGE_KEYS.legacySoundMode));
      const fallbackReciteIndexValue =
        reciteIndexValue ??
        (await AsyncStorage.getItem(STORAGE_KEYS.legacyReciteIndex));

      const nextCounter = readStoredNumber(fallbackCounterValue, 0);
      const nextMaxCount = readStoredNumber(fallbackMaxCountValue, 100);
      const nextSoundMode =
        fallbackSoundModeValue && soundModes[fallbackSoundModeValue]
          ? fallbackSoundModeValue
          : "vibrate";
      const nextReciteIndex = readStoredNumber(fallbackReciteIndexValue, 0);

      setCounter(nextCounter);
      setMaxCount(nextMaxCount);
      setTempMaxCount(nextMaxCount);
      setSoundMode(nextSoundMode);
      setReciteIndex(nextReciteIndex);
      setHasHydrated(true);
      setIsLoading(false);
    } catch (error) {
      console.error("Error loading initial values:", error);
      setHasHydrated(true);
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadInitialValues();
    }, 0);

    return () => clearTimeout(timer);
  }, [loadInitialValues]);

  useFocusEffect(
    useCallback(() => {
      const timer = setTimeout(() => {
        void loadInitialValues();
      }, 0);

      return () => clearTimeout(timer);
    }, [loadInitialValues]),
  );

  useEffect(() => {
    if (!hasHydrated) return;
    saveCounterToStorage(counter);
  }, [counter, hasHydrated, saveCounterToStorage]);

  useEffect(() => {
    if (!hasHydrated) return;
    persistMaxCount(maxCount);
  }, [maxCount, hasHydrated, persistMaxCount]);

  useEffect(() => {
    if (!hasHydrated) return;
    persistSoundMode(soundMode);
  }, [soundMode, hasHydrated, persistSoundMode]);

  useEffect(() => {
    if (!hasHydrated) return;
    persistReciteIndex(reciteIndex);
  }, [reciteIndex, hasHydrated, persistReciteIndex]);

  useEffect(() => {
    modalAnim.value = withTiming(showMaxCountModal ? 1 : 0, {
      duration: 200,
    });
  }, [showMaxCountModal, modalAnim]);

  const handleReset = useCallback(async () => {
    setCounter(0);
    setMaxCount(100);
    setTempMaxCount(100);
    try {
      await Promise.all([
        AsyncStorage.setItem(STORAGE_KEYS.counter, "0"),
        AsyncStorage.setItem(STORAGE_KEYS.legacyCounter, "0"),
        AsyncStorage.setItem(STORAGE_KEYS.maxCount, "100"),
        AsyncStorage.setItem(STORAGE_KEYS.legacyMaxCount, "100"),
      ]);
    } catch (error) {
      console.error("Failed to reset values in storage", error);
    }
    // Reanimated shared values are intentionally mutable.
    // eslint-disable-next-line react-hooks/immutability
    counterAnim.value = withSpring(0, {
      damping: 12,
      stiffness: 160,
    });
  }, [counterAnim]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <IconButton
            icon="refresh"
            onPress={handleReset}
            iconColor={theme.colors.textColor}
            style={styles.headerButton}
          />
          <IconButton
            icon={soundModes[soundMode]}
            onPress={switchSoundMode}
            iconColor={theme.colors.textColor}
            style={styles.headerButton}
          />
          <IconButton
            icon="cog"
            onPress={() => setShowMaxCountModal(true)}
            iconColor={theme.colors.textColor}
            style={styles.headerButton}
          />
        </View>
      ),
    });
  }, [
    navigation,
    soundMode,
    maxCount,
    theme.colors.textColor,
    handleReset,
    switchSoundMode,
  ]);

  const switchSoundMode = useCallback(() => {
    setSoundMode((prevMode) => {
      const newMode =
        prevMode === "sound"
          ? "vibrate"
          : prevMode === "vibrate"
            ? "silent"
            : "sound";
      persistSoundMode(newMode);
      return newMode;
    });
  }, [persistSoundMode]);

  const handleIncrement = async () => {
    if (counter >= maxCount) {
      if (soundMode === "vibrate" || soundMode === "sound") {
        Vibration.vibrate([0, 50, 50, 50]);
      }
      // Reanimated shared values are intentionally mutable.
      // eslint-disable-next-line react-hooks/immutability
      counterAnim.value = withSequence(
        withTiming(counter + 0.1, { duration: 50 }),
        withTiming(counter - 0.1, { duration: 50 }),
        withTiming(counter, { duration: 50 }),
      );
      return;
    }

    setCounter((prevCounter) => {
      const newCounter = prevCounter + 1;
      saveCounterToStorage(newCounter);
      counterAnim.value = withSpring(newCounter, {
        damping: 12,
        stiffness: 160,
      });
      return newCounter;
    });

    if (soundMode === "sound") {
      player.seekTo(0);
      player.play();
    } else if (soundMode === "vibrate") {
      Vibration.vibrate(60);
    }
  };

  const modalAnimatedStyle = useAnimatedStyle(() => ({
    opacity: modalAnim.value,
    transform: [
      {
        scale: interpolate(
          modalAnim.value,
          [0, 1],
          [0.8, 1],
          Extrapolation.CLAMP,
        ),
      },
    ],
  }));

  const counterAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      {
        scale: interpolate(
          counterAnim.value,
          [0, maxCount],
          [1, 1.1],
          Extrapolation.CLAMP,
        ),
      },
    ],
  }));

  const handleNextRecite = () => {
    setReciteIndex((prevIndex) => {
      const nextIndex = (prevIndex + 1) % recitations.length;
      persistReciteIndex(nextIndex);
      return nextIndex;
    });
  };

  const handlePreviousRecite = () => {
    setReciteIndex((prevIndex) => {
      const nextIndex =
        prevIndex === 0 ? recitations.length - 1 : prevIndex - 1;
      persistReciteIndex(nextIndex);
      return nextIndex;
    });
  };

  if (isLoading) {
    return (
      <View
        style={[
          styles.container,
          styles.loadingContainer,
          { backgroundColor: theme.colors.primary },
        ]}
      >
        <ActivityIndicator size="large" color={theme.colors.progressColor} />
      </View>
    );
  }

  return (
    <View
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      {showMaxCountModal && (
        <Animated.View style={[styles.modalOverlay, modalAnimatedStyle]}>
          <View
            style={[
              styles.modalContent,
              {
                backgroundColor: theme.colors.primary,
              },
            ]}
          >
            <Text
              style={[styles.modalTitle, { color: theme.colors.textColor }]}
            >
              {t("Set Max Count")}
            </Text>
            <View style={styles.inputRow}>
              <IconButton
                icon="minus"
                onPress={() => setTempMaxCount(Math.max(1, tempMaxCount - 1))}
                iconColor={theme.colors.progressColor}
                style={[
                  styles.inputButton,
                  { backgroundColor: theme.colors.background },
                ]}
                accessibilityLabel={t("Decrease max count")}
              />
              <TextInput
                style={[
                  styles.modalInput,
                  {
                    color: theme.colors.textColor,
                    backgroundColor: theme.colors.background,
                    borderColor: theme.colors.progressColor,
                  },
                ]}
                value={tempMaxCount.toString()}
                onChangeText={(text) => {
                  const value = parseInt(text, 10);
                  if (!isNaN(value)) setTempMaxCount(Math.max(1, value));
                }}
                keyboardType="numeric"
                placeholder={t("Enter count")}
                placeholderTextColor={theme.colors.inactiveColor}
                accessibilityLabel={t("Enter count")}
              />
              <IconButton
                icon="plus"
                onPress={() => setTempMaxCount(tempMaxCount + 1)}
                iconColor={theme.colors.progressColor}
                style={[
                  styles.inputButton,
                  { backgroundColor: theme.colors.background },
                ]}
                accessibilityLabel={t("Increase max count")}
              />
            </View>
            <View style={styles.modalActions}>
              <Button
                mode="contained"
                onPress={() => {
                  setMaxCount(tempMaxCount);
                  setShowMaxCountModal(false);
                }}
                style={styles.modalActionButton}
                buttonColor={theme.colors.progressColor}
                textColor={theme.colors.buttonText}
                accessibilityLabel={t("Save max count")}
              >
                {t("Save")}
              </Button>
              <Button
                mode="outlined"
                onPress={() => {
                  setTempMaxCount(maxCount);
                  setShowMaxCountModal(false);
                }}
                style={styles.modalActionButton}
                textColor={theme.colors.textColor}
                accessibilityLabel={t("Cancel max count")}
              >
                {t("Cancel")}
              </Button>
            </View>
          </View>
        </Animated.View>
      )}

      <View style={styles.topReciteWrapper}>
        <Pressable
          style={[
            styles.reciteContainer,
            {
              backgroundColor: theme.colors.primary,
            },
          ]}
        >
          <IconButton
            icon="chevron-left"
            onPress={handlePreviousRecite}
            iconColor={theme.colors.progressColor}
            style={[
              styles.navButton,
              { backgroundColor: theme.colors.background },
            ]}
            accessibilityLabel={t("Previous recitation")}
          />
          <ScrollView
            horizontal
            contentContainerStyle={styles.reciteScroll}
            showsHorizontalScrollIndicator={false}
          >
            <Text
              style={[styles.reciteText, { color: theme.colors.textColor }]}
            >
              {recitations[reciteIndex]}
            </Text>
          </ScrollView>
          <IconButton
            icon="chevron-right"
            onPress={handleNextRecite}
            iconColor={theme.colors.progressColor}
            style={[
              styles.navButton,
              { backgroundColor: theme.colors.background },
            ]}
            accessibilityLabel={t("Next recitation")}
          />
        </Pressable>
      </View>

      <Pressable
        style={[
          styles.progressContainer,
          { backgroundColor: theme.colors.background },
        ]}
        onPress={handleIncrement}
        accessibilityLabel={t("Tap to increment counter")}
        accessibilityRole="button"
      >
        <AnimatedCircularProgress
          size={260}
          width={18}
          fill={(counter / maxCount) * 100}
          tintColor={theme.colors.progressColor}
          backgroundColor={theme.colors.primary}
          rotation={0}
          lineCap="round"
        >
          {() => (
            <Animated.View style={[styles.progressInner, counterAnimatedStyle]}>
              <View style={styles.counterDisplay}>
                <Text
                  style={[
                    styles.counterText,
                    { color: theme.colors.progressColor },
                  ]}
                >
                  {counter}
                </Text>
                <Text
                  style={[
                    styles.maxCountText,
                    { color: theme.colors.inactiveColor },
                  ]}
                >
                  / {maxCount}
                </Text>
              </View>
            </Animated.View>
          )}
        </AnimatedCircularProgress>
        <Text style={[styles.tapText, { color: theme.colors.inactiveColor }]}>
          {t("Tap to count")}
        </Text>
      </Pressable>
    </View>
  );
};

export default Tazbih;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "flex-start",
    alignItems: "center",
    paddingTop: 10,
  },
  loadingContainer: {
    justifyContent: "center",
    alignItems: "center",
  },
  topReciteWrapper: {
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
  },
  progressContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    width: "100%",
    borderRadius: 20,
  },
  progressInner: {
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  counterDisplay: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "center",
  },
  counterText: {
    fontSize: 48,
    fontWeight: "700",
    marginRight: 8,
    letterSpacing: 1.2,
  },
  maxCountText: {
    fontSize: 24,
    fontWeight: "500",
    opacity: 0.7,
  },
  counterInput: {
    fontSize: 36,
    fontWeight: "700",
    textAlign: "center",
    minWidth: 100,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  reciteContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    width: "94%",
    minHeight: 72,
    borderRadius: 16,
    paddingHorizontal: 8,
    paddingVertical: 12,
    elevation: 6,
  },
  reciteText: {
    fontSize: 24,
    fontWeight: "600",
    textAlign: "center",
    paddingHorizontal: 16,
    letterSpacing: 0.5,
  },
  reciteScroll: {
    alignItems: "center",
    justifyContent: "center",
    flex: 1,
  },
  navButton: {
    borderRadius: 12,
    marginHorizontal: 4,
  },
  modalOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 100,
  },
  modalContent: {
    width: 340,
    borderRadius: 24,
    padding: 24,

    elevation: 12,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: "700",
    marginBottom: 24,
    textAlign: "center",
    letterSpacing: 0.5,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
    gap: 12,
  },
  modalInput: {
    fontSize: 32,
    fontWeight: "600",
    textAlign: "center",
    minWidth: 100,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: "100%",
    gap: 16,
  },
  modalActionButton: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 8,
  },
  inputButton: {
    borderRadius: 12,
    elevation: 4,
  },
  tapText: {
    marginTop: 16,
    fontSize: 18,
    fontWeight: "600",
    letterSpacing: 0.8,
    opacity: 0.8,
  },
  headerButton: {
    marginHorizontal: 4,
    backgroundColor: "transparent",
  },
});
