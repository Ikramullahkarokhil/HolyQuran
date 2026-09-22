import React, {
  useMemo,
  useCallback,
  useRef,
  useState,
  useEffect,
  memo,
} from "react";
import {
  View,
  Text,
  StyleSheet,
  Share,
  Pressable,
  Platform,
  StatusBar,
  AppState,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  withSpring,
  Easing,
  runOnJS,
  FadeIn,
  FadeOut,
  FadeInDown,
  FadeOutUp,
  interpolate,
  Extrapolation,
  useAnimatedReaction,
  cancelAnimation,
} from "react-native-reanimated";
import { AnimatedLegendList } from "@legendapp/list/reanimated";
import {
  getArabicVersesForSurah,
  getQuranVerses,
  getSurahNames,
  getSurahByIndex,
} from "../../components/quranData";
import {
  Directions,
  FlingGestureHandler,
  State,
  GestureHandlerRootView,
  Gesture,
  GestureDetector,
} from "react-native-gesture-handler";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  useQuranTranslationStore,
  useAppLanguageStore,
} from "../../components/store/store";
import {
  useLocalSearchParams,
  useFocusEffect,
  useNavigation,
  useRouter,
} from "expo-router";
import { Icon, useTheme } from "react-native-paper";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import FloatingLanguagePickerModal from "../../components/FloatingLanguagePickerModal";
import GeneralModal from "../../components/GeneralModal";
import { useAppAlert } from "../../components/AppAlertProvider";
import { getPashtoTafseerForSurah } from "../../components/tafseerData";
import { isRTL } from "../../components/utils/rtlUtils";
import { VerseItem, SurahAudioToolbar } from "../../components/QuranVerseItem";
import { useAudioPlayer } from "../../components/AudioPlayerProvider";

// ─── Utils ──────────────────────────────────────────────────────────────────

const withAlpha = (color, alpha) => {
  "worklet";
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
    if (normalized.length !== 6) return `rgba(37, 135, 216, ${alpha})`;
    const r = Number.parseInt(normalized.slice(0, 2), 16);
    const g = Number.parseInt(normalized.slice(2, 4), 16);
    const b = Number.parseInt(normalized.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  return `rgba(37, 135, 216, ${alpha})`;
};

const safeHaptic = (fn) => {
  try {
    const result = fn();
    if (result && typeof result.catch === "function") result.catch(() => {});
  } catch {
    // no-op
  }
};

const formatTime = (seconds) => {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const s = Math.floor(seconds % 60);
  const m = Math.floor(seconds / 60);
  return `${m}:${s < 10 ? "0" : ""}${s}`;
};

const formatBytes = (bytes) => {
  if (!Number.isFinite(bytes) || bytes <= 0) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

const SURAH_LIST = getSurahNames();
const getTranslationData = (language) => getQuranVerses(language);

const HEADER_EXPANDED = 56;
const AUDIO_FOCUS_VIEW_POSITION = 0.55;

const ENTER_SPRING = { damping: 22, stiffness: 180, mass: 0.9 };
const COMPACT_SPRING = { damping: 26, stiffness: 240, mass: 0.75 };
const PRESS_SPRING_IN = { damping: 18, stiffness: 420, mass: 0.45 };
const PRESS_SPRING_OUT = { damping: 16, stiffness: 300, mass: 0.5 };

// ─── Mini action pill ───────────────────────────────────────────────────────

const MiniPill = memo(
  ({
    onPress,
    icon,
    disabled = false,
    filled = false,
    active = false,
    haptic = true,
    accessibilityLabel,
    colors,
    rtl,
    size = 40,
  }) => {
    const scale = useSharedValue(1);

    const pressStyle = useAnimatedStyle(() => ({
      transform: [{ scale: scale.value }],
    }));

    const handlePressIn = useCallback(() => {
      cancelAnimation(scale);
      // eslint-disable-next-line react-hooks/immutability
      scale.value = withSpring(0.88, PRESS_SPRING_IN);
    }, [scale]);

    const handlePressOut = useCallback(() => {
      cancelAnimation(scale);
      // eslint-disable-next-line react-hooks/immutability
      scale.value = withSpring(1, PRESS_SPRING_OUT);
    }, [scale]);

    const handlePress = useCallback(() => {
      if (disabled) return;
      if (haptic) {
        safeHaptic(() =>
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light),
        );
      }
      onPress?.();
    }, [disabled, haptic, onPress]);

    return (
      <Animated.View style={pressStyle}>
        <Pressable
          onPress={handlePress}
          disabled={disabled}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel}
          accessibilityState={{ disabled: disabled || active }}
          style={({ pressed }) => [
            styles.miniPill,
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              backgroundColor: filled ? colors.accent : colors.surface,
              borderColor: filled ? colors.accent : colors.border,
              shadowColor: filled ? colors.accent : colors.shadow,
            },
            active &&
              !filled && { backgroundColor: withAlpha(colors.accent, 0.16) },
            pressed && { opacity: filled ? 0.88 : 0.78 },
            disabled && { opacity: 0.32 },
          ]}
        >
          <Icon
            source={icon}
            size={size >= 40 ? 19 : 17}
            color={filled ? "#fff" : rtl ? colors.accent : colors.text}
          />
        </Pressable>
      </Animated.View>
    );
  },
);
MiniPill.displayName = "MiniPill";

// ─── Interactive Seek bar ──────────────────────────────────────────────────

const SeekBar = memo(({ progress, onSeek, colors, disabled }) => {
  const trackWidth = useSharedValue(1);
  const fill = useSharedValue(progress);

  useEffect(() => {
    fill.value = withTiming(Math.min(1, Math.max(0, progress)), {
      duration: 90,
    });
  }, [fill, progress]);

  const fillStyle = useAnimatedStyle(() => ({
    width: `${fill.value * 100}%`,
  }));

  const thumbStyle = useAnimatedStyle(() => ({
    left: `${fill.value * 100}%`,
  }));

  const pan = Gesture.Pan()
    .enabled(!disabled)
    .onUpdate((e) => {
      const w = trackWidth.value || 1;
      // eslint-disable-next-line react-hooks/immutability
      fill.value = Math.min(1, Math.max(0, e.x / w));
    })
    .onEnd((e) => {
      const w = trackWidth.value || 1;
      const p = Math.min(1, Math.max(0, e.x / w));
      runOnJS(onSeek)?.(p);
    });

  const tap = Gesture.Tap()
    .enabled(!disabled)
    .onEnd((e) => {
      const w = trackWidth.value || 1;
      const p = Math.min(1, Math.max(0, e.x / w));
      // eslint-disable-next-line react-hooks/immutability
      fill.value = p;
      runOnJS(onSeek)?.(p);
    });

  return (
    <GestureDetector gesture={Gesture.Race(pan, tap)}>
      <View
        style={styles.seekTrack}
        onLayout={(e) => {
          trackWidth.value = e.nativeEvent.layout.width || 1;
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
            {
              backgroundColor: colors.accent,
              borderColor: colors.surface,
            },
            thumbStyle,
          ]}
        />
      </View>
    </GestureDetector>
  );
});
SeekBar.displayName = "SeekBar";

