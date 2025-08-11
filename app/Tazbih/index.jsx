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
  Animated,
  ActivityIndicator,
  TextInput,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useFocusEffect } from "@react-navigation/native";
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
  const [counterAnim] = useState(new Animated.Value(0));
  const [modalAnim] = useState(new Animated.Value(0));
  const [isLoading, setIsLoading] = useState(true);

  const player = useAudioPlayer(require("../../assets/audio/screen-tap2.mp3"));

  const saveCounterToStorage = async (counter) => {
    try {
      await AsyncStorage.setItem("counter", counter.toString());
    } catch (error) {
      console.error("Failed to save counter to Async Storage", error);
    }
  };

  useEffect(() => {
    const loadInitialValues = async () => {
      try {
        const [counterValue, maxCountValue, soundModeValue] = await Promise.all(
          [
            AsyncStorage.getItem("counter"),
            AsyncStorage.getItem("maxCount"),
            AsyncStorage.getItem("soundMode"),
          ]
        );

        if (counterValue !== null) setCounter(parseInt(counterValue, 10));
        if (maxCountValue !== null) {
          const parsedMaxCount = parseInt(maxCountValue, 10);
          setMaxCount(parsedMaxCount);
          setTempMaxCount(parsedMaxCount);
        }
        if (soundModeValue !== null) setSoundMode(soundModeValue);
        setIsLoading(false);
      } catch (error) {
        console.error("Error loading initial values:", error);
        setIsLoading(false);
      }
    };
    loadInitialValues();
  }, []);

  useFocusEffect(
    useCallback(() => {
      const reloadValues = async () => {
        try {
          const [counterValue, maxCountValue] = await Promise.all([
            AsyncStorage.getItem("counter"),
            AsyncStorage.getItem("maxCount"),
          ]);

          if (counterValue !== null) setCounter(parseInt(counterValue, 10));
          if (maxCountValue !== null) {
            const parsedMaxCount = parseInt(maxCountValue, 10);
            setMaxCount(parsedMaxCount);
            setTempMaxCount(parsedMaxCount);
          }
        } catch (error) {
          console.error("Error reloading values:", error);
        }
      };
      reloadValues();
    }, [])
  );

  useEffect(() => {
    saveCounterToStorage(counter);
  }, [counter]);

  useEffect(() => {
    const persistMaxCount = async () => {
      try {
        await AsyncStorage.setItem("maxCount", maxCount.toString());
      } catch (error) {
        console.error("Failed to persist maxCount", error);
      }
    };
    persistMaxCount();
  }, [maxCount]);

  useEffect(() => {
    if (showMaxCountModal) {
      Animated.spring(modalAnim, {
        toValue: 1,
        useNativeDriver: true,
        speed: 12,
        bounciness: 8,
      }).start();
    } else {
      Animated.timing(modalAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  }, [showMaxCountModal]);

  useFocusEffect(
    useCallback(() => {
      navigation.setOptions({
        title: t(""),
        headerShown: true,
        headerTitleStyle: { color: theme.colors.textColor },
      });
    }, [navigation, t, theme.colors.textColor])
  );

  const handleReset = async () => {
    setCounter(0);
    setMaxCount(100);
    setTempMaxCount(100);
    try {
      await Promise.all([
        AsyncStorage.setItem("counter", "0"),
        AsyncStorage.setItem("maxCount", "100"),
      ]);
    } catch (error) {
      console.error("Failed to reset values in storage", error);
    }
    Animated.spring(counterAnim, {
      toValue: 0,
      useNativeDriver: true,
      speed: 12,
      bounciness: 8,
    }).start();
  };

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
  }, [navigation, soundMode, maxCount, theme.colors.textColor]);

  const switchSoundMode = () => {
    setSoundMode((prevMode) => {
      const newMode =
        prevMode === "sound"
          ? "vibrate"
          : prevMode === "vibrate"
          ? "silent"
          : "sound";
      AsyncStorage.setItem("soundMode", newMode);
      return newMode;
    });
  };

  const handleIncrement = async () => {
    if (counter >= maxCount) {
      if (soundMode === "vibrate" || soundMode === "sound") {
        Vibration.vibrate([0, 50, 50, 50]);
      }
      Animated.sequence([
        Animated.timing(counterAnim, {
          toValue: counter + 0.1,
          duration: 50,
          useNativeDriver: true,
        }),
        Animated.timing(counterAnim, {
          toValue: counter - 0.1,
          duration: 50,
          useNativeDriver: true,
        }),
        Animated.timing(counterAnim, {
          toValue: counter,
          duration: 50,
          useNativeDriver: true,
        }),
      ]).start();
      return;
    }

    setCounter((prevCounter) => {
      const newCounter = prevCounter + 1;
      saveCounterToStorage(newCounter);
      Animated.spring(counterAnim, {
        toValue: newCounter,
        useNativeDriver: true,
        speed: 12,
        bounciness: 8,
      }).start();
      return newCounter;
    });

    if (soundMode === "sound") {
      player.seekTo(0);
      player.play();
    } else if (soundMode === "vibrate") {
      Vibration.vibrate(60);
    }
  };

  const handleNextRecite = () => {
    setReciteIndex((prevIndex) => (prevIndex + 1) % recitations.length);
  };

  const handlePreviousRecite = () => {
    setReciteIndex((prevIndex) =>
      prevIndex === 0 ? recitations.length - 1 : prevIndex - 1
    );
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
        <Animated.View
          style={[
            styles.modalOverlay,
            {
              opacity: modalAnim,
              transform: [
                {
                  scale: modalAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.8, 1],
                  }),
                },
              ],
            },
          ]}
        >
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
                accessibilityLabel="Decrease max count"
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
                placeholder="Enter count"
                placeholderTextColor={theme.colors.inactiveColor}
                accessibilityLabel="Max count input"
              />
              <IconButton
                icon="plus"
                onPress={() => setTempMaxCount(tempMaxCount + 1)}
                iconColor={theme.colors.progressColor}
                style={[
                  styles.inputButton,
                  { backgroundColor: theme.colors.background },
                ]}
                accessibilityLabel="Increase max count"
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
                accessibilityLabel="Save max count"
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
                accessibilityLabel="Cancel max count"
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
            accessibilityLabel="Previous recitation"
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
            accessibilityLabel="Next recitation"
          />
        </Pressable>
      </View>

      <Pressable
        style={[
          styles.progressContainer,
          { backgroundColor: theme.colors.background },
        ]}
        onPress={handleIncrement}
        accessibilityLabel="Tap to increment counter"
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
            <Animated.View
              style={[
                styles.progressInner,
                {
                  transform: [
                    {
                      scale: counterAnim.interpolate({
                        inputRange: [0, maxCount],
                        outputRange: [1, 1.1],
                        extrapolate: "clamp",
                      }),
                    },
                  ],
                },
              ]}
            >
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
