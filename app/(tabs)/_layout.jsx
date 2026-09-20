import React from "react";
import { NativeTabs } from "expo-router/unstable-native-tabs";
import { useTranslation } from "react-i18next";
import { useTheme } from "react-native-paper";

const withAlpha = (color, alpha) => {
  if (typeof color !== "string" || !color.startsWith("#")) return color;
  const hex = color.slice(1);
  const rgb = hex.length === 8 ? hex.slice(0, 6) : hex;
  const alphaHex = Math.round(alpha * 255)
    .toString(16)
    .padStart(2, "0");
  return `#${rgb}${alphaHex}`;
};

const TabsLayout = () => {
  const { t } = useTranslation();
  const theme = useTheme();
  const colors = theme?.colors || {};
  const backgroundColor = colors.surface || colors.primary || "#ffffff";
  const inactiveColor =
    colors.onSurfaceVariant || colors.inactiveColor || "#666666";
  const activeColor = colors.progressColor || colors.textColor || "#2587d8";
  const selectionIndicator = theme.dark
    ? withAlpha(activeColor, 0.25)
    : withAlpha(activeColor, 0.1);

  return (
    <NativeTabs
      backgroundColor={backgroundColor}
      iconColor={{ default: inactiveColor, selected: activeColor }}
      indicatorColor={selectionIndicator}
      labelStyle={{
        default: { color: inactiveColor, fontSize: 12 },
        selected: { color: activeColor, fontSize: 12, fontWeight: "700" },
      }}
      tintColor={activeColor}
      disableTransparentOnScrollEdge
    >
      <NativeTabs.Trigger name="home">
        <NativeTabs.Trigger.Icon
          sf={{ default: "house", selected: "house.fill" }}
          md={{ default: "home", selected: "home" }}
        />
        <NativeTabs.Trigger.Label>{t("home")}</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="search">
        <NativeTabs.Trigger.Icon
          sf={{ default: "search", selected: "search.fill" }}
          md={{ default: "search", selected: "search" }}
        />
        <NativeTabs.Trigger.Label>{t("Search")}</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="tools">
        <NativeTabs.Trigger.Icon
          sf={{
            default: "graduationcap",
            selected: "graduationcap.fill",
          }}
          md={{ default: "school", selected: "school" }}
        />
        <NativeTabs.Trigger.Label>{t("learn")}</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="settings">
        <NativeTabs.Trigger.Icon
          sf={{ default: "gearshape", selected: "gearshape.fill" }}
          md={{ default: "settings", selected: "settings" }}
        />
        <NativeTabs.Trigger.Label>{t("settings")}</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
};

export default TabsLayout;
