import React, {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
  ActivityIndicator,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  FadeIn,
  FadeOut,
  runOnJS,
  cancelAnimation,
} from "react-native-reanimated";
import {
  LongPressGestureHandler,
  State,
  Gesture,
  GestureDetector,
} from "react-native-gesture-handler";
import { Icon } from "react-native-paper";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { setAudioModeAsync, createAudioPlayer } from "expo-audio";
import { File, Directory, Paths } from "expo-file-system";
import {
  getAyahAudioUrl,
  getAyahFileName,
  DEFAULT_RECITER_ID,
  getReciterById,
} from "../components/reciters";
import { useReciterStore } from "./store/useReciterStore";
// Adjust path if your helpers live elsewhere:
// e.g. "../../components/quranAudio/reciters"

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

const PRESS_SPRING_IN = { damping: 18, stiffness: 420, mass: 0.45 };
const PRESS_SPRING_OUT = { damping: 16, stiffness: 300, mass: 0.5 };

const padFolder = (n) => String(n).padStart(3, "0");

/** Root: document/quran-audio */
const audioRootDir = () => new Directory(Paths.document, "quran-audio");

/** document/quran-audio/{reciterId}/{surahPad}/ */
const ayahDirFor = (reciterId, surahId) =>
  new Directory(audioRootDir(), String(reciterId), padFolder(surahId));

/** File for a single ayah */
const ayahFileFor = (reciterId, surahId, ayah) =>
  new File(ayahDirFor(reciterId, surahId), getAyahFileName(surahId, ayah));

/** URI string for createAudioPlayer / storage */
const localUriFor = (reciterId, surahId, ayah) =>
  ayahFileFor(reciterId, surahId, ayah).uri;

function ensureDir(dir) {
  if (!dir.exists) {
    dir.create({ intermediates: true });
  }
}

const storageKey = (reciterId, surahId, ayah) =>
  `quran_audio_v2_${reciterId}_${surahId}_${ayah}`;

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

