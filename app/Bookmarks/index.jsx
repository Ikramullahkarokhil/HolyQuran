import { StyleSheet, View, useWindowDimensions } from "react-native";
import React from "react";
import { TabView, SceneMap, TabBar } from "react-native-tab-view";
import HadithBookmarks from "./HadithBookmarks";
import QuranBookmark from "./QuranBookmarks";
import { useTheme } from "react-native-paper";

const renderScene = SceneMap({
  quran: QuranBookmark,
  hadith: HadithBookmarks,
});

const routes = [
  { key: "quran", title: "Quran" },
  { key: "hadith", title: "Hadith" },
];

const index = () => {
  const layout = useWindowDimensions();
  const [index, setIndex] = React.useState(0);
  const theme = useTheme();

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
      navigationState={{ index, routes }}
      renderScene={renderScene}
      onIndexChange={setIndex}
      initialLayout={{ width: layout.width }}
      renderTabBar={renderTabBar}
    />
  );
};

export default index;

const styles = StyleSheet.create({});
