import React, { useState, useEffect, useMemo, useCallback, memo } from "react";
import {
  StyleSheet,
  Text,
  View,
  Pressable,
  Platform,
  TextInput,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  withRepeat,
  Easing,
} from "react-native-reanimated";
import { LegendList } from "@legendapp/list/react-native";
import { Icon } from "react-native-paper";
import { getSurahNames } from "../../../components/quranData";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import useThemeStore from "../../../components/store/useThemeStore";
import { darkTheme, lightTheme } from "../../../components/Theme";

// ─── Helpers ────────────────────────────────────────────────────────────────

const withAlpha = (color, alpha) => {
  if (!color || typeof color !== "string" || !color.startsWith("#")) {
    return `rgba(37, 135, 216, ${alpha})`;
  }
  const hex = color.replace("#", "");
  let fullHex = hex;
  if (hex.length === 3) {
    fullHex = hex
      .split("")
      .map((c) => c + c)
      .join("");
  } else if (hex.length === 8) {
    fullHex = hex.slice(0, 6);
  }
  if (fullHex.length !== 6) return `rgba(37, 135, 216, ${alpha})`;

  const r = Number.parseInt(fullHex.slice(0, 2), 16);
  const g = Number.parseInt(fullHex.slice(2, 4), 16);
  const b = Number.parseInt(fullHex.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

// ─── Search Bar Component ───────────────────────────────────────────────────

const SearchBar = memo(
  ({ value, onChangeText, colors, placeholder, isRtl }) => {
    return (
      <View
        style={[
          styles.searchContainer,
          {
            backgroundColor: colors.searchBg,
            borderColor: colors.border,
            flexDirection: isRtl ? "row-reverse" : "row",
          },
        ]}
      >
        <Icon source="magnify" size={20} color={colors.secondary} />
        <TextInput
          style={[
            styles.searchInput,
            {
              color: colors.text,
              textAlign: isRtl ? "right" : "left",
            },
          ]}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.secondary}
          returnKeyType="search"
          autoCorrect={false}
          clearButtonMode="while-editing"
        />
        {value.length > 0 && Platform.OS === "android" && (
          <Pressable onPress={() => onChangeText("")} hitSlop={8}>
            <Icon source="close-circle" size={18} color={colors.secondary} />
          </Pressable>
        )}
      </View>
    );
  },
);
SearchBar.displayName = "SearchBar";

// ─── Memoized Surah Card ────────────────────────────────────────────────────

const SurahItem = memo(
  ({ surah, labels, colors, onSelect, rtl, textAlign, writingDirection }) => {
    const isMeccan = surah.type === "Meccan";
    const typeLabel = isMeccan ? labels.meccan : labels.medinan;

    const scale = useSharedValue(1);

    const animatedCardStyle = useAnimatedStyle(() => ({
      transform: [{ scale: scale.value }],
    }));

    const handlePressIn = () => {
      // eslint-disable-next-line react-hooks/immutability
      scale.value = withSpring(0.98, { damping: 15, stiffness: 300 });
    };

    const handlePressOut = () => {
      // eslint-disable-next-line react-hooks/immutability
      scale.value = withSpring(1, { damping: 15, stiffness: 300 });
    };

    const handlePress = () => {
      onSelect(surah);
    };

    return (
      <Animated.View style={[styles.cardWrapper, animatedCardStyle]}>
        <Pressable
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          onPress={handlePress}
          android_ripple={{
            color: colors.ripple,
            borderless: false,
            foreground: true,
          }}
          style={[
            styles.card,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              flexDirection: rtl ? "row-reverse" : "row",
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel={`${surah.name}, ${surah.tname}`}
        >
          {/* Surah Main Details */}
          <View style={styles.content}>
            <Text
              style={[
                styles.arabicName,
                {
                  color: colors.text,
                  textAlign: "right",
                  writingDirection: "rtl",
                },
              ]}
              numberOfLines={1}
            >
              {surah.name}
            </Text>

            <Text
              style={[
                styles.transliterated,
                { color: colors.secondary, textAlign, writingDirection },
              ]}
              numberOfLines={1}
            >
              {surah.tname}
            </Text>

            <View
              style={[
                styles.metaRow,
                { justifyContent: rtl ? "flex-end" : "flex-start" },
              ]}
            >
              <View
                style={[
                  styles.typeChip,
                  {
                    backgroundColor: isMeccan
                      ? colors.meccanBg
                      : colors.medinanBg,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.typeText,
                    {
                      color: isMeccan ? colors.meccanText : colors.medinanText,
                      textAlign,
                      writingDirection,
                    },
                  ]}
                >
                  {typeLabel}
                </Text>
              </View>

              <Text
                style={[
                  styles.verseCount,
                  { color: colors.secondary, textAlign, writingDirection },
                ]}
              >
                {`${surah.ayas} ${labels.verseLabel}`}
              </Text>
            </View>
          </View>

          {/* Surah Number Badge */}
          <View
            style={[
              styles.numberBadge,
              {
                backgroundColor: colors.badgeBg,
                borderColor: colors.badgeBorder,
                marginLeft: rtl ? 6 : 0,
                marginRight: rtl ? 0 : 6,
              },
            ]}
          >
            <Text style={[styles.numberText, { color: colors.accent }]}>
              {surah.index}
            </Text>
          </View>
          {/* Chevron Indicator */}
          <View style={styles.chevronWrap}>
            <Icon
              source={rtl ? "chevron-left" : "chevron-right"}
              size={20}
              color={colors.secondary}
            />
          </View>
        </Pressable>
      </Animated.View>
    );
  },
  (prev, next) =>
    prev.surah.index === next.surah.index &&
    prev.surah.name === next.surah.name &&
    prev.surah.tname === next.surah.tname &&
    prev.surah.ayas === next.surah.ayas &&
    prev.surah.type === next.surah.type &&
    prev.labels === next.labels &&
    prev.colors === next.colors &&
    prev.onSelect === next.onSelect &&
    prev.rtl === next.rtl &&
    prev.textAlign === next.textAlign &&
    prev.writingDirection === next.writingDirection,
);
SurahItem.displayName = "SurahItem";

// ─── Empty Search State ─────────────────────────────────────────────────────

const EmptyState = memo(({ colors, onClear, t }) => (
  <View style={styles.emptyContainer}>
    <Icon source="magnify-remove-outline" size={48} color={colors.secondary} />
    <Text style={[styles.emptyTitle, { color: colors.text }]}>
      {t("No Surahs Found") || "No Surahs Found"}
    </Text>
    <Text style={[styles.emptySubtitle, { color: colors.secondary }]}>
      {t("Try searching by another name or index number") ||
        "Try searching by another name or index number"}
    </Text>
    {onClear && (
      <Pressable
        onPress={onClear}
        style={[styles.clearSearchBtn, { backgroundColor: colors.badgeBg }]}
      >
        <Text style={[styles.clearSearchText, { color: colors.accent }]}>
          {t("Clear Search") || "Clear Search"}
        </Text>
      </Pressable>
    )}
  </View>
));
EmptyState.displayName = "EmptyState";

// ─── Skeleton Loading State ─────────────────────────────────────────────────

const LoadingState = memo(({ colors, rtl }) => {
  const pulse = useSharedValue(0.4);

  useEffect(() => {
    pulse.value = withRepeat(
      withTiming(0.9, { duration: 800, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
  }, [pulse]);

  const pulseStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));

  return (
    <View style={styles.loadingContainer}>
      {Array.from({ length: 8 }).map((_, i) => (
        <View
          key={i}
          style={[
            styles.skeletonCard,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              flexDirection: rtl ? "row-reverse" : "row",
            },
          ]}
        >
          <Animated.View
            style={[
              styles.skeletonBadge,
              pulseStyle,
              {
                backgroundColor: colors.skeleton,
                marginLeft: rtl ? 12 : 0,
                marginRight: rtl ? 0 : 12,
              },
            ]}
          />
          <View
            style={[
              styles.skeletonBody,
              { alignItems: rtl ? "flex-end" : "flex-start" },
            ]}
          >
            <Animated.View
              style={[
                styles.skeletonLineWide,
                pulseStyle,
                { backgroundColor: colors.skeleton },
              ]}
            />
            <Animated.View
              style={[
                styles.skeletonLineNarrow,
                pulseStyle,
                { backgroundColor: colors.skeleton },
              ]}
            />
          </View>
        </View>
      ))}
    </View>
  );
});
LoadingState.displayName = "LoadingState";

// ─── Main Home Screen ───────────────────────────────────────────────────────

const Home = () => {
  const [surahs, setSurahs] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);

  const isDarkTheme = useThemeStore((s) => s.isDarkTheme);
  const theme = isDarkTheme ? darkTheme : lightTheme;
  const { t } = useTranslation();
  const router = useRouter();

  const isRtl = true;

  const opacity = useSharedValue(0);
  const animatedContainerStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    flex: 1,
  }));

  // Stable theme colors
  const colors = useMemo(() => {
    const accentColor = theme.colors.progressColor || theme.colors.textColor;
    return {
      card: theme.colors.primary,
      text: theme.colors.textColor,
      secondary: isDarkTheme ? "rgba(255,255,255,0.6)" : "rgba(0,0,0,0.55)",
      accent: accentColor,
      ripple: withAlpha(accentColor, 0.12),
      badgeBg: withAlpha(accentColor, 0.08),
      badgeBorder: withAlpha(accentColor, 0.2),
      border: isDarkTheme ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.05)",
      searchBg: isDarkTheme ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.03)",
      skeleton: isDarkTheme ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)",
      meccanBg: isDarkTheme
        ? "rgba(46, 204, 113, 0.15)"
        : "rgba(46, 204, 113, 0.12)",
      meccanText: isDarkTheme ? "#2ecc71" : "#27ae60",
      medinanBg: isDarkTheme
        ? "rgba(52, 152, 219, 0.15)"
        : "rgba(52, 152, 219, 0.12)",
      medinanText: isDarkTheme ? "#3498db" : "#2980b9",
    };
  }, [theme, isDarkTheme]);

  const labels = useMemo(
    () => ({
      meccan: t("Meccan") || "مكية",
      medinan: t("Medinan") || "مدنية",
      verseLabel: t("آيات") || "آيات",
    }),
    [t],
  );

  // Fetch Surahs Data
  useEffect(() => {
    let cancelled = false;

    const loadData = async () => {
      try {
        setLoading(true);
        const data = getSurahNames();
        if (!cancelled && Array.isArray(data)) {
          setSurahs(data);
        }
      } catch (e) {
        console.error("Failed to load surah list:", e);
      } finally {
        if (!cancelled) {
          setLoading(false);
          opacity.value = withTiming(1, {
            duration: 250,
            easing: Easing.out(Easing.cubic),
          });
        }
      }
    };

    loadData();
    return () => {
      cancelled = true;
    };
  }, [opacity]);

  // Search Filter Optimization
  const filteredSurahs = useMemo(() => {
    if (!searchQuery.trim()) return surahs;
    const q = searchQuery.trim().toLowerCase();
    return surahs.filter((s) => {
      const matchIndex = String(s.index) === q;
      const matchName = s.name && s.name.toLowerCase().includes(q);
      const matchTName = s.tname && s.tname.toLowerCase().includes(q);
      return matchIndex || matchName || matchTName;
    });
  }, [surahs, searchQuery]);

  // Single Stable Navigation Handler
  const handleSelectSurah = useCallback(
    (surah) => {
      router.navigate({
        pathname: "/SurahDetails",
        params: {
          surahId: String(surah.index),
          surahName: surah.name,
          surahTname: surah.tname,
          surahType: surah.type,
          verseCount: String(surah.ayas),
        },
      });
    },
    [router],
  );

  const handleBookmarks = useCallback(() => {
    router.push("/Bookmarks");
  }, [router]);

  const renderItem = useCallback(
    ({ item }) => (
      <SurahItem
        surah={item}
        labels={labels}
        colors={colors}
        onSelect={handleSelectSurah}
        rtl={isRtl}
        textAlign={isRtl ? "right" : "left"}
        writingDirection={isRtl ? "rtl" : "ltr"}
      />
    ),
    [labels, colors, handleSelectSurah, isRtl],
  );

  const keyExtractor = useCallback((item) => String(item.index), []);

  const ListHeader = useMemo(
    () => (
      <View style={styles.headerContainer}>
        <SearchBar
          value={searchQuery}
          onChangeText={setSearchQuery}
          colors={colors}
          placeholder={t("Search Surahs...") || "Search Surahs..."}
          isRtl={isRtl}
        />
      </View>
    ),
    [colors, isRtl, searchQuery, t],
  );

  if (loading) {
    return (
      <View
        style={[styles.container, { backgroundColor: theme.colors.background }]}
      >
        <LoadingState colors={colors} rtl={isRtl} />
      </View>
    );
  }

  return (
    <View
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      <Animated.View style={animatedContainerStyle}>
        <LegendList
          data={filteredSurahs}
          extraData={isDarkTheme ? "dark" : "light"}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          recycleItems
          estimatedItemSize={92}
          drawDistance={400}
          ListHeaderComponent={ListHeader}
          ListEmptyComponent={
            <EmptyState
              colors={colors}
              onClear={searchQuery ? () => setSearchQuery("") : null}
              t={t}
            />
          }
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      </Animated.View>

      {/* Floating Bookmarks Action Button */}
      <Pressable
        style={({ pressed }) => [
          styles.fab,
          styles.fabLtr,
          { backgroundColor: colors.accent },
          pressed && { opacity: 0.9, transform: [{ scale: 0.92 }] },
        ]}
        onPress={handleBookmarks}
        accessibilityRole="button"
        accessibilityLabel={t("Bookmarks") || "Bookmarks"}
      >
        <Icon source="bookmark" size={24} color="#FFFFFF" />
      </Pressable>
    </View>
  );
};

