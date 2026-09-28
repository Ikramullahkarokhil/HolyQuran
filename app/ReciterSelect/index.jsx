import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
  memo,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
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
import { File, Directory, Paths } from "expo-file-system";
import { useTranslation } from "react-i18next";
import {
  RECITERS,
  getAyahAudioUrl,
  getAyahCountForSurah,
  getAyahFileName,
} from "../../components/reciters.js";
import { useReciterStore } from "../../components/store/useReciterStore";
import { useAppLanguageStore } from "../../components/store/store";
import { useAppAlert } from "../../components/AppAlertProvider";
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

const isNetworkFailure = (error) => {
  const message = String(error?.message || error || "").toLowerCase();
  return /network request failed|failed to fetch|network error|offline|no internet|connection refused|connection reset|unable to resolve host|could not connect|timed out|timeout|dns/.test(
    message,
  );
};

const ensureAudioReachable = async (url, timeoutMs = 15000) => {
  if (!url) return false;
  try {
    const headRes = await fetch(url, {
      method: "HEAD",
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (headRes.ok) return true;
    if (
      headRes.status === 405 ||
      headRes.status === 403 ||
      headRes.status === 501
    ) {
      const rangeRes = await fetch(url, {
        method: "GET",
        headers: { Range: "bytes=0-0" },
        signal: AbortSignal.timeout(timeoutMs),
      });
      return Boolean(rangeRes.ok || rangeRes.status === 206);
    }
    return false;
  } catch {
    return false;
  }
};

const BULK_DOWNLOAD_CONCURRENCY = 4;
const AUDIO_SIZE_INDEX_CACHE_TTL = 30 * 24 * 60 * 60 * 1000;

const formatDownloadBytes = (bytes) => {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
};

const getAyahDirectory = (reciterId, surahId) =>
  new Directory(
    new Directory(Paths.document, "quran-audio"),
    String(reciterId),
    String(surahId).padStart(3, "0"),
  );

const getAyahFile = (reciterId, surahId, ayah) =>
  new File(
    getAyahDirectory(reciterId, surahId),
    getAyahFileName(surahId, ayah),
  );

const hasCompleteAyahSizeIndex = (sizes) => {
  if (!sizes) return false;
  for (let surah = 1; surah <= 114; surah += 1) {
    for (let ayah = 1; ayah <= getAyahCountForSurah(surah); ayah += 1) {
      const size = sizes.get(getAyahFileName(surah, ayah));
      if (!Number.isFinite(size) || size <= 0) return false;
    }
  }
  return true;
};

const fetchReciterAudioSizes = async (reciterId) => {
  const cacheKey = `quran_audio_size_index_v1_${reciterId}`;
  try {
    const cached = await AsyncStorage.getItem(cacheKey);
    if (cached) {
      const cachedIndex = JSON.parse(cached);
      const cacheAge = Date.now() - cachedIndex.fetchedAt;
      if (
        cacheAge >= 0 &&
        cacheAge < AUDIO_SIZE_INDEX_CACHE_TTL &&
        cachedIndex.sizes
      ) {
        const sizes = new Map(Object.entries(cachedIndex.sizes));
        for (const [name, size] of sizes) sizes.set(name, Number(size));
        if (hasCompleteAyahSizeIndex(sizes)) return sizes;
      }
    }
  } catch {}

  const sampleUrl = getAyahAudioUrl(reciterId, 1, 1);
  if (!sampleUrl) return null;
  const directoryUrl = sampleUrl.slice(0, sampleUrl.lastIndexOf("/") + 1);
  const response = await fetch(directoryUrl, {
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error("Audio size index unavailable");

  const html = await response.text();
  const sizes = new Map();
  const rowPattern = /<tr class="file">([\s\S]*?)<\/tr>/g;
  let row;
  while ((row = rowPattern.exec(html)) !== null) {
    const name = row[1].match(/<span class="name">(\d{6}\.mp3)<\/span>/)?.[1];
    const size = Number(row[1].match(/<td data-order="(\d+)"/)?.[1]);
    if (name && Number.isFinite(size) && size > 0) sizes.set(name, size);
  }

  if (hasCompleteAyahSizeIndex(sizes)) {
    AsyncStorage.setItem(
      cacheKey,
      JSON.stringify({
        fetchedAt: Date.now(),
        sizes: Object.fromEntries(sizes),
      }),
    ).catch(() => {});
  }
  return sizes;
};

const prepareReciterDownloads = async (reciterId, onProgress) => {
  const total = Array.from({ length: 114 }, (_, index) =>
    getAyahCountForSurah(index + 1),
  ).reduce((sum, count) => sum + count, 0);
  const tasks = [];
  const localFiles = new Map();
  let existingCount = 0;
  let existingBytes = 0;
  let scanned = 0;

  for (let surah = 1; surah <= 114; surah += 1) {
    for (let ayah = 1; ayah <= getAyahCountForSurah(surah); ayah += 1) {
      const key = `${surah}:${ayah}`;
      try {
        const file = getAyahFile(reciterId, surah, ayah);
        const fileSize = file.exists ? (file.size ?? 0) : 0;
        if (fileSize > 512) {
          localFiles.set(key, { file, size: fileSize });
          existingCount += 1;
          existingBytes += fileSize;
        }
      } catch {}
      if (!localFiles.has(key)) {
        tasks.push({ surah, ayah });
      }
      scanned += 1;

      if (scanned % 200 === 0) {
        onProgress?.({
          stage: "scanning",
          scanned,
          total,
          existingCount,
          existingBytes,
        });
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }
  }

  onProgress?.({
    stage: "loadingSizes",
    scanned: total,
    total,
    existingCount,
    existingBytes,
  });
  let sizes = null;
  try {
    sizes = await fetchReciterAudioSizes(reciterId);
  } catch {}

  if (sizes) {
    tasks.length = 0;
    existingCount = 0;
    existingBytes = 0;
    for (let surah = 1; surah <= 114; surah += 1) {
      for (let ayah = 1; ayah <= getAyahCountForSurah(surah); ayah += 1) {
        const key = `${surah}:${ayah}`;
        const localFile = localFiles.get(key);
        const expectedSize = sizes.get(getAyahFileName(surah, ayah));
        const isComplete =
          localFile &&
          (expectedSize == null
            ? localFile.size > 512
            : localFile.size === expectedSize);

        if (isComplete) {
          existingCount += 1;
          existingBytes += localFile.size;
        } else {
          if (localFile) {
            try {
              localFile.file.delete();
            } catch {}
          }
          tasks.push({ surah, ayah });
        }
      }
    }
  }

  let totalBytes = 0;
  let isTotalBytesKnown = hasCompleteAyahSizeIndex(sizes);
  if (isTotalBytesKnown) {
    for (let surah = 1; surah <= 114; surah += 1) {
      for (let ayah = 1; ayah <= getAyahCountForSurah(surah); ayah += 1) {
        totalBytes += sizes.get(getAyahFileName(surah, ayah));
      }
    }
  }

  return {
    reciterId,
    tasks,
    existingCount,
    existingBytes,
    total,
    totalBytes: isTotalBytesKnown ? totalBytes : null,
    sizes,
  };
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
            backgroundColor: withAlpha(progressColor, 0.09),
            borderColor: withAlpha(progressColor, 0.28),
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
                { flexDirection: flexDir, marginTop: 6 },
              ]}
            >
              <View
                style={[
                  styles.badge,
                  { backgroundColor: withAlpha(progressColor, 0.16) },
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
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={
              isPlaying ? t("Pause preview") : t("Play preview")
            }
            style={({ pressed }) => [
              styles.headerPreviewBtn,
              { backgroundColor: progressColor },
              pressed && styles.pressedScale,
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

    const activeVariant = group.variants.find(
      (v) => v.id === selectedReciterId,
    );
    const isSelected = Boolean(activeVariant);

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
              : withAlpha(outlineColor || "#000", 0.1),
            borderWidth: isSelected ? 2 : StyleSheet.hairlineWidth,
          },
          isSelected && {
            shadowColor: progressColor,
            shadowOpacity: 0.12,
            shadowRadius: 10,
            shadowOffset: { width: 0, height: 4 },
            elevation: 3,
          },
        ]}
      >
        <View style={[styles.cardContent, { flexDirection: flexDir }]}>
          <Pressable
            onPress={() => onSelectVariant(previewVariant.id)}
            hitSlop={6}
            accessibilityRole="radio"
            accessibilityState={{ selected: isSelected }}
            style={[
              styles.radioCircle,
              {
                borderColor: isSelected
                  ? progressColor
                  : withAlpha(textColor, 0.28),
                backgroundColor: isSelected ? progressColor : "transparent",
              },
            ]}
          >
            {isSelected && <Icon source="check" size={13} color="#FFF" />}
          </Pressable>

          <View style={styles.textDetails}>
            <Pressable
              onPress={() => onSelectVariant(previewVariant.id)}
              accessibilityRole="button"
            >
              <Text
                style={[
                  styles.reciterName,
                  {
                    color: textColor,
                    textAlign,
                    writingDirection: writingDir,
                    fontWeight: isSelected ? "700" : "600",
                  },
                ]}
                numberOfLines={1}
              >
                {group.name}
              </Text>
            </Pressable>

            <View
              style={[
                styles.badgeRow,
                { flexDirection: flexDir, flexWrap: "wrap", marginTop: 8 },
              ]}
            >
              {group.variants.map((variant) => {
                const isQualitySelected = variant.id === selectedReciterId;
                return (
                  <Pressable
                    key={String(variant.id)}
                    onPress={() => onSelectVariant(variant.id)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isQualitySelected }}
                    style={({ pressed }) => [
                      styles.qualityChip,
                      {
                        backgroundColor: isQualitySelected
                          ? progressColor
                          : withAlpha(progressColor, 0.1),
                        borderColor: isQualitySelected
                          ? progressColor
                          : withAlpha(progressColor, 0.22),
                      },
                      pressed && { opacity: 0.75 },
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

          <Pressable
            onPress={(e) => {
              e.stopPropagation?.();
              onTogglePreview(previewVariant.id);
            }}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={isPlaying ? "Pause preview" : "Play preview"}
            style={({ pressed }) => [
              styles.previewBtn,
              {
                backgroundColor: isPlaying
                  ? progressColor
                  : withAlpha(progressColor, 0.12),
              },
              pressed && styles.pressedScale,
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

// ─── Empty Search State ──────────────────────────────────────────────────────

const EmptySearchState = memo(({ themeColors, textAlign, writingDir, t }) => (
  <View style={styles.emptyState}>
    <View
      style={[
        styles.emptyIconWrap,
        { backgroundColor: withAlpha(themeColors.progressColor, 0.1) },
      ]}
    >
      <Icon
        source="magnify"
        size={28}
        color={withAlpha(themeColors.progressColor, 0.7)}
      />
    </View>
    <Text
      style={[
        styles.emptyTitle,
        {
          color: themeColors.textColor,
          textAlign,
          writingDirection: writingDir,
        },
      ]}
    >
      {t("No reciters found") || "No reciters found"}
    </Text>
    <Text
      style={[
        styles.emptySubtitle,
        {
          color: withAlpha(themeColors.textColor, 0.55),
          textAlign,
          writingDirection: writingDir,
        },
      ]}
    >
      {t("Try a different name or quality") ||
        "Try a different name or quality"}
    </Text>
  </View>
));
EmptySearchState.displayName = "EmptySearchState";

// ─── Main Screen ─────────────────────────────────────────────────────────────

const ReciterSelectScreen = ({ navigation }) => {
  const theme = useTheme();
  const { t } = useTranslation();
  const { language } = useAppLanguageStore();
  const { reciterId, setReciterId } = useReciterStore();
  const { showAlert } = useAppAlert();

  const [search, setSearch] = useState("");
  const [playingId, setPlayingId] = useState(null);
  const [loadingId, setLoadingId] = useState(null);
  const [bulkDownload, setBulkDownload] = useState({
    status: "idle",
    total: 0,
    completed: 0,
    failed: 0,
    transferredBytes: 0,
    totalBytes: null,
    speed: 0,
  });
  const [downloadEstimate, setDownloadEstimate] = useState({
    reciterId,
    status: "scanning",
    scanned: 0,
    total: 0,
    remaining: 0,
    existingCount: 0,
    existingBytes: 0,
    totalBytes: null,
  });
  const [activeDownloads, setActiveDownloads] = useState([]);

  const playerRef = useRef(null);
  const listenerRef = useRef(null);
  const previewRequestRef = useRef(0);
  const previewTimeoutRef = useRef(null);
  const downloadQueueRef = useRef([]);
  const failedDownloadsRef = useRef([]);
  const activeDownloadsRef = useRef(new Map());
  const downloadControllersRef = useRef(new Map());
  const downloadControlRef = useRef({ paused: false, cancelled: false });
  const downloadBytesRef = useRef(0);
  const sessionBytesRef = useRef(0);
  const downloadStartTimeRef = useRef(0);
  const isScreenMountedRef = useRef(true);
  const preflightRef = useRef(null);
  const preflightRunRef = useRef(0);

  const flexDir = getFlexDirection(language);
  const textAlign = getTextAlignment(language);
  const writingDir = getWritingDirection(language);

  const themeColors = useMemo(
    () => ({
      progressColor:
        theme.colors.progressColor || theme.colors.primary || "#2587D8",
      textColor: theme.colors.textColor || theme.colors.onSurface || "#111111",
      primaryColor: theme.colors.surface || theme.colors.primary || "#FFFFFF",
      backgroundColor: theme.colors.background || "#F5F7FA",
      outlineColor:
        theme.colors.outline ||
        theme.colors.outlineVariant ||
        "rgba(17, 17, 17, 0.12)",
    }),
    [theme],
  );

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
      variants: group.variants.sort((a, b) => {
        const bitA = parseInt(a.bitrate, 10) || 0;
        const bitB = parseInt(b.bitrate, 10) || 0;
        return bitB - bitA;
      }),
    }));
  }, []);

  const selectedVariant = useMemo(() => {
    return (RECITERS || []).find((r) => r.id === reciterId) || RECITERS?.[0];
  }, [reciterId]);

  const stopAudio = useCallback((preserveRequest = false) => {
    if (!preserveRequest) {
      previewRequestRef.current += 1;
    }
    if (previewTimeoutRef.current) {
      clearTimeout(previewTimeoutRef.current);
      previewTimeoutRef.current = null;
    }

    const activePlayer = playerRef.current;
    const activeListener = listenerRef.current;

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

  const showPreviewError = useCallback(
    (error) => {
      if (isNetworkFailure(error)) {
        showAlert(
          t("No internet connection") || "No internet connection",
          t("Connect to the internet to preview reciters") ||
            "Connect to the internet to preview reciters",
        );
        return;
      }
      showAlert(
        t("Error") || "Error",
        t("Unable to play reciter preview") || "Unable to play reciter preview",
      );
    },
    [showAlert, t],
  );

  const ensurePreviewFile = useCallback(async (reciterIdValue, previewUrl) => {
    if (!previewUrl) throw new Error("Invalid reciter preview URL");

    const previewDir = new Directory(Paths.document, "reciter-preview");
    if (!previewDir.exists) {
      previewDir.create({ intermediates: true });
    }

    const previewFile = new File(previewDir, `preview-${reciterIdValue}.mp3`);
    if (previewFile.exists && (previewFile.size ?? 0) > 512) {
      return previewFile.uri;
    }

    const downloaded = await File.downloadFileAsync(previewUrl, previewDir, {
      idempotent: true,
    });
    const finalFile = new File(downloaded.uri);
    if (!finalFile.exists || (finalFile.size ?? 0) < 512) {
      throw new Error("Preview audio could not be downloaded");
    }

    if (downloaded.uri !== previewFile.uri && previewFile.exists) {
      try {
        previewFile.delete();
      } catch {}
    }

    const renamed = new File(downloaded.uri);
    if (renamed.exists) {
      const targetUri = previewFile.uri;
      const fallback = new File(targetUri);
      if (!fallback.exists) {
        renamed.move(previewFile);
      }
      return previewFile.uri;
    }

    return downloaded.uri;
  }, []);

  useEffect(() => {
    isScreenMountedRef.current = true;
    const downloadControl = downloadControlRef.current;
    const downloadControllers = downloadControllersRef.current;
    return () => {
      isScreenMountedRef.current = false;
      downloadControl.cancelled = true;
      for (const controller of downloadControllers.values()) {
        controller.abort();
      }
      stopAudio();
    };
  }, [stopAudio]);

  useEffect(() => {
    const runId = ++preflightRunRef.current;
    preflightRef.current = null;

    prepareReciterDownloads(reciterId, (progress) => {
      if (runId !== preflightRunRef.current || !isScreenMountedRef.current) {
        return;
      }
      setDownloadEstimate({
        reciterId,
        status: progress.stage,
        scanned: progress.scanned,
        total: progress.total,
        remaining: progress.total - progress.existingCount,
        existingCount: progress.existingCount,
        existingBytes: progress.existingBytes,
        totalBytes: null,
      });
      if (progress.stage === "loadingSizes") {
        downloadBytesRef.current = progress.existingBytes;
        sessionBytesRef.current = 0;
        setBulkDownload({
          status: "idle",
          total: progress.total,
          completed: progress.existingCount,
          failed: 0,
          transferredBytes: progress.existingBytes,
          totalBytes: null,
          speed: 0,
        });
      }
    }).then((prepared) => {
      if (runId !== preflightRunRef.current || !isScreenMountedRef.current) {
        return;
      }
      preflightRef.current = prepared;
      downloadBytesRef.current = prepared.existingBytes;
      sessionBytesRef.current = 0;
      setDownloadEstimate({
        reciterId,
        status: "ready",
        scanned: prepared.total,
        total: prepared.total,
        remaining: prepared.tasks.length,
        existingCount: prepared.existingCount,
        existingBytes: prepared.existingBytes,
        totalBytes: prepared.totalBytes,
      });
      setBulkDownload({
        status: prepared.tasks.length ? "idle" : "complete",
        total: prepared.total,
        completed: prepared.existingCount,
        failed: 0,
        transferredBytes: prepared.existingBytes,
        totalBytes: prepared.totalBytes,
        speed: 0,
      });
    });

    return () => {
      if (preflightRunRef.current === runId) preflightRunRef.current += 1;
    };
  }, [reciterId]);

  const updateDownloadProgress = useCallback(
    (task, bytesWritten, totalBytes) => {
      const key = `${task.surah}:${task.ayah}`;
      const previous = activeDownloadsRef.current.get(key);
      const written = Math.max(0, bytesWritten || 0);
      const delta = Math.max(0, written - (previous?.bytesWritten || 0));
      downloadBytesRef.current += delta;
      sessionBytesRef.current += delta;
      activeDownloadsRef.current.set(key, {
        ...task,
        bytesWritten: written,
        totalBytes: totalBytes || previous?.totalBytes || 0,
        progress:
          totalBytes > 0
            ? Math.min(1, written / totalBytes)
            : previous?.progress || 0,
      });
      const elapsedSeconds = Math.max(
        1,
        (Date.now() - downloadStartTimeRef.current) / 1000,
      );
      const downloads = Array.from(activeDownloadsRef.current.values());
      if (isScreenMountedRef.current) {
        setActiveDownloads(downloads);
        setBulkDownload((current) => ({
          ...current,
          transferredBytes: downloadBytesRef.current,
          speed: sessionBytesRef.current / elapsedSeconds,
        }));
      }
    },
    [],
  );

  const runBulkDownloads = useCallback(async () => {
    const control = downloadControlRef.current;
    control.paused = false;
    control.cancelled = false;
    downloadStartTimeRef.current = Date.now();
    sessionBytesRef.current = 0;
    if (isScreenMountedRef.current) {
      setBulkDownload((current) => ({ ...current, status: "downloading" }));
    }

    const worker = async () => {
      while (!control.paused && !control.cancelled) {
        const task = downloadQueueRef.current.shift();
        if (!task) return;
        const url = getAyahAudioUrl(reciterId, task.surah, task.ayah);
        const directory = getAyahDirectory(reciterId, task.surah);
        const destination = getAyahFile(reciterId, task.surah, task.ayah);
        const taskKey = `${task.surah}:${task.ayah}`;
        const expectedSize = preflightRef.current?.sizes?.get(
          getAyahFileName(task.surah, task.ayah),
        );
        let controller;

        try {
          if (!url) throw new Error("Invalid reciter or ayah");
          if (!directory.exists) directory.create({ intermediates: true });
          const existingSize = destination.exists ? (destination.size ?? 0) : 0;
          if (
            existingSize > 512 &&
            (expectedSize == null || existingSize === expectedSize)
          ) {
            updateDownloadProgress(task, existingSize, existingSize);
            if (isScreenMountedRef.current) {
              setBulkDownload((current) => ({
                ...current,
                completed: Math.min(current.total, current.completed + 1),
              }));
            }
            continue;
          }
          if (destination.exists) destination.delete();

          controller = new AbortController();
          downloadControllersRef.current.set(taskKey, controller);
          activeDownloadsRef.current.set(taskKey, {
            ...task,
            progress: 0,
            bytesWritten: 0,
            totalBytes: 0,
          });
          if (isScreenMountedRef.current) {
            setActiveDownloads(Array.from(activeDownloadsRef.current.values()));
          }

          const result = await File.downloadFileAsync(url, directory, {
            idempotent: true,
            signal: controller.signal,
            onProgress: (progress) =>
              updateDownloadProgress(
                task,
                progress?.bytesWritten,
                progress?.totalBytes,
              ),
          });
          const downloadedFile = new File(result.uri);
          const finalSize = downloadedFile.size ?? 0;
          if (
            !downloadedFile.exists ||
            finalSize <= 512 ||
            (expectedSize != null && finalSize !== expectedSize)
          ) {
            throw new Error("Audio file is incomplete");
          }
          updateDownloadProgress(task, finalSize, finalSize);
          if (downloadedFile.uri !== destination.uri) {
            if (destination.exists) destination.delete();
            downloadedFile.move(destination);
          }
          if (isScreenMountedRef.current) {
            setBulkDownload((current) => ({
              ...current,
              completed: Math.min(current.total, current.completed + 1),
            }));
          }
        } catch {
          const wasAborted = controller?.signal.aborted;
          const incompleteBytes =
            activeDownloadsRef.current.get(taskKey)?.bytesWritten || 0;
          if (incompleteBytes > 0) {
            downloadBytesRef.current = Math.max(
              preflightRef.current?.existingBytes || 0,
              downloadBytesRef.current - incompleteBytes,
            );
            if (isScreenMountedRef.current) {
              setBulkDownload((current) => ({
                ...current,
                transferredBytes: downloadBytesRef.current,
              }));
            }
          }
          if (wasAborted && control.paused && !control.cancelled) {
            downloadQueueRef.current.unshift(task);
          } else if (!wasAborted && !control.cancelled) {
            failedDownloadsRef.current.push(task);
            if (isScreenMountedRef.current) {
              setBulkDownload((current) => ({
                ...current,
                failed: failedDownloadsRef.current.length,
              }));
            }
          }
        } finally {
          downloadControllersRef.current.delete(taskKey);
          activeDownloadsRef.current.delete(taskKey);
          if (isScreenMountedRef.current) {
            setActiveDownloads(Array.from(activeDownloadsRef.current.values()));
          }
        }
      }
    };

    await Promise.all(
      Array.from({ length: BULK_DOWNLOAD_CONCURRENCY }, () => worker()),
    );
    if (!isScreenMountedRef.current) return;
    setActiveDownloads([]);
    if (control.cancelled) {
      setBulkDownload((current) => ({ ...current, status: "cancelled" }));
    } else if (control.paused) {
      setBulkDownload((current) => ({ ...current, status: "paused" }));
    } else {
      setBulkDownload((current) => ({
        ...current,
        status: failedDownloadsRef.current.length ? "error" : "complete",
        failed: failedDownloadsRef.current.length,
      }));
    }
  }, [reciterId, updateDownloadProgress]);

  const startBulkDownload = useCallback(async () => {
    if (bulkDownload.status === "downloading") return;
    if (bulkDownload.status === "paused") {
      runBulkDownloads();
      return;
    }
    if (bulkDownload.status === "preparing") return;

    const prepared = preflightRef.current;
    if (!prepared || prepared.reciterId !== reciterId) return;

    setBulkDownload((current) => ({
      ...current,
      status: "preparing",
      total: prepared.total,
      completed: prepared.existingCount,
      transferredBytes: prepared.existingBytes,
      totalBytes: prepared.totalBytes,
    }));
    await new Promise((resolve) => requestAnimationFrame(resolve));
    if (!isScreenMountedRef.current) return;

    failedDownloadsRef.current = [];
    activeDownloadsRef.current.clear();
    downloadQueueRef.current = prepared.tasks;
    downloadBytesRef.current = prepared.existingBytes;
    sessionBytesRef.current = 0;
    setBulkDownload({
      status: prepared.tasks.length ? "downloading" : "complete",
      total: prepared.total,
      completed: prepared.existingCount,
      failed: 0,
      transferredBytes: prepared.existingBytes,
      totalBytes: prepared.totalBytes,
      speed: 0,
    });
    if (prepared.tasks.length) await runBulkDownloads();
  }, [bulkDownload.status, reciterId, runBulkDownloads]);

  const pauseBulkDownload = useCallback(() => {
    downloadControlRef.current.paused = true;
    for (const controller of downloadControllersRef.current.values()) {
      controller.abort();
    }
  }, []);

  const cancelBulkDownload = useCallback(() => {
    downloadControlRef.current.cancelled = true;
    downloadControlRef.current.paused = false;
    downloadQueueRef.current = [];
    for (const controller of downloadControllersRef.current.values()) {
      controller.abort();
    }
  }, []);

  const retryFailedDownloads = useCallback(() => {
    downloadQueueRef.current = failedDownloadsRef.current;
    failedDownloadsRef.current = [];
    setBulkDownload((current) => ({ ...current, failed: 0 }));
    runBulkDownloads();
  }, [runBulkDownloads]);

  const handleTogglePreview = useCallback(
    async (id) => {
      if (playingId === id) {
        stopAudio();
        return;
      }

      const requestId = ++previewRequestRef.current;
      stopAudio(true);
      setLoadingId(id);
      if (previewTimeoutRef.current) {
        clearTimeout(previewTimeoutRef.current);
      }
      previewTimeoutRef.current = setTimeout(() => {
        if (requestId !== previewRequestRef.current) return;
        showPreviewError(new Error("Preview timed out"));
        stopAudio(true);
      }, 20000);

      try {
        const previewUrl = getAyahAudioUrl(id, 1, 1);
        if (!previewUrl) throw new Error("Invalid reciter preview URL");
        if (!(await ensureAudioReachable(previewUrl, 15000))) {
          throw new Error("Network unavailable");
        }
        if (requestId !== previewRequestRef.current) return;

        const localPreviewUri = await ensurePreviewFile(id, previewUrl);
        if (requestId !== previewRequestRef.current) return;

        const newPlayer = createAudioPlayer({ uri: localPreviewUri });
        playerRef.current = newPlayer;

        const sub = newPlayer.addListener("playbackStatusUpdate", (status) => {
          if (requestId !== previewRequestRef.current) return;
          if (status?.error) {
            showPreviewError(status.error);
            stopAudio(true);
            return;
          }
          if (
            status?.isLoaded ||
            status?.isPlaying ||
            status?.currentTime > 0
          ) {
            setLoadingId((curr) => (curr === id ? null : curr));
            setPlayingId(id);
          }
          if (status?.didJustFinish) {
            stopAudio(true);
          }
        });
        listenerRef.current = sub;

        await newPlayer.play();
        if (requestId === previewRequestRef.current) {
          setLoadingId((curr) => (curr === id ? null : curr));
          setPlayingId(id);
        }
      } catch (err) {
        if (requestId !== previewRequestRef.current) return;
        showPreviewError(err);
        stopAudio(true);
      }
    },
    [playingId, ensurePreviewFile, showPreviewError, stopAudio],
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
      length: 88,
      offset: 88 * index,
      index,
    }),
    [],
  );

  const bulkProgressValue = bulkDownload.total
    ? Math.min(
        1,
        (bulkDownload.completed +
          activeDownloads.reduce((sum, item) => sum + item.progress, 0)) /
          bulkDownload.total,
      )
    : 0;
  const bulkProgressPercent = Math.round(bulkProgressValue * 100);
  const visibleDownloadEstimate =
    downloadEstimate.reciterId === reciterId
      ? downloadEstimate
      : {
          reciterId: null,
          status: "scanning",
          remaining: 0,
          existingBytes: 0,
          totalBytes: null,
        };
  const displayedDownloadedBytes =
    visibleDownloadEstimate.reciterId !== reciterId
      ? 0
      : visibleDownloadEstimate.status === "scanning"
        ? visibleDownloadEstimate.existingBytes
        : Math.max(
            visibleDownloadEstimate.existingBytes,
            bulkDownload.transferredBytes,
          );
  const remainingDownloadBytes =
    visibleDownloadEstimate.totalBytes == null
      ? null
      : Math.max(
          0,
          visibleDownloadEstimate.totalBytes - displayedDownloadedBytes,
        );

  const isSearching = search.trim().length > 0;
  const hasNoResults = isSearching && filteredReciters.length === 0;

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
              borderColor: withAlpha(themeColors.outlineColor, 0.14),
              flexDirection: flexDir,
            },
          ]}
        >
          <Icon
            source="magnify"
            size={20}
            color={withAlpha(themeColors.textColor, 0.45)}
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
            autoCapitalize="none"
            clearButtonMode="never"
            returnKeyType="search"
          />
          {search.length > 0 && (
            <Pressable
              onPress={() => setSearch("")}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={t("Clear search") || "Clear search"}
              style={({ pressed }) => [
                styles.clearBtn,
                pressed && { opacity: 0.6 },
              ]}
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

      <FlatList
        data={filteredReciters}
        keyExtractor={(item) => item.name}
        renderItem={renderItem}
        contentContainerStyle={[
          styles.listContainer,
          hasNoResults && styles.listContainerEmpty,
        ]}
        ListHeaderComponent={
          <>
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

            {/* Download Panel */}
            <View
              style={[
                styles.downloadPanel,
                {
                  backgroundColor: themeColors.primaryColor,
                  borderColor: withAlpha(themeColors.outlineColor, 0.12),
                },
              ]}
            >
              <View
                style={[styles.downloadHeading, { flexDirection: flexDir }]}
              >
                <View
                  style={[
                    styles.downloadIcon,
                    {
                      backgroundColor: withAlpha(
                        themeColors.progressColor,
                        0.12,
                      ),
                    },
                  ]}
                >
                  <Icon
                    source="download-multiple"
                    size={20}
                    color={themeColors.progressColor}
                  />
                </View>
                <View style={styles.downloadHeadingText}>
                  <Text
                    style={[
                      styles.downloadTitle,
                      {
                        color: themeColors.textColor,
                        textAlign,
                        writingDirection: writingDir,
                      },
                    ]}
                  >
                    {t("Download all audio") || "Download all audio"}
                  </Text>
                  <Text
                    style={[
                      styles.downloadSubtitle,
                      {
                        color: withAlpha(themeColors.textColor, 0.6),
                        textAlign,
                        writingDirection: writingDir,
                      },
                    ]}
                    numberOfLines={2}
                  >
                    {selectedVariant?.name} · {selectedVariant?.bitrate}
                  </Text>
                </View>
              </View>

              <View style={styles.downloadSizeSummary}>
                <View
                  style={[styles.downloadSizeRow, { flexDirection: flexDir }]}
                >
                  <Text
                    style={[
                      styles.downloadSizeLabel,
                      {
                        color: withAlpha(themeColors.textColor, 0.65),
                        textAlign,
                      },
                    ]}
                  >
                    {t("Total size") || "Total size"}
                  </Text>
                  <Text
                    style={[
                      styles.downloadSizeValue,
                      { color: themeColors.textColor },
                    ]}
                  >
                    {visibleDownloadEstimate.totalBytes == null
                      ? visibleDownloadEstimate.status === "ready"
                        ? t("Download size unavailable") ||
                          "Download size unavailable"
                        : "..."
                      : formatDownloadBytes(visibleDownloadEstimate.totalBytes)}
                  </Text>
                </View>
                <View
                  style={[styles.downloadSizeRow, { flexDirection: flexDir }]}
                >
                  <Text
                    style={[
                      styles.downloadSizeLabel,
                      {
                        color: withAlpha(themeColors.textColor, 0.65),
                        textAlign,
                      },
                    ]}
                  >
                    {t("Downloaded") || "Downloaded"}
                  </Text>
                  <Text
                    style={[
                      styles.downloadSizeValue,
                      { color: themeColors.textColor },
                    ]}
                  >
                    {formatDownloadBytes(displayedDownloadedBytes)}
                  </Text>
                </View>
                <View
                  style={[styles.downloadSizeRow, { flexDirection: flexDir }]}
                >
                  <Text
                    style={[
                      styles.downloadSizeLabel,
                      {
                        color: withAlpha(themeColors.textColor, 0.65),
                        textAlign,
                      },
                    ]}
                  >
                    {t("Remaining to download") || "Remaining to download"}
                  </Text>
                  <Text
                    style={[
                      styles.downloadSizeValue,
                      { color: themeColors.textColor },
                    ]}
                  >
                    {remainingDownloadBytes == null
                      ? t("Download size unavailable") ||
                        "Download size unavailable"
                      : formatDownloadBytes(remainingDownloadBytes)}
                  </Text>
                </View>
                <View
                  style={[
                    styles.downloadEstimateRow,
                    { flexDirection: flexDir },
                  ]}
                >
                  {visibleDownloadEstimate.status === "scanning" ||
                  visibleDownloadEstimate.status === "loadingSizes" ? (
                    <ActivityIndicator
                      size="small"
                      color={themeColors.progressColor}
                    />
                  ) : null}
                  <Text
                    style={[
                      styles.downloadEstimateText,
                      {
                        color: withAlpha(themeColors.textColor, 0.68),
                        textAlign,
                      },
                    ]}
                  >
                    {visibleDownloadEstimate.status === "scanning"
                      ? t("Preparing audio list") || "Preparing audio list"
                      : visibleDownloadEstimate.status === "loadingSizes"
                        ? t("Loading exact audio sizes") ||
                          "Loading exact audio sizes"
                        : `${visibleDownloadEstimate.remaining} ${t("ayahs") || "ayahs"} ${t("remaining") || "remaining"}`}
                  </Text>
                </View>
              </View>

              {bulkDownload.status !== "idle" &&
                bulkDownload.status !== "preparing" && (
                  <View style={styles.downloadProgressArea}>
                    <View
                      style={[styles.downloadStats, { flexDirection: flexDir }]}
                    >
                      <Text
                        style={[
                          styles.downloadStatText,
                          { color: themeColors.textColor, textAlign },
                        ]}
                      >
                        {bulkDownload.completed} / {bulkDownload.total}{" "}
                        {t("ayahs") || "ayahs"} · {bulkProgressPercent}%
                      </Text>
                      <Text
                        style={[
                          styles.downloadStatText,
                          { color: withAlpha(themeColors.textColor, 0.6) },
                        ]}
                      >
                        {formatDownloadBytes(bulkDownload.speed)}/s
                      </Text>
                    </View>

                    <View
                      style={[
                        styles.downloadTrack,
                        {
                          backgroundColor: withAlpha(
                            themeColors.progressColor,
                            0.14,
                          ),
                        },
                      ]}
                    >
                      <View
                        style={[
                          styles.downloadFill,
                          {
                            width: `${bulkProgressPercent}%`,
                            backgroundColor: themeColors.progressColor,
                          },
                        ]}
                      />
                    </View>

                    {bulkDownload.failed > 0 && (
                      <Text
                        style={[
                          styles.downloadBytes,
                          {
                            color: withAlpha(themeColors.textColor, 0.58),
                            textAlign,
                          },
                        ]}
                      >
                        {bulkDownload.failed} {t("failed") || "failed"}
                      </Text>
                    )}

                    {activeDownloads
                      .slice(0, BULK_DOWNLOAD_CONCURRENCY)
                      .map((item) => (
                        <View
                          key={`${item.surah}:${item.ayah}`}
                          style={[
                            styles.activeDownloadRow,
                            { flexDirection: flexDir },
                          ]}
                        >
                          <Text
                            style={[
                              styles.activeDownloadLabel,
                              { color: themeColors.textColor, textAlign },
                            ]}
                            numberOfLines={1}
                          >
                            {t("Surah") || "Surah"} {item.surah} ·{" "}
                            {t("Ayah") || "Ayah"} {item.ayah}
                          </Text>
                          <Text
                            style={[
                              styles.activeDownloadPercent,
                              { color: themeColors.progressColor },
                            ]}
                          >
                            {Math.round(item.progress * 100)}%
                          </Text>
                        </View>
                      ))}
                  </View>
                )}

              <View
                style={[styles.downloadActions, { flexDirection: flexDir }]}
              >
                {bulkDownload.status === "downloading" ? (
                  <>
                    <Pressable
                      onPress={pauseBulkDownload}
                      accessibilityRole="button"
                      style={({ pressed }) => [
                        styles.downloadAction,
                        { backgroundColor: themeColors.progressColor },
                        pressed && styles.pressedOpacity,
                      ]}
                    >
                      <Icon source="pause" size={17} color="#FFF" />
                      <Text style={styles.downloadActionText}>
                        {t("Pause") || "Pause"}
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={cancelBulkDownload}
                      accessibilityRole="button"
                      style={({ pressed }) => [
                        styles.downloadActionSecondary,
                        {
                          borderColor: withAlpha(themeColors.textColor, 0.18),
                        },
                        pressed && styles.pressedOpacity,
                      ]}
                    >
                      <Icon
                        source="close"
                        size={17}
                        color={themeColors.textColor}
                      />
                      <Text
                        style={[
                          styles.downloadActionSecondaryText,
                          { color: themeColors.textColor },
                        ]}
                      >
                        {t("Cancel") || "Cancel"}
                      </Text>
                    </Pressable>
                  </>
                ) : bulkDownload.status === "preparing" ? (
                  <View
                    style={[
                      styles.downloadComplete,
                      { flexDirection: flexDir },
                    ]}
                  >
                    <ActivityIndicator color={themeColors.progressColor} />
                    <Text
                      style={[
                        styles.downloadCompleteText,
                        { color: themeColors.progressColor },
                      ]}
                    >
                      {t("Preparing downloads") || "Preparing downloads"}
                    </Text>
                  </View>
                ) : bulkDownload.status === "paused" ? (
                  <>
                    <Pressable
                      onPress={startBulkDownload}
                      accessibilityRole="button"
                      style={({ pressed }) => [
                        styles.downloadAction,
                        { backgroundColor: themeColors.progressColor },
                        pressed && styles.pressedOpacity,
                      ]}
                    >
                      <Icon source="play" size={17} color="#FFF" />
                      <Text style={styles.downloadActionText}>
                        {t("Resume") || "Resume"}
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={cancelBulkDownload}
                      accessibilityRole="button"
                      style={({ pressed }) => [
                        styles.downloadActionSecondary,
                        {
                          borderColor: withAlpha(themeColors.textColor, 0.18),
                        },
                        pressed && styles.pressedOpacity,
                      ]}
                    >
                      <Icon
                        source="close"
                        size={17}
                        color={themeColors.textColor}
                      />
                      <Text
                        style={[
                          styles.downloadActionSecondaryText,
                          { color: themeColors.textColor },
                        ]}
                      >
                        {t("Cancel") || "Cancel"}
                      </Text>
                    </Pressable>
                  </>
                ) : bulkDownload.status === "error" ? (
                  <Pressable
                    onPress={retryFailedDownloads}
                    accessibilityRole="button"
                    style={({ pressed }) => [
                      styles.downloadAction,
                      styles.downloadActionWide,
                      { backgroundColor: themeColors.progressColor },
                      pressed && styles.pressedOpacity,
                    ]}
                  >
                    <Icon source="reload" size={17} color="#FFF" />
                    <Text style={styles.downloadActionText}>
                      {t("Retry failed") || "Retry failed"}
                    </Text>
                  </Pressable>
                ) : bulkDownload.status === "complete" ? (
                  <View
                    style={[
                      styles.downloadComplete,
                      { flexDirection: flexDir },
                    ]}
                  >
                    <Icon
                      source="check-circle"
                      size={20}
                      color={themeColors.progressColor}
                    />
                    <Text
                      style={[
                        styles.downloadCompleteText,
                        { color: themeColors.progressColor },
                      ]}
                    >
                      {t("All ayahs downloaded") || "All ayahs downloaded"}
                    </Text>
                  </View>
                ) : (
                  <Pressable
                    onPress={startBulkDownload}
                    disabled={visibleDownloadEstimate.status !== "ready"}
                    accessibilityRole="button"
                    style={({ pressed }) => [
                      styles.downloadAction,
                      styles.downloadActionWide,
                      { backgroundColor: themeColors.progressColor },
                      visibleDownloadEstimate.status !== "ready" &&
                        styles.downloadActionDisabled,
                      pressed && styles.pressedOpacity,
                    ]}
                  >
                    <Icon source="download" size={18} color="#FFF" />
                    <Text style={styles.downloadActionText}>
                      {bulkDownload.status === "cancelled"
                        ? t("Continue download") || "Continue download"
                        : t("Download all surahs") || "Download all surahs"}
                    </Text>
                  </Pressable>
                )}
              </View>
            </View>
          </>
        }
        ListEmptyComponent={
          hasNoResults ? (
            <EmptySearchState
              themeColors={themeColors}
              textAlign={textAlign}
              writingDir={writingDir}
              t={t}
            />
          ) : null
        }
        initialNumToRender={12}
        maxToRenderPerBatch={10}
        windowSize={8}
        getItemLayout={getItemLayout}
        removeClippedSubviews={Platform.OS !== "web"}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
};

export default ReciterSelectScreen;

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },

  // Search
  searchContainer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  searchBar: {
    height: 48,
    borderRadius: 14,
    paddingHorizontal: 14,
    alignItems: "center",
    borderWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    height: "100%",
    paddingVertical: 0,
  },
  clearBtn: {
    justifyContent: "center",
    alignItems: "center",
    padding: 2,
  },

  // List
  listContainer: {
    paddingHorizontal: 16,
    paddingBottom: 36,
    paddingTop: 4,
  },
  listContainerEmpty: {
    flexGrow: 1,
  },

  // Empty state
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 48,
    paddingHorizontal: 24,
  },
  emptyIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 13,
    lineHeight: 18,
  },

  // Download panel
  downloadPanel: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: StyleSheet.hairlineWidth,
  },
  downloadHeading: {
    alignItems: "center",
    gap: 12,
  },
  downloadIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  downloadHeadingText: {
    flex: 1,
  },
  downloadTitle: {
    fontSize: 15,
    fontWeight: "700",
    letterSpacing: -0.2,
  },
  downloadSubtitle: {
    fontSize: 12.5,
    marginTop: 3,
  },
  downloadSizeSummary: {
    marginTop: 14,
    gap: 8,
  },
  downloadSizeRow: {
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  downloadSizeLabel: {
    flex: 1,
    fontSize: 12,
  },
  downloadSizeValue: {
    flexShrink: 1,
    fontSize: 12.5,
    fontWeight: "700",
    textAlign: "right",
  },
  downloadEstimateRow: {
    alignItems: "center",
    gap: 8,
    marginTop: 12,
  },
  downloadEstimateText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
  },
  downloadActionDisabled: {
    opacity: 0.45,
  },
  downloadProgressArea: {
    marginTop: 16,
    gap: 8,
  },
  downloadStats: {
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  downloadStatText: {
    fontSize: 12.5,
    fontWeight: "600",
  },
  downloadTrack: {
    height: 8,
    borderRadius: 5,
    overflow: "hidden",
  },
  downloadFill: {
    height: "100%",
    borderRadius: 5,
  },
  downloadBytes: {
    fontSize: 11.5,
  },
  activeDownloadRow: {
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    paddingVertical: 2,
  },
  activeDownloadLabel: {
    flex: 1,
    fontSize: 11.5,
  },
  activeDownloadPercent: {
    fontSize: 11.5,
    fontWeight: "700",
  },
  downloadActions: {
    alignItems: "center",
    gap: 10,
    marginTop: 14,
    flexWrap: "wrap",
  },
  downloadAction: {
    minHeight: 42,
    paddingHorizontal: 16,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  downloadActionWide: {
    flex: 1,
  },
  downloadActionText: {
    color: "#FFF",
    fontSize: 13.5,
    fontWeight: "700",
  },
  downloadActionSecondary: {
    minHeight: 42,
    paddingHorizontal: 14,
    borderRadius: 11,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
  },
  downloadActionSecondaryText: {
    fontSize: 13.5,
    fontWeight: "600",
  },
  downloadComplete: {
    alignItems: "center",
    gap: 8,
    minHeight: 42,
  },
  downloadCompleteText: {
    fontSize: 14,
    fontWeight: "700",
  },

  // Selected header
  headerCard: {
    borderRadius: 18,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    marginTop: 6,
  },
  headerTopRow: {
    marginBottom: 10,
    alignItems: "center",
  },
  activePill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
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
    fontSize: 10.5,
    fontWeight: "800",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  headerContent: {
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerReciterName: {
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: -0.3,
  },
  headerPreviewBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },

  // Reciter card
  card: {
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.04,
        shadowRadius: 8,
      },
      android: {
        elevation: 1.5,
      },
    }),
  },
  cardContent: {
    alignItems: "center",
    gap: 12,
  },
  radioCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  textDetails: {
    flex: 1,
  },
  reciterName: {
    fontSize: 15.5,
    letterSpacing: -0.2,
  },
  badgeRow: {
    gap: 6,
    alignItems: "center",
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 7,
    gap: 4,
  },
  badgeText: {
    fontSize: 11.5,
    fontWeight: "700",
  },
  qualityChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 9,
    borderWidth: 1,
  },
  qualityChipText: {
    fontSize: 11.5,
    fontWeight: "700",
  },
  previewBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },

  // Shared press feedback
  pressedScale: {
    opacity: 0.85,
    transform: [{ scale: 0.96 }],
  },
  pressedOpacity: {
    opacity: 0.82,
  },
});
