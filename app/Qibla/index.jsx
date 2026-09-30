import React, {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  Vibration,
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
  useDerivedValue,
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
import { Coordinates, CalculationMethod, PrayerTimes, Prayer } from "adhan";
import {
  Observer,
  Body,
  Illumination,
  MakeTime,
  SearchRiseSet,
} from "astronomy-engine";

/* ───────────────────────────── constants ───────────────────────────── */

const KAABA = { latitude: 21.4225, longitude: 39.8262 };
const TICKS = Array.from({ length: 72 }, (_, i) => i);
const ALIGNMENT_THRESHOLD = 8;
const NO_HEADING_TIMEOUT = 6000;
const SKY_TICK_MS = 60_000;
const SUN_CHART_WIDTH = 320;
const SUN_CHART_HEIGHT = 110;
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

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

/* ───────────────────────────── math helpers ────────────────────────── */

const toRadians = (d) => (d * Math.PI) / 180;
const normalizeDegrees = (d) => ((d % 360) + 360) % 360;
const shortestSignedDelta = (from, to) => ((to - from + 540) % 360) - 180;

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

const pad2 = (n) => String(n).padStart(2, "0");

const formatClock = (date, t) => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "––:––";
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

const moonPhaseLabel = (fraction, phaseAngleDeg) => {
  const f = fraction ?? 0;
  const a = phaseAngleDeg ?? 0;
  if (f < 0.03) return "New Moon";
  if (f > 0.97) return "Full Moon";
  if (a < 180) {
    if (f < 0.35) return "Waxing Crescent";
    if (f < 0.65) return "First Quarter";
    return "Waxing Gibbous";
  }
  if (f < 0.35) return "Waning Crescent";
  if (f < 0.65) return "Last Quarter";
  return "Waning Gibbous";
};

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

/* ───────────────────────────── sky + prayers ───────────────────────── */

function computePrayerBundle(lat, lon, now) {
  const coords = new Coordinates(lat, lon);
  const params = CalculationMethod.MuslimWorldLeague();
  const times = new PrayerTimes(coords, now, params);

  const entries = PRAYER_ORDER.map(({ key, prayer, icon }) => ({
    key,
    prayer,
    icon,
    label: prayerLabelKey(prayer),
    time: times.timeForPrayer(prayer),
  }));

  const next = times.nextPrayer(now);
  const current = times.currentPrayer(now);
  const nextTime = next != null ? times.timeForPrayer(next) : null;
  const currentTime = current != null ? times.timeForPrayer(current) : null;

  let progress = 0;
  if (currentTime && nextTime) {
    const span = nextTime.getTime() - currentTime.getTime();
    if (span > 0) {
      progress = Math.min(
        1,
        Math.max(0, (now.getTime() - currentTime.getTime()) / span),
      );
    }
  }

  return {
    entries,
    next,
    current,
    nextTime,
    currentTime,
    progress,
    nextLabel: next != null ? prayerLabelKey(next) : null,
    currentLabel: current != null ? prayerLabelKey(current) : null,
  };
}

function computeSkyBundle(lat, lon, now) {
  try {
    const observer = new Observer(lat, lon, 0);
    const time = MakeTime(now);
    const illum = Illumination(Body.Moon, time);
    const fraction = illum.phase_fraction ?? illum.phaseFraction ?? 0;
    const phaseAngle = illum.phase_angle ?? illum.phaseAngle ?? 0;

    const localDayStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    );
    const sunrise = SearchRiseSet(
      Body.Sun,
      observer,
      +1,
      MakeTime(localDayStart),
      2,
    );
    const sunset = SearchRiseSet(
      Body.Sun,
      observer,
      -1,
      MakeTime(localDayStart),
      2,
    );
    const moonrise = SearchRiseSet(Body.Moon, observer, +1, time, 1);
    const moonset = SearchRiseSet(Body.Moon, observer, -1, time, 1);
    const isSameLocalDay = (event) =>
      event?.date &&
      event.date.getFullYear() === localDayStart.getFullYear() &&
      event.date.getMonth() === localDayStart.getMonth() &&
      event.date.getDate() === localDayStart.getDate();

    return {
      moonFraction: fraction,
      moonLabel: moonPhaseLabel(fraction, phaseAngle),
      sunrise: isSameLocalDay(sunrise) ? sunrise.date : null,
      sunset: isSameLocalDay(sunset) ? sunset.date : null,
      moonrise: moonrise?.date ?? null,
      moonset: moonset?.date ?? null,
    };
  } catch {
    return {
      moonFraction: null,
      moonLabel: null,
      sunrise: null,
      sunset: null,
      moonrise: null,
      moonset: null,
    };
  }
}