export default Home;

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 100,
  },

  // Header & Search
  headerContainer: {
    marginBottom: 14,
    paddingTop: 4,
  },
  headerTitleRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: "700",
    fontFamily: Platform.select({
      ios: "System",
      android: "sans-serif-medium",
    }),
  },
  surahCountBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  surahCountText: {
    fontSize: 12,
    fontWeight: "700",
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    height: 46,
    borderRadius: 14,
    borderWidth: 1,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    height: "100%",
    paddingVertical: 0,
  },

  // Surah Card
  cardWrapper: {
    marginBottom: 10,
    borderRadius: 16,
  },
  card: {
    flexDirection: "row-reverse",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 16,
    borderWidth: 1,
    minHeight: 82,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.04,
        shadowRadius: 6,
      },
      android: {
        elevation: 1.5,
      },
    }),
  },

  // Number Badge (Right Side)
  numberBadge: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 6,
  },
  numberText: {
    fontSize: 14,
    fontWeight: "800",
  },

  // Surah Details Content
  content: {
    flex: 1,
    justifyContent: "center",
  },
  arabicName: {
    fontSize: 20,
    fontWeight: "600",
    lineHeight: 28,
    fontFamily: "Amiri-Regular",
    textAlign: "right",
    writingDirection: "rtl",
    marginBottom: 1,
  },
  transliterated: {
    fontSize: 13,
    fontWeight: "500",
    marginBottom: 6,
    letterSpacing: 0.1,
    textAlign: "right",
    writingDirection: "rtl",
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  typeChip: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  typeText: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  verseCount: {
    fontSize: 12,
    fontWeight: "500",
  },

  // Left Chevron
  chevronWrap: {
    paddingLeft: 4,
  },

  // Floating Action Button
  fab: {
    position: "absolute",
    bottom: 28,
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: "center",
    justifyContent: "center",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
      },
      android: {
        elevation: 6,
      },
    }),
  },
  fabLtr: {
    right: 20,
  },
  fabRtl: {
    left: 20,
  },

  // Empty Search View
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 48,
    paddingHorizontal: 24,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: "600",
    marginTop: 12,
    marginBottom: 4,
  },
  emptySubtitle: {
    fontSize: 13,
    textAlign: "center",
    lineHeight: 18,
    marginBottom: 16,
  },
  clearSearchBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  clearSearchText: {
    fontSize: 13,
    fontWeight: "600",
  },

  // Skeleton Loader
  skeletonCard: {
    alignItems: "center",
    marginBottom: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    minHeight: 82,
    borderRadius: 16,
    borderWidth: 1,
  },
  skeletonBadge: {
    width: 44,
    height: 44,
    borderRadius: 12,
  },
  skeletonBody: {
    flex: 1,
    justifyContent: "center",
    alignItems: "flex-end",
    gap: 8,
  },
  skeletonLineWide: {
    height: 16,
    width: "65%",
    borderRadius: 6,
  },
  skeletonLineNarrow: {
    height: 11,
    width: "40%",
    borderRadius: 4,
  },
});