// ─── Global Page-Level Floating Audio Player ────────────────────────────────

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
    topOffset,
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
          styles.globalPlayerContainer,
          {
            top: topOffset,
            backgroundColor: colors.surface,
            borderColor: withAlpha(colors.accent, 0.28),
            shadowColor: colors.shadow,
          },
        ]}
      >
        {/* Top Info Bar */}
        <View style={styles.globalPlayerTopRow}>
          <Pressable
            onPress={onJumpToVerse}
            style={({ pressed }) => [
              styles.globalPlayerAyahTag,
              { backgroundColor: withAlpha(colors.accent, 0.12) },
              pressed && { opacity: 0.8 },
            ]}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={`Jump to Ayah ${activeAyah}`}
          >
            <Icon source="volume-high" size={14} color={colors.accent} />
            <Text
              style={[styles.globalPlayerAyahText, { color: colors.accent }]}
            >
              {labels.ayah || "Ayah"} {activeAyah}
            </Text>
            <Icon source="target" size={12} color={colors.accent} />
          </Pressable>

          <Text
            style={[styles.globalPlayerReciter, { color: colors.secondary }]}
            numberOfLines={1}
          >
            {reciterName}
          </Text>

          <View style={styles.globalPlayerTopRight}>
            <Text
              style={[styles.globalPlayerTime, { color: colors.secondary }]}
            >
              {formatTime(positionSec)} / {formatTime(durationSec)}
            </Text>
          </View>
        </View>

        {/* Seek track or Download status */}
        {isDownloading ? (
          <View style={styles.globalPlayerDlRow}>
            <View
              style={[
                styles.globalPlayerTrackBg,
                { backgroundColor: withAlpha(colors.accent, 0.16) },
              ]}
            >
              <View
                style={[
                  styles.globalPlayerDlFill,
                  {
                    backgroundColor: colors.accent,
                    width: `${Math.round((downloadProgress || 0) * 100)}%`,
                  },
                ]}
              />
            </View>
            <Text style={[styles.globalPlayerDlPct, { color: colors.accent }]}>
              {Math.round((downloadProgress || 0) * 100)}%
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

        {/* Transport Controls */}
        <View style={styles.globalPlayerControlsRow}>
          <Pressable
            onPress={() => onSkip(-5)}
            hitSlop={10}
            style={styles.globalPlayerControlBtn}
            accessibilityLabel="Rewind 5 seconds"
          >
            <Icon source="rewind-5" size={20} color={colors.text} />
          </Pressable>

          <Pressable
            onPress={() => {
              safeHaptic(() =>
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light),
              );
              if (isPlaying) {
                onPause?.();
              } else {
                onPlay?.();
              }
            }}
            style={[
              styles.globalPlayerPlayBtn,
              { backgroundColor: colors.accent },
            ]}
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
            style={styles.globalPlayerControlBtn}
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

// ─── Collapsible floating header ────────────────────────────────────────────

const DIRECTION_THRESHOLD = 8;
const IDLE_RESET_MS = 180;

const FloatingPillHeader = memo(
  ({
    surah,
    canGoPrev,
    canGoNext,
    onPrev,
    onNext,
    onPins,
    onTranslate,
    onBack,
    colors,
    labels,
    scrollY,
  }) => {
    const insets = useSafeAreaInsets();
    const { language } = useAppLanguageStore();
    const rtl = isRTL(language);

    const enterProgress = useSharedValue(0);
    const compactProgress = useSharedValue(0);
    const lastScrollY = useSharedValue(0);
    const lastDirection = useSharedValue(0);
    const lastChangeTime = useSharedValue(0);

    useEffect(() => {
      enterProgress.value = withSpring(1, ENTER_SPRING);
      return () => {
        cancelAnimation(enterProgress);
        cancelAnimation(compactProgress);
      };
    }, [enterProgress, compactProgress]);

    useAnimatedReaction(
      () => scrollY.value,
      (y, prevY) => {
        if (prevY == null) {
          lastScrollY.value = y;
          return;
        }
        const delta = y - lastScrollY.value;
        if (Math.abs(delta) < DIRECTION_THRESHOLD) return;

        const now = Date.now();
        const direction = delta > 0 ? 1 : -1;

        if (
          lastDirection.value !== 0 &&
          direction !== lastDirection.value &&
          now - lastChangeTime.value < IDLE_RESET_MS
        ) {
          lastScrollY.value = y;
          return;
        }

        lastDirection.value = direction;
        lastChangeTime.value = now;

        if (direction > 0) {
          // eslint-disable-next-line react-hooks/immutability
          compactProgress.value = withSpring(1, COMPACT_SPRING);
        } else {
          compactProgress.value = withSpring(0, COMPACT_SPRING);
        }
        lastScrollY.value = y;
      },
      [],
    );

    const headerStyle = useAnimatedStyle(() => {
      const enterY = interpolate(
        enterProgress.value,
        [0, 1],
        [-24, 0],
        Extrapolation.CLAMP,
      );
      const enterOpacity = interpolate(
        enterProgress.value,
        [0, 0.4, 1],
        [0, 0.85, 1],
        Extrapolation.CLAMP,
      );
      return {
        opacity: enterOpacity,
        transform: [{ translateY: enterY }],
      };
    });

    const titleStyle = useAnimatedStyle(() => {
      const p = compactProgress.value;
      return {
        flexGrow: interpolate(p, [0, 1], [1, 1.28], Extrapolation.CLAMP),
        maxWidth: interpolate(p, [0, 1], [230, 360], Extrapolation.CLAMP),
        marginHorizontal: interpolate(p, [0, 1], [4, 6], Extrapolation.CLAMP),
      };
    });

    const secondaryStyle = useAnimatedStyle(() => {
      const p = compactProgress.value;
      return {
        opacity: interpolate(p, [0, 0.35, 1], [1, 0.2, 0], Extrapolation.CLAMP),
        transform: [
          { scale: interpolate(p, [0, 1], [1, 0.72], Extrapolation.CLAMP) },
        ],
        width: interpolate(p, [0, 1], [38, 0], Extrapolation.CLAMP),
        marginHorizontal: 0,
        overflow: "hidden",
      };
    });

    const backIcon = rtl ? "arrow-right" : "arrow-left";
    const prevIcon = rtl ? "chevron-right" : "chevron-left";
    const nextIcon = rtl ? "chevron-left" : "chevron-right";

    return (
      <Animated.View
        style={[
          styles.pillHeaderWrapper,
          { paddingTop: insets.top + 6 },
          headerStyle,
        ]}
        pointerEvents="box-none"
      >
        <View
          style={[
            styles.pillRow,
            { flexDirection: rtl ? "row-reverse" : "row" },
          ]}
        >
          <MiniPill
            onPress={onBack}
            icon={backIcon}
            accessibilityLabel={labels.back}
            colors={colors}
            rtl={rtl}
            size={38}
          />

          <MiniPill
            onPress={onPrev}
            disabled={!canGoPrev}
            icon={prevIcon}
            accessibilityLabel={labels.prev}
            colors={colors}
            rtl={rtl}
            size={38}
          />

          <Animated.View style={[styles.titleCapsuleWrapper, titleStyle]}>
            <View
              style={[
                styles.titleCapsuleInner,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                  shadowColor: colors.shadow,
                },
              ]}
            >
              <Text
                style={[styles.pillArabic, { color: colors.text }]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.75}
              >
                {surah?.name ?? "—"}
              </Text>
            </View>
          </Animated.View>

          <MiniPill
            onPress={onNext}
            disabled={!canGoNext}
            icon={nextIcon}
            accessibilityLabel={labels.next}
            colors={colors}
            rtl={rtl}
            size={38}
          />

          <Animated.View style={secondaryStyle} pointerEvents="box-none">
            <MiniPill
              onPress={onPins}
              icon="pin-outline"
              accessibilityLabel={labels.pins}
              colors={colors}
              rtl={rtl}
              size={38}
            />
          </Animated.View>

          <Animated.View style={secondaryStyle} pointerEvents="box-none">
            <MiniPill
              onPress={onTranslate}
              icon="translate"
              accessibilityLabel={labels.translate}
              colors={colors}
              rtl={rtl}
              size={38}
            />
          </Animated.View>
        </View>
      </Animated.View>
    );
  },
);
FloatingPillHeader.displayName = "FloatingPillHeader";