/* ───────────────────────────── compass ─────────────────────────────── */

const CompassRing = memo(({ size, rotation, qiblaAngle, dial }) => {
  const spin = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
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
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, styles.centerContent, spin]}
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

const QiblaNeedle = memo(({ size, rotation, dial, isAligned }) => {
  const spin = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));
  const c = size / 2;
  const len = c - 80;
  const tail = len * 0.36;
  const needleColor = isAligned ? dial.aligned : dial.needle;

  return (
    <Animated.View
      pointerEvents="none"
      entering={FadeIn.duration(280)}
      style={[StyleSheet.absoluteFill, styles.centerContent, spin]}
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

const AlignmentHalo = memo(({ size, isAligned, dial }) => {
  const pulse = useSharedValue(0);

  useEffect(() => {
    if (isAligned) {
      pulse.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 700, easing: Easing.inOut(Easing.quad) }),
          withTiming(0.4, {
            duration: 700,
            easing: Easing.inOut(Easing.quad),
          }),
        ),
        -1,
        true,
      );
    } else {
      cancelAnimation(pulse);
      pulse.value = withTiming(0, { duration: 200 });
    }
    return () => cancelAnimation(pulse);
  }, [isAligned, pulse]);

  const glowStyle = useAnimatedStyle(() => ({ opacity: pulse.value * 0.14 }));
  const ringStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));

  return (
    <>
      <Animated.View
        pointerEvents="none"
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
        pointerEvents="none"
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
  <View pointerEvents="none" style={styles.topPointerWrap}>
    <View style={[styles.topPointer, { borderTopColor: color }]} />
  </View>
));
TopPointer.displayName = "TopPointer";

/* ───────────────────────────── UI pieces ───────────────────────────── */

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

const HeadingReadout = memo(
  ({ heading, qiblaBearing, isAligned, dial, colors, t }) => {
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
        <Text
          style={[styles.readoutCaption, { color: colors.onSurfaceVariant }]}
        >
          {qiblaBearing === null
            ? t("Waiting for location...")
            : t("Qibla bearing from true north", {
                bearing: Math.round(qiblaBearing),
              })}
        </Text>
      </View>
    );
  },
);
HeadingReadout.displayName = "HeadingReadout";

const GuidancePill = memo(({ guidance, dial, colors }) => {
  if (!guidance) return null;
  return (
    <View
      style={[
        styles.guidance,
        {
          backgroundColor: guidance.aligned
            ? `${dial.aligned}14`
            : colors.surface,
          borderColor: guidance.aligned ? dial.aligned : colors.outlineVariant,
        },
      ]}
    >
      <Icon
        source={guidance.icon}
        size={18}
        color={guidance.aligned ? dial.aligned : colors.onSurfaceVariant}
      />
      <Text
        style={[
          styles.guidanceText,
          { color: guidance.aligned ? dial.aligned : colors.onSurface },
        ]}
      >
        {guidance.text}
      </Text>
    </View>
  );
});
GuidancePill.displayName = "GuidancePill";

