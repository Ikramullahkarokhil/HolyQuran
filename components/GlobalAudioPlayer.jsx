import React, { memo, useCallback, useEffect } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import Animated, {
  Easing,
  FadeInDown,
  FadeOutUp,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { Icon } from "react-native-paper";

const withAlpha = (color, alpha) => {
  if (!color || typeof color !== "string")
    return `rgba(37, 135, 216, ${alpha})`;
  if (!color.startsWith("#")) return `rgba(37, 135, 216, ${alpha})`;
  const raw = color.slice(1);
  const normalized =
    raw.length === 3
      ? raw
          .split("")
          .map((c) => c + c)
          .join("")
      : raw;
  if (normalized.length !== 6) return `rgba(37, 135, 216, ${alpha})`;
  const r = Number.parseInt(normalized.slice(0, 2), 16);
  const g = Number.parseInt(normalized.slice(2, 4), 16);
  const b = Number.parseInt(normalized.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const formatTime = (seconds) => {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.floor(seconds % 60);
  return `${minutes}:${remainder < 10 ? "0" : ""}${remainder}`;
};

const SeekBar = memo(({ progress, onSeek, colors, disabled }) => {
  const trackWidth = useSharedValue(1);
  const fill = useSharedValue(progress);

  useEffect(() => {
    fill.value = withTiming(Math.min(1, Math.max(0, progress)), {
      duration: 90,
    });
  }, [fill, progress]);

  const fillStyle = useAnimatedStyle(() => ({ width: `${fill.value * 100}%` }));
  const thumbStyle = useAnimatedStyle(() => ({ left: `${fill.value * 100}%` }));
  const seek = useCallback(
    (x) => {
      const ratio = Math.min(1, Math.max(0, x / (trackWidth.value || 1)));
      fill.value = ratio;
      runOnJS(onSeek)(ratio);
    },
    [fill, onSeek, trackWidth],
  );
  const pan = Gesture.Pan()
    .enabled(!disabled)
    .onUpdate((event) => {
      fill.value = Math.min(1, Math.max(0, event.x / (trackWidth.value || 1)));
    })
    .onEnd((event) => runOnJS(seek)(event.x));
  const tap = Gesture.Tap()
    .enabled(!disabled)
    .onEnd((event) => runOnJS(seek)(event.x));

  return (
    <GestureDetector gesture={Gesture.Race(pan, tap)}>
      <View
        style={styles.seekTrack}
        onLayout={(event) => {
          trackWidth.value = event.nativeEvent.layout.width || 1;
        }}
      >
        <View
          style={[
            styles.seekTrackBg,
            { backgroundColor: withAlpha(colors.accent, 0.16) },
          ]}
        />
        <Animated.View
          style={[
            styles.seekFill,
            { backgroundColor: colors.accent },
            fillStyle,
          ]}
        />
        <Animated.View
          style={[
            styles.seekThumb,
            { backgroundColor: colors.accent, borderColor: colors.surface },
            thumbStyle,
          ]}
        />
      </View>
    </GestureDetector>
  );
});
SeekBar.displayName = "SeekBar";

const GlobalAudioPlayer = memo(
  ({
    activeAyah,
    isPlaying,
    isDownloading,
    downloadProgress = 0,
    positionSec = 0,
    durationSec = 0,
    reciter,
    colors,
    labels,
    onPlay,
    onPause,
    onSeek,
    onSkip,
    onJumpToVerse,
    onClose,
    topOffset = 8,
  }) => {
    const progress =
      durationSec > 0 ? Math.min(1, Math.max(0, positionSec / durationSec)) : 0;
    const reciterName =
      reciter?.name ||
      reciter?.englishName ||
      labels.quranAudio ||
      "Quran Audio";

    return (
      <Animated.View
        entering={FadeInDown.duration(220).easing(Easing.out(Easing.cubic))}
        exiting={FadeOutUp.duration(160).easing(Easing.in(Easing.quad))}
        style={[
          styles.container,
          {
            top: topOffset,
            backgroundColor: colors.surface,
            borderColor: withAlpha(colors.accent, 0.28),
            shadowColor: colors.shadow,
          },
        ]}
      >
        <View style={styles.topRow}>
          <Pressable
            onPress={onJumpToVerse}
            style={[
              styles.ayahTag,
              { backgroundColor: withAlpha(colors.accent, 0.12) },
            ]}
            accessibilityRole="button"
            accessibilityLabel={`${labels.ayah || "Ayah"} ${activeAyah}`}
          >
            <Icon source="volume-high" size={14} color={colors.accent} />
            <Text style={[styles.ayahText, { color: colors.accent }]}>
              {labels.ayah || "Ayah"} {activeAyah}
            </Text>
            <Icon source="target" size={12} color={colors.accent} />
          </Pressable>
          <Text
            style={[styles.reciter, { color: colors.secondary }]}
            numberOfLines={1}
          >
            {reciterName}
          </Text>
          <View style={styles.topRight}>
            <Text style={[styles.time, { color: colors.secondary }]}>
              {formatTime(positionSec)} / {formatTime(durationSec)}
            </Text>
            <Pressable
              onPress={onClose}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Close audio player"
            >
              <Icon source="close" size={19} color={colors.secondary} />
            </Pressable>
          </View>
        </View>
        {isDownloading ? (
          <View style={styles.downloadRow}>
            <View
              style={[
                styles.downloadTrack,
                { backgroundColor: withAlpha(colors.accent, 0.16) },
              ]}
            >
              <View
                style={[
                  styles.downloadFill,
                  {
                    backgroundColor: colors.accent,
                    width: `${Math.round(downloadProgress * 100)}%`,
                  },
                ]}
              />
            </View>
            <Text style={[styles.downloadPct, { color: colors.accent }]}>
              {Math.round(downloadProgress * 100)}%
            </Text>
          </View>
        ) : (
          <SeekBar
            progress={progress}
            onSeek={onSeek}
            colors={colors}
            disabled={durationSec <= 0}
          />
        )}
        <View style={styles.controlsRow}>
          <Pressable
            onPress={() => onSkip(-5)}
            hitSlop={10}
            style={styles.control}
            accessibilityLabel="Rewind 5 seconds"
          >
            <Icon source="rewind-5" size={20} color={colors.text} />
          </Pressable>
          <Pressable
            onPress={isPlaying ? onPause : onPlay}
            style={[styles.play, { backgroundColor: colors.accent }]}
            accessibilityRole="button"
            accessibilityLabel={isPlaying ? "Pause" : "Play"}
          >
            <Icon
              source={isPlaying ? "pause" : "play"}
              size={20}
              color="#fff"
            />
          </Pressable>
          <Pressable
            onPress={() => onSkip(5)}
            hitSlop={10}
            style={styles.control}
            accessibilityLabel="Forward 5 seconds"
          >
            <Icon source="fast-forward-5" size={20} color={colors.text} />
          </Pressable>
        </View>
      </Animated.View>
    );
  },
);
GlobalAudioPlayer.displayName = "GlobalAudioPlayer";

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    left: 12,
    right: 12,
    marginTop: 50,
    zIndex: 20,
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  topRow: { flexDirection: "row", alignItems: "center", minHeight: 28 },
  ayahTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: 9,
    paddingHorizontal: 7,
    paddingVertical: 5,
  },
  ayahText: { fontSize: 12, fontWeight: "700" },
  reciter: { flex: 1, marginHorizontal: 8, fontSize: 11 },
  topRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  time: { fontSize: 11 },
  downloadRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
  },
  downloadTrack: { flex: 1, height: 5, borderRadius: 3, overflow: "hidden" },
  downloadFill: { height: "100%" },
  downloadPct: { width: 35, fontSize: 11, textAlign: "right" },
  seekTrack: { height: 22, justifyContent: "center" },
  seekTrackBg: { height: 4, borderRadius: 2 },
  seekFill: { position: "absolute", left: 0, height: 4, borderRadius: 2 },
  seekThumb: {
    position: "absolute",
    width: 12,
    height: 12,
    marginLeft: -6,
    borderRadius: 6,
    borderWidth: 2,
  },
  controlsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 30,
    paddingTop: 2,
  },
  control: {
    width: 34,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  play: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
});

export default GlobalAudioPlayer;
