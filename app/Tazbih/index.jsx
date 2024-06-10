import React, { useState, useCallback } from "react";
import { StyleSheet, Text, View, Pressable, Dimensions } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useFocusEffect } from "expo-router";
import { useTheme, ProgressBar } from "react-native-paper";
import { useTranslation } from "react-i18next";

const Tazbih = () => {
  const navigation = useNavigation();
  const theme = useTheme();
  const { t } = useTranslation();

  const [counter, setCounter] = useState(0);
  const [progress, setProgress] = useState(0);

  useFocusEffect(
    useCallback(() => {
      navigation.setOptions({
        title: t("Allah Names"),
        headerShown: true,
        headerTitleStyle: { color: theme.colors.textColor },
      });
    }, [navigation, t, theme.colors.textColor])
  );

  const handleIncrement = () => {
    const newCounter = counter + 1;
    const newProgress = (newCounter / 100) * 100;
    setCounter(newCounter);
    setProgress(newProgress);
  };

  return (
    <Pressable
      style={styles.container}
      onPress={handleIncrement}
      android_ripple={{
        color: "rgba(0, 0, 0, 0.1)",
        borderless: false,
      }}
    >
      <View style={styles.counterContainer}></View>
      <ProgressBar color="red" progress={0.5} visible={true} />
      <View style={[styles.progressContainer, { backgroundColor: "red" }]}>
        <View style={[styles.subProgress2]}>
          <View style={styles.subProgress}>
            <Text style={styles.counterText}>{counter}</Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
};

export default Tazbih;

const styles = StyleSheet.create({
  container: {
    justifyContent: "center",
    alignItems: "center",
    flex: 1,
  },
  counterContainer: {
    marginBottom: 20,
  },
  counterText: {
    fontSize: 24,
  },
  progressContainer: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    height: 140,
    width: 140,
    borderRadius: 100,
  },
  subProgress: {
    alignItems: "center",
    justifyContent: "center",
    height: 120,
    width: 120,
    borderWidth: 1,
    borderRadius: 100,
    backgroundColor: "white",
  },
  subProgress2: {
    borderWidth: 1,
    borderRadius: 100,
    alignItems: "center",
    justifyContent: "center",
  },
});