const CountdownRing = memo(
  ({ progress, size, stroke, track, color, children }) => {
    const r = (size - stroke) / 2;
    const c = 2 * Math.PI * r;
    const offset = c * (1 - Math.min(1, Math.max(0, progress)));

    return (
      <View
        style={{
          width: size,
          height: size,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
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

const NextPrayerCard = memo(({ prayers, nowMs, colors, dial, t }) => {
  if (!prayers?.nextLabel || !prayers.nextTime) return null;
  const remain = prayers.nextTime.getTime() - nowMs;
  const progress = prayers.progress ?? 0;

  return (
    <View
      style={[
        styles.nextCard,
        {
          backgroundColor: colors.surface,
          borderColor: colors.outlineVariant,
        },
      ]}
    >
      <View style={styles.nextLeft}>
        <Text style={[styles.nextEyebrow, { color: colors.primary }]}>
          {prayers.currentLabel
            ? `${t("Now")}: ${t(prayers.currentLabel)}`
            : t("Next prayer")}
        </Text>
        <Text style={[styles.nextName, { color: colors.onSurface }]}>
          {t(prayers.nextLabel)}
        </Text>
        <Text style={[styles.nextClock, { color: colors.onSurfaceVariant }]}>
          {formatClock(prayers.nextTime, t)}
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

const PrayerStrip = memo(({ prayers, colors, dial, t }) => {
  if (!prayers?.entries?.length) return null;
  return (
    <View
      style={[
        styles.prayerStrip,
        {
          backgroundColor: colors.surface,
          borderColor: colors.outlineVariant,
        },
      ]}
    >
      <Text style={[styles.sectionTitle, { color: colors.onSurface }]}>
        {t("Today")}
      </Text>
      <View style={styles.prayerGrid}>
        {prayers.entries.map((p) => {
          const isNext = p.prayer === prayers.next;
          const isCurrent = p.prayer === prayers.current;
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
              <Icon
                source={p.icon}
                size={15}
                color={
                  isNext
                    ? dial.aligned
                    : isCurrent
                      ? colors.primary
                      : colors.onSurfaceVariant
                }
              />
              <Text
                style={[
                  styles.prayerName,
                  {
                    color: isNext
                      ? dial.aligned
                      : isCurrent
                        ? colors.primary
                        : colors.onSurfaceVariant,
                  },
                ]}
              >
                {t(p.label)}
              </Text>
              <Text
                style={[
                  styles.prayerTime,
                  {
                    color: isNext
                      ? dial.aligned
                      : isCurrent
                        ? colors.onSurface
                        : colors.onSurface,
                  },
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

const MoonGlyph = memo(({ fraction, size, color, track }) => {
  const f = Math.max(0, Math.min(1, fraction ?? 0));
  const r = size / 2;
  const offset = (1 - f * 2) * r;
  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <Circle cx={r} cy={r} r={r - 1} fill={track} />
        <Circle cx={r} cy={r} r={r - 1} fill={color} opacity={0.16} />
        <Circle
          cx={r + offset * 0.55}
          cy={r}
          r={r - 2}
          fill={color}
          opacity={0.88}
        />
        {f < 0.5 && (
          <Circle cx={r} cy={r} r={r - 1} fill={track} opacity={0.5} />
        )}
        <Circle
          cx={r}
          cy={r}
          r={r - 1}
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

/* ───── NEW: Elegant Sun Path Card (inspired by your screenshot) ───── */

const SunPathCard = memo(({ sky, nowMs, colors, dial, t }) => {
  const sunriseMs = sky?.sunrise?.getTime() ?? 0;
  const sunsetMs = sky?.sunset?.getTime() ?? 0;
  const dayLengthMs = sunsetMs - sunriseMs;
  const remainingMs = Math.max(0, sunsetMs - nowMs);
  const progress =
    sky?.sunrise && sky?.sunset && dayLengthMs > 0
      ? Math.min(1, Math.max(0, (nowMs - sunriseMs) / dayLengthMs))
      : 0;

  const animatedProgress = useSharedValue(progress);
  useEffect(() => {
    animatedProgress.value = withTiming(progress, {
      duration: 900,
      easing: Easing.linear,
    });
  }, [animatedProgress, progress]);

  const animatedMarkerProps = useAnimatedProps(() => {
    const point = animatedProgress.value;
    const x = 12 + point * (SUN_CHART_WIDTH - 24);
    const y =
      SUN_CHART_HEIGHT - 8 - 2 * point * (1 - point) * (SUN_CHART_HEIGHT - 16);
    return { cx: x, cy: y };
  });

  if (!sky?.sunrise || !sky?.sunset || dayLengthMs <= 0) return null;

  const dayH = Math.floor(dayLengthMs / 3_600_000);
  const dayM = Math.floor((dayLengthMs % 3_600_000) / 60_000);
  const remH = Math.floor(remainingMs / 3_600_000);
  const remM = Math.floor((remainingMs % 3_600_000) / 60_000);

  // SVG path for a soft parabolic arc
  const W = SUN_CHART_WIDTH;
  const H = SUN_CHART_HEIGHT;
  const path = `M 12 ${H - 8} Q ${W / 2} 8 ${W - 12} ${H - 8}`;

  return (
    <View
      style={[
        styles.sunCard,
        {
          backgroundColor: colors.surface,
          borderColor: colors.outlineVariant,
        },
      ]}
    >
      {/* Endpoint labels and local times */}
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

      {/* Arc */}
      <View style={styles.sunArcWrap}>
        <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`}>
          <Defs>
            <LinearGradient id="skyFill" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0%" stopColor="#93c5fd" stopOpacity="0.35" />
              <Stop offset="100%" stopColor="#93c5fd" stopOpacity="0.02" />
            </LinearGradient>
          </Defs>
          {/* filled portion under the arc up to current progress */}
          <Path
            d={`M 12 ${H - 8} Q ${W / 2} 8 ${W - 12} ${H - 8} L ${W - 12} ${H} L 12 ${H} Z`}
            fill="url(#skyFill)"
          />
          <Path
            d={path}
            stroke={colors.outlineVariant}
            strokeWidth={1.5}
            fill="none"
            strokeLinecap="round"
          />
          {/* progress marker (sun) */}
          <AnimatedCircle
            animatedProps={animatedMarkerProps}
            r={9}
            fill={dial.gold}
          />
          <AnimatedCircle
            animatedProps={animatedMarkerProps}
            r={14}
            fill={dial.gold}
            opacity={0.18}
          />
        </Svg>
      </View>

      {/* Stats row */}
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
  return (
    <View
      style={[
        styles.skyCard,
        {
          backgroundColor: colors.surface,
          borderColor: colors.outlineVariant,
        },
      ]}
    >
      <View style={styles.skyMoon}>
        <MoonGlyph
          fraction={sky.moonFraction ?? 0}
          size={52}
          color={dial.gold}
          track={colors.surfaceVariant || "#eef2f1"}
        />
        <View style={{ flex: 1, marginLeft: 14 }}>
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
        <View style={styles.skyChip}>
          <Icon source="weather-sunset-up" size={15} color={dial.gold} />
          <Text
            style={[styles.skyChipLabel, { color: colors.onSurfaceVariant }]}
          >
            {t("Sunrise")}
          </Text>
          <Text style={[styles.skyChipValue, { color: colors.onSurface }]}>
            {formatClock(sky.sunrise, t)}
          </Text>
        </View>
        <View
          style={[
            styles.skyDivider,
            { backgroundColor: colors.outlineVariant },
          ]}
        />
        <View style={styles.skyChip}>
          <Icon source="weather-sunset" size={15} color={dial.gold} />
          <Text
            style={[styles.skyChipLabel, { color: colors.onSurfaceVariant }]}
          >
            {t("Sunset")}
          </Text>
          <Text style={[styles.skyChipValue, { color: colors.onSurface }]}>
            {formatClock(sky.sunset, t)}
          </Text>
        </View>
        <View
          style={[
            styles.skyDivider,
            { backgroundColor: colors.outlineVariant },
          ]}
        />
        <View style={styles.skyChip}>
          <Icon source="moon-waxing-crescent" size={15} color={dial.gold} />
          <Text
            style={[styles.skyChipLabel, { color: colors.onSurfaceVariant }]}
          >
            {t("Moonrise")}
          </Text>
          <Text style={[styles.skyChipValue, { color: colors.onSurface }]}>
            {formatClock(sky.moonrise, t)}
          </Text>
        </View>
        <View
          style={[
            styles.skyDivider,
            { backgroundColor: colors.outlineVariant },
          ]}
        />
        <View style={styles.skyChip}>
          <Icon source="moon-waning-crescent" size={15} color={dial.gold} />
          <Text
            style={[styles.skyChipLabel, { color: colors.onSurfaceVariant }]}
          >
            {t("Moonset")}
          </Text>
          <Text style={[styles.skyChipValue, { color: colors.onSurface }]}>
            {formatClock(sky.moonset, t)}
          </Text>
        </View>
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

  const colors = theme.colors;
  const dial = useMemo(
    () => (theme.dark ? DIAL_DARK : DIAL_LIGHT),
    [theme.dark],
  );
  const compassSize = Math.min(width - 56, 300);

  const headingSV = useSharedValue(0);
  const qiblaSV = useSharedValue(0);
  const hasQiblaSV = useSharedValue(0);

  const ringRotation = useDerivedValue(() => -headingSV.value);
  const needleRotation = useDerivedValue(() => {
    if (hasQiblaSV.value < 0.5) return 0;
    return qiblaSV.value - headingSV.value;
  });

  const lastRawHeadingRef = useRef(null);
  const unwrappedHeadingRef = useRef(0);
  const gotHeadingRef = useRef(false);
  const lastDisplayedHeading = useRef(null);
  const wasAlignedRef = useRef(false);
  const lastAccuracyRef = useRef(null);

  const [location, setLocation] = useState(null);
  const [cityName, setCityName] = useState(null);
  const [heading, setHeading] = useState(null);
  const [headingAccuracy, setHeadingAccuracy] = useState(null);
  const [headingUnavailable, setHeadingUnavailable] = useState(false);
  const [locationStatus, setLocationStatus] = useState("loading");
  const [canAskAgain, setCanAskAgain] = useState(true);
  const [retryToken, setRetryToken] = useState(0);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useFocusEffect(
    useCallback(() => {
      navigation.setOptions({ headerShown: false });
      setCityName(null);
    }, [navigation]),
  );

  useEffect(() => {
    let active = true;
    if (!location) {
      return () => {
        active = false;
      };
    }

    Location.reverseGeocodeAsync({
      latitude: location.latitude,
      longitude: location.longitude,
    })
      .then(([place]) => {
        if (active) setCityName(getCityName(place));
      })
      .catch(() => {
        if (active) setCityName(null);
      });

    return () => {
      active = false;
    };
  }, [location]);

  const qiblaBearing = useMemo(
    () =>
      location ? getQiblaBearing(location.latitude, location.longitude) : null,
    [location],
  );

  useEffect(() => {
    if (qiblaBearing != null) {
      qiblaSV.value = qiblaBearing;
      hasQiblaSV.value = 1;
    } else {
      hasQiblaSV.value = 0;
    }
  }, [qiblaBearing, qiblaSV, hasQiblaSV]);

  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const [skyNowMs, setSkyNowMs] = useState(nowMs);
  useEffect(() => {
    const id = setInterval(() => setSkyNowMs(Date.now()), SKY_TICK_MS);
    return () => clearInterval(id);
  }, []);

  const prayerMinute = Math.floor(nowMs / 60_000);
  const prayers = useMemo(() => {
    if (!location) return null;
    try {
      return computePrayerBundle(
        location.latitude,
        location.longitude,
        new Date(prayerMinute * 60_000),
      );
    } catch {
      return null;
    }
  }, [location, prayerMinute]);

  const livePrayers = useMemo(() => {
    if (!prayers || !location) return prayers;
    try {
      return computePrayerBundle(
        location.latitude,
        location.longitude,
        new Date(nowMs),
      );
    } catch {
      return prayers;
    }
  }, [prayers, location, nowMs]);

  const sky = useMemo(() => {
    if (!location) return null;
    return computeSkyBundle(
      location.latitude,
      location.longitude,
      new Date(skyNowMs),
    );
  }, [location, skyNowMs]);

  const isAligned = useMemo(() => {
    if (qiblaBearing == null || heading == null) return false;
    return (
      Math.abs(shortestSignedDelta(heading, qiblaBearing)) <=
      ALIGNMENT_THRESHOLD
    );
  }, [qiblaBearing, heading]);

  useEffect(() => {
    if (isAligned && !wasAlignedRef.current && Platform.OS !== "web") {
      Vibration.vibrate(60);
    }
    wasAlignedRef.current = isAligned;
  }, [isAligned]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      let headingSubscription;
      let noHeadingTimer;

      setLocationStatus(retryToken > 0 ? "refreshing" : "loading");
      setLocation(null);
      setCityName(null);
      setHeading(null);
      setHeadingAccuracy(null);
      setHeadingUnavailable(false);
      gotHeadingRef.current = false;
      lastDisplayedHeading.current = null;
      lastRawHeadingRef.current = null;
      unwrappedHeadingRef.current = 0;
      lastAccuracyRef.current = null;
      hasQiblaSV.set(0);

      const applyHeading = (trueHeading) => {
        const raw = normalizeDegrees(trueHeading);
        if (lastRawHeadingRef.current == null) {
          unwrappedHeadingRef.current = raw;
        } else {
          unwrappedHeadingRef.current += shortestSignedDelta(
            lastRawHeadingRef.current,
            raw,
          );
        }
        lastRawHeadingRef.current = raw;
        headingSV.value = unwrappedHeadingRef.current;

        const rounded = Math.round(raw) % 360;
        if (rounded !== lastDisplayedHeading.current) {
          const previous = lastDisplayedHeading.current;
          lastDisplayedHeading.current = rounded;
          setHeading(rounded);
          if (previous !== null) {
            Haptics.selectionAsync().catch(() => {});
          }
        }
      };

      const startCompass = async () => {
        try {
          const permission = await Location.requestForegroundPermissionsAsync();
          if (!active) return;
          setCanAskAgain(permission.canAskAgain);

          if (!permission.granted) {
            setLocationStatus("permission");
            return;
          }

          if (Platform.OS === "web") {
            setHeadingUnavailable(true);
          } else {
            try {
              headingSubscription = await Location.watchHeadingAsync(
                (reading) => {
                  if (!active) return;
                  const h =
                    reading.trueHeading >= 0
                      ? reading.trueHeading
                      : reading.magHeading;
                  if (h == null || h < 0) return;
                  gotHeadingRef.current = true;
                  applyHeading(h);
                  const acc = reading.accuracy;
                  if (acc !== lastAccuracyRef.current) {
                    lastAccuracyRef.current = acc;
                    setHeadingAccuracy(acc);
                    setHeadingUnavailable(false);
                  }
                },
              );
              noHeadingTimer = setTimeout(() => {
                if (active && !gotHeadingRef.current) {
                  setHeadingUnavailable(true);
                }
              }, NO_HEADING_TIMEOUT);
            } catch {
              if (active) setHeadingUnavailable(true);
            }
          }

          if (!active) {
            headingSubscription?.remove();
            return;
          }

          const cached = await Location.getLastKnownPositionAsync();
          if (cached && active) {
            setCityName(null);
            setLocation({
              latitude: cached.coords.latitude,
              longitude: cached.coords.longitude,
              accuracy: cached.coords.accuracy,
            });
            setLocationStatus("ready");
          }

          const position = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
          if (!active) return;
          setCityName(null);
          setLocation({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
          });
          setLocationStatus("ready");
        } catch {
          if (active) setLocationStatus("error");
        }
      };

      startCompass();
      return () => {
        active = false;
        headingSubscription?.remove();
        if (noHeadingTimer) clearTimeout(noHeadingTimer);
      };
    }, [retryToken, headingSV, hasQiblaSV]),
  );

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

  const retry = useCallback(() => setRetryToken((v) => v + 1), []);
  const permissionAction = canAskAgain ? retry : () => Linking.openSettings();
  const handleBack = useCallback(() => router.back(), [router]);

  const guidance = useMemo(() => {
    if (qiblaBearing == null || heading == null) return null;
    const delta = shortestSignedDelta(heading, qiblaBearing);
    if (Math.abs(delta) <= ALIGNMENT_THRESHOLD) {
      return {
        aligned: true,
        icon: "check-decagram-outline",
        text: t("You are facing the Qibla"),
      };
    }
    return {
      aligned: false,
      icon: delta > 0 ? "rotate-right" : "rotate-left",
      text: `${delta > 0 ? t("Turn right") : t("Turn left")} · ${Math.round(Math.abs(delta))}°`,
    };
  }, [qiblaBearing, heading, t]);

  const status = useMemo(() => {
    if (locationStatus === "loading")
      return {
        icon: "map-marker-outline",
        title: t("Locating your position..."),
        busy: true,
        tone: "info",
      };
    if (locationStatus === "refreshing")
      return {
        icon: "map-marker-outline",
        title: t("Updating your position..."),
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
    if (heading === null)
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
    return null;
  }, [locationStatus, headingUnavailable, heading, headingAccuracy, t]);

  const toneColor =
    status?.tone === "error"
      ? colors.error || "#dc2626"
      : status?.tone === "warn"
        ? "#b45309"
        : status?.tone === "muted"
          ? colors.onSurfaceVariant
          : colors.primary;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Floating header */}
      <View style={[styles.floatingHeader, { paddingTop: insets.top + 8 }]}>
        <View style={styles.floatingHeaderRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("Back")}
            onPress={handleBack}
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
              {t("Qibla Compass")}
            </Text>
            <Text
              style={[styles.headerCity, { color: colors.onSurfaceVariant }]}
              numberOfLines={1}
            >
              {cityName ||
                (location ? t("City unavailable") : t("Locating city..."))}
            </Text>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("Refresh location")}
            onPress={retry}
            style={[
              styles.headerPill,
              {
                backgroundColor: colors.surface,
                borderColor: colors.outlineVariant,
              },
            ]}
          >
            <Icon source="refresh" size={20} color={colors.onSurface} />
          </Pressable>
        </View>
      </View>

      <ScrollView
        style={styles.container}
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 78, paddingBottom: insets.bottom + 36 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Compass */}
        <Animated.View
          entering={FadeInDown.delay(40).duration(420)}
          style={[
            styles.dialStage,
            { width: compassSize, height: compassSize },
          ]}
          accessible
          accessibilityRole="image"
          accessibilityLabel={
            qiblaBearing === null
              ? t("Waiting for compass...")
              : `${t("Qibla bearing")} ${Math.round(qiblaBearing)}°`
          }
        >
          <AlignmentHalo size={compassSize} isAligned={isAligned} dial={dial} />
          <View
            style={[
              StyleSheet.absoluteFill,
              styles.bezel,
              {
                borderRadius: compassSize / 2,
                backgroundColor: dial.face,
                borderColor: dial.rim,
              },
            ]}
          />
          <CompassRing
            size={compassSize}
            rotation={ringRotation}
            qiblaAngle={qiblaBearing}
            dial={dial}
          />
          {qiblaBearing != null && (
            <QiblaNeedle
              size={compassSize}
              rotation={needleRotation}
              dial={dial}
              isAligned={isAligned}
            />
          )}
          <TopPointer color={dial.gold} />
        </Animated.View>

        {/* Heading + guidance */}
        <Animated.View entering={FadeInDown.delay(80).duration(380)}>
          <HeadingReadout
            heading={heading}
            qiblaBearing={qiblaBearing}
            isAligned={isAligned}
            dial={dial}
            colors={colors}
            t={t}
          />
        </Animated.View>

        <Animated.View entering={FadeInDown.duration(240)}>
          <GuidancePill guidance={guidance} dial={dial} colors={colors} />
        </Animated.View>

        {/* Sun path hero card */}
        <Animated.View
          entering={FadeInDown.delay(110).duration(400)}
          style={{ width: "100%", marginTop: 22 }}
        >
          <SunPathCard
            sky={sky}
            nowMs={nowMs}
            colors={colors}
            dial={dial}
            t={t}
          />
        </Animated.View>

        {/* Next prayer */}
        <Animated.View
          entering={FadeInDown.delay(140).duration(380)}
          style={{ width: "100%", marginTop: 12 }}
        >
          <NextPrayerCard
            prayers={livePrayers}
            nowMs={nowMs}
            colors={colors}
            dial={dial}
            t={t}
          />
        </Animated.View>

        {/* Prayer grid */}
        <Animated.View
          entering={FadeInDown.delay(170).duration(380)}
          style={{ width: "100%", marginTop: 12 }}
        >
          <PrayerStrip
            prayers={livePrayers}
            colors={colors}
            dial={dial}
            t={t}
          />
        </Animated.View>

        {/* Moon + sky times */}
        <Animated.View
          entering={FadeInDown.delay(200).duration(380)}
          style={{ width: "100%", marginTop: 12 }}
        >
          <SkyCard sky={sky} colors={colors} dial={dial} t={t} />
        </Animated.View>

        {/* Stats */}
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
            value={qiblaBearing === null ? "—" : `${Math.round(qiblaBearing)}°`}
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

        {/* Status / errors */}
        {status && (
          <Animated.View
            entering={FadeInDown.delay(40).duration(340)}
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
                style={[
                  styles.statusIconWrap,
                  { backgroundColor: `${toneColor}18` },
                ]}
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
                onPress={permissionAction}
                style={({ pressed }) => [
                  styles.actionButton,
                  {
                    backgroundColor: colors.primary,
                    opacity: pressed ? 0.9 : 1,
                  },
                ]}
              >
                <Text style={styles.actionText}>
                  {locationStatus === "permission" && !canAskAgain
                    ? t("Open settings")
                    : t("Try again")}
                </Text>
                <Icon
                  source={
                    Platform.OS === "ios" ? "chevron-right" : "arrow-right"
                  }
                  size={18}
                  color="#ffffff"
                />
              </Pressable>
            )}
          </Animated.View>
        )}
      </ScrollView>
    </View>
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
  halo: { position: "absolute" },
  haloRing: { borderWidth: 2.5 },
  topPointerWrap: {
    position: "absolute",
    top: -6,
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 4,
    elevation: 4,
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
