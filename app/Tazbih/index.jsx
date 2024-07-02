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
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useFocusEffect } from "@react-navigation/native";
import { Button, useTheme, IconButton } from "react-native-paper";
import { useTranslation } from "react-i18next";
import { AnimatedCircularProgress } from "react-native-circular-progress";
import { Audio } from "expo-av";
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
  const [sound, setSound] = useState();
  const maxCount = 1000;

  const saveCounterToStorage = async (counter) => {
    try {
      await AsyncStorage.setItem("counter", counter.toString());
    } catch (error) {
      console.error("Failed to save counter to Async Storage", error);
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

  useEffect(() => {
    const initializeState = async () => {
      const storedCounter = await getCounterFromStorage();
      setCounter(storedCounter);
    };

    initializeState();
  }, []);

  useEffect(() => {
    saveCounterToStorage(counter);
  }, [counter]);

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
  };

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <View style={{ flexDirection: "row", alignItems: "center" }}>
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
            </>
          )}
        </AnimatedCircularProgress>
        <Text style={{ marginTop: 10, color: theme.colors.textColor }}>
          Click to count
        </Text>
      </Pressable>
      <View
        style={[
          styles.reciteContainer,
          {
            backgroundColor: theme.colors.background,
            borderWidth: 0.5,
            borderColor: "#D2D2D2",
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
        <ScrollView>
          <Text style={[styles.reciteText, { color: theme.colors.textColor }]}>
            {recitations[reciteIndex]}
          </Text>
        </ScrollView>
        <Button
          icon="chevron-right"
          mode="contained"
          onPress={handleNextRecite}
          style={styles.navButton}
          textColor={theme.colors.textColor}
          buttonColor={theme.colors.background}
        />
      </View>
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
    width: "95%",
    height: 90,
    backgroundColor: "white",
    borderRadius: 15,
    position: "absolute",
    top: 15,
    elevation: 10,
  },

  reciteText: {
    fontSize: 20,
    flex: 1,
    textAlign: "center",
  },
  navButton: {
    width: 40,
  },
});
