import { StyleSheet, View, useWindowDimensions } from "react-native";
import React from "react";
import { TabView, SceneMap, TabBar } from "react-native-tab-view";
import HadithBookmarks from "./HadithBookmarks";
import QuranBookmark from "./QuranBookmarks";
import { useTheme } from "react-native-paper";
import { useTranslation } from "react-i18next";

const renderScene = SceneMap({
  quran: QuranBookmark,
  hadith: HadithBookmarks,
});

const getRoutes = (t) => [
  { key: "quran", title: t("Quran") },
  { key: "hadith", title: t("Hadith") },
];

const index = () => {
  const layout = useWindowDimensions();
  const [index, setIndex] = React.useState(0);
  const theme = useTheme();
  const { t } = useTranslation();

  const renderTabBar = (props) => (
    <TabBar
      {...props}
      indicatorStyle={{ backgroundColor: theme.colors.progressColor }}
      style={{ backgroundColor: theme.colors.primary }}
      inactiveColor={theme.colors.inactiveColor}
      activeColor={theme.colors.progressColor}
    />
  );

  return (
    <TabView
      navigationState={{ index, routes: getRoutes(t) }}
      renderScene={renderScene}
      onIndexChange={setIndex}
      initialLayout={{ width: layout.width }}
      renderTabBar={renderTabBar}
    />
  );
};

export default index;

const styles = StyleSheet.create({});
