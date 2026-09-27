import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { getArabicVersesForSurah } from "./quranData";
import { useSurahAudioRegistry } from "./QuranVerseItem";
import { setAudioModeAsync } from "expo-audio";

const AudioPlayerContext = createContext(null);

export const AudioPlayerProvider = ({ children }) => {
  const [routeSurahId, setRouteSurahId] = useState(0);
  const [sessionSurahId, setSessionSurahId] = useState(0);
  const [ayahList, setAyahList] = useState([]);
  const [isVisible, setIsVisible] = useState(true);

  const activeSessionSurahId = sessionSurahId || routeSurahId;
  const registry = useSurahAudioRegistry(activeSessionSurahId, ayahList);
  const registryRef = useRef(registry);

  useEffect(() => {
    registryRef.current = registry;
  }, [registry]);

  useEffect(() => {
    setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      shouldRouteThroughEarpiece: false,
      interruptionMode: "doNotMix",
    }).catch(() => {});
  }, []);

  const updateAyahListForSurah = useCallback((surahId) => {
    const nextAyahList = getArabicVersesForSurah(surahId).map(
      (verse) => verse.ayah,
    );
    setAyahList((current) => {
      if (
        current.length === nextAyahList.length &&
        current[0] === nextAyahList[0]
      ) {
        return current;
      }
      return nextAyahList;
    });
  }, []);

  const registerSurah = useCallback(
    (nextSurahId) => {
      const id = Number(nextSurahId);
      if (!Number.isFinite(id) || id < 1 || id > 114) return;

      setRouteSurahId(id);
      const shouldKeepSession =
        !!registry.playingSurahId && registry.playingSurahId !== id;
      if (shouldKeepSession) return;

      setSessionSurahId(id);
      updateAyahListForSurah(id);
    },
    [registry.playingSurahId, updateAyahListForSurah],
  );

  const showPlayer = useCallback(() => setIsVisible(true), []);
  const hidePlayer = useCallback(() => {
    registry.refreshLockScreenControls?.();
    setIsVisible(false);
  }, [registry]);

  const playVerse = useCallback(
    async (ayah, opts = {}) => {
      const targetAyah = Number(ayah);
      if (!Number.isFinite(targetAyah) || targetAyah <= 0) return;

      const targetSurahId = Number(routeSurahId || sessionSurahId || 0);
      if (targetSurahId <= 0) return;

      setSessionSurahId(targetSurahId);
      updateAyahListForSurah(targetSurahId);
      setIsVisible(true);

      const player = registryRef.current;
      if (!player) return;
      setTimeout(() => {
        player.playVerse(targetAyah, opts).catch(() => {});
      }, 0);
    },
    [routeSurahId, sessionSurahId, updateAyahListForSurah],
  );

  const activeAyah =
    registry.expandedId ??
    registry.playingId ??
    registry.lastActiveAyah ??
    null;
  const playbackSurahId =
    registry.playingSurahId ?? registry.lastActiveSurahId ?? routeSurahId;

  const value = useMemo(
    () => ({
      ...registry,
      surahId: routeSurahId,
      playbackSurahId,
      activeAyah,
      activeSurahId: playbackSurahId,
      isVisible,
      registerSurah,
      showPlayer,
      hidePlayer,
      playVerse,
    }),
    [
      activeAyah,
      hidePlayer,
      isVisible,
      playVerse,
      playbackSurahId,
      registerSurah,
      registry,
      showPlayer,
      routeSurahId,
    ],
  );

  return (
    <AudioPlayerContext.Provider value={value}>
      {children}
    </AudioPlayerContext.Provider>
  );
};

export const useAudioPlayer = () => {
  const context = useContext(AudioPlayerContext);
  if (!context)
    throw new Error("useAudioPlayer must be used inside AudioPlayerProvider");
  return context;
};