/** HEAD request for Content-Length (best-effort). */
async function fetchRemoteSize(url) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, {
      method: "HEAD",
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const len = res.headers.get("content-length");
    const n = Number(len);
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

// ─── Seek bar (smooth shared-value driven) ──────────────────────────────────
const SeekBar = memo(({ progress, onSeek, colors, disabled }) => {
  const trackWidth = useSharedValue(1);
  const fill = useSharedValue(progress);

  useEffect(() => {
    // Short timing keeps the bar fluid without fighting user drags
    fill.value = withTiming(Math.min(1, Math.max(0, progress)), {
      duration: 90,
    });
  }, [progress, fill]);

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

// ─── Compact mini player (no speed control) ─────────────────────────────────
const VerseMiniPlayer = memo(
  ({
    colors,
    isPlaying,
    positionSec,
    durationSec,
    downloadProgress,
    onPlay,
    onPause,
    onSeek,
    onSkip,
    onClose,
  }) => {
    const progress =
      durationSec > 0 ? Math.min(1, positionSec / durationSec) : 0;

    return (
      <Animated.View
        entering={FadeIn.duration(140)}
        exiting={FadeOut.duration(100)}
        style={[
          styles.miniPlayer,
          {
            backgroundColor: withAlpha(colors.accent, 0.07),
            borderColor: withAlpha(colors.accent, 0.2),
          },
        ]}
      >
        <View style={styles.miniTopRow}>
          <Text style={[styles.timeText, { color: colors.secondary }]}>
            {formatTime(positionSec)}
            <Text style={{ opacity: 0.5 }}> / {formatTime(durationSec)}</Text>
          </Text>
          <Pressable
            onPress={onClose}
            hitSlop={12}
            style={styles.miniClose}
            accessibilityRole="button"
            accessibilityLabel="Collapse player"
          >
            <Icon source="chevron-up" size={18} color={colors.secondary} />
          </Pressable>
        </View>

        {downloadProgress != null && downloadProgress < 1 ? (
          <View style={styles.dlBarWrap}>
            <View
              style={[
                styles.dlBarBg,
                { backgroundColor: withAlpha(colors.accent, 0.14) },
              ]}
            >
              <View
                style={[
                  styles.dlBarFill,
                  {
                    backgroundColor: colors.accent,
                    width: `${Math.round(downloadProgress * 100)}%`,
                  },
                ]}
              />
            </View>
            <Text style={[styles.dlPct, { color: colors.accent }]}>
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

        <View style={styles.transportRow}>
          <Pressable
            onPress={() => onSkip(-5)}
            hitSlop={10}
            style={styles.transportBtn}
            accessibilityLabel="Rewind 5 seconds"
          >
            <Icon source="rewind-5" size={20} color={colors.text} />
          </Pressable>
          <Pressable
            onPress={() => {
              safeHaptic(() =>
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light),
              );
              isPlaying ? onPause?.() : onPlay?.();
            }}
            style={[styles.playPauseBtn, { backgroundColor: colors.accent }]}
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
            style={styles.transportBtn}
            accessibilityLabel="Forward 5 seconds"
          >
            <Icon source="fast-forward-5" size={20} color={colors.text} />
          </Pressable>
        </View>
      </Animated.View>
    );
  },
);
VerseMiniPlayer.displayName = "VerseMiniPlayer";

// ─── Compact chip ───────────────────────────────────────────────────────────
export const VerseAudioButton = memo(
  ({
    colors,
    size = 34,
    isDownloaded = false,
    isPlaying = false,
    isDownloading = false,
    durationSec = 0,
    sizeLabel,
    progress,
    onPressDownload,
    onPressPlay,
    onPressPause,
    onExpand,
  }) => {
    const scale = useSharedValue(1);
    const pressStyle = useAnimatedStyle(() => ({
      transform: [{ scale: scale.value }],
    }));

    const handlePress = useCallback(() => {
      safeHaptic(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
      if (isDownloading) return;
      if (isPlaying) {
        onPressPause?.();
        onExpand?.();
        return;
      }
      if (isDownloaded) {
        onPressPlay?.();
        onExpand?.();
        return;
      }
      onPressDownload?.();
    }, [
      isDownloading,
      isPlaying,
      isDownloaded,
      onPressDownload,
      onPressPlay,
      onPressPause,
      onExpand,
    ]);

    let icon = "download-outline";
    let iconColor = colors.accent;
    let bg = withAlpha(colors.accent, 0.1);
    let border = withAlpha(colors.accent, 0.28);

    if (isDownloading) icon = null;
    else if (isPlaying) {
      icon = "pause";
      iconColor = "#fff";
      bg = colors.accent;
      border = colors.accent;
    } else if (isDownloaded) {
      icon = "play";
      iconColor = "#fff";
      bg = colors.accent;
      border = colors.accent;
    }

    return (
      <View style={styles.audioChipCol}>
        <Animated.View style={pressStyle}>
          <Pressable
            onPress={handlePress}
            onPressIn={() => {
              cancelAnimation(scale);
              scale.value = withSpring(0.88, PRESS_SPRING_IN);
            }}
            onPressOut={() => {
              cancelAnimation(scale);
              scale.value = withSpring(1, PRESS_SPRING_OUT);
            }}
            disabled={isDownloading}
            hitSlop={8}
            style={({ pressed }) => [
              styles.audioBtn,
              {
                width: size,
                height: size,
                borderRadius: size / 2,
                backgroundColor: bg,
                borderColor: border,
                opacity: pressed && !isDownloading ? 0.85 : 1,
              },
            ]}
          >
            {isDownloading ? (
              <View style={styles.chipProgress}>
                <ActivityIndicator size="small" color={colors.accent} />
                {progress > 0 && progress < 1 ? (
                  <Text style={[styles.chipPct, { color: colors.accent }]}>
                    {Math.round(progress * 100)}
                  </Text>
                ) : null}
              </View>
            ) : (
              <Icon
                source={icon}
                size={size >= 36 ? 18 : 16}
                color={iconColor}
              />
            )}
          </Pressable>
        </Animated.View>
        {isDownloaded && durationSec > 0 ? (
          <Text style={[styles.durationUnder, { color: colors.secondary }]}>
            {formatTime(durationSec)}
          </Text>
        ) : !isDownloaded && sizeLabel ? (
          <Text style={[styles.durationUnder, { color: colors.secondary }]}>
            {sizeLabel}
          </Text>
        ) : null}
      </View>
    );
  },
);
VerseAudioButton.displayName = "VerseAudioButton";

// ─── Surah toolbar ──────────────────────────────────────────────────────────
export const SurahAudioToolbar = memo(
  ({
    totalVerses = 0,
    downloadedCount = 0,
    isDownloadingAll = false,
    progress = 0,
    totalBytesLabel,
    colors,
    labels,
    onDownloadAll,
    onCancelDownloadAll,
  }) => {
    const allDone =
      totalVerses > 0 && downloadedCount >= totalVerses && !isDownloadingAll;

    return (
      <View
        style={[
          styles.surahAudioBar,
          { backgroundColor: colors.surface, borderColor: colors.border },
        ]}
      >
        <View style={styles.surahAudioLeft}>
          <View
            style={[
              styles.surahAudioIconWrap,
              { backgroundColor: withAlpha(colors.accent, 0.12) },
            ]}
          >
            <Icon
              source={allDone ? "check-circle" : "cloud-download-outline"}
              size={18}
              color={colors.accent}
            />
          </View>
          <View style={styles.surahAudioTextCol}>
            <Text
              style={[styles.surahAudioTitle, { color: colors.text }]}
              numberOfLines={1}
            >
              {allDone
                ? labels?.allDownloaded || "All ayahs downloaded"
                : isDownloadingAll
                  ? labels?.downloadingAll || "Downloading surah…"
                  : labels?.downloadAll || "Download full surah"}
            </Text>
            <Text
              style={[styles.surahAudioSub, { color: colors.secondary }]}
              numberOfLines={1}
            >
              {isDownloadingAll
                ? `${Math.round((progress || 0) * 100)}% · ${downloadedCount}/${totalVerses}`
                : totalBytesLabel
                  ? `${downloadedCount} / ${totalVerses} · ~${totalBytesLabel}`
                  : `${downloadedCount} / ${totalVerses} ${labels?.ayahs || "ayahs"}`}
            </Text>
          </View>
        </View>
        <Pressable
          onPress={() => {
            safeHaptic(() =>
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light),
            );
            if (isDownloadingAll) onCancelDownloadAll?.();
            else if (!allDone) onDownloadAll?.();
          }}
          disabled={allDone}
          style={({ pressed }) => [
            styles.surahAudioAction,
            {
              backgroundColor: allDone
                ? withAlpha(colors.accent, 0.12)
                : colors.accent,
              opacity: pressed && !allDone ? 0.88 : 1,
            },
          ]}
        >
          {isDownloadingAll ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text
              style={[
                styles.surahAudioActionText,
                { color: allDone ? colors.accent : "#fff" },
              ]}
            >
              {allDone
                ? labels?.done || "Done"
                : labels?.download || "Download"}
            </Text>
          )}
        </Pressable>
      </View>
    );
  },
);
SurahAudioToolbar.displayName = "SurahAudioToolbar";

// ─── Production audio registry ──────────────────────────────────────────────
/**
 * @param {number} surahId
 * @param {number[]} ayahList
 * @param {number} [reciterId]
 */
export function useSurahAudioRegistry(surahId, ayahList = [], customReciterId) {
  const storeReciterId = useReciterStore((state) => state.reciterId);

  // Use customReciterId if explicitly provided, otherwise fall back to store value
  const reciterId = customReciterId ?? storeReciterId;

  const [downloadedSet, setDownloadedSet] = useState(() => new Set());
  const [durationMap, setDurationMap] = useState(() => new Map());
  const [sizeMap, setSizeMap] = useState(() => new Map());
  const [downloadingId, setDownloadingId] = useState(null);
  const [downloadProgressMap, setDownloadProgressMap] = useState(
    () => new Map(),
  );
  const [playingId, setPlayingId] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [positionSec, setPositionSec] = useState(0);
  const [isDownloadingAll, setIsDownloadingAll] = useState(false);
  const [bulkProgress, setBulkProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState(null);

  const playerRef = useRef(null);
  const statusIntervalRef = useRef(null);
  const bulkCancelRef = useRef(false);
  const downloadAbortRef = useRef(null);
  const positionRef = useRef(0);
  const durationRef = useRef(0);
  const isMounted = useRef(true);
  const userPausedRef = useRef(false);
  const autoAdvanceRef = useRef(true);
  const playingAyahRef = useRef(null);
  const ayahListRef = useRef(ayahList);
  const downloadedSetRef = useRef(downloadedSet);
  const playVerseRef = useRef(null);
  const prefetchingRef = useRef(new Set());

  const reciterIdRef = useRef(reciterId);
  useEffect(() => {
    reciterIdRef.current = reciterId;
  }, [reciterId]);

  // Keep references synced
  useEffect(() => {
    ayahListRef.current = ayahList;
  }, [ayahList]);

  useEffect(() => {
    downloadedSetRef.current = downloadedSet;
  }, [downloadedSet]);

  useEffect(() => {
    ayahListRef.current = ayahList;
  }, [ayahList]);

  useEffect(() => {
    downloadedSetRef.current = downloadedSet;
  }, [downloadedSet]);

  useEffect(() => {
    isMounted.current = true;

    setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      shouldRouteThroughEarpiece: false,
      interruptionMode: "doNotMix",
    }).catch(() => {});

    return () => {
      isMounted.current = false;
      bulkCancelRef.current = true;
      autoAdvanceRef.current = false;
      try {
        downloadAbortRef.current?.abort?.();
      } catch {}
      if (statusIntervalRef.current) {
        clearInterval(statusIntervalRef.current);
        statusIntervalRef.current = null;
      }
      if (playerRef.current) {
        try {
          playerRef.current.pause();
        } catch {}
        try {
          playerRef.current.remove?.();
        } catch {}
        playerRef.current = null;
      }
    };
  }, []);

  // Scan local files + AsyncStorage for this surah/reciter
  useEffect(() => {
    let active = true;
    const scan = async () => {
      if (!surahId || surahId <= 0) return;
      const next = new Set();
      const durs = new Map();
      const sizes = new Map();

      const dir = ayahDirFor(reciterId, surahId);
      try {
        ensureDir(dir);
      } catch {}

      for (const ayah of ayahList) {
        try {
          const file = ayahFileFor(reciterId, surahId, ayah);
          if (file.exists) {
            const size = file.size ?? 0;
            if (size > 0) {
              next.add(ayah);
              sizes.set(ayah, size);
              const meta = await AsyncStorage.getItem(
                storageKey(reciterId, surahId, ayah),
              );
              if (meta) {
                const d = Number(JSON.parse(meta)?.duration);
                if (Number.isFinite(d) && d > 0) durs.set(ayah, d);
              }
            }
          }
        } catch {}
      }
      if (active && isMounted.current) {
        setDownloadedSet(next);
        setDurationMap(durs);
        setSizeMap(sizes);
      }
    };
    scan();
    return () => {
      active = false;
    };
  }, [surahId, ayahList, reciterId]);

  const unloadPlayer = useCallback(() => {
    if (statusIntervalRef.current) {
      clearInterval(statusIntervalRef.current);
      statusIntervalRef.current = null;
    }
    if (playerRef.current) {
      try {
        playerRef.current.pause();
      } catch {}
      try {
        playerRef.current.remove?.();
      } catch {}
      playerRef.current = null;
    }
  }, []);

  const markDownloaded = useCallback(
    async (ayah, durationSec, byteSize) => {
      setDownloadedSet((prev) => {
        if (prev.has(ayah)) return prev;
        const n = new Set(prev);
        n.add(ayah);
        return n;
      });
      if (durationSec > 0) {
        setDurationMap((prev) => {
          if (prev.get(ayah) === durationSec) return prev;
          const n = new Map(prev);
          n.set(ayah, durationSec);
          return n;
        });
      }
      if (byteSize > 0) {
        setSizeMap((prev) => {
          if (prev.get(ayah) === byteSize) return prev;
          const n = new Map(prev);
          n.set(ayah, byteSize);
          return n;
        });
      }
      try {
        await AsyncStorage.setItem(
          storageKey(reciterId, surahId, ayah),
          JSON.stringify({ duration: durationSec || 0, size: byteSize || 0 }),
        );
      } catch {}
    },
    [reciterId, surahId],
  );

  const downloadOne = useCallback(
    async (ayah, { onProgress, silent } = {}) => {
      const url = getAyahAudioUrl(reciterId, surahId, ayah);
      if (!url) throw new Error("Invalid reciter / ayah");

      const dir = ayahDirFor(reciterId, surahId);
      ensureDir(dir);

      const destFile = ayahFileFor(reciterId, surahId, ayah);

      if (destFile.exists && (destFile.size ?? 0) > 1024) {
        await markDownloaded(
          ayah,
          durationMap.get(ayah) || 0,
          destFile.size ?? 0,
        );
        return destFile.uri;
      }

      let remoteSize = sizeMap.get(ayah);
      if (!remoteSize) {
        remoteSize = await fetchRemoteSize(url);
        if (remoteSize && isMounted.current) {
          setSizeMap((prev) => {
            const n = new Map(prev);
            n.set(ayah, remoteSize);
            return n;
          });
        }
      }

      onProgress?.(0.04);
      if (isMounted.current && !silent) {
        setDownloadProgressMap((prev) => {
          const n = new Map(prev);
          n.set(ayah, 0.04);
          return n;
        });
      }

      const tmpName = `${getAyahFileName(surahId, ayah)}.tmp`;
      const tmpFile = new File(dir, tmpName);
      if (tmpFile.exists) {
        try {
          tmpFile.delete();
        } catch {}
      }

      const controller = new AbortController();
      downloadAbortRef.current = controller;

      try {
        const downloaded = await File.downloadFileAsync(url, dir, {
          idempotent: true,
          signal: controller.signal,
          onProgress: (data) => {
            const total = data?.totalBytes ?? remoteSize ?? 0;
            const written = data?.bytesWritten ?? 0;
            if (total > 0) {
              const p = Math.min(0.98, written / total);
              onProgress?.(p);
              if (isMounted.current && !silent) {
                setDownloadProgressMap((prev) => {
                  const n = new Map(prev);
                  n.set(ayah, p);
                  return n;
                });
              }
            }
          },
        });

        if (downloaded.uri !== destFile.uri) {
          if (destFile.exists) {
            try {
              destFile.delete();
            } catch {}
          }
          const src = new File(downloaded.uri);
          src.move(destFile);
        }

        onProgress?.(1);
        if (isMounted.current && !silent) {
          setDownloadProgressMap((prev) => {
            const n = new Map(prev);
            n.set(ayah, 1);
            return n;
          });
        }
      } catch (e) {
        if (controller.signal.aborted) throw e;
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) throw new Error("Download failed");
        const bytes = await res.bytes();
        if (!destFile.exists) {
          destFile.create();
        }
        destFile.write(bytes);
        onProgress?.(1);
      } finally {
        downloadAbortRef.current = null;
        try {
          if (tmpFile.exists) tmpFile.delete();
        } catch {}
      }

      if (!destFile.exists || (destFile.size ?? 0) < 512) {
        try {
          if (destFile.exists) destFile.delete();
        } catch {}
        throw new Error("Corrupt download");
      }

      const finalSize = destFile.size ?? 0;
      await markDownloaded(ayah, 0, finalSize);
      if (isMounted.current && !silent) {
        setDownloadProgressMap((prev) => {
          const n = new Map(prev);
          n.delete(ayah);
          return n;
        });
      }
      return destFile.uri;
    },
    [reciterId, surahId, durationMap, sizeMap, markDownloaded],
  );

  const prefetchNext = useCallback(
    async (currentAyah) => {
      const list = ayahListRef.current || [];
      const idx = list.indexOf(currentAyah);
      if (idx < 0 || idx >= list.length - 1) return;
      const nextAyah = list[idx + 1];
      if (downloadedSetRef.current.has(nextAyah)) return;
      if (prefetchingRef.current.has(nextAyah)) return;
      prefetchingRef.current.add(nextAyah);
      try {
        await downloadOne(nextAyah, { silent: true });
      } catch {
        // quiet fail — user can still tap download
      } finally {
        prefetchingRef.current.delete(nextAyah);
      }
    },
    [downloadOne],
  );

  const advanceToNext = useCallback(async (finishedAyah) => {
    if (!autoAdvanceRef.current || userPausedRef.current) return;
    if (!isMounted.current) return;

    const list = ayahListRef.current || [];
    const idx = list.indexOf(finishedAyah);
    if (idx < 0 || idx >= list.length - 1) return;

    const nextAyah = list[idx + 1];
    // Prefer playVerse via ref to avoid circular deps / stale closures
    const playFn = playVerseRef.current;
    if (typeof playFn === "function") {
      try {
        await playFn(nextAyah, { fromAutoAdvance: true });
      } catch {
        // stop chain on failure
      }
    }
  }, []);

  const startStatusPolling = useCallback(
    (player, ayah) => {
      if (statusIntervalRef.current) {
        clearInterval(statusIntervalRef.current);
      }
      // ~10fps UI updates for a smooth progress line
      statusIntervalRef.current = setInterval(() => {
        if (!playerRef.current || !isMounted.current) return;
        try {
          const current = player.currentTime ?? 0;
          const dur = player.duration ?? 0;
          positionRef.current = current;
          if (dur > 0) durationRef.current = dur;

          setPositionSec(current);

          if (dur > 0) {
            setDurationMap((prev) => {
              if (prev.get(ayah) === dur) return prev;
              const n = new Map(prev);
              n.set(ayah, dur);
              return n;
            });
          }

          const ended =
            dur > 0 &&
            current >= dur - 0.12 &&
            (player.playing === false || current >= dur - 0.02);

          if (ended) {
            if (statusIntervalRef.current) {
              clearInterval(statusIntervalRef.current);
              statusIntervalRef.current = null;
            }
            setPlayingId(null);
            playingAyahRef.current = null;
            positionRef.current = 0;
            setPositionSec(0);

            // Auto-advance unless user paused
            if (!userPausedRef.current && autoAdvanceRef.current) {
              advanceToNext(ayah);
            }
          }
        } catch {}
      }, 100);
    },
    [advanceToNext],
  );

  const downloadVerse = useCallback(
    async (ayah) => {
      if (downloadingId != null) return;
      setErrorMsg(null);
      setDownloadingId(ayah);
      setExpandedId(ayah);
      try {
        const url = getAyahAudioUrl(reciterId, surahId, ayah);
        if (url && !sizeMap.has(ayah)) {
          const s = await fetchRemoteSize(url);
          if (s && isMounted.current) {
            setSizeMap((prev) => new Map(prev).set(ayah, s));
          }
        }
        await downloadOne(ayah);
        safeHaptic(() =>
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
        );
      } catch (e) {
        if (isMounted.current) {
          setErrorMsg(e?.message || "Download failed");
        }
        safeHaptic(() =>
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error),
        );
      } finally {
        if (isMounted.current) {
          setDownloadingId(null);
          setDownloadProgressMap((prev) => {
            const n = new Map(prev);
            n.delete(ayah);
            return n;
          });
        }
      }
    },
    [downloadingId, downloadOne, reciterId, surahId, sizeMap],
  );

  const playVerse = useCallback(
    async (ayah, opts = {}) => {
      const fromAuto = !!opts.fromAutoAdvance;
      setErrorMsg(null);
      userPausedRef.current = false;
      autoAdvanceRef.current = true;

      try {
        const file = ayahFileFor(reciterId, surahId, ayah);
        let uri = file.uri;
        if (!file.exists || (file.size ?? 0) < 512) {
          if (!fromAuto) setDownloadingId(ayah);
          uri = await downloadOne(ayah);
          if (!fromAuto && isMounted.current) setDownloadingId(null);
        }

        unloadPlayer();

        // 100ms status updates from native player when supported
        const player = createAudioPlayer({ uri }, 100);
        playerRef.current = player;
        playingAyahRef.current = ayah;

        player.play();

        const knownDur = durationMap.get(ayah);
        if (knownDur > 0) {
          durationRef.current = knownDur;
        }

        startStatusPolling(player, ayah);

        const tryPersistDuration = () => {
          try {
            const dur = player.duration;
            if (dur > 0 && isMounted.current) {
              durationRef.current = dur;
              setDurationMap((prev) => {
                if (prev.get(ayah) === dur) return prev;
                const n = new Map(prev);
                n.set(ayah, dur);
                return n;
              });
              AsyncStorage.setItem(
                storageKey(reciterId, surahId, ayah),
                JSON.stringify({
                  duration: dur,
                  size: sizeMap.get(ayah) || 0,
                }),
              ).catch(() => {});
            }
          } catch {}
        };
        setTimeout(tryPersistDuration, 350);
        setTimeout(tryPersistDuration, 1100);

        if (isMounted.current) {
          setPlayingId(ayah);
          setExpandedId(ayah);
          setPositionSec(0);
          positionRef.current = 0;
        }

        // Prefetch next ayah while this one plays
        prefetchNext(ayah);

        if (!fromAuto) {
          safeHaptic(() =>
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light),
          );
        }
      } catch (e) {
        if (isMounted.current) setDownloadingId(null);
        setErrorMsg(e?.message || "Playback failed");
        safeHaptic(() =>
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error),
        );
      }
    },
    [
      reciterId,
      surahId,
      downloadOne,
      unloadPlayer,
      startStatusPolling,
      durationMap,
      sizeMap,
      prefetchNext,
    ],
  );

  // Keep stable ref for auto-advance
  useEffect(() => {
    playVerseRef.current = playVerse;
  }, [playVerse]);

  const pauseVerse = useCallback(async () => {
    userPausedRef.current = true;
    autoAdvanceRef.current = false;
    try {
      if (playerRef.current) {
        playerRef.current.pause();
      }
    } catch {}
    setPlayingId(null);
  }, []);

  const seekTo = useCallback(async (ratio) => {
    const player = playerRef.current;
    const dur = player?.duration || durationRef.current || 0;
    const next = Math.min(dur, Math.max(0, ratio * dur));
    positionRef.current = next;
    setPositionSec(next);
    try {
      if (player) {
        await player.seekTo(next);
      }
    } catch {}
  }, []);

  const skipBy = useCallback(async (delta) => {
    const player = playerRef.current;
    const dur = player?.duration || durationRef.current || 0;
    const current = player?.currentTime ?? positionRef.current;
    const next = Math.min(dur, Math.max(0, current + delta));
    positionRef.current = next;
    setPositionSec(next);
    try {
      if (player) {
        await player.seekTo(next);
      }
    } catch {}
  }, []);

  const expandPlayer = useCallback((ayah) => setExpandedId(ayah), []);
  const collapsePlayer = useCallback(() => setExpandedId(null), []);

  const downloadAll = useCallback(async () => {
    if (isDownloadingAll || !ayahList.length) return;
    bulkCancelRef.current = false;
    setIsDownloadingAll(true);
    setBulkProgress(0);
    setErrorMsg(null);
    for (let i = 0; i < ayahList.length; i++) {
      if (bulkCancelRef.current) break;
      const ayah = ayahList[i];
      if (!downloadedSet.has(ayah)) {
        setDownloadingId(ayah);
        try {
          await downloadOne(ayah);
        } catch {
          // continue remaining ayahs
        }
      }
      if (isMounted.current) {
        setBulkProgress((i + 1) / ayahList.length);
      }
    }
    setDownloadingId(null);
    setIsDownloadingAll(false);
    if (!bulkCancelRef.current) {
      safeHaptic(() =>
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
      );
    }
  }, [ayahList, downloadedSet, isDownloadingAll, downloadOne]);

  const cancelDownloadAll = useCallback(() => {
    bulkCancelRef.current = true;
    try {
      downloadAbortRef.current?.abort?.();
    } catch {}
    downloadAbortRef.current = null;
    setIsDownloadingAll(false);
    setDownloadingId(null);
  }, []);

  // Prefetch sizes for undownloaded ayahs (lightweight, capped)
  useEffect(() => {
    if (!surahId || !ayahList.length) return;
    let cancelled = false;
    const run = async () => {
      const missing = ayahList.filter((a) => !downloadedSet.has(a)).slice(0, 5);
      for (const ayah of missing) {
        if (cancelled) break;
        if (sizeMap.has(ayah)) continue;
        const url = getAyahAudioUrl(reciterId, surahId, ayah);
        if (!url) continue;
        const s = await fetchRemoteSize(url);
        if (s && !cancelled && isMounted.current) {
          setSizeMap((prev) => new Map(prev).set(ayah, s));
        }
      }
    };
    const t = setTimeout(run, 400);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [surahId, ayahList, reciterId, downloadedSet, sizeMap]);

  const totalKnownBytes = useMemo(() => {
    let sum = 0;
    let n = 0;
    for (const a of ayahList) {
      const s = sizeMap.get(a);
      if (s) {
        sum += s;
        n += 1;
      }
    }
    if (n === 0) return null;
    const avg = sum / n;
    return avg * ayahList.length;
  }, [ayahList, sizeMap]);

  return {
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
    downloadedCount: downloadedSet.size,
    errorMsg,
    totalBytesLabel: formatBytes(totalKnownBytes),
    reciter: getReciterById(reciterId),
    downloadVerse,
    playVerse,
    pauseVerse,
    seekTo,
    skipBy,
    expandPlayer,
    collapsePlayer,
    downloadAll,
    cancelDownloadAll,
  };
}

