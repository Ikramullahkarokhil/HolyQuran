import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { getArabicVersesForSurah } from "./quranData";
import { useSurahAudioRegistry } from "./QuranVerseItem";
import { setAudioModeAsync } from "expo-audio";

const AudioPlayerContext = createContext(null);

export const AudioPlayerProvider = ({ children }) => {
  const [surahId, setSurahId] = useState(0);
  const [ayahList, setAyahList] = useState([]);
  const [isVisible, setIsVisible] = useState(true);
  const registry = useSurahAudioRegistry(surahId, ayahList);

  useEffect(() => {
    setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      shouldRouteThroughEarpiece: false,
      interruptionMode: "doNotMix",
    }).catch(() => {});
  }, []);

  const registerSurah = useCallback(
    (nextSurahId) => {
      const id = Number(nextSurahId);
      if (!Number.isFinite(id) || id < 1 || id > 114) return;
      setSurahId((current) => (current === id ? current : id));
      setAyahList((current) => {
        if (current.length && id === surahId) return current;
        return getArabicVersesForSurah(id).map((verse) => verse.ayah);
      });
    },
    [surahId],
  );

  const showPlayer = useCallback(() => setIsVisible(true), []);
  const hidePlayer = useCallback(() => {
    registry.refreshLockScreenControls?.();
    setIsVisible(false);
  }, [registry]);
  const playVerse = useCallback(
    async (ayah) => {
      setIsVisible(true);
      return registry.playVerse(ayah);
    },
    [registry],
  );

  const value = useMemo(
    () => ({
      ...registry,
      surahId,
      activeAyah: registry.expandedId ?? registry.playingId ?? null,
      isVisible,
      registerSurah,
      showPlayer,
      hidePlayer,
      playVerse,
    }),
    [
      hidePlayer,
      isVisible,
      playVerse,
      registerSurah,
      registry,
      showPlayer,
      surahId,
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
