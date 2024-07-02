import { StyleSheet } from "react-native";
import React from "react";
import { Tabs } from "expo-router";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useTheme } from "react-native-paper";

const layout = () => {
  const { t } = useTranslation();
  const theme = useTheme();
  return (
    <Tabs
      screenOptions={{
        headerTitleAlign: "center",
        headerStyle: { backgroundColor: theme.colors.primary },
        headerTitleStyle: { color: theme.colors.textColor },
        tabBarStyle: { backgroundColor: theme.colors.primary, height: "9%" },
        tabBarAllowFontScaling: true,
        tabBarLabelStyle: { marginBottom: "10%", fontSize: 12 },
        tabBarActiveTintColor: theme.colors.textColor,
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: t("home"),
          tabBarHideOnKeyboard: true,
          tabBarIcon: ({ focused, color, size }) => {
            const iconName = focused ? "home" : "home-outline";
            return <Ionicons name={iconName} size={size} color={color} />;
          },
        }}
      />
      <Tabs.Screen
        name="tools"
        options={{
          title: t("tools"),
          tabBarIcon: ({ focused, color, size }) => {
            const iconName = focused ? "toolbox" : "toolbox-outline";
            return (
              <MaterialCommunityIcons
                name={iconName}
                size={size}
                color={color}
              />
            );
          },
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: t("settings"),
          tabBarIcon: ({ focused, color, size }) => {
            const iconName = focused ? "settings" : "settings-outline";
            return <Ionicons name={iconName} size={size} color={color} />;
          },
        }}
      />
    </Tabs>
  );
};

export default layout;

const styles = StyleSheet.create({});