// ─── Main screen ────────────────────────────────────────────────────────────

const SurahDetails = () => {
  const params = useLocalSearchParams();
  const { surahId: paramSurahId, surahName, ayahId } = params;

  const navigation = useNavigation();
  const router = useRouter();
  const theme = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { showAlert, showToast } = useAppAlert();
  const { translationLanguage, setTranslationLanguage } =
    useQuranTranslationStore();

  const listRef = useRef(null);
  const isMounted = useRef(true);
  const showScrollTopRef = useRef(false);
  const currentTopIndexRef = useRef(0);
  const lastSavedIndexRef = useRef(null);
  const hasUserScrolledRef = useRef(false);
  const indexSaveTimer = useRef(null);
  const scrollRetryTimer = useRef(null);
  const lastReadDismissTimer = useRef(null);
  const lastPlayedDismissTimer = useRef(null);

  const scrollY = useSharedValue(0);

  const [showScrollTop, setShowScrollTop] = useState(false);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [actionVerse, setActionVerse] = useState(null);
  const [actionIsBookmarked, setActionIsBookmarked] = useState(false);
  const [pins, setPins] = useState([]);
  const [pinsVisible, setPinsVisible] = useState(false);
  const [highlightedAyahId, setHighlightedAyahId] = useState(null);
  const [expandedTafseerIds, setExpandedTafseerIds] = useState(() => new Set());

  const [lastReadIndex, setLastReadIndex] = useState(null);
  const [lastReadAyah, setLastReadAyah] = useState(null);
  const [showLastReadBtn, setShowLastReadBtn] = useState(false);
  const [lastPlayedAyah, setLastPlayedAyah] = useState(null);
  const [showLastPlayedBtn, setShowLastPlayedBtn] = useState(false);

  const highlightProgress = useSharedValue(0);

  const surah = useMemo(() => {
    const id = Number(
      Array.isArray(paramSurahId) ? paramSurahId[0] : paramSurahId,
    );
    if (Number.isFinite(id) && id >= 1 && id <= 114) {
      const fromHelper = getSurahByIndex?.(id);
      if (fromHelper) return fromHelper;
      return SURAH_LIST.find((s) => s.index === id) || null;
    }

    const name = (() => {
      const raw = Array.isArray(surahName) ? surahName[0] : surahName;
      if (!raw || typeof raw !== "string") return null;
      try {
        return decodeURIComponent(raw);
      } catch {
        return raw;
      }
    })();

    if (name) {
      return SURAH_LIST.find((s) => s.name === name) || null;
    }
    return null;
  }, [paramSurahId, surahName]);

  const surahId = surah?.index ?? -1;

  const targetAyahId = useMemo(() => {
    const value = Array.isArray(ayahId) ? ayahId[0] : ayahId;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }, [ayahId]);

  const colors = useMemo(
    () => ({
      text: theme.colors.onSurface,
      secondary:
        theme.colors.onSurfaceVariant ||
        withAlpha(theme.colors.onSurface, 0.65),
      accent: theme.colors.progressColor || theme.colors.primary,
      surface: theme.colors.surface,
      background: theme.colors.background,
      border:
        theme.colors.outlineVariant ||
        (theme.dark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)"),
      shadow: theme.dark ? "#000" : "#000",
      primary: theme.colors.primary,
      buttonText: theme.colors.buttonText || "#fff",
      error: theme.colors.error,
    }),
    [theme],
  );

  const labels = useMemo(
    () => ({
      back: t("Back"),
      prev: t("Previous Surah"),
      next: t("Next Surah"),
      pins: t("Pinned locations"),
      translate: t("Select translation language"),
      meccan: t("Meccan") || "Meccan",
      medinan: t("Medinan") || "Medinan",
      verses: t("verses") || "verses",
      downloadAll: t("Download full surah") || "Download full surah",
      downloadingAll: t("Downloading surah…") || "Downloading surah…",
      allDownloaded: t("All ayahs downloaded") || "All ayahs downloaded",
      download: t("Download") || "Download",
      done: t("Done") || "Done",
      cancel: t("Cancel") || "Cancel",
      ayahs: t("ayahs") || "ayahs",
      ayah: t("Ayah") || "Ayah",
      quranAudio: t("Quran Audio") || "Quran Audio",
    }),
    [t],
  );

  const getScrollStorageKey = useCallback(() => {
    if (surahId <= 0) return null;
    return `surah_details_scroll_${surahId}`;
  }, [surahId]);

  const getPinsStorageKey = useCallback(() => {
    if (surahId <= 0) return null;
    return `surah_details_pins_${surahId}`;
  }, [surahId]);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      if (indexSaveTimer.current) clearTimeout(indexSaveTimer.current);
      if (scrollRetryTimer.current) clearTimeout(scrollRetryTimer.current);
      if (lastReadDismissTimer.current)
        clearTimeout(lastReadDismissTimer.current);
      if (lastPlayedDismissTimer.current)
        clearTimeout(lastPlayedDismissTimer.current);
    };
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHighlightedAyahId(null);
    setExpandedTafseerIds(new Set());
    setShowScrollTop(false);
    showScrollTopRef.current = false;
    currentTopIndexRef.current = 0;
    lastSavedIndexRef.current = null;
    hasUserScrolledRef.current = false;
    setLastReadIndex(null);
    setLastReadAyah(null);
    setShowLastReadBtn(false);
    setLastPlayedAyah(null);
    setShowLastPlayedBtn(false);
    if (lastReadDismissTimer.current)
      clearTimeout(lastReadDismissTimer.current);
    if (lastPlayedDismissTimer.current)
      clearTimeout(lastPlayedDismissTimer.current);
    scrollY.value = 0;
    cancelAnimation(highlightProgress);

    let active = true;
    const loadLastRead = async () => {
      const key = getScrollStorageKey();
      if (!key) return;
      try {
        const raw = await AsyncStorage.getItem(key);
        if (!raw) return;
        const parsed = JSON.parse(raw);
        const idx = Number(parsed?.index);
        if (active && isMounted.current && Number.isFinite(idx) && idx > 2) {
          const ayah = Number(parsed?.ayah);
          setLastReadIndex(idx);
          setLastReadAyah(Number.isFinite(ayah) ? ayah : null);
          setShowLastReadBtn(true);
          lastReadDismissTimer.current = setTimeout(
            () => setShowLastReadBtn(false),
            5000,
          );
        }
      } catch {}
    };
    loadLastRead();

    return () => {
      active = false;
    };
  }, [surahId, getScrollStorageKey, scrollY, highlightProgress]);

  useEffect(() => {
    let active = true;
    const loadPins = async () => {
      const key = getPinsStorageKey();
      if (!key) return;
      try {
        const raw = await AsyncStorage.getItem(key);
        const stored = JSON.parse(raw || "[]");
        if (active && isMounted.current) {
          setPins(Array.isArray(stored) ? stored : []);
        }
      } catch {
        if (active && isMounted.current) setPins([]);
      }
    };
    loadPins();
    return () => {
      active = false;
    };
  }, [getPinsStorageKey]);

  useFocusEffect(
    useCallback(() => {
      navigation.setOptions({ headerShown: false });
    }, [navigation]),
  );

  const verses = useMemo(() => {
    if (surahId <= 0) return [];
    return getArabicVersesForSurah(surahId);
  }, [surahId]);

  const scrollToVerse = useCallback(
    (index, viewPosition = AUDIO_FOCUS_VIEW_POSITION, animated = true) => {
      if (index < 0 || index >= verses.length) return;
      requestAnimationFrame(() => {
        if (!isMounted.current) return;
        try {
          listRef.current?.scrollToIndex?.({
            index,
            animated,
            viewPosition,
          });
        } catch {}
      });
    },
    [verses],
  );

  // ─── Audio registry ───────────────────────────────────────────────────────
  const audioPlayer = useAudioPlayer();
  const {
    downloadedSet,
    durationMap,
    sizeMap,
    downloadingId,
    downloadProgressMap,
    playingId,
    expandedId,
    positionSec,
    isDownloadingAll,
    bulkProgress,
    downloadedCount,
    totalBytesLabel,
    reciter,
    errorMsg,
    downloadVerse,
    playVerse,
    pauseVerse,
    downloadAll,
    cancelDownloadAll,
  } = audioPlayer;
  const activeAudioAyah = audioPlayer.activeAyah;
  const audioPlayerVisible = Boolean(
    audioPlayer.isVisible && activeAudioAyah != null,
  );
  const { registerSurah } = audioPlayer;

  useEffect(() => {
    registerSurah(surahId);
  }, [registerSurah, surahId]);

  const reciterId = reciter?.id;
  const audioResumeKey = useMemo(
    () =>
      surahId > 0 && reciterId != null
        ? `surah_audio_last_${reciterId}_${surahId}`
        : null,
    [reciterId, surahId],
  );

  useEffect(() => {
    if (!audioResumeKey || playingId == null) return;
    AsyncStorage.setItem(audioResumeKey, String(playingId)).catch(() => {});
  }, [audioResumeKey, playingId]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      const loadLastPlayedAyah = async () => {
        if (!audioResumeKey) return;
        try {
          const stored = Number(await AsyncStorage.getItem(audioResumeKey));
          if (
            active &&
            Number.isFinite(stored) &&
            verses.some((verse) => verse.ayah === stored)
          ) {
            setLastPlayedAyah(stored);
            setShowLastPlayedBtn(true);
            lastPlayedDismissTimer.current = setTimeout(
              () => setShowLastPlayedBtn(false),
              5000,
            );
          }
        } catch {}
      };
      loadLastPlayedAyah();
      return () => {
        active = false;
        if (lastPlayedDismissTimer.current)
          clearTimeout(lastPlayedDismissTimer.current);
      };
    }, [audioResumeKey, verses]),
  );

  // Auto scroll to verse when playingId changes
  useEffect(() => {
    if (!playingId || targetAyahId != null) return;
    const idx = verses.findIndex((v) => v.ayah === playingId);
    scrollToVerse(idx);
  }, [playingId, scrollToVerse, targetAyahId, verses]);

  const restoreAudioPosition = useCallback(() => {
    if (!playingId || targetAyahId != null) return undefined;
    const index = verses.findIndex((verse) => verse.ayah === playingId);
    if (index < 0) return undefined;

    const firstRetry = setTimeout(
      () => scrollToVerse(index, AUDIO_FOCUS_VIEW_POSITION, false),
      80,
    );
    const secondRetry = setTimeout(
      () => scrollToVerse(index, AUDIO_FOCUS_VIEW_POSITION, true),
      320,
    );
    return () => {
      clearTimeout(firstRetry);
      clearTimeout(secondRetry);
    };
  }, [playingId, scrollToVerse, targetAyahId, verses]);

  useFocusEffect(
    useCallback(() => restoreAudioPosition(), [restoreAudioPosition]),
  );

  useEffect(() => {
    let cleanup = null;
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState !== "active") return;
      cleanup?.();
      cleanup = restoreAudioPosition();
    });
    return () => {
      cleanup?.();
      subscription.remove();
    };
  }, [restoreAudioPosition]);

  // Surface download / playback errors
  useEffect(() => {
    if (errorMsg) {
      if (errorMsg === "OFFLINE") {
        showAlert(
          t("No internet connection") || "No internet connection",
          t("Connect to the internet to download or play Quran audio") ||
            "Connect to the internet to download or play Quran audio",
        );
      } else {
        showToast?.(errorMsg) ?? showAlert(t("Error"), errorMsg);
      }
    }
  }, [errorMsg, showAlert, showToast, t]);

  const targetAyahIndex = useMemo(() => {
    if (targetAyahId === null) return -1;
    return verses.findIndex((v) => v.ayah === targetAyahId);
  }, [targetAyahId, verses]);

  const clearHighlight = useCallback(() => {
    if (isMounted.current) setHighlightedAyahId(null);
  }, []);

  useEffect(() => {
    if (targetAyahIndex < 0) return;

    const timer = setTimeout(() => {
      if (!isMounted.current) return;
      scrollToVerse(targetAyahIndex, 0.28, false);

      setHighlightedAyahId(verses[targetAyahIndex]?.id ?? null);
      highlightProgress.value = 0;
      highlightProgress.value = withSequence(
        withTiming(1, { duration: 220, easing: Easing.out(Easing.cubic) }),
        withTiming(0, { duration: 1400, easing: Easing.inOut(Easing.quad) }),
      );
    }, 120);

    scrollRetryTimer.current = setTimeout(() => {
      if (!isMounted.current) return;
      scrollToVerse(targetAyahIndex, 0.28, true);
    }, 420);

    const clearTimer = setTimeout(() => {
      runOnJS(clearHighlight)();
    }, 2600);

    return () => {
      clearTimeout(timer);
      clearTimeout(clearTimer);
      if (scrollRetryTimer.current) clearTimeout(scrollRetryTimer.current);
      cancelAnimation(highlightProgress);
    };
  }, [
    clearHighlight,
    highlightProgress,
    scrollToVerse,
    targetAyahId,
    targetAyahIndex,
    verses,
  ]);

  const translationMap = useMemo(() => {
    const map = new Map();
    if (surahId <= 0) return map;
    const data = getTranslationData(translationLanguage);
    for (const v of data) {
      if (v.surah === surahId) map.set(v.id, v.verse);
    }
    return map;
  }, [surahId, translationLanguage]);

  const isPashtoTranslation =
    translationLanguage === "pashto" || translationLanguage === "pa";
  const isRtlTranslationLanguage =
    translationLanguage === "pashto" ||
    translationLanguage === "pa" ||
    translationLanguage === "dari";

  const tafseerByAyah = useMemo(() => {
    if (!isPashtoTranslation || surahId <= 0) return new Map();
    const list = getPashtoTafseerForSurah(surahId) || [];
    return new Map(list.map((item) => [item.ayah, item.text]));
  }, [isPashtoTranslation, surahId]);

  const toggleTafseer = useCallback((verseId) => {
    setExpandedTafseerIds((prev) => {
      const next = new Set(prev);
      if (next.has(verseId)) next.delete(verseId);
      else next.add(verseId);
      return next;
    });
  }, []);

  const quranLanguageOptions = useMemo(
    () => [
      { label: t("English"), value: "english" },
      { label: t("Pashto"), value: "pashto" },
      { label: t("Dari"), value: "dari" },
    ],
    [t],
  );

  const currentIndex = surahId > 0 ? surahId - 1 : -1;
  const canGoPrev = currentIndex > 0;
  const canGoNext = currentIndex >= 0 && currentIndex < SURAH_LIST.length - 1;

  const goToSurah = useCallback(
    (index) => {
      const target = SURAH_LIST[index];
      if (!target) return;
      navigation.setParams({
        surahId: String(target.index),
        surahName: target.name,
        surahTname: target.tname,
        surahType: target.type,
        verseCount: String(target.ayas),
        ayahId: undefined,
      });
    },
    [navigation],
  );

  const handlePrev = useCallback(() => {
    if (canGoPrev) goToSurah(currentIndex - 1);
  }, [canGoPrev, currentIndex, goToSurah]);

  const handleNext = useCallback(() => {
    if (canGoNext) goToSurah(currentIndex + 1);
  }, [canGoNext, currentIndex, goToSurah]);

  const handleBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)/home");
  }, [router]);

  const handlePins = useCallback(() => setPinsVisible(true), []);
  const handleTranslate = useCallback(() => setPickerVisible(true), []);

  const handleFlingLeft = useCallback(
    ({ nativeEvent }) => {
      if (nativeEvent.state !== State.ACTIVE) return;
      if (!canGoNext) return;
      safeHaptic(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
      handleNext();
    },
    [canGoNext, handleNext],
  );

  const handleFlingRight = useCallback(
    ({ nativeEvent }) => {
      if (nativeEvent.state !== State.ACTIVE) return;
      if (!canGoPrev) return;
      safeHaptic(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
      handlePrev();
    },
    [canGoPrev, handlePrev],
  );

  const handleLongPress = useCallback(
    async (verse) => {
      try {
        const existing =
          JSON.parse((await AsyncStorage.getItem("bookmarks")) || "[]") || [];
        const isBookmarked = existing.some((b) => b.id === verse.id);
        if (!isMounted.current) return;
        safeHaptic(() => Haptics.selectionAsync());
        setActionVerse({
          ...verse,
          surahName: surah?.name,
          surahTname: surah?.tname,
        });
        setActionIsBookmarked(isBookmarked);
      } catch {
        showAlert(t("Error"), t("Failed to load bookmark status"));
      }
    },
    [surah, showAlert, t],
  );

  const savePins = useCallback(
    (nextPins) => {
      setPins(nextPins);
      const key = getPinsStorageKey();
      if (key) {
        AsyncStorage.setItem(key, JSON.stringify(nextPins)).catch(() => {});
      }
    },
    [getPinsStorageKey],
  );

  const toggleVersePin = useCallback(
    (verse, index) => {
      const isPinned = pins.some((p) => p.id === verse.id);
      const next = isPinned
        ? pins.filter((p) => p.id !== verse.id)
        : [...pins, { id: verse.id, index, ayah: verse.ayah }];
      savePins(next);
    },
    [pins, savePins],
  );

  const goToVersePin = useCallback((pin) => {
    try {
      listRef.current?.scrollToIndex?.({
        index: pin.index,
        animated: true,
        viewPosition: 0.28,
      });
    } catch {}
    setPinsVisible(false);
  }, []);

  const pinnedVerseIds = useMemo(() => new Set(pins.map((p) => p.id)), [pins]);
  const pinnedLabel = t("Pinned");
  const translationFallback = t("Translation not available");

  const pinOptions = useMemo(
    () =>
      pins.map((pin) => ({
        label: `${t("Ayah")} ${pin.ayah}`,
        value: String(pin.id),
        icon: "pin",
        onPress: () => goToVersePin(pin),
        secondaryAction: {
          label: t("Remove pin"),
          icon: "pin-off-outline",
          onPress: () => savePins(pins.filter((item) => item.id !== pin.id)),
        },
      })),
    [goToVersePin, pins, savePins, t],
  );

  const verseActionOptions = useMemo(() => {
    if (!actionVerse) return [];
    const message = `${actionVerse.verse}\n\n${actionVerse.translationVerse}`;
    const isPinned = pinnedVerseIds.has(actionVerse.id);

    return [
      {
        label: actionIsBookmarked ? t("Already Bookmarked") : t("Bookmark"),
        value: "bookmark",
        icon: "bookmark-outline",
        disabled: actionIsBookmarked,
        onPress: async () => {
          try {
            const existing =
              JSON.parse((await AsyncStorage.getItem("bookmarks")) || "[]") ||
              [];
            const bookmark = {
              ...actionVerse,
              surahName: actionVerse.surahName || surah?.name,
              surahNumber: actionVerse.surah || surahId,
              ayahNumber: actionVerse.ayah,
              createdAt: Date.now(),
            };
            await AsyncStorage.setItem(
              "bookmarks",
              JSON.stringify([...existing, bookmark]),
            );
            setActionVerse(null);
            safeHaptic(() =>
              Haptics.notificationAsync(
                Haptics.NotificationFeedbackType.Success,
              ),
            );
            showToast(t("Bookmarked"));
          } catch {
            showAlert(t("Error"), t("Failed to save bookmark"));
          }
        },
      },
      {
        label: t("Copy"),
        value: "copy",
        icon: "content-copy",
        onPress: async () => {
          try {
            await Clipboard.setStringAsync(message);
            setActionVerse(null);
            safeHaptic(() =>
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light),
            );
            showToast(t("Copied to Clipboard"));
          } catch {
            showAlert(t("Error"), t("Failed to copy"));
          }
        },
      },
      {
        label: t("Share"),
        value: "share",
        icon: "share-variant",
        onPress: () => {
          setActionVerse(null);
          Share.share({ message }).catch(() => {});
          showToast(t("Shared"));
        },
      },
      {
        label: isPinned ? t("Remove pin") : t("Pin this location"),
        value: "pin",
        icon: isPinned ? "pin-off-outline" : "pin-outline",
        onPress: () => {
          const nextPinned = !pinnedVerseIds.has(actionVerse.id);
          toggleVersePin(actionVerse, actionVerse.index);
          setActionVerse(null);
          safeHaptic(() => Haptics.selectionAsync());
          showToast(nextPinned ? t("Pinned") : t("Pin removed"));
        },
      },
    ];
  }, [
    actionIsBookmarked,
    actionVerse,
    pinnedVerseIds,
    surah,
    showAlert,
    showToast,
    surahId,
    t,
    toggleVersePin,
  ]);

  const renderItem = useCallback(
    ({ item, index }) => {
      const rawTranslation = translationMap.get(item.id);
      const translationVerse = rawTranslation || translationFallback;
      const isFallbackTranslation = !rawTranslation;
      const sizeBytes = sizeMap.get(item.ayah);
      const dlProgress = downloadProgressMap.get(item.ayah);

      return (
        <VerseItem
          item={item}
          index={index}
          translationVerse={translationVerse}
          isFallbackTranslation={isFallbackTranslation}
          tafseerText={tafseerByAyah.get(item.ayah)}
          isPashtoTranslation={isPashtoTranslation}
          isRtlText={isRtlTranslationLanguage}
          isTafseerExpanded={expandedTafseerIds.has(item.id)}
          onToggleTafseer={toggleTafseer}
          isHighlighted={highlightedAyahId === item.id}
          isPinned={pinnedVerseIds.has(item.id)}
          highlightProgress={highlightProgress}
          colors={colors}
          pinnedLabel={pinnedLabel}
          onLongPress={handleLongPress}
          surahId={surahId}
          isAudioDownloaded={downloadedSet.has(item.ayah)}
          isAudioPlaying={playingId === item.ayah}
          isAudioDownloading={downloadingId === item.ayah}
          audioDurationSec={durationMap.get(item.ayah) || 0}
          audioSizeLabel={sizeBytes ? formatBytes(sizeBytes) : null}
          audioDownloadProgress={
            typeof dlProgress === "number" ? dlProgress : 0
          }
          onAudioDownload={downloadVerse}
          onAudioPlay={playVerse}
          onAudioPause={pauseVerse}
        />
      );
    },
    [
      translationMap,
      translationFallback,
      highlightedAyahId,
      pinnedVerseIds,
      highlightProgress,
      colors,
      pinnedLabel,
      handleLongPress,
      tafseerByAyah,
      isPashtoTranslation,
      isRtlTranslationLanguage,
      expandedTafseerIds,
      toggleTafseer,
      surahId,
      downloadedSet,
      playingId,
      downloadingId,
      durationMap,
      sizeMap,
      downloadProgressMap,
      downloadVerse,
      playVerse,
      pauseVerse,
    ],
  );

  const keyExtractor = useCallback((item) => String(item.id), []);

  const updateScrollTopVisibility = useCallback((offsetY) => {
    const shouldShow = offsetY > 420;
    if (shouldShow !== showScrollTopRef.current) {
      showScrollTopRef.current = shouldShow;
      setShowScrollTop(shouldShow);
    }
  }, []);

  const onScroll = useCallback(
    (event) => {
      const offsetY = event.nativeEvent.contentOffset.y || 0;
      if (offsetY > 24) hasUserScrolledRef.current = true;
      updateScrollTopVisibility(offsetY);
    },
    [updateScrollTopVisibility],
  );

  const viewabilityConfig = useMemo(
    () => ({
      itemVisiblePercentThreshold: 50,
      minimumViewTime: 80,
    }),
    [],
  );

  const handleViewableItemsChanged = useCallback(
    ({ viewableItems }) => {
      if (!viewableItems || viewableItems.length === 0) return;

      let topIndex = viewableItems[0]?.index;
      for (const v of viewableItems) {
        if (typeof v.index === "number" && v.index < topIndex) {
          topIndex = v.index;
        }
      }
      if (typeof topIndex !== "number") return;

      currentTopIndexRef.current = topIndex;

      // Initial list measurement starts at the top. Do not overwrite a saved
      // reading position until the user has actually scrolled this surah.
      if (!hasUserScrolledRef.current && topIndex <= 2) return;

      const key = getScrollStorageKey();
      if (!key) return;
      if (lastSavedIndexRef.current === topIndex) return;

      if (indexSaveTimer.current) clearTimeout(indexSaveTimer.current);
      indexSaveTimer.current = setTimeout(async () => {
        lastSavedIndexRef.current = topIndex;
        try {
          const ayah = verses[topIndex]?.ayah ?? null;
          await AsyncStorage.setItem(
            key,
            JSON.stringify({ index: topIndex, ayah }),
          );
        } catch {}
      }, 450);
    },
    [getScrollStorageKey, verses],
  );

  const scrollToTop = useCallback(() => {
    safeHaptic(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
    listRef.current?.scrollToOffset?.({ offset: 0, animated: true });
  }, []);

  const goToLastRead = useCallback(() => {
    const savedAyahIndex = verses.findIndex(
      (verse) => verse.ayah === lastReadAyah,
    );
    const targetIndex = savedAyahIndex >= 0 ? savedAyahIndex : lastReadIndex;
    if (targetIndex == null) return;
    if (targetIndex >= verses.length) {
      setShowLastReadBtn(false);
      return;
    }
    safeHaptic(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
    scrollToVerse(targetIndex, 0.12, true);
    setShowLastReadBtn(false);
  }, [lastReadAyah, lastReadIndex, scrollToVerse, verses]);

  const currentPlayingAyah = verses.some((verse) => verse.ayah === playingId)
    ? playingId
    : null;
  const displayedLastPlayedAyah = currentPlayingAyah ?? lastPlayedAyah;

  const playLastPlayedAyah = useCallback(() => {
    const ayahToPlay = displayedLastPlayedAyah;
    if (ayahToPlay == null) return;
    safeHaptic(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
    playVerse(ayahToPlay);
  }, [displayedLastPlayedAyah, playVerse]);

  const listTopPadding = insets.top + 8 + HEADER_EXPANDED + 14;

  const listExtraData = useMemo(
    () =>
      `${translationLanguage}|${highlightedAyahId ?? ""}|${pins.length}|${expandedTafseerIds.size}|${downloadedCount}|${playingId ?? ""}|${expandedId ?? ""}|${Math.floor(positionSec)}|${downloadingId ?? ""}|${bulkProgress.toFixed(2)}`,
    [
      translationLanguage,
      highlightedAyahId,
      pins.length,
      expandedTafseerIds.size,
      downloadedCount,
      playingId,
      expandedId,
      positionSec,
      downloadingId,
      bulkProgress,
    ],
  );

  const ListHeader = useMemo(
    () => (
      <SurahAudioToolbar
        totalVerses={verses.length}
        downloadedCount={downloadedCount}
        isDownloadingAll={isDownloadingAll}
        progress={bulkProgress}
        totalBytesLabel={totalBytesLabel}
        colors={colors}
        labels={labels}
        onDownloadAll={downloadAll}
        onCancelDownloadAll={cancelDownloadAll}
      />
    ),
    [
      verses.length,
      downloadedCount,
      isDownloadingAll,
      bulkProgress,
      totalBytesLabel,
      colors,
      labels,
      downloadAll,
      cancelDownloadAll,
    ],
  );

  if (!surah) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <Icon source="alert-circle-outline" size={40} color={colors.error} />
        <Text style={[styles.errorText, { color: colors.error }]}>
          {t("Invalid Surah")}
        </Text>
        <Pressable
          onPress={handleBack}
          style={({ pressed }) => [
            styles.errorAction,
            pressed && { opacity: 0.7 },
          ]}
          accessibilityRole="button"
          accessibilityLabel={t("Go back")}
        >
          <Text style={[styles.errorActionText, { color: colors.accent }]}>
            {t("Go back")}
          </Text>
        </Pressable>
      </View>
    );
  }

  if (verses.length === 0) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <Icon source="book-alert-outline" size={40} color={colors.secondary} />
        <Text style={[styles.errorText, { color: colors.error }]}>
          {t("No verses found")}
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar
        barStyle={theme.dark ? "light-content" : "dark-content"}
        backgroundColor="transparent"
        translucent
      />

      <FloatingPillHeader
        surah={surah}
        canGoPrev={canGoPrev}
        canGoNext={canGoNext}
        onPrev={handlePrev}
        onNext={handleNext}
        onPins={handlePins}
        onTranslate={handleTranslate}
        onBack={handleBack}
        colors={colors}
        labels={labels}
        scrollY={scrollY}
      />

      <FlingGestureHandler
        direction={Directions.LEFT}
        onHandlerStateChange={handleFlingLeft}
      >
        <FlingGestureHandler
          direction={Directions.RIGHT}
          onHandlerStateChange={handleFlingRight}
        >
          <View style={styles.listFlex}>
            <AnimatedLegendList
              key={surahId}
              ref={listRef}
              extraData={listExtraData}
              data={verses}
              renderItem={renderItem}
              keyExtractor={keyExtractor}
              ListHeaderComponent={ListHeader}
              recycleItems
              estimatedItemSize={160}
              drawDistance={480}
              showsVerticalScrollIndicator={false}
              onScroll={onScroll}
              scrollEventThrottle={16}
              onViewableItemsChanged={handleViewableItemsChanged}
              viewabilityConfig={viewabilityConfig}
              contentContainerStyle={[
                styles.listContent,
                {
                  paddingTop: audioPlayerVisible
                    ? listTopPadding + 110
                    : listTopPadding,
                  paddingBottom: insets.bottom + 72,
                },
              ]}
              removeClippedSubviews={Platform.OS === "android"}
              maintainVisibleContentPosition
              sharedValues={{ scrollOffset: scrollY }}
            />
          </View>
        </FlingGestureHandler>
      </FlingGestureHandler>

      {showScrollTop && (
        <Animated.View
          entering={FadeIn.duration(160)}
          exiting={FadeOut.duration(110)}
          style={[styles.scrollTopWrapper, { bottom: insets.bottom + 24 }]}
        >
          <Pressable
            style={({ pressed }) => [
              styles.scrollTopBtn,
              {
                backgroundColor: colors.primary,
                shadowColor: colors.primary,
                opacity: pressed ? 0.9 : 1,
                transform: [{ scale: pressed ? 0.94 : 1 }],
              },
            ]}
            onPress={scrollToTop}
            android_ripple={{ color: "#ffffff40", borderless: true }}
            accessibilityRole="button"
            accessibilityLabel={t("Scroll to top")}
          >
            <Icon source="arrow-up" size={22} color="#fff" />
          </Pressable>
        </Animated.View>
      )}

      {(showLastReadBtn && lastReadIndex != null) ||
      (showLastPlayedBtn && displayedLastPlayedAyah != null) ? (
        <Animated.View
          entering={FadeInDown.duration(220).easing(Easing.out(Easing.cubic))}
          style={[styles.resumeActionsWrapper, { bottom: insets.bottom + 22 }]}
          pointerEvents="box-none"
        >
          <View style={styles.resumeActionsRow}>
            {showLastReadBtn && lastReadIndex != null && (
              <Pressable
                onPress={goToLastRead}
                style={({ pressed }) => [
                  styles.resumeActionBtn,
                  {
                    backgroundColor: colors.surface,
                    borderColor: withAlpha(colors.accent, 0.35),
                    shadowColor: colors.shadow,
                    opacity: pressed ? 0.92 : 1,
                    transform: [{ scale: pressed ? 0.97 : 1 }],
                  },
                ]}
                accessibilityRole="button"
                accessibilityLabel={`${t("Continue reading") || "Continue reading"} ${lastReadAyah != null ? `${t("Ayah")} ${lastReadAyah}` : ""}`}
              >
                <Icon
                  source="bookmark-outline"
                  size={17}
                  color={colors.accent}
                />
                <Text
                  style={[styles.resumeActionText, { color: colors.text }]}
                  numberOfLines={1}
                >
                  {t("Continue reading") || "Continue reading"}
                  {lastReadAyah != null
                    ? ` · ${t("Ayah")} ${lastReadAyah}`
                    : ""}
                </Text>
              </Pressable>
            )}

            {showLastPlayedBtn && displayedLastPlayedAyah != null && (
              <Pressable
                onPress={playLastPlayedAyah}
                style={({ pressed }) => [
                  styles.resumeActionBtn,
                  {
                    backgroundColor: colors.accent,
                    borderColor: colors.accent,
                    shadowColor: colors.accent,
                    opacity: pressed ? 0.9 : 1,
                    transform: [{ scale: pressed ? 0.97 : 1 }],
                  },
                ]}
                accessibilityRole="button"
                accessibilityLabel={`${t("Play last played ayah") || "Play last played ayah"} ${displayedLastPlayedAyah}`}
              >
                <Icon source="play-circle-outline" size={18} color="#fff" />
                <Text
                  style={[styles.resumeActionText, { color: "#fff" }]}
                  numberOfLines={1}
                >
                  {t("Play last played ayah") || "Play last played ayah"} ·{" "}
                  {t("Ayah")} {displayedLastPlayedAyah}
                </Text>
              </Pressable>
            )}
          </View>
        </Animated.View>
      ) : null}

      <FloatingLanguagePickerModal
        visible={pickerVisible}
        title={t("Select Quran translation language")}
        options={quranLanguageOptions}
        selectedValue={translationLanguage}
        onSelect={setTranslationLanguage}
        onClose={() => setPickerVisible(false)}
        theme={theme}
      />

      <GeneralModal
        visible={Boolean(actionVerse)}
        title={
          actionIsBookmarked ? t("Already Bookmarked") : t("Choose an action")
        }
        description={
          actionVerse
            ? `${actionVerse.verse}\n\n${actionVerse.translationVerse}`
            : undefined
        }
        writingDirection={isRtlTranslationLanguage ? "rtl" : "ltr"}
        options={verseActionOptions}
        onClose={() => setActionVerse(null)}
      />

      <GeneralModal
        visible={pinsVisible}
        title={t("Pinned locations")}
        description={pins.length === 0 ? t("No pins yet") : undefined}
        writingDirection={isRtlTranslationLanguage ? "rtl" : "ltr"}
        options={pinOptions}
        onClose={() => setPinsVisible(false)}
      />
    </View>
  );
};

