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
  AppState,
} from "react-native";
import Animated, { useAnimatedStyle, FadeIn } from "react-native-reanimated";
import { LongPressGestureHandler, State } from "react-native-gesture-handler";
import { Icon } from "react-native-paper";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { setAudioModeAsync, createAudioPlayer } from "expo-audio";
import { File, Directory, Paths } from "expo-file-system";
import {
  getAyahAudioUrl,
  getAyahFileName,
  getAyahCountForSurah,
  getReciterById,
} from "../components/reciters";
import { getSurahByIndex } from "./quranData";
import { useReciterStore } from "./store/useReciterStore";
import { requestAudioNotificationPermission } from "./requestAudioNotificationPermission";
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

const padFolder = (n) => String(n).padStart(3, "0");

/** Root: document/quran-audio */
const audioRootDir = () => new Directory(Paths.document, "quran-audio");

/** document/quran-audio/{reciterId}/{surahPad}/ */
const ayahDirFor = (reciterId, surahId) =>
  new Directory(audioRootDir(), String(reciterId), padFolder(surahId));

/** File for a single ayah */
const ayahFileFor = (reciterId, surahId, ayah) =>
  new File(ayahDirFor(reciterId, surahId), getAyahFileName(surahId, ayah));

function ensureDir(dir) {
  if (!dir.exists) {
    dir.create({ intermediates: true });
  }
}

const storageKey = (reciterId, surahId, ayah) =>
  `quran_audio_v2_${reciterId}_${surahId}_${ayah}`;

const SURAH_DOWNLOAD_CONCURRENCY = 4;

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

const OFFLINE_ERROR = "OFFLINE";

const isNetworkFailure = (error) => {
  const message = String(error?.message || error || "").toLowerCase();
  return (
    error?.name === "AbortError" ||
    /network request failed|failed to fetch|network error|network unavailable|offline|no internet|connection refused|connection reset|unable to resolve host|could not connect|timed out|timeout|dns/.test(
      message,
    )
  );
};

async function fetchWithTimeout(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const externalSignal = options.signal;
  const abortFromExternalSignal = () => controller.abort();
  if (externalSignal?.aborted) {
    controller.abort();
  } else {
    externalSignal?.addEventListener("abort", abortFromExternalSignal, {
      once: true,
    });
  }
  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
    externalSignal?.removeEventListener("abort", abortFromExternalSignal);
  }
}

/** HEAD request for Content-Length (best-effort). */
async function fetchRemoteSize(url) {
  try {
    const headRes = await fetchWithTimeout(url, { method: "HEAD" }, 8000);
    if (headRes.ok) {
      const len = headRes.headers.get("content-length");
      const n = Number(len);
      return Number.isFinite(n) && n > 0 ? n : null;
    }
    if (
      headRes.status === 405 ||
      headRes.status === 403 ||
      headRes.status === 501
    ) {
      const rangeRes = await fetchWithTimeout(
        url,
        {
          method: "GET",
          headers: { Range: "bytes=0-0" },
        },
        8000,
      );
      if (!rangeRes.ok && rangeRes.status !== 206) return null;
      const len =
        rangeRes.headers.get("content-range")?.split("/")?.[1] ??
        rangeRes.headers.get("content-length");
      const n = Number(len);
      return Number.isFinite(n) && n > 0 ? n : null;
    }
    return null;
  } catch {
    return null;
  }
}

