import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
  memo,
} from "react";
import {
  View,
  Text,
  FlatList,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Platform,
} from "react-native";
import { Icon, useTheme } from "react-native-paper";
import { createAudioPlayer } from "expo-audio";
import { useTranslation } from "react-i18next";
import { RECITERS, getAyahAudioUrl } from "../../components/reciters.js";
import { useReciterStore } from "../../components/store/useReciterStore";
import { useAppLanguageStore } from "../../components/store/store";
import {
  getTextAlignment,
  getWritingDirection,
  getFlexDirection,
} from "../../components/utils/rtlUtils";

const withAlpha = (color, alpha) => {
  if (!color || typeof color !== "string")
    return `rgba(37, 135, 216, ${alpha})`;
  if (color.startsWith("#")) {
    const raw = color.replace("#", "");
    const normalized =
      raw.length === 3
        ? raw
            .split("")
            .map((c) => c + c)
            .join("")
        : raw;
    const r = parseInt(normalized.slice(0, 2), 16);
    const g = parseInt(normalized.slice(2, 4), 16);
    const b = parseInt(normalized.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  return `rgba(37, 135, 216, ${alpha})`;
};

// ─── Header: Currently Selected Reciter ──────────────────────────────────────

const SelectedReciterCard = memo(
  ({
    selectedVariant,
    isPlaying,
    isLoading,
    onTogglePreview,
    themeColors,
    flexDir,
    textAlign,
    writingDir,
    t,
  }) => {
    if (!selectedVariant) return null;

    const { progressColor, textColor } = themeColors;

    return (
      <View
        style={[
          styles.headerCard,
          {
            backgroundColor: withAlpha(progressColor, 0.08),
            borderColor: withAlpha(progressColor, 0.3),
          },
        ]}
      >
        <View style={[styles.headerTopRow, { flexDirection: flexDir }]}>
          <View
            style={[
              styles.activePill,
              { backgroundColor: progressColor, flexDirection: flexDir },
            ]}
          >
            <View style={styles.activeDot} />
            <Text style={styles.activePillText}>{t("Currently selected")}</Text>
          </View>
        </View>

        <View style={[styles.headerContent, { flexDirection: flexDir }]}>
          <View style={styles.textDetails}>
            <Text
              style={[
                styles.headerReciterName,
                { color: textColor, textAlign, writingDirection: writingDir },
              ]}
              numberOfLines={1}
            >
              {selectedVariant.name}
            </Text>
            <View
              style={[
                styles.badgeRow,
                { flexDirection: flexDir, marginTop: 4 },
              ]}
            >
              <View
                style={[
                  styles.badge,
                  { backgroundColor: withAlpha(progressColor, 0.18) },
                ]}
              >
                <Icon source="tune-variant" size={12} color={progressColor} />
                <Text style={[styles.badgeText, { color: progressColor }]}>
                  {selectedVariant.bitrate}
                </Text>
              </View>
            </View>
          </View>

          <Pressable
            onPress={() => onTogglePreview(selectedVariant.id)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={
              isPlaying ? t("Pause preview") : t("Play preview")
            }
            style={({ pressed }) => [
              styles.headerPreviewBtn,
              { backgroundColor: progressColor },
              pressed && { opacity: 0.85 },
            ]}
          >
            {isLoading ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <Icon
                source={isPlaying ? "pause" : "play"}
                size={22}
                color="#FFF"
              />
            )}
          </Pressable>
        </View>
      </View>
    );
  },
);
SelectedReciterCard.displayName = "SelectedReciterCard";

// ─── Deduplicated Reciter Card Component ─────────────────────────────────────

const ReciterCard = memo(
  ({
    group,
    selectedReciterId,
    playingId,
    loadingId,
    onSelectVariant,
    onTogglePreview,
    themeColors,
    flexDir,
    textAlign,
    writingDir,
  }) => {
    const { progressColor, textColor, primaryColor, outlineColor } =
      themeColors;

    // Check if any variant inside this grouped reciter is selected
    const activeVariant = group.variants.find(
      (v) => v.id === selectedReciterId,
    );
    const isSelected = Boolean(activeVariant);

    // Default variant to preview (either currently active or highest quality)
    const previewVariant = activeVariant || group.variants[0];
    const isPlaying = playingId === previewVariant.id;
    const isLoading = loadingId === previewVariant.id;

    return (
      <View
        style={[
          styles.card,
          {
            backgroundColor: primaryColor,
            borderColor: isSelected
              ? progressColor
              : withAlpha(outlineColor || "#000", 0.08),
            borderWidth: isSelected ? 2 : StyleSheet.hairlineWidth,
          },
        ]}
      >
        <View style={[styles.cardContent, { flexDirection: flexDir }]}>
          {/* Selection Radio / Check Indicator */}
          <Pressable
            onPress={() => onSelectVariant(previewVariant.id)}
            style={[
              styles.radioCircle,
              {
                borderColor: isSelected
                  ? progressColor
                  : withAlpha(textColor, 0.3),
                backgroundColor: isSelected ? progressColor : "transparent",
              },
            ]}
          >
            {isSelected && <Icon source="check" size={14} color="#FFF" />}
          </Pressable>

          {/* Reciter Details & Bitrate Quality Selectors */}
          <View style={styles.textDetails}>
            <Pressable onPress={() => onSelectVariant(previewVariant.id)}>
              <Text
                style={[
                  styles.reciterName,
                  { color: textColor, textAlign, writingDirection: writingDir },
                ]}
                numberOfLines={1}
              >
                {group.name}
              </Text>
            </Pressable>

            {/* Quality Selector Pills */}
            <View
              style={[
                styles.badgeRow,
                { flexDirection: flexDir, flexWrap: "wrap", marginTop: 6 },
              ]}
            >
              {group.variants.map((variant) => {
                const isQualitySelected = variant.id === selectedReciterId;
                return (
                  <Pressable
                    key={String(variant.id)}
                    onPress={() => onSelectVariant(variant.id)}
                    style={({ pressed }) => [
                      styles.qualityChip,
                      {
                        backgroundColor: isQualitySelected
                          ? progressColor
                          : withAlpha(progressColor, 0.1),
                        borderColor: isQualitySelected
                          ? progressColor
                          : withAlpha(progressColor, 0.2),
                      },
                      pressed && { opacity: 0.8 },
                    ]}
                  >
                    <Text
                      style={[
                        styles.qualityChipText,
                        { color: isQualitySelected ? "#FFF" : progressColor },
                      ]}
                    >
                      {variant.bitrate}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* Audio Preview Button */}
          <Pressable
            onPress={(e) => {
              e.stopPropagation();
              onTogglePreview(previewVariant.id);
            }}
            hitSlop={8}
            style={({ pressed }) => [
              styles.previewBtn,
              {
                backgroundColor: isPlaying
                  ? progressColor
                  : withAlpha(progressColor, 0.12),
              },
              pressed && { opacity: 0.8 },
            ]}
          >
            {isLoading ? (
              <ActivityIndicator
                size="small"
                color={isPlaying ? "#FFF" : progressColor}
              />
            ) : (
              <Icon
                source={isPlaying ? "pause" : "play"}
                size={20}
                color={isPlaying ? "#FFF" : progressColor}
              />
            )}
          </Pressable>
        </View>
      </View>
    );
  },
);
ReciterCard.displayName = "ReciterCard";

// ─── Main Screen ─────────────────────────────────────────────────────────────

const ReciterSelectScreen = ({ navigation }) => {
  const theme = useTheme();
  const { t } = useTranslation();
  const { language } = useAppLanguageStore();
  const { reciterId, setReciterId } = useReciterStore();

  const [search, setSearch] = useState("");
  const [playingId, setPlayingId] = useState(null);
  const [loadingId, setLoadingId] = useState(null);

  // Audio player references for synchronous cleanup and mutual exclusion
  const playerRef = useRef(null);
  const listenerRef = useRef(null);

  const flexDir = getFlexDirection(language);
  const textAlign = getTextAlignment(language);
  const writingDir = getWritingDirection(language);

  const themeColors = useMemo(
    () => ({
      progressColor: theme.colors.progressColor || "#2587D8",
      textColor: theme.colors.textColor || theme.colors.onSurface,
      primaryColor: theme.colors.primary || "#FFFFFF",
      backgroundColor: theme.colors.background || "#F5F7FA",
      outlineColor: theme.colors.outline || theme.colors.outlineVariant,
    }),
    [theme],
  );

  // Group reciters by name to deduplicate identical reciters with different qualities
  const groupedReciters = useMemo(() => {
    const map = new Map();
    (RECITERS || []).forEach((r) => {
      const normalizedKey = (r.name || "").trim().toLowerCase();
      if (!map.has(normalizedKey)) {
        map.set(normalizedKey, {
          name: r.name,
          variants: [],
        });
      }
      map.get(normalizedKey).variants.push(r);
    });

    return Array.from(map.values()).map((group) => ({
      ...group,
      // Sort quality variants descending (e.g. 192kbps -> 128kbps -> 64kbps)
      variants: group.variants.sort((a, b) => {
        const bitA = parseInt(a.bitrate, 10) || 0;
        const bitB = parseInt(b.bitrate, 10) || 0;
        return bitB - bitA;
      }),
    }));
  }, []);

  // Selected variant metadata lookup
  const selectedVariant = useMemo(() => {
    return (RECITERS || []).find((r) => r.id === reciterId) || RECITERS?.[0];
  }, [reciterId]);

  // Safely stop and release active player instance (fixesExpo Audio shared object issue)
  const stopAudio = useCallback(() => {
    const activePlayer = playerRef.current;
    const activeListener = listenerRef.current;

    // Immediately detach refs to block concurrent or re-entrant teardown calls
    playerRef.current = null;
    listenerRef.current = null;

    if (activeListener) {
      try {
        if (typeof activeListener.remove === "function") {
          activeListener.remove();
        }
      } catch (_) {}
    }

    if (activePlayer) {
      try {
        if (activePlayer.playing) {
          activePlayer.pause();
        }
      } catch (_) {}

      try {
        activePlayer.release();
      } catch (_) {}
    }

    setPlayingId(null);
    setLoadingId(null);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopAudio();
    };
  }, [stopAudio]);

  // Handle single audio playback preview (stops previous audio before starting new)
  const handleTogglePreview = useCallback(
    async (id) => {
      if (playingId === id) {
        stopAudio();
        return;
      }

      // Stop previous instance immediately
      stopAudio();
      setLoadingId(id);

      try {
        const previewUrl = getAyahAudioUrl(id, 1, 1); // Al-Fatiha Ayah 1 preview
        const newPlayer = createAudioPlayer({ uri: previewUrl });
        playerRef.current = newPlayer;

        const sub = newPlayer.addListener("playbackStatusUpdate", (status) => {
          if (status?.isLoaded) {
            if (status.isPlaying) {
              setLoadingId((curr) => (curr === id ? null : curr));
              setPlayingId(id);
            }
            if (status.didJustFinish) {
              stopAudio();
            }
          }
        });
        listenerRef.current = sub;

        newPlayer.play();
        setPlayingId(id);
      } catch (err) {
        console.warn("Audio playback failed:", err);
        stopAudio();
      }
    },
    [playingId, stopAudio],
  );

  const handleSelectVariant = useCallback(
    (id) => {
      setReciterId(id);
      if (navigation?.canGoBack()) {
        navigation.goBack();
      }
    },
    [setReciterId, navigation],
  );

  // Filter reciters list based on search text
  const filteredReciters = useMemo(() => {
    if (!search.trim()) return groupedReciters;
    const query = search.toLowerCase();
    return groupedReciters.filter(
      (group) =>
        group.name.toLowerCase().includes(query) ||
        group.variants.some((v) => v.bitrate.toLowerCase().includes(query)),
    );
  }, [search, groupedReciters]);

  const renderItem = useCallback(
    ({ item }) => (
      <ReciterCard
        group={item}
        selectedReciterId={reciterId}
        playingId={playingId}
        loadingId={loadingId}
        onSelectVariant={handleSelectVariant}
        onTogglePreview={handleTogglePreview}
        themeColors={themeColors}
        flexDir={flexDir}
        textAlign={textAlign}
        writingDir={writingDir}
      />
    ),
    [
      reciterId,
      playingId,
      loadingId,
      handleSelectVariant,
      handleTogglePreview,
      themeColors,
      flexDir,
      textAlign,
      writingDir,
    ],
  );

  const getItemLayout = useCallback(
    (_, index) => ({
      length: 82,
      offset: 82 * index,
      index,
    }),
    [],
  );

  return (
    <View
      style={[styles.root, { backgroundColor: themeColors.backgroundColor }]}
    >
      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <View
          style={[
            styles.searchBar,
            {
              backgroundColor: themeColors.primaryColor,
              borderColor: withAlpha(themeColors.outlineColor, 0.12),
              flexDirection: flexDir,
            },
          ]}
        >
          <Icon
            source="magnify"
            size={20}
            color={withAlpha(themeColors.textColor, 0.5)}
          />
          <TextInput
            style={[
              styles.searchInput,
              {
                color: themeColors.textColor,
                textAlign,
                writingDirection: writingDir,
              },
            ]}
            placeholder={t("Search reciters...")}
            placeholderTextColor={withAlpha(themeColors.textColor, 0.4)}
            value={search}
            onChangeText={setSearch}
            autoCorrect={false}
          />
          {search.length > 0 && (
            <Pressable
              onPress={() => setSearch("")}
              hitSlop={8}
              style={styles.clearBtn}
            >
              <Icon
                source="close-circle"
                size={18}
                color={withAlpha(themeColors.textColor, 0.4)}
              />
            </Pressable>
          )}
        </View>
      </View>

      {/* Reciter List */}
      <FlatList
        data={filteredReciters}
        keyExtractor={(item) => item.name}
        renderItem={renderItem}
        contentContainerStyle={styles.listContainer}
        ListHeaderComponent={
          <SelectedReciterCard
            selectedVariant={selectedVariant}
            isPlaying={playingId === selectedVariant?.id}
            isLoading={loadingId === selectedVariant?.id}
            onTogglePreview={handleTogglePreview}
            themeColors={themeColors}
            flexDir={flexDir}
            textAlign={textAlign}
            writingDir={writingDir}
            t={t}
          />
        }
        initialNumToRender={10}
        maxToRenderPerBatch={10}
        windowSize={7}
        getItemLayout={getItemLayout}
        removeClippedSubviews={Platform.OS !== "web"}
      />
    </View>
  );
};

export default ReciterSelectScreen;

const styles = StyleSheet.create({
  root: { flex: 1 },
  searchContainer: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 6 },
  searchBar: {
    height: 46,
    borderRadius: 12,
    paddingHorizontal: 12,
    alignItems: "center",
    borderWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  searchInput: { flex: 1, fontSize: 15, height: "100%" },
  clearBtn: { justifyContent: "center", alignItems: "center" },
  listContainer: { paddingHorizontal: 16, paddingBottom: 30, paddingTop: 6 },

  // Active Reciter Header Styling
  headerCard: {
    borderRadius: 16,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    marginTop: 10,
  },
  headerTopRow: { marginBottom: 8, alignItems: "center" },
  activePill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    gap: 6,
  },
  activeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#FFF",
  },
  activePillText: {
    color: "#FFF",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  headerContent: { alignItems: "center", justifyContent: "space-between" },
  headerReciterName: { fontSize: 17, fontWeight: "700" },
  headerPreviewBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },

  // Reciter Card Styling
  card: {
    borderRadius: 14,
    padding: 12,
    marginBottom: 8,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.03,
        shadowRadius: 6,
      },
      android: { elevation: 1 },
    }),
  },
  cardContent: { alignItems: "center", gap: 12 },
  radioCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  textDetails: { flex: 1 },
  reciterName: { fontSize: 15, fontWeight: "600" },
  badgeRow: { gap: 6, alignItems: "center" },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    gap: 4,
  },
  badgeText: { fontSize: 11, fontWeight: "700" },

  // Quality Selector Chips
  qualityChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
  },
  qualityChipText: { fontSize: 11, fontWeight: "700" },

  previewBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
});
