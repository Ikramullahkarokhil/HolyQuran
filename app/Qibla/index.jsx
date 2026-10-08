/**
 * Qibla compass screen
 * Expo SDK 57 · React Native 0.86 · Reanimated 4.5 · plain JavaScript
 *
 * Architecture (why it stays at your display's refresh rate):
 *  1. Sensor → JS: a One-Euro filter removes jitter at rest and keeps lag low
 *     while turning. Output is written to a shared value (no React state).
 *  2. UI thread: a frame callback eases the dial toward the filtered target
 *     every display frame (60 / 120 Hz), independent of the sensor rate.
 *  3. Only tiny components (number readout, guidance pill, halo) subscribe to
 *     heading changes through an external store, throttled to 10 Hz. The
 *     screen itself never re-renders for a heading tick.
 *  4. Clocks / timers pause when the screen is unfocused or backgrounded.
 */
import React, {
  createContext,
  memo,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  AccessibilityInfo,
  ActivityIndicator,
  AppState,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useFocusEffect, useNavigation, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Location from "expo-location";
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  cancelAnimation,
  useAnimatedProps,
  useAnimatedStyle,
  useFrameCallback,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import Svg, {
  Circle,
  Defs,
  G,
  Line,
  LinearGradient,
  Path,
  Rect,
  Stop,
  Text as SvgText,
} from "react-native-svg";
import { Icon, useTheme } from "react-native-paper";
import { useTranslation } from "react-i18next";
import * as Haptics from "expo-haptics";
import {
  Coordinates,
  CalculationMethod,
  HighLatitudeRule,
  Madhab,
  PrayerTimes,
  Prayer,
} from "adhan";
import {
  Observer,
  Body,
  Illumination,
  MakeTime,
  MoonPhase,
  SearchRiseSet,
} from "astronomy-engine";

/* ───────────────────────────── constants ───────────────────────────── */

// Kaaba coordinates (same reference point the adhan library uses).
const KAABA = { latitude: 21.4225241, longitude: 39.8261818 };
const TICKS = Array.from({ length: 72 }, (_, i) => i);

// Visual alignment. Enter/exit differ so the UI never flickers on the edge.
const ALIGN_ENTER_DEG = 8;
const ALIGN_EXIT_DEG = 11;

// Haptic alignment (stricter, needs a trustworthy sensor).
const HAPTIC_ENTER_DEG = 4;
const HAPTIC_EXIT_DEG = 7;
const HAPTIC_DWELL_MS = 500;
const HAPTIC_MIN_ACCURACY = 2;

// Heading pipeline.
const HEADING_UI_INTERVAL_MS = 100; // max React updates for the number readout
const DISPLAY_HYSTERESIS_DEG = 0.65; // keeps the integer from flickering at rest
const NO_HEADING_TIMEOUT_MS = 6000;
const TRUE_HEADING_GRACE_MS = 2500; // wait for true north before using magnetic
const VISUAL_TAU_MS = 45; // UI-thread easing time constant (lower = snappier)
// Tuned by simulation (σ≈1.5° sensor noise): ~2.7× less jitter at rest with
// ≈45 ms of lag while turning at 90°/s. Raise minCutoff for a snappier needle,
// lower it for a calmer one.
const FILTER = {
  minCutoff: 0.9, // Hz – smoothing at rest
  minCutoffLowAccuracy: 0.5, // Hz – calmer when the sensor reports low accuracy
  beta: 0.03, // how quickly smoothing relaxes while turning
  derivativeCutoff: 0.5, // Hz
};

// Location.
const LOCATION_TIMEOUT_MS = 15_000;
const CACHED_LOCATION_MAX_AGE_MS = 5 * 60_000;
const FALLBACK_LOCATION_MAX_AGE_MS = 60 * 60_000;
const RESUME_REFRESH_AFTER_MS = 5_000;

// Time keeping.
const MOON_BUCKET_MS = 15 * 60_000;

// Sun chart geometry.
const SUN_CHART_WIDTH = 320;
const SUN_CHART_HEIGHT = 110;
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// Prayer settings. Change these two lines to switch method / madhab.
// Methods: MuslimWorldLeague, Egyptian, Karachi, UmmAlQura, Dubai, Qatar,
// Kuwait, MoonsightingCommittee, Singapore, Turkey, Tehran, NorthAmerica.
const PRAYER_CALCULATION_METHOD = "MuslimWorldLeague";
const PRAYER_MADHAB = Madhab.Shafi; // Madhab.Hanafi for later Asr

const COMPASS_POINTS = [
  "N",
  "NNE",
  "NE",
  "ENE",
  "E",
  "ESE",
  "SE",
  "SSE",
  "S",
  "SSW",
  "SW",
  "WSW",
  "W",
  "WNW",
  "NW",
  "NNW",
];
const DEGREE_LABELS = [30, 60, 120, 150, 210, 240, 300, 330];
const CARDINALS = [
  { deg: 0, label: "N", primary: true },
  { deg: 90, label: "E" },
  { deg: 180, label: "S" },
  { deg: 270, label: "W" },
];

const PRAYER_ORDER = [
  { key: "fajr", prayer: Prayer.Fajr, icon: "weather-night" },
  { key: "sunrise", prayer: Prayer.Sunrise, icon: "weather-sunset-up" },
  { key: "dhuhr", prayer: Prayer.Dhuhr, icon: "white-balance-sunny" },
  { key: "asr", prayer: Prayer.Asr, icon: "weather-partly-cloudy" },
  { key: "maghrib", prayer: Prayer.Maghrib, icon: "weather-sunset" },
  { key: "isha", prayer: Prayer.Isha, icon: "moon-waning-crescent" },
];

const MOON_PHASE_LABELS = [
  "New Moon",
  "Waxing Crescent",
  "First Quarter",
  "Waxing Gibbous",
  "Full Moon",
  "Waning Gibbous",
  "Last Quarter",
  "Waning Crescent",
];

const DIAL_LIGHT = {
  face: "#fbfcfc",
  rim: "#e2e8e6",
  tick: "#c9d2cf",
  tickMajor: "#5f6e6a",
  label: "#5f6e6a",
  needle: "#0d9488",
  tail: "#b4beb9",
  gold: "#d97706",
  aligned: "#059669",
  soft: "#ecfdf5",
};
const DIAL_DARK = {
  face: "#0f1615",
  rim: "#24302d",
  tick: "#35413e",
  tickMajor: "#8b9894",
  label: "#8b9894",
  needle: "#2dd4bf",
  tail: "#3d4a46",
  gold: "#f59e0b",
  aligned: "#34d399",
  soft: "#064e3b",
};

const EMPTY_SKY_EVENTS = {
  sunrise: null,
  sunset: null,
  moonrise: null,
  moonset: null,
};
const EMPTY_MOON = {
  moonFraction: null,
  moonLabel: null,
  moonWaxing: true,
  southern: false,
};

/* ───────────────────────────── math helpers ────────────────────────── */

const toRadians = (d) => (d * Math.PI) / 180;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// Marked as worklets so the UI-thread frame callback can use them too.
const normalizeDegrees = (d) => {
  "worklet";
  return ((d % 360) + 360) % 360;
};

const shortestSignedDelta = (from, to) => {
  "worklet";
  return ((((to - from) % 360) + 540) % 360) - 180;
};

// One UI-frame of easing toward the target heading (frame-rate independent).
const stepVisualHeading = (current, target, dtMs) => {
  "worklet";
  const diff = shortestSignedDelta(current, target);
  if (Math.abs(diff) < 0.02) return target;
  const k = 1 - Math.exp(-dtMs / VISUAL_TAU_MS);
  return normalizeDegrees(current + diff * k);
};

export const getQiblaBearing = (latitude, longitude) => {
  const φ1 = toRadians(latitude);
  const φ2 = toRadians(KAABA.latitude);
  const Δλ = toRadians(KAABA.longitude - longitude);
  const east = Math.sin(Δλ) * Math.cos(φ2);
  const north =
    Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return normalizeDegrees((Math.atan2(east, north) * 180) / Math.PI);
};

const cardinalOf = (deg) => COMPASS_POINTS[Math.round(deg / 22.5) % 16];

const getCityName = (place) =>
  place?.city ||
  place?.district ||
  place?.subregion ||
  place?.region ||
  place?.country ||
  null;

const isValidLocation = (coords) =>
  Number.isFinite(coords?.latitude) &&
  coords.latitude >= -90 &&
  coords.latitude <= 90 &&
  Number.isFinite(coords?.longitude) &&
  coords.longitude >= -180 &&
  coords.longitude <= 180;

const isValidDate = (d) => d instanceof Date && !Number.isNaN(d.getTime());

const pad2 = (n) => String(n).padStart(2, "0");

const formatClock = (date, t) => {
  if (!isValidDate(date)) return "––:––";
  const hours = date.getHours();
  const hour12 = hours % 12 || 12;
  const period = t(hours < 12 ? "AM" : "PM");
  return `${hour12}:${pad2(date.getMinutes())} ${period}`;
};

const formatCountdown = (ms) => {
  if (ms == null || ms < 0) return "––:––:––";
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${pad2(m)}:${pad2(s)}`;
  return `${pad2(m)}:${pad2(s)}`;
};

// Uses the Moon's ecliptic phase (0 new → 180 full), which – unlike the
// illumination "phase angle" – distinguishes waxing from waning.
const moonPhaseLabel = (phaseDeg) =>
  MOON_PHASE_LABELS[
    Math.floor(((normalizeDegrees(phaseDeg) + 22.5) % 360) / 45)
  ];

const prayerLabelKey = (prayer) => {
  switch (prayer) {
    case Prayer.Fajr:
      return "Fajr";
    case Prayer.Sunrise:
      return "Sunrise";
    case Prayer.Dhuhr:
      return "Dhuhr";
    case Prayer.Asr:
      return "Asr";
    case Prayer.Maghrib:
      return "Maghrib";
    case Prayer.Isha:
      return "Isha";
    default:
      return "Prayer";
  }
};

const withTimeout = (promise, ms, message) => {
  let id;
  const timeout = new Promise((_, reject) => {
    id = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(id));
};

const warn = (...args) => {
  if (__DEV__) console.warn(...args);
};

/* ───────────────────────────── sky + prayers ───────────────────────── */

function buildPrayerParams(coords) {
  const factory =
    CalculationMethod[PRAYER_CALCULATION_METHOD] ??
    CalculationMethod.MuslimWorldLeague;
  const params = factory();
  params.madhab = PRAYER_MADHAB;
  // Without this, Fajr / Isha are wrong or undefined in long summer twilight
  // at high latitudes (above ~48°).
  if (typeof HighLatitudeRule?.recommended === "function") {
    params.highLatitudeRule = HighLatitudeRule.recommended(coords);
  }
  return params;
}

/**
 * One calculation per (location, local day). Also grabs yesterday's Isha and
 * tomorrow's Fajr so "next prayer" is always defined, even after Isha.
 */
function computePrayerSchedule(latitude, longitude, dayStartMs) {
  const coords = new Coordinates(latitude, longitude);
  const params = buildPrayerParams(coords);
  const day = new Date(dayStartMs);
  const timesFor = (offsetDays) =>
    new PrayerTimes(
      coords,
      new Date(
        day.getFullYear(),
        day.getMonth(),
        day.getDate() + offsetDays,
        12,
      ),
      params,
    );

  const today = timesFor(0);
  return {
    entries: PRAYER_ORDER.map(({ key, prayer, icon }) => ({
      key,
      prayer,
      icon,
      label: prayerLabelKey(prayer),
      time: today.timeForPrayer(prayer),
    })),
    previousIsha: timesFor(-1).isha,
    nextFajr: timesFor(1).fajr,
  };
}

/** Pure: which prayer is current / next at `nowMs`. */
function derivePrayerPhase(schedule, nowMs) {
  const timed = schedule.entries.filter((e) => isValidDate(e.time));
  let currentIndex = -1;
  timed.forEach((e, i) => {
    if (e.time.getTime() <= nowMs) currentIndex = i;
  });

  const current = currentIndex >= 0 ? timed[currentIndex] : null;
  let next = timed[currentIndex + 1] ?? null;
  let nextTime = next ? next.time : null;
  let nextIsTomorrow = false;

  if (!next && isValidDate(schedule.nextFajr)) {
    next = schedule.entries.find((e) => e.key === "fajr") ?? null;
    nextTime = schedule.nextFajr;
    nextIsTomorrow = true;
  }

  const startTime = current
    ? current.time
    : isValidDate(schedule.previousIsha)
      ? schedule.previousIsha
      : null;

  return {
    current: current?.prayer ?? null,
    currentLabel: current?.label ?? null,
    next: next?.prayer ?? null,
    nextLabel: next?.label ?? null,
    nextTimeMs: nextTime ? nextTime.getTime() : null,
    nextTime,
    nextIsTomorrow,
    startMs: startTime ? startTime.getTime() : null,
  };
}

/** Sunrise / sunset / moonrise / moonset that fall on the given local day. */
function computeSkyEvents(latitude, longitude, dayStartMs) {
  try {
    const observer = new Observer(latitude, longitude, 0);
    const start = new Date(dayStartMs);
    const dayEndMs = new Date(
      start.getFullYear(),
      start.getMonth(),
      start.getDate() + 1,
    ).getTime();
    const startTime = MakeTime(start);

    const find = (body, direction) => {
      const date = SearchRiseSet(
        body,
        observer,
        direction,
        startTime,
        1.5,
      )?.date;
      const ms = date?.getTime?.();
      return ms != null && ms >= dayStartMs && ms < dayEndMs ? date : null;
    };

    return {
      sunrise: find(Body.Sun, +1),
      sunset: find(Body.Sun, -1),
      moonrise: find(Body.Moon, +1),
      moonset: find(Body.Moon, -1),
    };
  } catch {
    return EMPTY_SKY_EVENTS;
  }
}

function computeMoonState(latitude, nowMs) {
  try {
    const time = MakeTime(new Date(nowMs));
    const illum = Illumination(Body.Moon, time);
    const fraction = illum.phase_fraction ?? illum.phaseFraction ?? 0;
    const phaseDeg = MoonPhase(time);
    return {
      moonFraction: fraction,
      moonLabel: moonPhaseLabel(phaseDeg),
      moonWaxing: phaseDeg < 180,
      southern: latitude < 0,
    };
  } catch {
    return EMPTY_MOON;
  }
}

/* ───────────────────────── heading pipeline (JS) ───────────────────── */

/**
 * One-Euro filter on a circular quantity (degrees). Heavy smoothing when the
 * phone is still, light smoothing when it is turning – so no jitter and no lag.
 */
function createHeadingFilter() {
  let value = null;
  let lastRaw = null;
  let lastAt = 0;
  let rate = 0;

  const alpha = (cutoffHz, dtSec) => {
    const tau = 1 / (2 * Math.PI * cutoffHz);
    return 1 / (1 + tau / dtSec);
  };

  return {
    reset() {
      value = null;
      lastRaw = null;
      lastAt = 0;
      rate = 0;
    },
    update(raw, nowMs, lowAccuracy) {
      if (value == null) {
        value = raw;
        lastRaw = raw;
        lastAt = nowMs;
        rate = 0;
        return value;
      }
      const dt = clamp((nowMs - lastAt) / 1000, 0.008, 0.5);
      const instantRate = shortestSignedDelta(lastRaw, raw) / dt;
      lastRaw = raw;
      lastAt = nowMs;
      rate += alpha(FILTER.derivativeCutoff, dt) * (instantRate - rate);
      const cutoff =
        (lowAccuracy ? FILTER.minCutoffLowAccuracy : FILTER.minCutoff) +
        FILTER.beta * Math.abs(rate);
      value = normalizeDegrees(
        value + alpha(cutoff, dt) * shortestSignedDelta(value, raw),
      );
      return value;
    },
  };
}

/* Tiny external store: only components that need the heading subscribe. */
const INITIAL_COMPASS_STATE = { heading: null, aligned: false };

function createCompassStore() {
  let state = INITIAL_COMPASS_STATE;
  const listeners = new Set();
  return {
    getState: () => state,
    setState(patch) {
      let changed = false;
      for (const key of Object.keys(patch)) {
        if (state[key] !== patch[key]) {
          changed = true;
          break;
        }
      }
      if (!changed) return;
      state = { ...state, ...patch };
      listeners.forEach((listener) => listener());
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

const selectHeading = (s) => s.heading;
const selectAligned = (s) => s.aligned;

function useCompassValue(store, selector) {
  const getSnapshot = () => selector(store.getState());
  return useSyncExternalStore(store.subscribe, getSnapshot, getSnapshot);
}

const fireSuccessHaptic = () => {
  if (Platform.OS === "web") return;
  try {
    Promise.resolve(
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
    ).catch(() => {});
  } catch {
    // Haptics are a nicety – never let them break the compass.
  }
};

/**
 * Turns raw sensor readings into: (a) a smooth target for the UI thread,
 * (b) a throttled integer for the readout, (c) alignment state + haptics.
 */
function createHeadingPipeline({
  store,
  targetSV,
  snapSV,
  onAccuracy,
  onMode,
  onFirstReading,
}) {
  const filter = createHeadingFilter();

  let running = false;
  let startedAt = 0;
  let qibla = null;
  let accuracy = null;
  let mode = null;
  let gotReading = false;
  let lastHeading = null;
  let lastReadingAt = 0;

  let shown = null;
  let shownAt = 0;
  let pendingShown = null;
  let shownTimer = null;

  let hapticBaselineSet = false;
  let hapticLatched = false;
  let hapticTimer = null;

  const clearShownTimer = () => {
    if (shownTimer) clearTimeout(shownTimer);
    shownTimer = null;
    pendingShown = null;
  };
  const clearHapticTimer = () => {
    if (hapticTimer) clearTimeout(hapticTimer);
    hapticTimer = null;
  };

  // True north when available; magnetic north only after a short grace period.
  const resolveHeading = (reading, now) => {
    const trueHeading = reading?.trueHeading;
    const magHeading = reading?.magHeading;
    if (Number.isFinite(trueHeading) && trueHeading >= 0) {
      return { value: trueHeading, mode: "true" };
    }
    if (
      Number.isFinite(magHeading) &&
      magHeading >= 0 &&
      now - startedAt >= TRUE_HEADING_GRACE_MS
    ) {
      return { value: magHeading, mode: "magnetic" };
    }
    return null;
  };

  const commitShown = (rounded, now) => {
    shown = rounded;
    shownAt = now;
    pendingShown = null;
    store.setState({ heading: rounded });
  };

  // Leading + trailing throttle so the last value is never dropped.
  const showHeading = (deg, now) => {
    if (
      shown != null &&
      Math.abs(shortestSignedDelta(shown, deg)) < DISPLAY_HYSTERESIS_DEG
    ) {
      pendingShown = null;
      return;
    }
    const rounded = Math.round(deg) % 360;
    if (rounded === shown) {
      pendingShown = null;
      return;
    }
    const elapsed = now - shownAt;
    if (shown == null || elapsed >= HEADING_UI_INTERVAL_MS) {
      commitShown(rounded, now);
      return;
    }
    pendingShown = rounded;
    if (!shownTimer) {
      shownTimer = setTimeout(() => {
        shownTimer = null;
        if (running && pendingShown != null && pendingShown !== shown) {
          commitShown(pendingShown, Date.now());
        }
      }, HEADING_UI_INTERVAL_MS - elapsed);
    }
  };

  const evaluateHaptics = (delta) => {
    if (!hapticBaselineSet) {
      // Don't buzz for a phone that is already aligned when the screen opens.
      hapticBaselineSet = true;
      hapticLatched = delta <= HAPTIC_ENTER_DEG;
      return;
    }
    if (delta > HAPTIC_EXIT_DEG) {
      hapticLatched = false;
      clearHapticTimer();
      return;
    }
    if (accuracy == null || accuracy < HAPTIC_MIN_ACCURACY) {
      if (hapticTimer) {
        clearHapticTimer();
        hapticLatched = false;
      }
      return;
    }
    if (delta > HAPTIC_ENTER_DEG || hapticLatched || Platform.OS === "web") {
      return;
    }

    hapticLatched = true;
    hapticTimer = setTimeout(() => {
      hapticTimer = null;
      const stillAligned =
        running &&
        qibla != null &&
        lastHeading != null &&
        accuracy != null &&
        accuracy >= HAPTIC_MIN_ACCURACY &&
        Date.now() - lastReadingAt <= 1000 &&
        Math.abs(shortestSignedDelta(lastHeading, qibla)) <= HAPTIC_ENTER_DEG;
      if (stillAligned) fireSuccessHaptic();
      else hapticLatched = false;
    }, HAPTIC_DWELL_MS);
  };

  const evaluate = (headingDeg) => {
    if (qibla == null) return;
    const delta = Math.abs(shortestSignedDelta(headingDeg, qibla));
    const wasAligned = store.getState().aligned;
    store.setState({
      aligned: wasAligned ? delta <= ALIGN_EXIT_DEG : delta <= ALIGN_ENTER_DEG,
    });
    evaluateHaptics(delta);
  };

  return {
    start() {
      running = true;
      startedAt = Date.now();
      filter.reset();
      gotReading = false;
      lastHeading = null;
      hapticBaselineSet = false;
      hapticLatched = false;
      clearHapticTimer();
      clearShownTimer();
    },
    stop() {
      running = false;
      clearHapticTimer();
      clearShownTimer();
    },
    hasReading: () => gotReading,
    setQibla(value) {
      qibla = value;
      if (running && lastHeading != null) evaluate(lastHeading);
    },
    push(reading) {
      if (!running) return;
      const now = Date.now();
      const resolved = resolveHeading(reading, now);
      if (!resolved) return;

      const nextAccuracy = Number.isFinite(reading.accuracy)
        ? reading.accuracy
        : null;
      if (nextAccuracy !== accuracy) {
        accuracy = nextAccuracy;
        onAccuracy(nextAccuracy);
      }
      if (resolved.mode !== mode) {
        mode = resolved.mode;
        onMode(mode);
      }

      const isFirst = !gotReading;
      const filtered = filter.update(
        normalizeDegrees(resolved.value),
        now,
        accuracy != null && accuracy < 2,
      );
      lastHeading = filtered;
      lastReadingAt = now;

      // Target first, then snap flag: the first reading must not animate.
      targetSV.set(filtered);
      if (isFirst) {
        snapSV.set(1);
        gotReading = true;
        onFirstReading();
      }

      showHeading(filtered, now);
      evaluate(filtered);
    },
  };
}

/* ───────────────────────── screen-level hooks ──────────────────────── */

const ActiveContext = createContext(true);

/** True while the screen is focused and the app is not in the background. */
function useScreenActive() {
  const [focused, setFocused] = useState(true);
  const [appActive, setAppActive] = useState(
    AppState.currentState !== "background",
  );

  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      setAppActive(state !== "background");
    });
    return () => sub.remove();
  }, []);

  return focused && appActive;
}

/** Re-renders only its caller, only while the screen is active. */
function useClock(intervalMs) {
  const active = useContext(ActiveContext);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return undefined;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [active, intervalMs]);
  return now;
}

const readTimeStamp = () => {
  const now = new Date();
  return {
    dayStartMs: new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    ).getTime(),
    moonBucket: Math.floor(now.getTime() / MOON_BUCKET_MS),
  };
};

/** Local-day + 15-minute buckets. State only changes when a bucket changes. */
function useTimeStamp(active) {
  const [stamp, setStamp] = useState(readTimeStamp);
  useEffect(() => {
    if (!active) return undefined;
    const refresh = () =>
      setStamp((prev) => {
        const next = readTimeStamp();
        return next.dayStartMs === prev.dayStartMs &&
          next.moonBucket === prev.moonBucket
          ? prev
          : next;
      });
    refresh();
    const id = setInterval(refresh, 30_000);
    return () => clearInterval(id);
  }, [active]);
  return stamp;
}

/** Current / next prayer; re-derives exactly when the next prayer starts. */
function usePrayerPhase(schedule, active) {
  const [nowMs, setNowMs] = useState(() => Date.now());

  const phase = useMemo(
    () => (schedule ? derivePrayerPhase(schedule, nowMs) : null),
    [schedule, nowMs],
  );
  const boundary = phase?.nextTimeMs ?? null;

  useEffect(() => {
    if (active) setNowMs(Date.now());
  }, [active]);

  useEffect(() => {
    if (!active || boundary == null) return undefined;
    const wait = clamp(boundary - Date.now() + 300, 500, 2 ** 31 - 1);
    const id = setTimeout(() => setNowMs(Date.now()), wait);
    return () => clearTimeout(id);
  }, [active, boundary]);

  return phase;
}

/** Eases the displayed heading toward the target on the UI thread, per frame. */
function useHeadingSmoothing({ headingSV, targetSV, snapSV, active }) {
  const frame = useFrameCallback((info) => {
    "worklet";
    if (snapSV.get() === 1) {
      snapSV.set(0);
      headingSV.set(targetSV.get());
      return;
    }
    const current = headingSV.get();
    const dt = Math.min(
      64,
      info.timeSincePreviousFrame == null ? 16 : info.timeSincePreviousFrame,
    );
    const next = stepVisualHeading(current, targetSV.get(), dt);
    if (next !== current) headingSV.set(next);
  }, false);

  useEffect(() => {
    frame.setActive(active);
    return () => frame.setActive(false);
  }, [frame, active]);
}

/** City name, geocoded only when the position moves by roughly a kilometre. */
function useCityName(location) {
  const [cityName, setCityName] = useState(null);
  const resolvedKeyRef = useRef(null);
  const lat = location ? Math.round(location.latitude * 100) / 100 : null;
  const lon = location ? Math.round(location.longitude * 100) / 100 : null;

  useEffect(() => {
    if (lat == null || lon == null) return undefined;
    const key = `${lat},${lon}`;
    if (key === resolvedKeyRef.current) return undefined;

    let cancelled = false;
    Location.reverseGeocodeAsync({ latitude: lat, longitude: lon })
      .then((places) => {
        if (cancelled) return;
        resolvedKeyRef.current = key;
        setCityName(getCityName(places?.[0]));
      })
      .catch(() => {
        if (!cancelled) setCityName(null);
      });
    return () => {
      cancelled = true;
    };
  }, [lat, lon]);

  return cityName;
}

/**
 * Permission → heading subscription + location (in parallel) with cached
 * position, timeout, last-known fallback, and a full refresh after the app
 * has been in the background.
 */
function useQiblaSensors({ store, targetSV, snapSV, qiblaSV }) {
  const [location, setLocation] = useState(null);
  const [locationStatus, setLocationStatus] = useState("loading");
  const [canAskAgain, setCanAskAgain] = useState(true);
  const [hasHeading, setHasHeading] = useState(false);
  const [headingAccuracy, setHeadingAccuracy] = useState(null);
  const [headingMode, setHeadingMode] = useState("true");
  const [headingUnavailable, setHeadingUnavailable] = useState(false);
  const [retryToken, setRetryToken] = useState(0);

  const locationRef = useRef(null);
  useEffect(() => {
    locationRef.current = location;
  }, [location]);

  const pipelineRef = useRef(null);
  if (pipelineRef.current === null) {
    pipelineRef.current = createHeadingPipeline({
      store,
      targetSV,
      snapSV,
      onAccuracy: setHeadingAccuracy,
      onMode: setHeadingMode,
      onFirstReading: () => {
        setHasHeading(true);
        setHeadingUnavailable(false);
      },
    });
  }

  const qiblaBearing = useMemo(
    () =>
      location
        ? Math.round(
            getQiblaBearing(location.latitude, location.longitude) * 100,
          ) / 100
        : null,
    [location],
  );

  useLayoutEffect(() => {
    if (qiblaBearing != null) qiblaSV.set(qiblaBearing);
    pipelineRef.current.setQibla(qiblaBearing);
  }, [qiblaBearing, qiblaSV]);

  useFocusEffect(
    useCallback(() => {
      const pipeline = pipelineRef.current;
      let cancelled = false;
      let headingSub = null;
      let noHeadingTimer = null;
      let backgroundedAt = null;

      pipeline.start();
      setHeadingUnavailable(false);
      setLocationStatus(locationRef.current ? "refreshing" : "loading");

      const applyLocation = (coords) => {
        const next = {
          latitude: coords.latitude,
          longitude: coords.longitude,
          accuracy: coords.accuracy,
        };
        setLocation((prev) =>
          prev &&
          prev.latitude === next.latitude &&
          prev.longitude === next.longitude &&
          prev.accuracy === next.accuracy
            ? prev
            : next,
        );
      };

      const startHeading = async () => {
        if (Platform.OS === "web") {
          setHeadingUnavailable(true);
          return;
        }
        try {
          const sub = await Location.watchHeadingAsync((reading) => {
            if (!cancelled) pipeline.push(reading);
          });
          if (cancelled) {
            sub.remove();
            return;
          }
          headingSub = sub;
          noHeadingTimer = setTimeout(() => {
            if (!cancelled && !pipeline.hasReading()) {
              setHeadingUnavailable(true);
            }
          }, NO_HEADING_TIMEOUT_MS);
        } catch (error) {
          warn("Failed to start heading updates:", error);
          if (!cancelled) setHeadingUnavailable(true);
        }
      };

      const fetchPosition = async () => {
        try {
          return await withTimeout(
            Location.getCurrentPositionAsync({
              accuracy: Location.Accuracy.Balanced,
            }),
            LOCATION_TIMEOUT_MS,
            "Location request timed out",
          );
        } catch (error) {
          const fallback = await Location.getLastKnownPositionAsync({
            maxAge: FALLBACK_LOCATION_MAX_AGE_MS,
          }).catch(() => null);
          if (fallback && isValidLocation(fallback.coords)) return fallback;
          throw error;
        }
      };

      const run = async () => {
        let hasUsableLocation = locationRef.current != null;
        try {
          const permission = await Location.requestForegroundPermissionsAsync();
          if (cancelled) return;
          setCanAskAgain(permission.canAskAgain);

          if (!permission.granted) {
            setLocation(null);
            setLocationStatus("permission");
            return;
          }

          startHeading();

          if (!hasUsableLocation) {
            let cached = null;
            try {
              cached = await Location.getLastKnownPositionAsync({
                maxAge: CACHED_LOCATION_MAX_AGE_MS,
                requiredAccuracy: 1000,
              });
            } catch (error) {
              warn("Failed to read cached Qibla location:", error);
            }
            if (cancelled) return;
            if (cached && isValidLocation(cached.coords)) {
              hasUsableLocation = true;
              applyLocation(cached.coords);
              setLocationStatus("refreshing");
            }
          }

          const servicesEnabled = await Location.hasServicesEnabledAsync();
          if (cancelled) return;
          if (!servicesEnabled) {
            setLocationStatus(hasUsableLocation ? "ready" : "error");
            return;
          }

          const position = await fetchPosition();
          if (cancelled) return;
          if (!isValidLocation(position.coords)) {
            throw new Error("Invalid location coordinates");
          }
          hasUsableLocation = true;
          applyLocation(position.coords);
          setLocationStatus("ready");
        } catch (error) {
          warn("Failed to update Qibla location:", error);
          if (!cancelled) {
            setLocationStatus(hasUsableLocation ? "ready" : "error");
          }
        }
      };

      run();

      // Sensors can go stale after a long time in the background: restart.
      const appStateSub = AppState.addEventListener("change", (state) => {
        if (state === "background") {
          backgroundedAt = Date.now();
        } else if (state === "active" && backgroundedAt != null) {
          const away = Date.now() - backgroundedAt;
          backgroundedAt = null;
          if (away >= RESUME_REFRESH_AFTER_MS) setRetryToken((v) => v + 1);
        }
      });

      return () => {
        cancelled = true;
        appStateSub.remove();
        headingSub?.remove();
        if (noHeadingTimer) clearTimeout(noHeadingTimer);
        pipeline.stop();
      };
    }, [retryToken]),
  );

  const retry = useCallback(() => setRetryToken((v) => v + 1), []);

  return {
    location,
    qiblaBearing,
    locationStatus,
    canAskAgain,
    hasHeading,
    headingAccuracy,
    headingMode,
    headingUnavailable,
    retry,
  };
}

/* ───────────────────────────── compass ─────────────────────────────── */

const CompassRing = memo(({ size, headingSV, qiblaAngle, dial }) => {
  const spin = useAnimatedStyle(() => ({
    transform: [{ rotate: `${-headingSV.get()}deg` }],
  }));

  const c = size / 2;
  const outerR = c - 6;
  const tickOuter = c - 16;
  const innerMajor = c - 36;
  const innerMid = c - 28;
  const innerMinor = c - 24;
  const hairlineR = c - 42;
  const labelR = c - 52;
  const markerR = c - 76;

  const ticks = useMemo(
    () =>
      TICKS.map((i) => {
        const angle = (i * 5 * Math.PI) / 180;
        const major = i % 6 === 0;
        const mid = i % 3 === 0;
        const inner = major ? innerMajor : mid ? innerMid : innerMinor;
        return {
          key: i,
          x1: c + Math.sin(angle) * inner,
          y1: c - Math.cos(angle) * inner,
          x2: c + Math.sin(angle) * tickOuter,
          y2: c - Math.cos(angle) * tickOuter,
          stroke: major ? dial.tickMajor : dial.tick,
          width: major ? 2.4 : mid ? 1.4 : 1,
        };
      }),
    [c, tickOuter, innerMajor, innerMid, innerMinor, dial],
  );

  return (
    <Animated.View
      style={[
        StyleSheet.absoluteFill,
        styles.centerContent,
        styles.passive,
        spin,
      ]}
    >
      <Svg width={size} height={size}>
        <Circle
          cx={c}
          cy={c}
          r={outerR}
          stroke={dial.rim}
          strokeWidth={1.5}
          fill="none"
        />
        <Circle
          cx={c}
          cy={c}
          r={hairlineR}
          stroke={dial.rim}
          strokeWidth={1}
          opacity={0.65}
          fill="none"
        />
        {ticks.map((t) => (
          <Line
            key={t.key}
            x1={t.x1}
            y1={t.y1}
            x2={t.x2}
            y2={t.y2}
            stroke={t.stroke}
            strokeWidth={t.width}
            strokeLinecap="round"
          />
        ))}
        {DEGREE_LABELS.map((deg) => (
          <SvgText
            key={deg}
            x={c}
            y={c - labelR + 4}
            transform={`rotate(${deg} ${c} ${c})`}
            fill={dial.label}
            fontSize={10}
            fontWeight="600"
            textAnchor="middle"
            opacity={0.8}
          >
            {deg}
          </SvgText>
        ))}
        {CARDINALS.map(({ deg, label, primary }) => (
          <SvgText
            key={label}
            x={c}
            y={c - labelR + 6}
            transform={`rotate(${deg} ${c} ${c})`}
            fill={primary ? dial.gold : dial.label}
            fontSize={primary ? 18 : 14}
            fontWeight={primary ? "800" : "700"}
            textAnchor="middle"
          >
            {label}
          </SvgText>
        ))}
        {qiblaAngle != null && (
          <G rotation={qiblaAngle} origin={`${c}, ${c}`}>
            <Circle
              cx={c}
              cy={c - markerR}
              r={18}
              fill={dial.gold}
              opacity={0.12}
            />
            <Rect
              x={c - 11}
              y={c - markerR - 11}
              width={22}
              height={22}
              rx={5}
              fill="#0c1211"
              stroke={dial.gold}
              strokeOpacity={0.5}
              strokeWidth={1.2}
            />
            <Rect
              x={c - 11}
              y={c - markerR - 5}
              width={22}
              height={5}
              fill={dial.gold}
            />
          </G>
        )}
      </Svg>
    </Animated.View>
  );
});
CompassRing.displayName = "CompassRing";

const QiblaNeedle = memo(({ size, headingSV, qiblaSV, dial, store }) => {
  const isAligned = useCompassValue(store, selectAligned);
  const spin = useAnimatedStyle(() => ({
    transform: [{ rotate: `${qiblaSV.get() - headingSV.get()}deg` }],
  }));
  const c = size / 2;
  const len = c - 80;
  const tail = len * 0.36;
  const needleColor = isAligned ? dial.aligned : dial.needle;

  return (
    <Animated.View
      entering={FadeIn.duration(280)}
      style={[
        StyleSheet.absoluteFill,
        styles.centerContent,
        styles.passive,
        spin,
      ]}
    >
      <Svg width={size} height={size}>
        <Path
          d={`M ${c} ${c - len} L ${c + 7.5} ${c} L ${c - 7.5} ${c} Z`}
          fill={needleColor}
        />
        <Path
          d={`M ${c} ${c + tail} L ${c + 5.5} ${c} L ${c - 5.5} ${c} Z`}
          fill={dial.tail}
        />
        <Circle
          cx={c}
          cy={c}
          r={11}
          fill={dial.face}
          stroke={dial.rim}
          strokeWidth={1.5}
        />
        <Circle cx={c} cy={c} r={5} fill={dial.gold} />
      </Svg>
    </Animated.View>
  );
});
QiblaNeedle.displayName = "QiblaNeedle";

const AlignmentHalo = memo(({ size, store, dial }) => {
  const active = useContext(ActiveContext);
  const isAligned = useCompassValue(store, selectAligned);
  const pulse = useSharedValue(0);
  const pulsing = isAligned && active;

  useEffect(() => {
    if (pulsing) {
      pulse.set(
        withRepeat(
          withSequence(
            withTiming(1, { duration: 700, easing: Easing.inOut(Easing.quad) }),
            withTiming(0.4, {
              duration: 700,
              easing: Easing.inOut(Easing.quad),
            }),
          ),
          -1,
          false,
        ),
      );
    } else {
      cancelAnimation(pulse);
      pulse.set(withTiming(0, { duration: 200 }));
    }
    return () => cancelAnimation(pulse);
  }, [pulsing, pulse]);

  const glowStyle = useAnimatedStyle(() => ({ opacity: pulse.get() * 0.14 }));
  const ringStyle = useAnimatedStyle(() => ({ opacity: pulse.get() }));

  return (
    <>
      <Animated.View
        style={[
          styles.halo,
          {
            width: size + 44,
            height: size + 44,
            borderRadius: (size + 44) / 2,
            backgroundColor: dial.aligned,
          },
          glowStyle,
        ]}
      />
      <Animated.View
        style={[
          styles.halo,
          styles.haloRing,
          {
            width: size + 14,
            height: size + 14,
            borderRadius: (size + 14) / 2,
            borderColor: dial.aligned,
          },
          ringStyle,
        ]}
      />
    </>
  );
});
AlignmentHalo.displayName = "AlignmentHalo";

const TopPointer = memo(({ color }) => (
  <View style={styles.topPointerWrap}>
    <View style={[styles.topPointer, { borderTopColor: color }]} />
  </View>
));
TopPointer.displayName = "TopPointer";

const CompassDial = memo(
  ({ size, headingSV, qiblaSV, qiblaBearing, dial, store, t }) => (
    <Animated.View
      entering={FadeInDown.delay(40).duration(420)}
      style={[styles.dialStage, { width: size, height: size }]}
      accessible
      accessibilityRole="image"
      accessibilityLabel={
        qiblaBearing === null
          ? t("Waiting for compass...")
          : `${t("Qibla bearing")} ${Math.round(qiblaBearing)}°`
      }
    >
      <AlignmentHalo size={size} store={store} dial={dial} />
      <View
        style={[
          StyleSheet.absoluteFill,
          styles.bezel,
          {
            borderRadius: size / 2,
            backgroundColor: dial.face,
            borderColor: dial.rim,
          },
        ]}
      />
      <CompassRing
        size={size}
        headingSV={headingSV}
        qiblaAngle={qiblaBearing}
        dial={dial}
      />
      {qiblaBearing != null && (
        <QiblaNeedle
          size={size}
          headingSV={headingSV}
          qiblaSV={qiblaSV}
          dial={dial}
          store={store}
        />
      )}
      <TopPointer color={dial.gold} />
    </Animated.View>
  ),
);
CompassDial.displayName = "CompassDial";

/* ───────────────────────────── UI pieces ───────────────────────────── */

const FloatingHeader = memo(
  ({ topInset, title, subtitle, busy, onBack, onRefresh, colors, t }) => (
    <View style={[styles.floatingHeader, { paddingTop: topInset + 8 }]}>
      <View style={styles.floatingHeaderRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("Back")}
          hitSlop={8}
          onPress={onBack}
          style={[
            styles.headerPill,
            {
              backgroundColor: colors.surface,
              borderColor: colors.outlineVariant,
            },
          ]}
        >
          <Icon source="arrow-left" size={20} color={colors.onSurface} />
        </Pressable>

        <View
          style={[
            styles.headerTitlePill,
            {
              backgroundColor: colors.surface,
              borderColor: colors.outlineVariant,
            },
          ]}
        >
          <Text
            style={[styles.headerTitle, { color: colors.onSurface }]}
            numberOfLines={1}
          >
            {title}
          </Text>
          <Text
            style={[styles.headerCity, { color: colors.onSurfaceVariant }]}
            numberOfLines={1}
          >
            {subtitle}
          </Text>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("Refresh location")}
          accessibilityState={{ busy, disabled: busy }}
          disabled={busy}
          hitSlop={8}
          onPress={onRefresh}
          style={[
            styles.headerPill,
            {
              backgroundColor: colors.surface,
              borderColor: colors.outlineVariant,
            },
          ]}
        >
          {busy ? (
            <ActivityIndicator size="small" color={colors.onSurface} />
          ) : (
            <Icon source="refresh" size={20} color={colors.onSurface} />
          )}
        </Pressable>
      </View>
    </View>
  ),
);
FloatingHeader.displayName = "FloatingHeader";

const StatChip = memo(({ icon, label, value, colors }) => (
  <View style={styles.statChip}>
    <View
      style={[
        styles.statIconWrap,
        { backgroundColor: colors.surfaceVariant || "#eef2f1" },
      ]}
    >
      <Icon source={icon} size={15} color={colors.primary} />
    </View>
    <Text style={[styles.statValue, { color: colors.onSurface }]}>{value}</Text>
    <Text style={[styles.statLabel, { color: colors.onSurfaceVariant }]}>
      {label}
    </Text>
  </View>
));
StatChip.displayName = "StatChip";

const HeadingReadout = memo(({ store, qiblaBearing, dial, colors, t }) => {
  const heading = useCompassValue(store, selectHeading);
  const isAligned = useCompassValue(store, selectAligned);
  const headingColor = isAligned ? dial.aligned : colors.onSurface;

  return (
    <View style={styles.readout}>
      <View style={styles.readoutRow}>
        <Text style={[styles.readoutValue, { color: headingColor }]}>
          {heading === null ? "–––" : heading}
          <Text style={[styles.readoutUnit, { color: headingColor }]}>°</Text>
        </Text>
        <View
          style={[
            styles.cardinalBadge,
            {
              backgroundColor: isAligned
                ? `${dial.aligned}18`
                : colors.surfaceVariant || "#eef2f1",
            },
          ]}
        >
          <Text
            style={[
              styles.cardinalText,
              { color: isAligned ? dial.aligned : colors.onSurface },
            ]}
          >
            {heading === null ? "—" : cardinalOf(heading)}
          </Text>
        </View>
      </View>
      <Text style={[styles.readoutCaption, { color: colors.onSurfaceVariant }]}>
        {qiblaBearing === null
          ? t("Waiting for location...")
          : t("Qibla bearing from true north", {
              bearing: Math.round(qiblaBearing),
            })}
      </Text>
    </View>
  );
});
HeadingReadout.displayName = "HeadingReadout";

const GuidancePill = memo(({ store, qiblaBearing, dial, colors, t }) => {
  const heading = useCompassValue(store, selectHeading);
  const isAligned = useCompassValue(store, selectAligned);

  const tRef = useRef(t);
  useEffect(() => {
    tRef.current = t;
  }, [t]);

  // Announce alignment once for screen-reader users (not every degree).
  useEffect(() => {
    if (isAligned) {
      AccessibilityInfo.announceForAccessibility(
        tRef.current("You are facing the Qibla"),
      );
    }
  }, [isAligned]);

  if (qiblaBearing == null || heading == null) return null;

  const delta = shortestSignedDelta(heading, qiblaBearing);
  const icon = isAligned
    ? "check-decagram-outline"
    : delta > 0
      ? "rotate-right"
      : "rotate-left";
  const text = isAligned
    ? t("You are facing the Qibla")
    : `${delta > 0 ? t("Turn right") : t("Turn left")} · ${Math.round(Math.abs(delta))}°`;

  return (
    <View
      style={[
        styles.guidance,
        {
          backgroundColor: isAligned ? `${dial.aligned}14` : colors.surface,
          borderColor: isAligned ? dial.aligned : colors.outlineVariant,
        },
      ]}
    >
      <Icon
        source={icon}
        size={18}
        color={isAligned ? dial.aligned : colors.onSurfaceVariant}
      />
      <Text
        style={[
          styles.guidanceText,
          { color: isAligned ? dial.aligned : colors.onSurface },
        ]}
      >
        {text}
      </Text>
    </View>
  );
});
GuidancePill.displayName = "GuidancePill";

const StatusCard = memo(({ status, colors, actionLabel, onAction }) => {
  const toneColor =
    status.tone === "error"
      ? colors.error || "#dc2626"
      : status.tone === "warn"
        ? "#b45309"
        : status.tone === "muted"
          ? colors.onSurfaceVariant
          : colors.primary;

  return (
    <Animated.View
      entering={FadeInDown.duration(300)}
      style={[
        styles.statusCard,
        {
          backgroundColor: colors.surface,
          borderColor: colors.outlineVariant,
        },
      ]}
    >
      <View style={styles.statusRow}>
        <View
          style={[styles.statusIconWrap, { backgroundColor: `${toneColor}18` }]}
        >
          <Icon source={status.icon} size={20} color={toneColor} />
        </View>
        <View style={styles.statusTexts}>
          <Text style={[styles.statusTitle, { color: colors.onSurface }]}>
            {status.title}
          </Text>
          {status.description ? (
            <Text
              style={[
                styles.statusDescription,
                { color: colors.onSurfaceVariant },
              ]}
            >
              {status.description}
            </Text>
          ) : null}
        </View>
        {status.busy && (
          <ActivityIndicator color={colors.primary} size="small" />
        )}
      </View>
      {status.action && (
        <Pressable
          accessibilityRole="button"
          onPress={onAction}
          style={({ pressed }) => [
            styles.actionButton,
            { backgroundColor: colors.primary, opacity: pressed ? 0.9 : 1 },
          ]}
        >
          <Text style={styles.actionText}>{actionLabel}</Text>
          <Icon
            source={Platform.OS === "ios" ? "chevron-right" : "arrow-right"}
            size={18}
            color="#ffffff"
          />
        </Pressable>
      )}
    </Animated.View>
  );
});
StatusCard.displayName = "StatusCard";

const CountdownRing = memo(
  ({ progress, size, stroke, track, color, children }) => {
    const r = (size - stroke) / 2;
    const c = 2 * Math.PI * r;
    const offset = c * (1 - clamp(progress, 0, 1));

    return (
      <View style={[styles.ringBox, { width: size, height: size }]}>
        <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={track}
            strokeWidth={stroke}
            fill="none"
          />
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={color}
            strokeWidth={stroke}
            fill="none"
            strokeDasharray={`${c} ${c}`}
            strokeDashoffset={offset}
            strokeLinecap="round"
            rotation={-90}
            origin={`${size / 2}, ${size / 2}`}
          />
        </Svg>
        {children}
      </View>
    );
  },
);
CountdownRing.displayName = "CountdownRing";

// Owns its own 1 s clock, so only this card re-renders every second.
const NextPrayerCard = memo(({ phase, colors, dial, t }) => {
  const nowMs = useClock(1000);
  if (!phase?.nextLabel || phase.nextTimeMs == null) return null;

  const remain = Math.max(0, phase.nextTimeMs - nowMs);
  const span = phase.startMs != null ? phase.nextTimeMs - phase.startMs : 0;
  const progress = span > 0 ? clamp((nowMs - phase.startMs) / span, 0, 1) : 0;
  const clock = formatClock(phase.nextTime, t);

  return (
    <View
      style={[
        styles.nextCard,
        { backgroundColor: colors.surface, borderColor: colors.outlineVariant },
      ]}
    >
      <View style={styles.nextLeft}>
        <Text style={[styles.nextEyebrow, { color: colors.primary }]}>
          {phase.currentLabel
            ? `${t("Now")}: ${t(phase.currentLabel)}`
            : t("Next prayer")}
        </Text>
        <Text style={[styles.nextName, { color: colors.onSurface }]}>
          {t(phase.nextLabel)}
        </Text>
        <Text style={[styles.nextClock, { color: colors.onSurfaceVariant }]}>
          {phase.nextIsTomorrow ? `${t("Tomorrow")} · ${clock}` : clock}
        </Text>
      </View>
      <CountdownRing
        progress={progress}
        size={78}
        stroke={5}
        track={colors.surfaceVariant || "#e8eeec"}
        color={dial.aligned}
      >
        <Text style={[styles.countdownText, { color: dial.aligned }]}>
          {formatCountdown(remain)}
        </Text>
      </CountdownRing>
    </View>
  );
});
NextPrayerCard.displayName = "NextPrayerCard";

const PrayerStrip = memo(({ schedule, phase, colors, dial, t }) => {
  if (!schedule?.entries?.length) return null;
  return (
    <View
      style={[
        styles.prayerStrip,
        { backgroundColor: colors.surface, borderColor: colors.outlineVariant },
      ]}
    >
      <Text style={[styles.sectionTitle, { color: colors.onSurface }]}>
        {t("Today")}
      </Text>
      <View style={styles.prayerGrid}>
        {schedule.entries.map((p) => {
          const isNext =
            !!phase && !phase.nextIsTomorrow && p.prayer === phase.next;
          const isCurrent = !!phase && p.prayer === phase.current;
          const accent = isNext
            ? dial.aligned
            : isCurrent
              ? colors.primary
              : colors.onSurfaceVariant;
          return (
            <View
              key={p.key}
              style={[
                styles.prayerCell,
                isNext && {
                  backgroundColor: `${dial.aligned}12`,
                  borderColor: dial.aligned,
                },
                isCurrent &&
                  !isNext && {
                    backgroundColor: colors.surfaceVariant || "#eef2f1",
                    borderColor: colors.outlineVariant,
                  },
              ]}
            >
              <Icon source={p.icon} size={15} color={accent} />
              <Text style={[styles.prayerName, { color: accent }]}>
                {t(p.label)}
              </Text>
              <Text
                style={[
                  styles.prayerTime,
                  { color: isNext ? dial.aligned : colors.onSurface },
                ]}
              >
                {formatClock(p.time, t)}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
});
PrayerStrip.displayName = "PrayerStrip";

/**
 * Moon with the correct lit shape: a half-circle on the lit side plus an
 * elliptical terminator. Mirrored in the southern hemisphere.
 */
const MoonGlyph = memo(({ fraction, waxing, southern, size, color, track }) => {
  const f = clamp(fraction ?? 0, 0, 1);
  const cx = size / 2;
  const cy = size / 2;
  const R = size / 2 - 1;

  let lit = null;
  if (f > 0.985) {
    lit = <Circle cx={cx} cy={cy} r={R} fill={color} opacity={0.9} />;
  } else if (f > 0.015) {
    const litRight = waxing !== southern;
    const outerSweep = litRight ? 1 : 0;
    const innerSweep = f < 0.5 === litRight ? 0 : 1;
    const rx = R * Math.abs(1 - 2 * f);
    lit = (
      <Path
        d={`M ${cx} ${cy - R} A ${R} ${R} 0 0 ${outerSweep} ${cx} ${cy + R} A ${rx} ${R} 0 0 ${innerSweep} ${cx} ${cy - R} Z`}
        fill={color}
        opacity={0.9}
      />
    );
  }

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <Circle cx={cx} cy={cy} r={R} fill={track} />
        {lit}
        <Circle
          cx={cx}
          cy={cy}
          r={R}
          stroke={color}
          strokeWidth={1.5}
          fill="none"
          opacity={0.4}
        />
      </Svg>
    </View>
  );
});
MoonGlyph.displayName = "MoonGlyph";

const SunPathCard = memo(({ sky, colors, dial, t }) => {
  const nowMs = useClock(60_000);

  const sunriseMs = sky?.sunrise?.getTime() ?? 0;
  const sunsetMs = sky?.sunset?.getTime() ?? 0;
  const dayLengthMs = sunsetMs - sunriseMs;
  const valid = dayLengthMs > 0;
  const isDay = valid && nowMs >= sunriseMs && nowMs <= sunsetMs;
  const progress = valid ? clamp((nowMs - sunriseMs) / dayLengthMs, 0, 1) : 0;
  const remainingMs = isDay ? sunsetMs - nowMs : 0;

  const animatedProgress = useSharedValue(progress);
  useEffect(() => {
    animatedProgress.set(
      withTiming(progress, { duration: 900, easing: Easing.linear }),
    );
  }, [animatedProgress, progress]);

  const animatedMarkerProps = useAnimatedProps(() => {
    const p = animatedProgress.get();
    return {
      cx: 12 + p * (SUN_CHART_WIDTH - 24),
      cy: SUN_CHART_HEIGHT - 8 - 2 * p * (1 - p) * (SUN_CHART_HEIGHT - 16),
    };
  });

  if (!valid) return null;

  const dayH = Math.floor(dayLengthMs / 3_600_000);
  const dayM = Math.floor((dayLengthMs % 3_600_000) / 60_000);
  const remH = Math.floor(remainingMs / 3_600_000);
  const remM = Math.floor((remainingMs % 3_600_000) / 60_000);

  const W = SUN_CHART_WIDTH;
  const H = SUN_CHART_HEIGHT;
  const arc = `M 12 ${H - 8} Q ${W / 2} 8 ${W - 12} ${H - 8}`;

  return (
    <View
      style={[
        styles.sunCard,
        { backgroundColor: colors.surface, borderColor: colors.outlineVariant },
      ]}
    >
      <View style={styles.sunLabels}>
        <View>
          <Text style={[styles.sunLabel, { color: dial.gold }]}>
            {t("Sunrise")}
          </Text>
          <Text style={[styles.sunTime, { color: colors.onSurfaceVariant }]}>
            {formatClock(sky.sunrise, t)}
          </Text>
        </View>
        <View style={styles.sunEndpointRight}>
          <Text style={[styles.sunLabel, { color: "#dc2626" }]}>
            {t("Sunset")}
          </Text>
          <Text style={[styles.sunTime, { color: colors.onSurfaceVariant }]}>
            {formatClock(sky.sunset, t)}
          </Text>
        </View>
      </View>

      <View style={styles.sunArcWrap}>
        <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`}>
          <Defs>
            <LinearGradient id="skyFill" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0%" stopColor="#93c5fd" stopOpacity="0.35" />
              <Stop offset="100%" stopColor="#93c5fd" stopOpacity="0.02" />
            </LinearGradient>
          </Defs>
          <Path
            d={`${arc} L ${W - 12} ${H} L 12 ${H} Z`}
            fill="url(#skyFill)"
          />
          <Path
            d={arc}
            stroke={colors.outlineVariant}
            strokeWidth={1.5}
            fill="none"
            strokeLinecap="round"
          />
          <AnimatedCircle
            animatedProps={animatedMarkerProps}
            r={14}
            fill={dial.gold}
            opacity={isDay ? 0.18 : 0.06}
          />
          <AnimatedCircle
            animatedProps={animatedMarkerProps}
            r={9}
            fill={dial.gold}
            opacity={isDay ? 1 : 0.35}
          />
        </Svg>
      </View>

      <View style={styles.sunStats}>
        <Text style={[styles.sunStat, { color: colors.onSurfaceVariant }]}>
          {t("Day length")}:{" "}
          <Text style={{ color: colors.onSurface, fontWeight: "700" }}>
            {dayH}h {pad2(dayM)}m
          </Text>
        </Text>
        <Text style={[styles.sunStatCenter, { color: dial.gold }]}>
          {t("Noon")}
        </Text>
        <Text style={[styles.sunStat, { color: colors.onSurfaceVariant }]}>
          {t("Remaining")}:{" "}
          <Text style={{ color: colors.onSurface, fontWeight: "700" }}>
            {remH}h {pad2(remM)}m
          </Text>
        </Text>
      </View>
    </View>
  );
});
SunPathCard.displayName = "SunPathCard";

