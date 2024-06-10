import { StyleSheet, Text, View } from "react-native";
import React, { useCallback } from "react";
import { useNavigation } from "@react-navigation/native";
import { useFocusEffect } from "expo-router";
import { useTheme } from "react-native-paper";
import { useTranslation } from "react-i18next";

const PashtoNamaz = () => {
  const navigation = useNavigation();
  const theme = useTheme();
  const { t } = useTranslation();

  useFocusEffect(
    useCallback(() => {
      navigation.setOptions({
        title: t("Allah Names"),
        headerShown: true,
        headerTitleStyle: { color: theme.colors.textColor },
      });
    }, [])
  );

  return (
    <View
      style={{
        justifyContent: "center",
        alignItems: "center",
        flex: 1,
      }}
    >
      <Text>PashtoNamaz</Text>
    </View>
  );
};

export default PashtoNamaz;

const styles = StyleSheet.create({});
