import React, { useMemo } from "react";
import { NativeTabs } from "expo-router/unstable-native-tabs";
import { useTranslation } from "react-i18next";
import { useTheme } from "react-native-paper";

/** Convert #RRGGBB / #RRGGBBAA → #RRGGBBAA with given alpha (0–1) */
const withAlpha = (color, alpha) => {
  if (typeof color !== "string" || !color.startsWith("#")) return color;

  const hex = color.slice(1);
  // Support both #RGB, #RRGGBB and #RRGGBBAA
  let rgb = hex;
  if (hex.length === 3) {
    rgb = hex
      .split("")
      .map((c) => c + c)
      .join("");
  } else if (hex.length === 8) {
    rgb = hex.slice(0, 6);
  } else if (hex.length !== 6) {
    return color; // invalid → return original
  }

  const alphaHex = Math.round(Math.min(1, Math.max(0, alpha)) * 255)
    .toString(16)
    .padStart(2, "0");

  return `#${rgb}${alphaHex}`;
};

const TabsLayout = () => {
  const { t } = useTranslation();
  const theme = useTheme();

  // ---- Stable color extraction (memoized) ----
  const colors = useMemo(() => {
    const c = theme?.colors ?? {};
    const isDark = theme.dark ?? false;

    const backgroundColor =
      c.surface ?? c.background ?? (isDark ? "#121212" : "#ffffff");

    const inactiveColor =
      c.inactiveColor ??
      c.onSurfaceVariant ??
      c.outline ??
      (isDark ? "#a0a0a0" : "#666666");

    // Prefer your custom progress / text color, fall back sensibly
    const activeColor =
      c.progressColor ?? c.primary ?? c.textColor ?? "#2587d8";

    // Softer selection indicator (Android indicator + iOS visual cue)
    const selectionIndicator = withAlpha(activeColor, isDark ? 0.25 : 0.12);

    return {
      backgroundColor,
      inactiveColor,
      activeColor,
      selectionIndicator,
      isDark,
    };
  }, [theme]);

  // ---- Stable labelStyle object ----
  const labelStyle = useMemo(
    () => ({
      default: {
        color: colors.inactiveColor,
        fontSize: 12,
      },
      selected: {
        color: colors.activeColor,
        fontSize: 12,
        fontWeight: "700",
      },
    }),
    [colors.inactiveColor, colors.activeColor],
  );

  // ---- Icon color object (stable) ----
  const iconColor = useMemo(
    () => ({
      default: colors.inactiveColor,
      selected: colors.activeColor,
    }),
    [colors.inactiveColor, colors.activeColor],
  );

  return (
    <NativeTabs
      backgroundColor={colors.backgroundColor}
      iconColor={iconColor}
      indicatorColor={colors.selectionIndicator} // Android only
      labelStyle={labelStyle}
      tintColor={colors.activeColor} // selected icon + label tint
      // Keeps tab bar opaque when scrolled to edge (iOS ≤ 18)
      // On iOS 26+ Liquid Glass this has limited effect, but is still safe
      disableTransparentOnScrollEdge
      // Optional: nicer keyboard behavior on Android 11+
      // tabBarRespectsIMEInsets={Platform.OS === "android"}
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
          sf={{ default: "magnifyingglass", selected: "magnifyingglass" }}
          // "search" is valid; "magnifyingglass" is the modern SF Symbol
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

export default React.memo(TabsLayout);
