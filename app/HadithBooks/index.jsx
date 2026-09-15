import React, {
  useEffect,
  useState,
  useMemo,
  useCallback,
  memo,
} from "react";
import {
  StyleSheet,
  View,
  Pressable,
  TextInput,
  Platform,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from "react-native-reanimated";
import { LegendList } from "@legendapp/list/react-native";
import { useTheme, Text, ActivityIndicator } from "react-native-paper";
import { useTranslation } from "react-i18next";
import { MaterialIcons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useHadithTranslationStore } from "../../components/store/store";
import { getHadithBooks } from "../../components/hadithData";

// ─── withAlpha (shared design language) ─────────────────────────────────────

const withAlpha = (color, alpha) => {
  if (!color || typeof color !== "string") {
    return `rgba(37, 135, 216, ${alpha})`;
  }
  if (color.startsWith("#")) {
    const raw = color.replace("#", "");
    const normalized =
      raw.length === 3
        ? raw
            .split("")
            .map((c) => c + c)
            .join("")
        : raw;
    if (normalized.length !== 6) {
      return `rgba(37, 135, 216, ${alpha})`;
    }
    const r = Number.parseInt(normalized.slice(0, 2), 16);
    const g = Number.parseInt(normalized.slice(2, 4), 16);
    const b = Number.parseInt(normalized.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  return `rgba(37, 135, 216, ${alpha})`;
};

// ─── Memoized book row ──────────────────────────────────────────────────────

const BookItem = memo(
  ({
    bookNumber,
    bookName,
    count,
    hadithsLabel,
    isArabic,
    primaryColor,
    textColor,
    inactiveColor,
    backgroundColor,
    progressColor,
    onPress,
  }) => {
    return (
      <View
        style={[
          styles.itemShadowContainer,
          {
            backgroundColor: primaryColor,
            borderRadius: 16,
            overflow: "hidden",
          },
        ]}
      >
        <Pressable
          android_ripple={{
            color: withAlpha(progressColor || "#2587d8", 0.18),
            borderless: false,
            foreground: true,
          }}
          style={({ pressed }) => [
            styles.card,
            { opacity: pressed ? 0.92 : 1 },
          ]}
          onPress={onPress}
        >
          <View style={styles.itemContent}>
            {/* Count */}
            <Text style={[styles.hadithCount, { color: inactiveColor || textColor }]}>
              {count} {hadithsLabel}
            </Text>

            {/* Name + number badge */}
            <View
              style={[
                styles.bookMeta,
                isArabic && styles.bookMetaRtl,
              ]}
            >
              <Text
                style={[
                  styles.bookName,
                  {
                    color: textColor,
                    textAlign: isArabic ? "right" : "left",
                    writingDirection: isArabic ? "rtl" : "ltr",
                  },
                ]}
                numberOfLines={2}
              >
                {bookName}
              </Text>

              <View
                style={[
                  styles.numberBadge,
                  { backgroundColor },
                ]}
              >
                <Text
                  style={[
                    styles.bookNumber,
                    { color: progressColor || textColor },
                  ]}
                >
                  {bookNumber}
                </Text>
              </View>
            </View>
          </View>
        </Pressable>
      </View>
    );
  },
  (prev, next) =>
    prev.bookNumber === next.bookNumber &&
    prev.bookName === next.bookName &&
    prev.count === next.count &&
    prev.hadithsLabel === next.hadithsLabel &&
    prev.isArabic === next.isArabic &&
    prev.primaryColor === next.primaryColor &&
    prev.textColor === next.textColor &&
    prev.inactiveColor === next.inactiveColor &&
    prev.backgroundColor === next.backgroundColor &&
    prev.progressColor === next.progressColor &&
    prev.onPress === next.onPress,
);
BookItem.displayName = "BookItem";

// ─── Main screen ────────────────────────────────────────────────────────────

const HadithsScreen = () => {
  const theme = useTheme();
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const { translationLanguage: hadithLanguage } =
    useHadithTranslationStore();
  const { collection: collectionParam } = useLocalSearchParams();
  const collection = collectionParam === "muslim" ? "muslim" : "bukhari";

  const isArabic = hadithLanguage === "arabic";

  // Stable color primitives (avoids object-identity re-renders)
  const primaryColor = theme.colors.primary;
  const textColor = theme.colors.textColor || theme.colors.onSurface;
  const inactiveColor =
    theme.colors.inactiveColor ||
    theme.colors.onSurfaceVariant ||
    theme.colors.onSurface;
  const backgroundColor = theme.colors.background;
  const progressColor = theme.colors.progressColor;
  const outlineVariant =
    theme.colors.outlineVariant || "rgba(0,0,0,0.08)";

  const hadithsLabel = t("hadiths");

  // Reanimated fade-in
  const opacity = useSharedValue(0);
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    flex: 1,
  }));

  // Precompute books once per language
  const booksArray = useMemo(
    () => getHadithBooks(collection, hadithLanguage),
    [collection, hadithLanguage],
  );

  const filteredBooks = useMemo(() => {
    if (!searchQuery.trim()) return booksArray;
    const q = searchQuery.trim().toLowerCase();
    return booksArray.filter(
      (book) =>
        book.bookName.toLowerCase().includes(q) ||
        String(book.bookNumber).includes(q),
    );
  }, [booksArray, searchQuery]);

  useEffect(() => {
    // Data is sync – brief tick then fade in
    const timer = setTimeout(() => {
      setLoading(false);
      opacity.value = withTiming(1, {
        duration: 320,
        easing: Easing.out(Easing.cubic),
      });
    }, 0);
    return () => clearTimeout(timer);
  }, [opacity]);

  const createBookPressHandler = useCallback(
    (bookNumber, bookName) => () => {
      router.push({
        pathname: "Hadiths",
        params: { collection, bookNumber, bookName },
      });
    },
    [collection, router],
  );

  // Stable handlers per book
  const pressHandlers = useMemo(() => {
    const map = new Map();
    for (const book of booksArray) {
      map.set(
        book.bookNumber,
        createBookPressHandler(book.bookNumber, book.bookName),
      );
    }
    return map;
  }, [booksArray, createBookPressHandler]);

  const renderItem = useCallback(
    ({ item }) => (
      <BookItem
        bookNumber={item.bookNumber}
        bookName={item.bookName}
        count={item.count}
        hadithsLabel={hadithsLabel}
        isArabic={isArabic}
        primaryColor={primaryColor}
        textColor={textColor}
        inactiveColor={inactiveColor}
        backgroundColor={backgroundColor}
        progressColor={progressColor}
        onPress={pressHandlers.get(item.bookNumber)}
      />
    ),
    [
      hadithsLabel,
      isArabic,
      primaryColor,
      textColor,
      inactiveColor,
      backgroundColor,
      progressColor,
      pressHandlers,
    ],
  );

  const keyExtractor = useCallback(
    (item) => String(item.bookNumber),
    [],
  );

  const ListEmptyComponent = useCallback(
    () => (
      <View style={styles.emptyContainer}>
        <Text
          style={[
            styles.emptyText,
            { color: inactiveColor },
          ]}
        >
          {searchQuery ? t("No results found") : t("Loading hadiths...")}
        </Text>
      </View>
    ),
    [inactiveColor, searchQuery, t],
  );

  if (loading) {
    return (
      <View
        style={[
          styles.loadingContainer,
          { backgroundColor: theme.colors.background },
        ]}
      >
        <ActivityIndicator
          size="large"
          color={theme.colors.progressColor}
        />
      </View>
    );
  }

  return (
    <View
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      {/* Search */}
      <View style={styles.searchContainer}>
        <TextInput
          placeholder={
            collection === "muslim"
              ? t("Search Sahih Muslim books")
              : t("Search sahih bukhari books")
          }
          onChangeText={setSearchQuery}
          value={searchQuery}
          style={[
            styles.searchBar,
            {
              backgroundColor: primaryColor,
              color: textColor,
              borderColor: outlineVariant,
            },
          ]}
          numberOfLines={1}
          placeholderTextColor={inactiveColor}
          cursorColor={progressColor}
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
        <View style={styles.searchIcon}>
          <MaterialIcons
            name="search"
            size={22}
            color={inactiveColor}
          />
        </View>
      </View>

      <Animated.View style={animatedStyle}>
        <LegendList
          data={filteredBooks}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          recycleItems
          estimatedItemSize={88}
          drawDistance={280}
          contentContainerStyle={styles.listContainer}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={ListEmptyComponent}
          keyboardShouldPersistTaps="handled"
        />
      </Animated.View>
    </View>
  );
};