export default function App() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <SurahDetails />
    </GestureHandlerRootView>
  );
}

// ====================== STYLES ======================
const styles = StyleSheet.create({
  root: { flex: 1 },
  container: { flex: 1 },
  listFlex: { flex: 1 },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 28,
    gap: 10,
  },
  errorAction: {
    marginTop: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  errorActionText: {
    fontWeight: "600",
    fontSize: 15,
  },

  pillHeaderWrapper: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
    paddingHorizontal: 10,
    alignItems: "center",
  },
  pillRow: {
    width: "100%",
    maxWidth: 600,
    alignSelf: "center",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingHorizontal: 2,
  },
  miniPill: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
    ...Platform.select({
      ios: {
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.12,
        shadowRadius: 6,
      },
      android: {
        elevation: 2,
      },
    }),
  },

  titleCapsuleWrapper: {
    flex: 1,
    minWidth: 100,
    maxWidth: 230,
    marginHorizontal: 4,
  },
  titleCapsuleInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    minHeight: 40,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
    ...Platform.select({
      ios: {
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.12,
        shadowRadius: 6,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  pillArabic: {
    fontSize: 16.5,
    fontWeight: "700",
    fontFamily: "Amiri-Regular",
    flexShrink: 1,
    textAlign: "center",
    letterSpacing: 0.12,
  },

  // Global Audio Player
  globalPlayerContainer: {
    position: "absolute",
    left: 12,
    right: 12,
    zIndex: 19,
    maxWidth: 580,
    alignSelf: "center",
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 8,
    ...Platform.select({
      ios: {
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.16,
        shadowRadius: 10,
      },
      android: {
        elevation: 6,
      },
    }),
  },
  globalPlayerTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 4,
  },
  globalPlayerAyahTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 12,
  },
  globalPlayerAyahText: {
    fontSize: 12,
    fontWeight: "700",
  },
  globalPlayerReciter: {
    fontSize: 12,
    fontWeight: "600",
    flex: 1,
    textAlign: "center",
  },
  globalPlayerTopRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  globalPlayerTime: {
    fontSize: 11.5,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
  globalPlayerCloseBtn: {
    width: 26,
    height: 26,
    alignItems: "center",
    justifyContent: "center",
  },
  globalPlayerDlRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginVertical: 6,
  },
  globalPlayerTrackBg: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    overflow: "hidden",
  },
  globalPlayerDlFill: {
    height: 4,
    borderRadius: 2,
  },
  globalPlayerDlPct: {
    fontSize: 11,
    fontWeight: "700",
    minWidth: 32,
    textAlign: "right",
  },
  seekTrack: {
    height: 22,
    justifyContent: "center",
    marginVertical: 2,
  },
  seekTrackBg: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 3.5,
    borderRadius: 2,
  },
  seekFill: {
    position: "absolute",
    left: 0,
    height: 3.5,
    borderRadius: 2,
  },
  seekThumb: {
    position: "absolute",
    width: 12,
    height: 12,
    borderRadius: 6,
    marginLeft: -6,
    borderWidth: 2,
    top: 5,
  },
  globalPlayerControlsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 22,
    marginTop: 2,
  },
  globalPlayerControlBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  globalPlayerPlayBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },

  listContent: {
    paddingHorizontal: 12,
  },

  scrollTopWrapper: {
    position: "absolute",
    right: 16,
    zIndex: 15,
  },
  scrollTopBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    elevation: 6,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
  },

  resumeActionsWrapper: {
    position: "absolute",
    left: 0,
    right: 0,
    zIndex: 16,
    paddingHorizontal: 12,
  },
  resumeActionsRow: {
    flexDirection: "row",
    alignItems: "stretch",
    justifyContent: "center",
    gap: 8,
  },
  resumeActionBtn: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: 10,
    paddingHorizontal: 9,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    ...Platform.select({
      ios: {
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.14,
        shadowRadius: 10,
      },
      android: {
        elevation: 5,
      },
    }),
  },
  resumeActionText: {
    flexShrink: 1,
    fontSize: 12.5,
    fontWeight: "600",
    textAlign: "center",
  },

  errorText: {
    fontSize: 16,
    fontWeight: "500",
    textAlign: "center",
    lineHeight: 24,
  },
});