const waitBeforeRetry = (delayMs, signal) =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error("Download cancelled"));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", abort);
      resolve();
    }, delayMs);
    const abort = () => {
      clearTimeout(timer);
      reject(new Error("Download cancelled"));
    };
    signal?.addEventListener("abort", abort, { once: true });
  });

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
    accessibilityLabel,
    onPressDownload,
    onPressPlay,
    onPressPause,
  }) => {
    const handlePress = useCallback(() => {
      safeHaptic(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
      if (isDownloading) return;
      if (isPlaying) {
        onPressPause?.();
        return;
      }
      if (isDownloaded) {
        onPressPlay?.();
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
        <Pressable
          onPress={handlePress}
          disabled={isDownloading}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel}
          accessibilityState={{
            disabled: isDownloading,
            selected: isPlaying,
          }}
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
            <Icon source={icon} size={size >= 36 ? 18 : 16} color={iconColor} />
          )}
        </Pressable>
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
    isPausedDownloadAll = false,
    progress = 0,
    activeDownloads = [],
    singleProgress = 0,
    singleDownloadMetrics = null,
    bulkDownloadedBytes = 0,
    bulkTotalBytes = null,
    failedCount = 0,
    totalBytesLabel,
    colors,
    labels,
    onDownloadAll,
    onPauseDownloadAll,
    onResumeDownloadAll,
    onCancelDownloadAll,
  }) => {
    const allDone =
      totalVerses > 0 && downloadedCount >= totalVerses && !isDownloadingAll;
    const isPaused = isDownloadingAll && isPausedDownloadAll;
    const isSingleDownloading = !isDownloadingAll && singleDownloadMetrics;
    const shownProgress =
      isDownloadingAll || isPaused ? progress : singleProgress;
    const progressPercent = Math.round(
      Math.max(0, Math.min(1, shownProgress)) * 100,
    );
    const displayedBytes = isDownloadingAll
      ? bulkDownloadedBytes
      : singleDownloadMetrics?.bytesWritten;
    const displayedTotalBytes = isDownloadingAll
      ? bulkTotalBytes
      : singleDownloadMetrics?.totalBytes;
    const activeLabel = activeDownloads
      .map(
        (download) =>
          `${labels?.ayah || "Ayah"} ${download.ayah} · ${Math.round(download.progress * 100)}%`,
      )
      .join("  ·  ");

    return (
      <View
        style={[
          styles.surahAudioBar,
          { backgroundColor: colors.surface, borderColor: colors.border },
        ]}
      >
        <View style={styles.surahAudioContent}>
          <View style={styles.surahAudioTopRow}>
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
                    : isPaused
                      ? labels?.downloadPaused || "Download paused"
                      : isDownloadingAll
                        ? labels?.downloadingAll || "Downloading surah…"
                        : failedCount > 0
                          ? `${failedCount} ${labels?.failed || "failed"} · ${labels?.tapToRetry || "Tap to retry"}`
                          : labels?.downloadAll || "Download full surah"}
                </Text>
                <Text
                  style={[styles.surahAudioSub, { color: colors.secondary }]}
                  numberOfLines={1}
                >
                  {isDownloadingAll || isPaused
                    ? `${downloadedCount}/${totalVerses} ${labels?.ayahs || "ayahs"} · ${progressPercent}%`
                    : isSingleDownloading
                      ? `${labels?.downloading || "Downloading"} ${labels?.ayah || "Ayah"} ${singleDownloadMetrics.ayah} · ${progressPercent}%`
                      : totalBytesLabel && !allDone
                        ? `${downloadedCount}/${totalVerses} ${labels?.ayahs || "ayahs"} · ~${totalBytesLabel}`
                        : `${downloadedCount}/${totalVerses} ${labels?.ayahs || "ayahs"}`}
                </Text>
              </View>
            </View>
            <View style={styles.surahAudioActions}>
              {!allDone && isDownloadingAll ? (
                <>
                  <Pressable
                    onPress={() =>
                      isPaused
                        ? onResumeDownloadAll?.()
                        : onPauseDownloadAll?.()
                    }
                    accessibilityRole="button"
                    accessibilityLabel={
                      isPaused
                        ? labels?.resume || "Resume"
                        : labels?.pause || "Pause"
                    }
                    hitSlop={6}
                    style={({ pressed }) => [
                      styles.surahAudioIconAction,
                      {
                        backgroundColor: withAlpha(colors.accent, 0.12),
                        opacity: pressed ? 0.7 : 1,
                      },
                    ]}
                  >
                    <Icon
                      source={isPaused ? "play" : "pause"}
                      size={18}
                      color={colors.accent}
                    />
                  </Pressable>
                  <Pressable
                    onPress={onCancelDownloadAll}
                    accessibilityRole="button"
                    accessibilityLabel={labels?.cancel || "Cancel"}
                    hitSlop={6}
                    style={({ pressed }) => [
                      styles.surahAudioIconAction,
                      {
                        backgroundColor: withAlpha(colors.text, 0.07),
                        opacity: pressed ? 0.7 : 1,
                      },
                    ]}
                  >
                    <Icon source="close" size={18} color={colors.secondary} />
                  </Pressable>
                </>
              ) : !allDone ? (
                <Pressable
                  onPress={() => {
                    safeHaptic(() =>
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light),
                    );
                    onDownloadAll?.();
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={
                    failedCount > 0
                      ? labels?.retry || "Retry"
                      : labels?.download || "Download"
                  }
                  style={({ pressed }) => [
                    styles.surahAudioIconAction,
                    {
                      backgroundColor: colors.accent,
                      opacity: pressed ? 0.86 : 1,
                    },
                  ]}
                >
                  <Icon source="download" size={16} color="#fff" />
                </Pressable>
              ) : (
                <View
                  style={[
                    styles.surahAudioDone,
                    { backgroundColor: withAlpha(colors.accent, 0.12) },
                  ]}
                >
                  <Icon source="check" size={17} color={colors.accent} />
                </View>
              )}
            </View>
          </View>
          {(isDownloadingAll || isPaused || isSingleDownloading) && (
            <View
              accessibilityRole="progressbar"
              accessibilityValue={{
                min: 0,
                max: 100,
                now: progressPercent,
              }}
              style={[
                styles.surahProgressTrack,
                { backgroundColor: withAlpha(colors.accent, 0.14) },
              ]}
            >
              <View
                style={[
                  styles.surahProgressFill,
                  {
                    width: `${progressPercent}%`,
                    backgroundColor: colors.accent,
                  },
                ]}
              />
            </View>
          )}
          {isDownloadingAll || isSingleDownloading ? (
            <Text
              style={[styles.surahActiveDownloads, { color: colors.secondary }]}
              numberOfLines={1}
            >
              {formatBytes(displayedBytes) || "0 B"} /{" "}
              {displayedTotalBytes
                ? `${isDownloadingAll ? "~" : ""}${formatBytes(displayedTotalBytes)}`
                : labels?.sizeUnknown || "size unknown"}
            </Text>
          ) : null}
        </View>
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
  const [singleDownloadMetrics, setSingleDownloadMetrics] = useState(null);
  const [bulkDownloadedBytes, setBulkDownloadedBytes] = useState(0);
  const [bulkTotalBytes, setBulkTotalBytes] = useState(null);
  const [playingId, setPlayingId] = useState(null);
  const [playingSurahId, setPlayingSurahId] = useState(null);
  const [lastActiveAyah, setLastActiveAyah] = useState(null);
  const [lastActiveSurahId, setLastActiveSurahId] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [positionSec, setPositionSec] = useState(0);
  const [isDownloadingAll, setIsDownloadingAll] = useState(false);
  const [bulkProgress, setBulkProgress] = useState(0);
  const [bulkPaused, setBulkPaused] = useState(false);
  const [bulkActiveDownloads, setBulkActiveDownloads] = useState([]);
  const [bulkFailedCount, setBulkFailedCount] = useState(0);
  const [errorMsg, setErrorMsg] = useState(null);

  const playerRef = useRef(null);
  const playerListenerRef = useRef(null);
  const lockScreenPlayerRef = useRef(null);
  const statusIntervalRef = useRef(null);
  const bulkCancelRef = useRef(false);
  const bulkPauseRef = useRef(false);
  const downloadAbortRef = useRef(new Map());
  const activeDownloadsRef = useRef(new Map());
  const positionRef = useRef(0);
  const durationRef = useRef(0);
  const isMounted = useRef(true);
  const userPausedRef = useRef(false);
  const autoAdvanceRef = useRef(true);
  const wasPlayingBeforeBackgroundRef = useRef(false);
  const playingAyahRef = useRef(null);
  const ayahListRef = useRef(ayahList);
  const downloadedSetRef = useRef(downloadedSet);
  const playVerseRef = useRef(null);
  const prefetchingRef = useRef(new Set());
  const bulkActiveBytesRef = useRef(new Map());
  const bulkCompletedBytesRef = useRef(0);
  const sessionIdRef = useRef(0);
  const playingSessionRef = useRef(null);
  const finishedSessionRef = useRef(null);

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
    const abortControllersSnapshot = downloadAbortRef.current;

    setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      shouldRouteThroughEarpiece: false,
      interruptionMode: "doNotMix",
    }).catch(() => {});

    const appStateSubscription = AppState.addEventListener(
      "change",
      (nextState) => {
        if (nextState === "background" || nextState === "inactive") {
          wasPlayingBeforeBackgroundRef.current =
            !!playingAyahRef.current && !userPausedRef.current;
          return;
        }
        if (nextState !== "active") return;

        const resumeAfterForeground = async () => {
          try {
            await setAudioModeAsync({
              playsInSilentMode: true,
              shouldPlayInBackground: true,
              shouldRouteThroughEarpiece: false,
              interruptionMode: "doNotMix",
            });
          } catch {}

          const player = playerRef.current;
          const ayah = playingAyahRef.current;
          if (
            player &&
            ayah != null &&
            wasPlayingBeforeBackgroundRef.current &&
            !userPausedRef.current &&
            !player.playing
          ) {
            try {
              player.play();
              setPlayingId(ayah);
            } catch {}
          }
        };
        resumeAfterForeground();
      },
    );

    return () => {
      isMounted.current = false;
      appStateSubscription.remove();
      bulkCancelRef.current = true;
      autoAdvanceRef.current = false;
      const activeAbortControllers = Array.from(
        abortControllersSnapshot.values(),
      );
      try {
        for (const controller of activeAbortControllers) {
          controller?.abort?.();
        }
      } catch {}
      try {
        abortControllersSnapshot.clear();
      } catch {}
      if (statusIntervalRef.current) {
        clearInterval(statusIntervalRef.current);
        statusIntervalRef.current = null;
      }
      try {
        playerListenerRef.current?.remove?.();
      } catch {}
      playerListenerRef.current = null;
      if (playerRef.current) {
        try {
          playerRef.current.clearLockScreenControls?.();
        } catch {}
        try {
          playerRef.current.pause();
        } catch {}
        try {
          playerRef.current.remove?.();
        } catch {}
        playerRef.current = null;
      }
      lockScreenPlayerRef.current = null;
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
            if (size >= 512) {
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
    try {
      playerListenerRef.current?.remove?.();
    } catch {}
    playerListenerRef.current = null;
    if (playerRef.current) {
      try {
        playerRef.current.clearLockScreenControls?.();
      } catch {}
      try {
        playerRef.current.pause();
      } catch {}
      try {
        playerRef.current.remove?.();
      } catch {}
      playerRef.current = null;
    }
    lockScreenPlayerRef.current = null;
  }, []);

  const resetPlaybackState = useCallback(() => {
    sessionIdRef.current += 1;
    userPausedRef.current = true;
    autoAdvanceRef.current = false;
    if (statusIntervalRef.current) {
      clearInterval(statusIntervalRef.current);
      statusIntervalRef.current = null;
    }
    playingAyahRef.current = null;
    positionRef.current = 0;
    durationRef.current = 0;
    setPlayingId(null);
    setPlayingSurahId(null);
    setExpandedId(null);
    setPositionSec(0);
    unloadPlayer();
  }, [unloadPlayer]);

  const refreshLockScreenControls = useCallback(() => {
    const player = playerRef.current;
    const ayah = playingAyahRef.current;
    if (!player || ayah == null) return false;

    const surahName = getSurahByIndex(surahId)?.name || `Surah ${surahId}`;
    const metadata = {
      title: `${surahName} - Ayah ${ayah}`,
      artist: getReciterById(reciterId)?.name || "Quran Audio",
      albumTitle: "Quran Audio",
    };

    try {
      if (lockScreenPlayerRef.current === player) {
        player.updateLockScreenMetadata(metadata);
      } else {
        player.setActiveForLockScreen(true, metadata, {
          showSeekBackward: true,
          showSeekForward: true,
        });
        lockScreenPlayerRef.current = player;
      }
      return true;
    } catch (error) {
      console.warn("Failed to activate Quran audio media controls:", error);
      return false;
    }
  }, [reciterId, surahId]);

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
    async (ayah, { onProgress, onBytesProgress, silent } = {}) => {
      const url = getAyahAudioUrl(reciterId, surahId, ayah);
      if (!url) throw new Error("Invalid reciter / ayah");

      const downloadKey = `${reciterId}:${surahId}:${ayah}`;
      const pending = activeDownloadsRef.current.get(downloadKey);
      if (pending) return pending;

      const downloadTask = (async () => {
        const dir = ayahDirFor(reciterId, surahId);
        ensureDir(dir);

        const destFile = ayahFileFor(reciterId, surahId, ayah);

        if (destFile.exists && (destFile.size ?? 0) >= 512) {
          await markDownloaded(
            ayah,
            durationMap.get(ayah) || 0,
            destFile.size ?? 0,
          );
          return destFile.uri;
        }

        const remoteSize = sizeMap.get(ayah) || 0;
        if (isMounted.current && !silent) {
          setDownloadProgressMap((prev) => {
            const n = new Map(prev);
            n.set(ayah, 0);
            return n;
          });
          setSingleDownloadMetrics({
            ayah,
            bytesWritten: 0,
            totalBytes: remoteSize,
          });
        }

        const tmpFile = new File(dir, `${getAyahFileName(surahId, ayah)}.tmp`);
        if (tmpFile.exists) {
          try {
            tmpFile.delete();
          } catch {}
        }

        const controller = new AbortController();
        downloadAbortRef.current.set(downloadKey, controller);
        let lastProgressUpdateAt = 0;

        try {
          let downloadedFile = null;
          let lastError = null;
          for (let attempt = 0; attempt < 3; attempt += 1) {
            if (controller.signal.aborted)
              throw new Error("Download cancelled");
            try {
              const downloaded = await File.downloadFileAsync(url, tmpFile, {
                idempotent: true,
                signal: controller.signal,
                onProgress: (data) => {
                  const total = data?.totalBytes ?? remoteSize;
                  const written = data?.bytesWritten ?? 0;
                  const now = Date.now();
                  if (
                    now - lastProgressUpdateAt < 120 &&
                    !(total > 0 && written >= total)
                  ) {
                    return;
                  }
                  lastProgressUpdateAt = now;
                  onBytesProgress?.({
                    bytesWritten: written,
                    totalBytes: total || 0,
                  });
                  if (isMounted.current && !silent) {
                    setSingleDownloadMetrics({
                      ayah,
                      bytesWritten: written,
                      totalBytes: total || 0,
                    });
                  }
                  const p = total > 0 ? Math.min(0.99, written / total) : 0;
                  onProgress?.(p);
                  if (isMounted.current && !silent) {
                    setDownloadProgressMap((prev) => {
                      const n = new Map(prev);
                      n.set(ayah, p);
                      return n;
                    });
                  }
                },
              });

              downloadedFile = new File(downloaded.uri);
              if (!downloadedFile.exists || (downloadedFile.size ?? 0) < 512) {
                throw new Error("Corrupt download");
              }
              await downloadedFile.move(destFile, { overwrite: true });
              lastError = null;
              break;
            } catch (error) {
              lastError = error;
              if (controller.signal.aborted) throw error;
              try {
                if (tmpFile.exists) tmpFile.delete();
              } catch {}
              if (attempt < 2) {
                await waitBeforeRetry(500 * 2 ** attempt, controller.signal);
              }
            }
          }
          if (lastError) throw lastError;
          const finalSize = destFile.size ?? 0;
          onBytesProgress?.({ bytesWritten: finalSize, totalBytes: finalSize });
          onProgress?.(1);
          if (isMounted.current && !silent) {
            setSingleDownloadMetrics({
              ayah,
              bytesWritten: finalSize,
              totalBytes: finalSize,
            });
            setDownloadProgressMap((prev) => {
              const n = new Map(prev);
              n.set(ayah, 1);
              return n;
            });
          }
        } finally {
          downloadAbortRef.current.delete(downloadKey);
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
      })();

      activeDownloadsRef.current.set(downloadKey, downloadTask);
      try {
        return await downloadTask;
      } finally {
        if (activeDownloadsRef.current.get(downloadKey) === downloadTask) {
          activeDownloadsRef.current.delete(downloadKey);
        }
      }
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

  const startStatusPolling = useCallback((player, ayah) => {
    if (statusIntervalRef.current) {
      clearInterval(statusIntervalRef.current);
    }
    // Keep the progress UI smooth without forcing excessive screen renders.
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
      } catch {}
    }, 250);
  }, []);

  const handlePlaybackFinished = useCallback(
    (ayah, activeSession) => {
      if (
        activeSession !== sessionIdRef.current ||
        finishedSessionRef.current === activeSession
      ) {
        return;
      }
      finishedSessionRef.current = activeSession;
      if (statusIntervalRef.current) {
        clearInterval(statusIntervalRef.current);
        statusIntervalRef.current = null;
      }
      setPlayingId(null);
      setPlayingSurahId(null);
      playingAyahRef.current = null;
      playingSessionRef.current = null;
      positionRef.current = 0;
      setPositionSec(0);

      if (!userPausedRef.current && autoAdvanceRef.current) {
        advanceToNext(ayah);
      }
    },
    [advanceToNext],
  );

  const downloadVerse = useCallback(
    async (ayah) => {
      const downloadKey = `${reciterId}:${surahId}:${ayah}`;
      if (activeDownloadsRef.current.has(downloadKey)) return;
      setErrorMsg(null);
      setDownloadingId(ayah);
      setExpandedId(ayah);
      try {
        await downloadOne(ayah);
        safeHaptic(() =>
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
        );
      } catch (e) {
        if (isMounted.current) {
          setErrorMsg(
            isNetworkFailure(e)
              ? OFFLINE_ERROR
              : e?.message || "Download failed",
          );
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
          setSingleDownloadMetrics(null);
        }
      }
    },
    [downloadOne, reciterId, surahId],
  );

  const playVerse = useCallback(
    async (ayah, opts = {}) => {
      const fromAuto = !!opts.fromAutoAdvance;
      const targetAyah = Number(ayah);
      if (
        !Number.isInteger(surahId) ||
        surahId < 1 ||
        surahId > 114 ||
        !Number.isInteger(targetAyah) ||
        targetAyah < 1 ||
        targetAyah > getAyahCountForSurah(surahId)
      ) {
        setErrorMsg("Invalid surah or ayah");
        return;
      }
      const activeSession = ++sessionIdRef.current;
      setErrorMsg(null);
      userPausedRef.current = false;
      autoAdvanceRef.current = true;
      if (statusIntervalRef.current) {
        clearInterval(statusIntervalRef.current);
        statusIntervalRef.current = null;
      }
      try {
        playerRef.current?.pause();
      } catch {}
      playingAyahRef.current = null;
      playingSessionRef.current = null;
      setPlayingId(null);
      setPlayingSurahId(null);
      setDownloadingId(null);
      positionRef.current = 0;
      setPositionSec(0);

      try {
        if (!fromAuto) {
          const notificationsAllowed =
            await requestAudioNotificationPermission();
          if (!notificationsAllowed && Platform.OS === "android") {
            throw new Error(
              "Notification permission is required for playback controls",
            );
          }
        }
        if (activeSession !== sessionIdRef.current) return;

        const file = ayahFileFor(reciterId, surahId, targetAyah);
        let uri = file.uri;
        if (!file.exists || (file.size ?? 0) < 512) {
          if (fromAuto) {
            uri = getAyahAudioUrl(reciterId, surahId, targetAyah);
            if (!uri) throw new Error("Invalid reciter / ayah");
            downloadOne(targetAyah, { silent: true }).catch(() => {});
          } else {
            setDownloadingId(targetAyah);
            uri = await downloadOne(targetAyah);
            if (activeSession !== sessionIdRef.current) return;
            if (isMounted.current) setDownloadingId(null);
          }
        }
        if (activeSession !== sessionIdRef.current) return;

        if (statusIntervalRef.current) {
          clearInterval(statusIntervalRef.current);
          statusIntervalRef.current = null;
        }

        // Keep one native player/media session alive so the notification is updated in place.
        let player = playerRef.current;
        if (player) {
          try {
            player.replace({ uri });
          } catch {
            unloadPlayer();
            player = null;
          }
        }

        if (!player) {
          player = createAudioPlayer(
            { uri },
            {
              updateInterval: 100,
              preferredForwardBufferDuration: 30,
              keepAudioSessionActive: true,
            },
          );
          playerRef.current = player;
          playerListenerRef.current = player.addListener?.(
            "playbackStatusUpdate",
            (status) => {
              const currentPlayer = playerRef.current;
              const currentAyah = playingAyahRef.current;
              if (currentPlayer !== player || currentAyah == null) return;
              const currentSession = playingSessionRef.current;
              if (
                currentSession == null ||
                currentSession !== sessionIdRef.current
              ) {
                return;
              }
              if (status?.error) {
                if (statusIntervalRef.current) {
                  clearInterval(statusIntervalRef.current);
                  statusIntervalRef.current = null;
                }
                try {
                  player.pause();
                } catch {}
                playingAyahRef.current = null;
                playingSessionRef.current = null;
                setPlayingId(null);
                setPlayingSurahId(null);
                setDownloadingId(null);
                setErrorMsg(String(status.error));
                return;
              }
              if (status?.isLoaded && status.playing) {
                setPlayingId(currentAyah);
              }
              if (status?.didJustFinish) {
                handlePlaybackFinished(currentAyah, currentSession);
              }
            },
          );
        }

        playingAyahRef.current = targetAyah;
        playingSessionRef.current = activeSession;
        setPlayingSurahId(surahId);
        setLastActiveAyah(targetAyah);
        setLastActiveSurahId(surahId);

        refreshLockScreenControls();
        player.play();

        const knownDur = durationMap.get(targetAyah);
        if (knownDur > 0) {
          durationRef.current = knownDur;
        }

        startStatusPolling(player, targetAyah);

        const tryPersistDuration = () => {
          if (
            activeSession !== sessionIdRef.current ||
            playerRef.current !== player ||
            playingAyahRef.current !== targetAyah
          ) {
            return;
          }
          try {
            const dur = player.duration;
            if (dur > 0 && isMounted.current) {
              durationRef.current = dur;
              setDurationMap((prev) => {
                if (prev.get(targetAyah) === dur) return prev;
                const n = new Map(prev);
                n.set(targetAyah, dur);
                return n;
              });
              AsyncStorage.setItem(
                storageKey(reciterId, surahId, targetAyah),
                JSON.stringify({
                  duration: dur,
                  size: sizeMap.get(targetAyah) || 0,
                }),
              ).catch(() => {});
            }
          } catch {}
        };
        setTimeout(tryPersistDuration, 350);
        setTimeout(tryPersistDuration, 1100);

        if (isMounted.current) {
          setPlayingId(targetAyah);
          setExpandedId(targetAyah);
          setPositionSec(0);
          positionRef.current = 0;
        }

        // Prefetch next ayah while this one plays
        prefetchNext(targetAyah);

        if (!fromAuto) {
          safeHaptic(() =>
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light),
          );
        }
      } catch (e) {
        if (activeSession !== sessionIdRef.current) return;
        if (isMounted.current) {
          if (statusIntervalRef.current) {
            clearInterval(statusIntervalRef.current);
            statusIntervalRef.current = null;
          }
          try {
            playerRef.current?.pause();
          } catch {}
          setDownloadingId(null);
          playingAyahRef.current = null;
          playingSessionRef.current = null;
          setPlayingId(null);
          setPlayingSurahId(null);
          setErrorMsg(
            isNetworkFailure(e)
              ? OFFLINE_ERROR
              : e?.message || "Playback failed",
          );
        }
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
      handlePlaybackFinished,
      durationMap,
      sizeMap,
      prefetchNext,
      refreshLockScreenControls,
    ],
  );

  // Keep stable ref for auto-advance
  useEffect(() => {
    playVerseRef.current = playVerse;
  }, [playVerse]);

  const pauseVerse = useCallback(async () => {
    sessionIdRef.current += 1;
    userPausedRef.current = true;
    autoAdvanceRef.current = false;
    playingSessionRef.current = null;
    setDownloadingId(null);
    try {
      if (playerRef.current) {
        playerRef.current.pause();
      }
    } catch {}
    const activeAyah = playingAyahRef.current ?? lastActiveAyah;
    playingAyahRef.current = null;
    playingSessionRef.current = null;
    setPlayingId(null);
    setPlayingSurahId((current) =>
      current != null ? current : lastActiveSurahId,
    );
    if (activeAyah != null) {
      setLastActiveAyah(activeAyah);
    }
    setExpandedId(null);
  }, [lastActiveAyah, lastActiveSurahId]);

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

  const totalKnownBytes = useMemo(() => {
    let sum = 0;
    let count = 0;
    for (const ayah of ayahList) {
      const size = sizeMap.get(ayah);
      if (size) {
        sum += size;
        count += 1;
      }
    }
    if (count === 0) return null;
    return (sum / count) * ayahList.length;
  }, [ayahList, sizeMap]);

  const downloadAll = useCallback(async () => {
    if (!ayahList.length) return;
    if (isDownloadingAll && !bulkPaused) return;

    bulkCancelRef.current = false;
    bulkPauseRef.current = false;
    setBulkPaused(false);
    setIsDownloadingAll(true);
    const pendingAyahs = ayahList.filter((ayah) => !downloadedSet.has(ayah));
    let nextIndex = 0;
    let completedCount = ayahList.length - pendingAyahs.length;
    const progressByAyah = new Map();
    let failedCount = 0;
    let stopWorkers = false;
    bulkCompletedBytesRef.current = ayahList.reduce(
      (sum, ayah) =>
        sum + (downloadedSet.has(ayah) ? sizeMap.get(ayah) || 0 : 0),
      0,
    );
    bulkActiveBytesRef.current = new Map();
    setBulkDownloadedBytes(bulkCompletedBytesRef.current);
    setBulkTotalBytes(totalKnownBytes);
    setBulkFailedCount(0);
    setBulkProgress(completedCount / ayahList.length);
    setErrorMsg(null);

    const syncActiveDownloads = () => {
      if (isMounted.current) {
        setBulkActiveDownloads(
          Array.from(progressByAyah, ([ayah, value]) => ({
            ayah,
            progress: value,
          })),
        );
      }
    };

    const syncBulkBytes = () => {
      const activeBytes = Array.from(
        bulkActiveBytesRef.current.values(),
      ).reduce((sum, value) => sum + value, 0);
      if (isMounted.current) {
        setBulkDownloadedBytes(bulkCompletedBytesRef.current + activeBytes);
        setBulkTotalBytes(totalKnownBytes);
      }
    };

    const refreshBulkProgress = () => {
      const inProgress = Array.from(progressByAyah.values()).reduce(
        (sum, value) => sum + value,
        0,
      );
      if (isMounted.current) {
        setBulkProgress(
          Math.min(1, (completedCount + inProgress) / ayahList.length),
        );
      }
    };

    const updateBulkProgress = (ayah, progress) => {
      progressByAyah.set(ayah, Math.max(0, Math.min(1, progress || 0)));
      refreshBulkProgress();
      syncActiveDownloads();
    };

    const worker = async () => {
      while (!bulkCancelRef.current && !bulkPauseRef.current && !stopWorkers) {
        const index = nextIndex;
        const ayah = pendingAyahs[index];
        if (ayah === undefined) return;
        nextIndex += 1;
        progressByAyah.set(ayah, 0);
        bulkActiveBytesRef.current.set(ayah, 0);
        syncActiveDownloads();
        syncBulkBytes();
        setDownloadingId(ayah);
        let succeeded = false;
        try {
          await downloadOne(ayah, {
            silent: true,
            onProgress: (progress) => updateBulkProgress(ayah, progress),
            onBytesProgress: ({ bytesWritten }) => {
              bulkActiveBytesRef.current.set(ayah, bytesWritten || 0);
              syncBulkBytes();
            },
          });
          succeeded = true;
        } catch (error) {
          if (!bulkPauseRef.current && !bulkCancelRef.current) {
            failedCount += 1;
            if (isNetworkFailure(error)) stopWorkers = true;
          }
        }
        progressByAyah.delete(ayah);
        const ayahBytes = bulkActiveBytesRef.current.get(ayah) || 0;
        if (succeeded) bulkCompletedBytesRef.current += ayahBytes;
        bulkActiveBytesRef.current.delete(ayah);
        syncActiveDownloads();
        syncBulkBytes();
        if (succeeded) completedCount += 1;
        refreshBulkProgress();
        if (bulkCancelRef.current || bulkPauseRef.current || stopWorkers)
          return;
      }
    };

    await Promise.all(
      Array.from({ length: SURAH_DOWNLOAD_CONCURRENCY }, () => worker()),
    );

    setBulkActiveDownloads([]);
    if (!bulkPauseRef.current && !bulkCancelRef.current) {
      setBulkFailedCount(failedCount);
    }
    if (stopWorkers) {
      setErrorMsg(OFFLINE_ERROR);
      setBulkProgress(completedCount / ayahList.length);
    }
    if (bulkPauseRef.current || bulkCancelRef.current) {
      setDownloadingId(null);
      if (bulkPauseRef.current) {
        setBulkPaused(true);
      }
      return;
    }

    setDownloadingId(null);
    setIsDownloadingAll(false);
    setBulkPaused(false);
    if (failedCount === 0) {
      safeHaptic(() =>
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
      );
    }
  }, [
    ayahList,
    downloadedSet,
    sizeMap,
    totalKnownBytes,
    isDownloadingAll,
    bulkPaused,
    downloadOne,
  ]);

  const pauseDownloadAll = useCallback(() => {
    if (!isDownloadingAll) return;
    bulkPauseRef.current = true;

    for (const controller of downloadAbortRef.current.values()) {
      try {
        controller?.abort?.();
      } catch {}
    }
    downloadAbortRef.current.clear();
    setDownloadingId(null);
  }, [isDownloadingAll]);

  const resumeDownloadAll = useCallback(() => {
    if (!ayahList.length) return;
    bulkPauseRef.current = false;
    setBulkPaused(false);
    return downloadAll();
  }, [ayahList.length, downloadAll]);

  const cancelDownloadAll = useCallback(() => {
    bulkCancelRef.current = true;
    bulkPauseRef.current = false;
    setBulkPaused(false);
    setBulkActiveDownloads([]);
    bulkActiveBytesRef.current.clear();
    for (const controller of downloadAbortRef.current.values()) {
      try {
        controller?.abort?.();
      } catch {}
    }
    downloadAbortRef.current.clear();
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

  return {
    downloadedSet,
    durationMap,
    sizeMap,
    downloadingId,
    downloadProgressMap,
    playingId,
    playingSurahId,
    lastActiveAyah,
    lastActiveSurahId,
    expandedId,
    positionSec,
    isDownloadingAll,
    bulkProgress,
    bulkPaused,
    bulkActiveDownloads,
    singleDownloadMetrics,
    bulkDownloadedBytes,
    bulkTotalBytes,
    bulkFailedCount,
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
    pauseDownloadAll,
    resumeDownloadAll,
    cancelDownloadAll,
    refreshLockScreenControls,
    resetPlaybackState,
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
    audioDurationSec,
    audioSizeLabel,
    audioDownloadProgress,
    audioAccessibilityLabel,
    onAudioDownload,
    onAudioPlay,
    onAudioPause,
  }) => {
    const rippleStyle = useAnimatedStyle(() => {
      if (!isHighlighted) return { opacity: 0, transform: [{ scale: 1 }] };
      return {
        opacity: highlightProgress.value * 0.9,
        transform: [{ scale: 0.98 + highlightProgress.value * 0.02 }],
      };
    });

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
                isDownloaded={isAudioDownloaded}
                isPlaying={isAudioPlaying}
                isDownloading={isAudioDownloading}
                durationSec={audioDurationSec}
                sizeLabel={audioSizeLabel}
                progress={audioDownloadProgress}
                accessibilityLabel={audioAccessibilityLabel}
                onPressDownload={() => onAudioDownload?.(item.ayah)}
                onPressPlay={() => onAudioPlay?.(item.ayah)}
                onPressPause={onAudioPause}
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
    prev.audioDurationSec === next.audioDurationSec &&
    prev.audioSizeLabel === next.audioSizeLabel &&
    prev.audioDownloadProgress === next.audioDownloadProgress &&
    prev.audioAccessibilityLabel === next.audioAccessibilityLabel &&
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
  surahAudioBar: {
    marginBottom: 8,
    padding: 12,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
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
  surahAudioContent: { gap: 10 },
  surahAudioTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
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
  surahAudioActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  surahAudioIconAction: {
    width: 38,
    height: 38,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  surahAudioDone: {
    width: 38,
    height: 38,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  surahProgressTrack: {
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
  },
  surahProgressFill: {
    height: "100%",
    borderRadius: 3,
  },
  surahActiveDownloads: { fontSize: 11, fontWeight: "600" },
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