// ─── Verse row ──────────────────────────────────────────────────────────────
export const VerseItem = memo(
  ({
    item,
    index,
    translationVerse,
    isFallbackTranslation,
    tafseerText,
    isPashtoTranslation,
    isRtlText,
    isTafseerExpanded,
    onToggleTafseer,
    isHighlighted,
    isPinned,
    highlightProgress,
    colors,
    pinnedLabel,
    onLongPress,
    surahId,
    isAudioDownloaded,
    isAudioPlaying,
    isAudioDownloading,
    isPlayerExpanded,
    audioDurationSec,
    audioPositionSec,
    audioSizeLabel,
    audioDownloadProgress,
    onAudioDownload,
    onAudioPlay,
    onAudioPause,
    onAudioSeek,
    onAudioSkip,
    onAudioExpand,
    onAudioCollapse,
  }) => {
    const rippleStyle = useAnimatedStyle(() => {
      if (!isHighlighted) return { opacity: 0, transform: [{ scale: 1 }] };
      return {
        opacity: highlightProgress.value * 0.9,
        transform: [{ scale: 0.98 + highlightProgress.value * 0.02 }],
      };
    }, [isHighlighted]);

    const cardBg = isHighlighted
      ? withAlpha(colors.accent, 0.09)
      : colors.surface;

    const handleLongPressState = useCallback(
      ({ nativeEvent }) => {
        if (nativeEvent.state === State.ACTIVE) {
          onLongPress({
            id: item.id,
            verse: item.verse,
            translationVerse,
            ayah: item.ayah,
            index,
            surah: item.surah,
          });
        }
      },
      [item, translationVerse, index, onLongPress],
    );

    return (
      <LongPressGestureHandler
        onHandlerStateChange={handleLongPressState}
        minDurationMs={400}
      >
        <Animated.View
          style={[
            styles.verseOuter,
            {
              backgroundColor: cardBg,
              borderColor: isHighlighted
                ? withAlpha(colors.accent, 0.42)
                : colors.border,
            },
          ]}
        >
          <Pressable
            android_ripple={{
              color: withAlpha(colors.accent, 0.1),
              borderless: false,
              foreground: true,
            }}
            style={({ pressed }) => [
              styles.verseContainer,
              isHighlighted && {
                borderLeftColor: colors.accent,
                borderLeftWidth: 3,
              },
              pressed && {
                backgroundColor: withAlpha(colors.accent, 0.045),
              },
            ]}
          >
            {isHighlighted ? (
              <Animated.View
                pointerEvents="none"
                style={[
                  styles.ayahRipple,
                  { borderColor: withAlpha(colors.accent, 0.45) },
                  rippleStyle,
                ]}
              />
            ) : null}

            <View style={styles.topRow}>
              <View style={styles.badgeRow}>
                {isPinned ? (
                  <View
                    style={[
                      styles.inlinePinBadge,
                      { backgroundColor: colors.accent },
                    ]}
                  >
                    <Icon source="pin" size={11} color="#fff" />
                    <Text style={styles.pinBadgeText}>{pinnedLabel}</Text>
                  </View>
                ) : (
                  <View style={styles.badgeSpacer} />
                )}
              </View>

              <VerseAudioButton
                colors={colors}
                size={34}
                isDownloaded={isAudioDownloaded}
                isPlaying={isAudioPlaying}
                isDownloading={isAudioDownloading}
                durationSec={audioDurationSec}
                sizeLabel={audioSizeLabel}
                progress={audioDownloadProgress}
                onPressDownload={() => onAudioDownload?.(item.ayah)}
                onPressPlay={() => onAudioPlay?.(item.ayah)}
                onPressPause={onAudioPause}
                onExpand={() => onAudioExpand?.(item.ayah)}
              />
            </View>

            <View style={styles.arabicRow}>
              <Text
                style={[styles.arabicText, { color: colors.text }]}
                selectable
              >
                <Text
                  style={[styles.ayahNumberInline, { color: colors.accent }]}
                >
                  {item.ayah}{" "}
                </Text>
                {item.verse}
              </Text>
            </View>

            <Text
              style={[
                styles.translationText,
                {
                  color: colors.secondary,
                  textAlign: isRtlText ? "right" : "left",
                  writingDirection: isRtlText ? "rtl" : "ltr",
                },
                isFallbackTranslation && styles.translationTextFallback,
              ]}
              selectable
            >
              {translationVerse}
            </Text>

            {isPlayerExpanded && isAudioDownloaded ? (
              <VerseMiniPlayer
                colors={colors}
                isPlaying={isAudioPlaying}
                positionSec={audioPositionSec}
                durationSec={audioDurationSec}
                downloadProgress={
                  isAudioDownloading ? audioDownloadProgress : null
                }
                onPlay={() => onAudioPlay?.(item.ayah)}
                onPause={onAudioPause}
                onSeek={onAudioSeek}
                onSkip={onAudioSkip}
                onClose={onAudioCollapse}
              />
            ) : null}

            {isPashtoTranslation ? (
              <Pressable
                onPress={() => onToggleTafseer(item.id)}
                style={({ pressed }) => [
                  styles.tafseerToggle,
                  {
                    opacity: pressed ? 0.75 : 1,
                    borderTopColor: withAlpha(colors.accent, 0.12),
                  },
                ]}
                accessibilityRole="button"
                accessibilityState={{ expanded: isTafseerExpanded }}
                hitSlop={8}
              >
                <View style={styles.tafseerToggleLabel}>
                  <Icon
                    source={isTafseerExpanded ? "chevron-up" : "chevron-down"}
                    size={18}
                    color={colors.accent}
                  />
                  <Text
                    style={[
                      styles.tafseerInlineLabel,
                      { color: colors.accent },
                    ]}
                  >
                    تفسیر
                  </Text>
                </View>
                {isTafseerExpanded && tafseerText ? (
                  <Animated.View entering={FadeIn.duration(140)}>
                    <Text
                      selectable
                      style={[
                        styles.tafseerInlineText,
                        { color: colors.secondary },
                      ]}
                    >
                      {tafseerText}
                    </Text>
                  </Animated.View>
                ) : null}
              </Pressable>
            ) : null}
          </Pressable>
        </Animated.View>
      </LongPressGestureHandler>
    );
  },
  (prev, next) =>
    prev.item.id === next.item.id &&
    prev.item.verse === next.item.verse &&
    prev.item.ayah === next.item.ayah &&
    prev.translationVerse === next.translationVerse &&
    prev.isFallbackTranslation === next.isFallbackTranslation &&
    prev.tafseerText === next.tafseerText &&
    prev.isPashtoTranslation === next.isPashtoTranslation &&
    prev.isRtlText === next.isRtlText &&
    prev.isTafseerExpanded === next.isTafseerExpanded &&
    prev.isHighlighted === next.isHighlighted &&
    prev.isPinned === next.isPinned &&
    prev.colors === next.colors &&
    prev.pinnedLabel === next.pinnedLabel &&
    prev.onLongPress === next.onLongPress &&
    prev.onToggleTafseer === next.onToggleTafseer &&
    prev.index === next.index &&
    prev.isAudioDownloaded === next.isAudioDownloaded &&
    prev.isAudioPlaying === next.isAudioPlaying &&
    prev.isAudioDownloading === next.isAudioDownloading &&
    prev.isPlayerExpanded === next.isPlayerExpanded &&
    prev.audioDurationSec === next.audioDurationSec &&
    prev.audioPositionSec === next.audioPositionSec &&
    prev.audioSizeLabel === next.audioSizeLabel &&
    prev.audioDownloadProgress === next.audioDownloadProgress &&
    prev.surahId === next.surahId,
);
VerseItem.displayName = "VerseItem";