export default HadithsScreen;

// ─── Styles (aligned with Home list cards) ──────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  searchContainer: {
    position: "relative",
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
  },
  searchBar: {
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingLeft: 48,
    height: 48,
    fontSize: 15,
    borderWidth: StyleSheet.hairlineWidth,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.04,
        shadowRadius: 4,
      },
      android: {
        elevation: 1,
      },
    }),
  },
  searchIcon: {
    position: "absolute",
    left: 12,
    top: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
    width: 28,
  },
  listContainer: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 24,
  },
  itemShadowContainer: {
    marginBottom: 12,
    borderRadius: 16,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  card: {
    borderRadius: 16,
    overflow: "hidden",
  },
  itemContent: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 16,
    paddingHorizontal: 16,
    minHeight: 76,
    gap: 12,
  },
  bookMeta: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 12,
  },
  bookMetaRtl: {
    flexDirection: "row-reverse",
  },
  bookName: {
    flex: 1,
    fontSize: 17,
    fontWeight: "600",
    lineHeight: 24,
  },
  numberBadge: {
    minWidth: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.04,
        shadowRadius: 3,
      },
      android: {
        elevation: 1,
      },
    }),
  },
  bookNumber: {
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  hadithCount: {
    fontSize: 13,
    fontWeight: "500",
    opacity: 0.75,
    flexShrink: 0,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 48,
    paddingHorizontal: 24,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: "500",
    textAlign: "center",
    opacity: 0.75,
  },
});