const SkyCard = memo(({ sky, colors, dial, t }) => {
  if (!sky) return null;
  const items = [
    { icon: "weather-sunset-up", label: "Sunrise", time: sky.sunrise },
    { icon: "weather-sunset", label: "Sunset", time: sky.sunset },
    { icon: "moon-waxing-crescent", label: "Moonrise", time: sky.moonrise },
    { icon: "moon-waning-crescent", label: "Moonset", time: sky.moonset },
  ];

  return (
    <View
      style={[
        styles.skyCard,
        { backgroundColor: colors.surface, borderColor: colors.outlineVariant },
      ]}
    >
      <View style={styles.skyMoon}>
        <MoonGlyph
          fraction={sky.moonFraction ?? 0}
          waxing={sky.moonWaxing}
          southern={sky.southern}
          size={52}
          color={dial.gold}
          track={colors.surfaceVariant || "#eef2f1"}
        />
        <View style={styles.skyMoonText}>
          <Text style={[styles.skyTitle, { color: colors.onSurface }]}>
            {t(sky.moonLabel ?? "Moon")}
          </Text>
          <Text style={[styles.skySub, { color: colors.onSurfaceVariant }]}>
            {sky.moonFraction != null
              ? `${Math.round(sky.moonFraction * 100)}% ${t("illuminated")}`
              : "—"}
          </Text>
        </View>
      </View>

      <View style={styles.skyGrid}>
        {items.map((item, index) => (
          <React.Fragment key={item.label}>
            {index > 0 && (
              <View
                style={[
                  styles.skyDivider,
                  { backgroundColor: colors.outlineVariant },
                ]}
              />
            )}
            <View style={styles.skyChip}>
              <Icon source={item.icon} size={15} color={dial.gold} />
              <Text
                style={[
                  styles.skyChipLabel,
                  { color: colors.onSurfaceVariant },
                ]}
              >
                {t(item.label)}
              </Text>
              <Text style={[styles.skyChipValue, { color: colors.onSurface }]}>
                {formatClock(item.time, t)}
              </Text>
            </View>
          </React.Fragment>
        ))}
      </View>
    </View>
  );
});
SkyCard.displayName = "SkyCard";