// ====================== STYLES ======================
const styles = StyleSheet.create({
  audioChipCol: { alignItems: "center", minWidth: 40 },
  audioBtn: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  chipProgress: { alignItems: "center", justifyContent: "center" },
  chipPct: {
    position: "absolute",
    fontSize: 8,
    fontWeight: "700",
  },
  durationUnder: {
    fontSize: 10,
    fontWeight: "600",
    marginTop: 3,
    letterSpacing: 0.2,
  },
  miniPlayer: {
    marginTop: 10,
    paddingTop: 10,
    paddingBottom: 6,
    paddingHorizontal: 10,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  miniTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  miniClose: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  timeText: {
    fontSize: 12,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
  dlBarWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 6,
  },
  dlBarBg: { flex: 1, height: 3.5, borderRadius: 2, overflow: "hidden" },
  dlBarFill: { height: 3.5, borderRadius: 2 },
  dlPct: { fontSize: 11, fontWeight: "700", minWidth: 34, textAlign: "right" },
  seekTrack: { height: 26, justifyContent: "center", marginBottom: 2 },
  seekTrackBg: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 3.5,
    borderRadius: 2,
  },
  seekFill: { position: "absolute", left: 0, height: 3.5, borderRadius: 2 },
  seekThumb: {
    position: "absolute",
    width: 12,
    height: 12,
    borderRadius: 6,
    marginLeft: -6,
    borderWidth: 2,
    top: 7,
  },
  transportRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 20,
    marginTop: 2,
  },
  transportBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  playPauseBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  surahAudioBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 10,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
      },
      android: { elevation: 1 },
    }),
  },
  surahAudioLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    gap: 10,
    minWidth: 0,
  },
  surahAudioIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  surahAudioTextCol: { flex: 1, minWidth: 0 },
  surahAudioTitle: { fontSize: 14, fontWeight: "700", letterSpacing: 0.15 },
  surahAudioSub: { fontSize: 12, fontWeight: "500", marginTop: 1 },
  surahAudioAction: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    minWidth: 88,
    alignItems: "center",
    justifyContent: "center",
  },
  surahAudioActionText: { fontSize: 13, fontWeight: "700", letterSpacing: 0.2 },
  verseOuter: {
    borderRadius: 16,
    overflow: "hidden",
    marginVertical: 5,
    borderWidth: StyleSheet.hairlineWidth,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04,
        shadowRadius: 5,
      },
      android: { elevation: 1 },
    }),
  },
  verseContainer: {
    position: "relative",
    paddingVertical: 16,
    paddingHorizontal: 14,
    borderRadius: 16,
  },
  ayahRipple: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 1.5,
    borderRadius: 16,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  badgeRow: { flexDirection: "row", alignItems: "center", flex: 1 },
  badgeSpacer: { height: 1 },
  inlinePinBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 16,
  },
  pinBadgeText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.15,
  },
  arabicRow: { width: "100%", marginBottom: 8 },
  ayahNumberInline: { fontWeight: "700", fontSize: 17 },
  arabicText: {
    fontSize: 22,
    fontWeight: "500",
    textAlign: "right",
    lineHeight: 38,
    writingDirection: "rtl",
    letterSpacing: 0.2,
  },
  translationText: { fontSize: 15, lineHeight: 24, opacity: 0.94 },
  translationTextFallback: { fontStyle: "italic", opacity: 0.55 },
  tafseerToggle: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  tafseerToggleLabel: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 3,
  },
  tafseerInlineLabel: {
    fontSize: 13,
    fontWeight: "700",
    textAlign: "right",
    writingDirection: "rtl",
  },
  tafseerInlineText: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 24,
    textAlign: "right",
    writingDirection: "rtl",
  },
});
