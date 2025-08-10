import React from "react";
import { Tabs } from "expo-router";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useTheme } from "react-native-paper";
import { View, Text } from "react-native";

const TabsLayout = () => {
  try {
    const { t } = useTranslation();
    const theme = useTheme();

    if (!theme || !t) {
      console.error("Theme or translation not initialized");
      return (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <Text>Loading resources...</Text>
        </View>
      );
    }

    return (
      <Tabs
        screenOptions={{
          headerTitleAlign: "center",
          headerStyle: { 
            backgroundColor: theme?.colors?.primary || '#fff'
          },
          headerTitleStyle: { 
            color: theme?.colors?.textColor || '#000',
            fontSize: 20 
          },
          tabBarStyle: { 
            backgroundColor: theme?.colors?.primary,
           
          },
          tabBarActiveTintColor: theme?.colors?.textColor || '#000',
          tabBarInactiveTintColor: theme?.colors?.disabled || '#666',
        }}
      >
        <Tabs.Screen
          name="home"
          options={{
            title: t("home") || "Home",
            tabBarIcon: ({ focused, color, size }) => {
              const iconName = focused ? "home" : "home-outline";
              return <Ionicons name={iconName} size={size} color={color} />;
            },
          }}
        />
        <Tabs.Screen
          name="tools"
          options={{
            title: t("tools") || "Tools",
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
            title: t("settings") || "Settings",
            tabBarIcon: ({ focused, color, size }) => {
              const iconName = focused ? "settings" : "settings-outline";
              return <Ionicons name={iconName} size={size} color={color} />;
            },
          }}
        />
      </Tabs>
    );
  } catch (error) {
    console.error("Fatal error in Tabs Layout:", error);
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <Text>Error loading tabs: {error.message}</Text>
      </View>
    );
  }
};

export default TabsLayout;