/* ───────────────────────────── main screen ─────────────────────────── */

const Qibla = () => {
  const theme = useTheme();
  const navigation = useNavigation();
  const router = useRouter();
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const active = useScreenActive();

  const colors = theme.colors;
  const dial = useMemo(
    () => (theme.dark ? DIAL_DARK : DIAL_LIGHT),
    [theme.dark],
  );
  const compassSize = Math.max(220, Math.min(width - 56, 300));

  useLayoutEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  // Heading plumbing: JS writes target, UI thread eases `headingSV` per frame.
  const [store] = useState(createCompassStore);
  const headingSV = useSharedValue(0);
  const targetSV = useSharedValue(0);
  const snapSV = useSharedValue(0);
  const qiblaSV = useSharedValue(0);
  useHeadingSmoothing({ headingSV, targetSV, snapSV, active });

  const {
    location,
    qiblaBearing,
    locationStatus,
    canAskAgain,
    hasHeading,
    headingAccuracy,
    headingMode,
    headingUnavailable,
    retry,
  } = useQiblaSensors({ store, targetSV, snapSV, qiblaSV });

  const cityName = useCityName(location);

  // ~110 m precision is plenty for sky / prayer maths and keeps memos stable.
  const lat = location ? Math.round(location.latitude * 1000) / 1000 : null;
  const lon = location ? Math.round(location.longitude * 1000) / 1000 : null;
  const stamp = useTimeStamp(active);

  const schedule = useMemo(() => {
    if (lat == null || lon == null) return null;
    try {
      return computePrayerSchedule(lat, lon, stamp.dayStartMs);
    } catch (error) {
      warn("Prayer calculation failed:", error);
      return null;
    }
  }, [lat, lon, stamp.dayStartMs]);
  const phase = usePrayerPhase(schedule, active);

  const skyEvents = useMemo(
    () =>
      lat == null || lon == null
        ? null
        : computeSkyEvents(lat, lon, stamp.dayStartMs),
    [lat, lon, stamp.dayStartMs],
  );
  const moon = useMemo(
    () =>
      lat == null
        ? null
        : computeMoonState(lat, stamp.moonBucket * MOON_BUCKET_MS),
    [lat, stamp.moonBucket],
  );
  const sky = useMemo(
    () => (skyEvents && moon ? { ...skyEvents, ...moon } : null),
    [skyEvents, moon],
  );
  const hasSunArc = !!(sky?.sunrise && sky?.sunset);

  const accuracyLabel =
    headingAccuracy === 3
      ? t("High")
      : headingAccuracy === 2
        ? t("Moderate")
        : headingAccuracy === 1
          ? t("Low")
          : headingAccuracy === 0
            ? t("Unreliable")
            : null;

  const handleBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace("/");
  }, [router]);

  const openSettings = useCallback(() => {
    Linking.openSettings().catch(() => {});
  }, []);

  const needsSettings = locationStatus === "permission" && !canAskAgain;
  const busy = locationStatus === "loading" || locationStatus === "refreshing";

  const status = useMemo(() => {
    if (locationStatus === "loading")
      return {
        icon: "map-marker-outline",
        title: t("Locating your position..."),
        busy: true,
        tone: "info",
      };
    if (locationStatus === "permission")
      return {
        icon: "map-marker-off-outline",
        title: t("Location permission is off"),
        description: t(
          "Location permission is needed to calculate the Qibla direction.",
        ),
        tone: "error",
        action: true,
      };
    if (locationStatus === "error")
      return {
        icon: "alert-circle-outline",
        title: t("Location unavailable"),
        description: t("Check that location services are on, then try again."),
        tone: "error",
        action: true,
      };
    if (headingUnavailable)
      return {
        icon: "compass-off-outline",
        title: t("Compass sensor unavailable on this device."),
        tone: "muted",
      };
    if (!hasHeading)
      return {
        icon: "compass-outline",
        title: t("Calibrating compass..."),
        description: t(
          "Move your phone in a figure-eight, away from metal or magnets.",
        ),
        busy: true,
        tone: "info",
      };
    if (headingAccuracy !== null && headingAccuracy <= 1)
      return {
        icon: "alert-outline",
        title: t("Compass accuracy is low"),
        description: t(
          "Move your phone in a figure-eight, away from metal or magnets.",
        ),
        tone: "warn",
      };
    if (headingMode === "magnetic")
      return {
        icon: "magnet",
        title: t("Using magnetic north"),
        description: t(
          "True north isn't available yet, so the direction may be off by a few degrees.",
        ),
        tone: "warn",
      };
    return null;
  }, [
    locationStatus,
    headingUnavailable,
    hasHeading,
    headingAccuracy,
    headingMode,
    t,
  ]);

  return (
    <ActiveContext.Provider value={active}>
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <FloatingHeader
          topInset={insets.top}
          title={t("Qibla Compass")}
          subtitle={
            cityName ||
            (location ? t("City unavailable") : t("Locating city..."))
          }
          busy={busy}
          onBack={handleBack}
          onRefresh={retry}
          colors={colors}
          t={t}
        />

        <ScrollView
          style={styles.container}
          contentContainerStyle={[
            styles.content,
            { paddingTop: insets.top + 78, paddingBottom: insets.bottom + 36 },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <CompassDial
            size={compassSize}
            headingSV={headingSV}
            qiblaSV={qiblaSV}
            qiblaBearing={qiblaBearing}
            dial={dial}
            store={store}
            t={t}
          />

          <Animated.View entering={FadeInDown.delay(80).duration(380)}>
            <HeadingReadout
              store={store}
              qiblaBearing={qiblaBearing}
              dial={dial}
              colors={colors}
              t={t}
            />
          </Animated.View>

          <Animated.View entering={FadeInDown.duration(240)}>
            <GuidancePill
              store={store}
              qiblaBearing={qiblaBearing}
              dial={dial}
              colors={colors}
              t={t}
            />
          </Animated.View>

          {status && (
            <StatusCard
              status={status}
              colors={colors}
              actionLabel={needsSettings ? t("Open settings") : t("Try again")}
              onAction={needsSettings ? openSettings : retry}
            />
          )}

          {hasSunArc && (
            <Animated.View
              entering={FadeInDown.delay(110).duration(400)}
              style={styles.blockFirst}
            >
              <SunPathCard sky={sky} colors={colors} dial={dial} t={t} />
            </Animated.View>
          )}

          {phase?.nextLabel && (
            <Animated.View
              entering={FadeInDown.delay(140).duration(380)}
              style={hasSunArc ? styles.block : styles.blockFirst}
            >
              <NextPrayerCard phase={phase} colors={colors} dial={dial} t={t} />
            </Animated.View>
          )}

          {schedule && (
            <Animated.View
              entering={FadeInDown.delay(170).duration(380)}
              style={styles.block}
            >
              <PrayerStrip
                schedule={schedule}
                phase={phase}
                colors={colors}
                dial={dial}
                t={t}
              />
            </Animated.View>
          )}

          {sky && (
            <Animated.View
              entering={FadeInDown.delay(200).duration(380)}
              style={styles.block}
            >
              <SkyCard sky={sky} colors={colors} dial={dial} t={t} />
            </Animated.View>
          )}

          <Animated.View
            entering={FadeInDown.delay(220).duration(380)}
            style={[
              styles.statsCard,
              {
                backgroundColor: colors.surface,
                borderColor: colors.outlineVariant,
              },
            ]}
          >
            <StatChip
              icon="mosque"
              label={t("Qibla")}
              value={
                qiblaBearing === null ? "—" : `${Math.round(qiblaBearing)}°`
              }
              colors={colors}
            />
            <View
              style={[
                styles.statDivider,
                { backgroundColor: colors.outlineVariant },
              ]}
            />
            <StatChip
              icon="map-marker-outline"
              label={t("GPS")}
              value={
                location?.accuracy != null
                  ? `±${Math.round(location.accuracy)} m`
                  : "—"
              }
              colors={colors}
            />
            <View
              style={[
                styles.statDivider,
                { backgroundColor: colors.outlineVariant },
              ]}
            />
            <StatChip
              icon="gauge"
              label={t("Sensor")}
              value={accuracyLabel ?? "—"}
              colors={colors}
            />
          </Animated.View>
        </ScrollView>
      </View>
    </ActiveContext.Provider>
  );
};

export default Qibla;

/* ─────────────────────────────── styles ────────────────────────────── */

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: {
    alignItems: "center",
    paddingHorizontal: 18,
  },
  passive: { pointerEvents: "none" },
  block: { width: "100%", marginTop: 12 },
  blockFirst: { width: "100%", marginTop: 22 },

  floatingHeader: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 30,
    paddingHorizontal: 14,
  },
  floatingHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerPill: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  headerTitlePill: {
    flex: 1,
    minHeight: 52,
    borderRadius: 26,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  headerTitle: {
    fontSize: 14,
    fontWeight: "800",
    letterSpacing: -0.2,
  },
  headerCity: {
    fontSize: 11.5,
    marginTop: 1,
  },

  dialStage: {
    alignItems: "center",
    justifyContent: "center",
    marginTop: 18,
    marginBottom: 14,
  },
  bezel: {
    borderWidth: 1.5,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
    elevation: 8,
  },
  centerContent: {
    alignItems: "center",
    justifyContent: "center",
  },
  halo: { position: "absolute", pointerEvents: "none" },
  haloRing: { borderWidth: 2.5 },
  topPointerWrap: {
    position: "absolute",
    top: -6,
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 4,
    elevation: 4,
    pointerEvents: "none",
  },
  topPointer: {
    width: 0,
    height: 0,
    borderLeftWidth: 9,
    borderRightWidth: 9,
    borderTopWidth: 14,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
  },

  readout: { alignItems: "center" },
  readoutRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  readoutValue: {
    fontSize: 52,
    fontWeight: "800",
    letterSpacing: -1.8,
    fontVariant: ["tabular-nums"],
  },
  readoutUnit: {
    fontSize: 21,
    fontWeight: "700",
  },
  cardinalBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  cardinalText: {
    fontSize: 14,
    fontWeight: "800",
    letterSpacing: 0.4,
  },
  readoutCaption: {
    fontSize: 13,
    marginTop: 4,
    textAlign: "center",
  },

  guidance: {
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 11,
    paddingHorizontal: 18,
    borderRadius: 999,
    borderWidth: 1,
    marginTop: 14,
  },
  guidanceText: {
    fontSize: 14,
    fontWeight: "700",
  },

  /* Sun path card */
  sunCard: {
    width: "100%",
    borderWidth: 1,
    borderRadius: 24,
    paddingTop: 16,
    paddingBottom: 14,
    paddingHorizontal: 16,
    overflow: "hidden",
  },
  sunLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 4,
    marginBottom: 2,
  },
  sunLabel: {
    fontSize: 13,
    fontWeight: "700",
  },
  sunTime: {
    fontSize: 12,
    marginTop: 2,
    fontVariant: ["tabular-nums"],
  },
  sunEndpointRight: {
    alignItems: "flex-end",
  },
  sunArcWrap: {
    height: 110,
    marginVertical: 4,
  },
  sunStats: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 6,
    paddingHorizontal: 2,
  },
  sunStat: {
    fontSize: 12.5,
  },
  sunStatCenter: {
    fontSize: 13,
    fontWeight: "800",
  },

  ringBox: {
    alignItems: "center",
    justifyContent: "center",
  },
  nextCard: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderRadius: 22,
    paddingVertical: 16,
    paddingHorizontal: 18,
  },
  nextLeft: {
    flex: 1,
    paddingRight: 14,
  },
  nextEyebrow: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  nextName: {
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: -0.3,
  },
  nextClock: {
    fontSize: 14,
    marginTop: 2,
    fontVariant: ["tabular-nums"],
  },
  countdownText: {
    fontSize: 13,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },

  prayerStrip: {
    width: "100%",
    borderWidth: 1,
    borderRadius: 22,
    padding: 14,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.3,
    marginBottom: 10,
    marginLeft: 4,
  },
  prayerGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  prayerCell: {
    width: "31%",
    flexGrow: 1,
    minWidth: 96,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "transparent",
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: "center",
    gap: 4,
  },
  prayerName: {
    fontSize: 11.5,
    fontWeight: "600",
    letterSpacing: 0.2,
  },
  prayerTime: {
    fontSize: 15,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },

  skyCard: {
    width: "100%",
    borderWidth: 1,
    borderRadius: 22,
    padding: 16,
  },
  skyMoon: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
  },
  skyMoonText: { flex: 1, marginLeft: 14 },
  skyTitle: {
    fontSize: 17,
    fontWeight: "800",
  },
  skySub: {
    fontSize: 13,
    marginTop: 2,
  },
  skyGrid: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  skyChip: {
    flex: 1,
    alignItems: "center",
    gap: 3,
  },
  skyChipLabel: {
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  skyChipValue: {
    fontSize: 14,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
  skyDivider: {
    width: 1,
    height: 42,
  },

  statsCard: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 22,
    paddingVertical: 16,
    marginTop: 12,
  },
  statChip: {
    flex: 1,
    alignItems: "center",
    gap: 3,
  },
  statIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  statValue: {
    fontSize: 17,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
  statLabel: {
    fontSize: 10.5,
    fontWeight: "600",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  statDivider: {
    width: 1,
    height: 44,
  },

  statusCard: {
    width: "100%",
    borderWidth: 1,
    borderRadius: 22,
    padding: 16,
    marginTop: 16,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  statusIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  statusTexts: { flex: 1 },
  statusTitle: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "600",
  },
  statusDescription: {
    fontSize: 13,
    lineHeight: 19,
    marginTop: 4,
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 48,
    borderRadius: 14,
    marginTop: 14,
  },
  actionText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "700",
  },
});
