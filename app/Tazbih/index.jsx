import React, {
  useState,
  useCallback,
  useLayoutEffect,
  useEffect,
} from "react";
import { StyleSheet, Text, Pressable, View, Vibration } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useFocusEffect } from "@react-navigation/native";
import { Button, useTheme, IconButton } from "react-native-paper";
import { useTranslation } from "react-i18next";
import { AnimatedCircularProgress } from "react-native-circular-progress";
import { Audio } from "expo-av";
import AsyncStorage from "@react-native-async-storage/async-storage";

const recitations = ["سبحان الله", "الحمد لله", "الله أكبر"];
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
  const [soundMode, setSoundMode] = useState("sound");
  const [sound, setSound] = useState();
  const [maxCount, setMaxCount] = useState(33);
  const [badgeCount, setBadgeCount] = useState(0);

  const saveCounterToStorage = async (counter) => {
    try {
      await AsyncStorage.setItem("counter", counter.toString());
    } catch (error) {
      console.error("Failed to save counter to Async Storage", error);
    }
  };

  const saveBadgeCountToStorage = async (badgeCount) => {
    try {
      await AsyncStorage.setItem("badgeCount", badgeCount.toString());
    } catch (error) {
      console.error("Failed to save badge count to Async Storage", error);
    }
  };

  const getCounterFromStorage = async () => {
    try {
      const counterValue = await AsyncStorage.getItem("counter");

      return counterValue !== null ? parseInt(counterValue, 10) : 0;
    } catch (error) {
      console.error("Failed to retrieve counter from Async Storage", error);
      return 0;
    }
  };

  const getBadgeCountFromStorage = async () => {
    try {
      const badgeCountValue = await AsyncStorage.getItem("badgeCount");

      return badgeCountValue !== null ? parseInt(badgeCountValue) : 0;
    } catch (error) {
      console.error("Failed to retrieve badge count from Async Storage", error);
      return 0;
    }
  };

  useEffect(() => {
    const initializeState = async () => {
      const storedCounter = await getCounterFromStorage();
      const storedBadgeCount = await getBadgeCountFromStorage();
      console.log(storedBadgeCount);
      setCounter(storedCounter);
      setBadgeCount(storedBadgeCount);
    };

    initializeState();
  }, []);

  useEffect(() => {
    saveCounterToStorage(counter);
  }, [counter]);

  useEffect(() => {
    saveBadgeCountToStorage(badgeCount);
  }, [badgeCount]);

  useEffect(() => {
    let soundObject;

    const loadSound = async () => {
      try {
        const { sound } = await Audio.Sound.createAsync(
          require("../../assets/audio/screen-tap2.mp3")
        );
        setSound(sound);
        soundObject = sound;
      } catch (error) {
        console.error("Failed to load sound", error);
      }
    };

    loadSound();

    return () => {
      if (soundObject) {
        soundObject.unloadAsync();
      }
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      navigation.setOptions({
        title: t(""),
        headerShown: true,
        headerTitleStyle: { color: theme.colors.textColor },
      });
    }, [navigation, t, theme.colors.textColor])
  );

  const handleReset = () => {
    setCounter(0);
    setBadgeCount(0);
  };

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <Button
            mode="contained"
            onPress={handleCycleMaxCount}
            textColor={theme.colors.textColor}
            buttonColor={theme.colors.background}
          >
            {maxCount}
          </Button>
          <IconButton
            icon="refresh"
            onPress={handleReset}
            iconColor={theme.colors.textColor}
          />
          <IconButton
            icon={soundModes[soundMode]}
            onPress={switchSoundMode}
            iconColor={theme.colors.textColor}
          />
        </View>
      ),
    });
  }, [navigation, soundMode, maxCount, theme.colors.textColor]);

  const switchSoundMode = () => {
    setSoundMode((prevMode) => {
      if (prevMode === "sound") return "vibrate";
      if (prevMode === "vibrate") return "silent";
      return "sound";
    });
  };

  const handleIncrement = async () => {
    setCounter((prevCounter) => {
      const newCounter = prevCounter + 1;
      if (newCounter === maxCount) {
        setBadgeCount((prevBadgeCount) => prevBadgeCount + 1);
        saveBadgeCountToStorage(badgeCount + 1); // Save the updated badge count
        return 0;
      }
      saveCounterToStorage(newCounter); // Save the updated counter
      return newCounter;
    });

    if (soundMode === "sound" && sound) {
      try {
        await sound.replayAsync();
      } catch (error) {
        console.error("Failed to play sound", error);
      }
    } else if (soundMode === "vibrate") {
      Vibration.vibrate(100);
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

  const handleCycleMaxCount = () => {
    setMaxCount((prevMaxCount) => {
      if (prevMaxCount === 33) return 66;
      if (prevMaxCount === 66) return 99;
      return 33;
    });
  };

  return (
    <View
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      <Pressable
        style={styles.progressContainer}
        onPress={handleIncrement}
        android_ripple={{
          color: theme.colors.ripple,
          borderless: false,
        }}
      >
        <AnimatedCircularProgress
          size={200}
          width={10}
          fill={(counter / maxCount) * 100}
          tintColor={theme.colors.textColor}
          backgroundColor={theme.colors.progressColor}
        >
          {() => (
            <>
              <Text
                style={[styles.counterText, { color: theme.colors.textColor }]}
              >
                {counter}
              </Text>
              <View style={styles.badgeContainer}>
                <Text style={styles.badgeText}>{badgeCount}</Text>
              </View>
            </>
          )}
        </AnimatedCircularProgress>
        <Text style={{ marginTop: 10, color: theme.colors.textColor }}>
          Click to count
        </Text>
        <View
          style={[
            styles.reciteContainer,
            {
              backgroundColor: theme.colors.background,
              borderWidth: 0.5,
              borderColor: theme.colors.textColor,
            },
          ]}
        >
          <Button
            icon="chevron-left"
            mode="contained"
            onPress={handlePreviousRecite}
            textColor={theme.colors.textColor}
            buttonColor={theme.colors.background}
            style={styles.navButton}
          />
          <Text style={[styles.reciteText, { color: theme.colors.textColor }]}>
            {recitations[reciteIndex]}
          </Text>
          <Button
            icon="chevron-right"
            mode="contained"
            onPress={handleNextRecite}
            style={styles.navButton}
            textColor={theme.colors.textColor}
            buttonColor={theme.colors.background}
          />
        </View>
      </Pressable>
    </View>
  );
};

export default Tazbih;

const styles = StyleSheet.create({
  container: {
    justifyContent: "center",
    alignItems: "center",
    flex: 1,
  },
  progressContainer: {
    justifyContent: "center",
    alignItems: "center",
    flex: 1,
    width: "100%",
  },
  counterText: {
    fontSize: 30,
    position: "absolute",
  },
  reciteContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "85%",
    padding: 10,
    height: 90,
    backgroundColor: "white",
    borderRadius: 15,
    marginBottom: 20,
    position: "absolute",
    bottom: 0,
    elevation: 10,
  },
  badgeContainer: {
    marginTop: 100,
  },
  badgeText: {
    color: "red",
    fontSize: 24,
  },

  reciteText: {
    fontSize: 20,
    flex: 1,
    textAlign: "center",
  },
});
