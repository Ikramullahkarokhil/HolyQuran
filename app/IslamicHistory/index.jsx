import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useRef,
} from "react";
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  ActivityIndicator,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "react-native-paper";
import { useTranslation } from "react-i18next";
import { getQuranVerses, getSurahNames } from "../../components/quranData";
import { getAllHadiths, getHadithBooks } from "../../components/hadithData";
import {
  getFlexDirection,
  getTextAlignment,
  getWritingDirection,
  isRTL,
} from "../../components/utils/rtlUtils";

const DAILY_REMINDER_KEY = "daily_wisdom_notification_time";
const DAILY_LANGUAGE_KEY = "daily_wisdom_notification_language";
const DAILY_ENABLED_KEY = "daily_wisdom_notification_enabled";
const DAILY_REMINDER_CHANNEL_ID = "daily-wisdom-reminders";
const DEFAULT_REMINDER_TIME = { hour: 8, minute: 0 };
const DEFAULT_LANGUAGE = "english";
const REMINDER_MINUTE_STEP = 5;

const LANGUAGE_OPTIONS = [
  { label: "English", value: "english", icon: "translate" },
  { label: "Pashto", value: "pashto", icon: "translate" },
  { label: "Dari", value: "dari", icon: "translate" },
  { label: "Arabic", value: "arabic", icon: "translate" },
];

const REMINDER_TEXT = {
  english: {
    title: "✨ Your Daily Reflection",
    body: "Take a moment to connect with today's Ayah and Hadith.",
  },
  pashto: {
    title: "✨ د نن ورځې حکمت",
    body: "یو شیبه وخت واخلئ او د نن ورځې له ایات او حدیث سره وصل شئ.",
  },
  dari: {
    title: "✨ حکمت امروز",
    body: "لحظه‌ای تأمل کنید و با آیه و حدیث امروز همراه شوید.",
  },
  arabic: {
    title: "✨ نورُ اليوم",
    body: "خُذ لحظة للتفكُّر في آيةِ ومالامحِ حديثِ اليوم.",
  },
};

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

const hashString = (value) => {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    const char = value.charCodeAt(i);
    hash ^= char;
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const getTodayKey = () => new Date().toISOString().slice(0, 10);

const readStorageReminderTime = async () => {
  try {
    const raw = await AsyncStorage.getItem(DAILY_REMINDER_KEY);
    if (!raw) return DEFAULT_REMINDER_TIME;
    const parsed = JSON.parse(raw);
    if (
      !parsed ||
      typeof parsed.hour !== "number" ||
      typeof parsed.minute !== "number"
    ) {
      return DEFAULT_REMINDER_TIME;
    }
    return {
      hour: Math.min(23, Math.max(0, parsed.hour)),
      minute: Math.min(59, Math.max(0, parsed.minute)),
    };
  } catch {
    return DEFAULT_REMINDER_TIME;
  }
};

const readStorageLanguage = async () => {
  try {
    const raw = await AsyncStorage.getItem(DAILY_LANGUAGE_KEY);
    return raw && LANGUAGE_OPTIONS.some((item) => item.value === raw)
      ? raw
      : DEFAULT_LANGUAGE;
  } catch {
    return DEFAULT_LANGUAGE;
  }
};

const readStorageEnabled = async () => {
  try {
    const raw = await AsyncStorage.getItem(DAILY_ENABLED_KEY);
    return raw === "true";
  } catch {
    return false;
  }
};

const persistReminderSettings = async ({ hour, minute, language, enabled }) => {
  const normalized = {
    hour: Math.min(23, Math.max(0, Number(hour) || 0)),
    minute: Math.min(59, Math.max(0, Number(minute) || 0)),
  };

  await AsyncStorage.setItem(
    DAILY_REMINDER_KEY,
    JSON.stringify({ ...normalized }),
  );
  await AsyncStorage.setItem(DAILY_LANGUAGE_KEY, language || DEFAULT_LANGUAGE);
  await AsyncStorage.setItem(DAILY_ENABLED_KEY, enabled ? "true" : "false");
  return normalized;
};

const normalizeReminderTime = ({ hour, minute }) => {
  const safeHour = Math.min(23, Math.max(0, Number(hour) || 0));
  const safeMinute = Math.min(59, Math.max(0, Number(minute) || 0));
  return { hour: safeHour, minute: safeMinute };
};

const formatReminderTime = ({ hour, minute }) => {
  const date = new Date();
  date.setHours(hour, minute, 0, 0);
  return date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
};

const buildDailyVerse = (language, refreshSeed = 0) => {
  const verses = getQuranVerses(language);
  const surahNames = getSurahNames();
  const todayKey = getTodayKey();
  const index =
    hashString(`${todayKey}-${language}-${refreshSeed}`) % verses.length;
  const verse = verses[index] || verses[0];
  const surah = surahNames.find((entry) => entry.index === verse.surah) || {
    tname: `Surah ${verse.surah}`,
  };

  return {
    reference: `${verse.surah}:${verse.ayah}`,
    text: verse.verse,
    surah: surah.tname || `Surah ${verse.surah}`,
    surahId: verse.surah,
    ayah: verse.ayah,
  };
};

const buildDailyHadith = (language, refreshSeed = 0) => {
  const todayKey = getTodayKey();
  const collections = ["bukhari", "muslim"];
  const collectionIndex =
    hashString(`${todayKey}-hadith-collection-${language}-${refreshSeed}`) %
    collections.length;
  const collection = collections[collectionIndex] || "bukhari";
  const dataset = getAllHadiths(
    collection,
    language === "arabic" ? "arabic" : "english",
  );

  const itemIndex =
    hashString(`${todayKey}-hadith-${collection}-${language}-${refreshSeed}`) %
    Math.max(dataset.length, 1);
  const item = dataset[itemIndex] || dataset[0];

  const sourceMap = {
    bukhari: {
      english: "Sahih Bukhari",
      arabic: "صحيح البخاري",
    },
    muslim: {
      english: "Sahih Muslim",
      arabic: "صحيح المسلم",
    },
  };

  const bookName =
    getHadithBooks(
      collection,
      language === "arabic" ? "arabic" : "english",
    ).find(
      (book) => String(book.bookNumber) === String(item?.reference?.book ?? ""),
    )?.bookName || `Book ${item?.reference?.book ?? 1}`;

  return {
    id: item?.hadithnumber ?? item?.reference?.hadith ?? 1,
    bookNumber: item?.reference?.book ?? 1,
    collection,
    bookName,
    title: sourceMap[collection][language === "arabic" ? "arabic" : "english"],
    text: item?.text || "",
    source: sourceMap[collection][language === "arabic" ? "arabic" : "english"],
  };
};

const wrapDirectionalText = (value, language) => {
  if (!value) return value;

  const text = String(value);
  if (isRTL(language)) {
    return `\u2067${text}\u2069`;
  }

  return `\u2066${text}\u2069`;
};

const buildDailyNotificationContent = (language) => {
  const verse = buildDailyVerse(language);
  const hadith = buildDailyHadith(language);
  const title = REMINDER_TEXT[language] || REMINDER_TEXT.english;

  return {
    title: wrapDirectionalText(title.title, language),
    body: [
      wrapDirectionalText(verse.text, language),
      wrapDirectionalText(`${verse.surah} ${verse.reference}`, language),
      "",
      wrapDirectionalText(hadith.text, language),
      wrapDirectionalText(`${hadith.title} • ${hadith.source}`, language),
    ].join("\n"),
    data: {
      screen: "SurahDetails",
      type: "daily-verse",
      language,
      textAlign: getTextAlignment(language),
      writingDirection: getWritingDirection(language),
      verseReference: verse.reference,
      verseSurah: verse.surah,
      surahId: verse.surahId,
      ayahId: verse.ayah,
    },
  };
};

const ensureDailyReminderChannel = async () => {
  try {
    await Notifications.setNotificationChannelAsync(DAILY_REMINDER_CHANNEL_ID, {
      name: "Daily wisdom reminders",
      importance: Notifications.AndroidImportance.HIGH,
      enableVibrate: true,
      vibrationPattern: [0, 250, 250, 250],
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      showBadge: true,
    });
  } catch {
    // Android channel setup is optional on unsupported devices.
  }
};

const cancelExistingReminder = async () => {
  try {
    await Notifications.cancelScheduledNotificationAsync(
      "daily-wisdom-reminder",
    );
  } catch {
    // Ignore missing reminder
  }
};

const scheduleReminder = async ({
  hour,
  minute,
  language = DEFAULT_LANGUAGE,
  enabled = true,
  showAlert = true,
}) => {
  const normalizedTime = {
    hour: Math.min(23, Math.max(0, Number(hour) || 0)),
    minute: Math.min(59, Math.max(0, Number(minute) || 0)),
  };

  const safeLanguage = LANGUAGE_OPTIONS.some((item) => item.value === language)
    ? language
    : DEFAULT_LANGUAGE;

  await persistReminderSettings({
    hour: normalizedTime.hour,
    minute: normalizedTime.minute,
    language: safeLanguage,
    enabled,
  });

  if (!enabled) {
    await cancelExistingReminder();
    return true;
  }

  try {
    await ensureDailyReminderChannel();

    const permission = await Notifications.getPermissionsAsync();
    let granted = permission.granted;

    if (!granted) {
      const result = await Notifications.requestPermissionsAsync({
        ios: {
          allowAlert: true,
          allowBadge: true,
          allowSound: true,
        },
      });
      granted = result.granted;
    }

    if (!granted) {
      if (showAlert) {
        Alert.alert(
          "Notification permission needed",
          "Turn on notifications in Settings to receive your daily verse and hadith reminder.",
        );
      }
      return false;
    }

    const reminderCopy = buildDailyNotificationContent(safeLanguage);

    await cancelExistingReminder();

    await Notifications.scheduleNotificationAsync({
      identifier: "daily-wisdom-reminder",
      content: {
        title: reminderCopy.title,
        body: reminderCopy.body,
        sound: true,
        data: reminderCopy.data,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: normalizedTime.hour,
        minute: normalizedTime.minute,
        channelId: DAILY_REMINDER_CHANNEL_ID,
      },
    });

    return true;
  } catch (error) {
    console.warn("Reminder scheduling failed:", error);
    if (showAlert) {
      Alert.alert(
        "Reminder unavailable",
        "Your saved reminder time has been kept, but scheduling failed. Please try again in a moment.",
      );
    }
    return false;
  }
};

const IslamicHistory = () => {
  const theme = useTheme();
  const router = useRouter();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  const [selectedLanguage, setSelectedLanguage] = useState(DEFAULT_LANGUAGE);
  const [reminderTime, setReminderTime] = useState(DEFAULT_REMINDER_TIME);
  const [isReminderEnabled, setIsReminderEnabled] = useState(false);
  const [isScheduling, setIsScheduling] = useState(false);
  const [reminderModalVisible, setReminderModalVisible] = useState(false);
  const [verseRefreshSeed, setVerseRefreshSeed] = useState(0);
  const [hadithRefreshSeed, setHadithRefreshSeed] = useState(0);

  useEffect(() => {
    let mounted = true;

    const init = async () => {
      const savedTime = await readStorageReminderTime();
      const savedLanguage = await readStorageLanguage();
      const savedEnabled = await readStorageEnabled();

      if (!mounted) return;

      setReminderTime(savedTime);
      setSelectedLanguage(savedLanguage);
      setIsReminderEnabled(savedEnabled);

      if (savedEnabled) {
        await scheduleReminder({
          ...savedTime,
          language: savedLanguage,
          enabled: true,
          showAlert: false,
        });
      } else {
        await cancelExistingReminder();
      }
    };

    init();
    return () => {
      mounted = false;
    };
  }, []);

  const dailyVerse = useMemo(
    () => buildDailyVerse(selectedLanguage, verseRefreshSeed),
    [selectedLanguage, verseRefreshSeed],
  );
  const dailyHadith = useMemo(
    () => buildDailyHadith(selectedLanguage, hadithRefreshSeed),
    [selectedLanguage, hadithRefreshSeed],
  );
  const selectedTextStyle = useMemo(
    () => ({
      textAlign: getTextAlignment(selectedLanguage),
      writingDirection: getWritingDirection(selectedLanguage),
    }),
    [selectedLanguage],
  );
  const selectedMetaRowStyle = useMemo(
    () => ({
      flexDirection: getFlexDirection(selectedLanguage),
    }),
    [selectedLanguage],
  );

  const hourOptions = useMemo(
    () => Array.from({ length: 24 }, (_, index) => index),
    [],
  );
  const minuteOptions = useMemo(
    () =>
      Array.from(
        { length: 60 / REMINDER_MINUTE_STEP },
        (_, index) => index * REMINDER_MINUTE_STEP,
      ),
    [],
  );

  const handleReminderSave = useCallback(
    async (
      nextTime = reminderTime,
      nextLanguage = selectedLanguage,
      nextEnabled = true,
    ) => {
      setIsScheduling(true);
      try {
        const success = await scheduleReminder({
          ...nextTime,
          language: nextLanguage,
          enabled: nextEnabled,
          showAlert: true,
        });
        if (success) {
          setReminderTime(nextTime);
          setSelectedLanguage(nextLanguage);
          setIsReminderEnabled(nextEnabled);
        }
      } finally {
        setIsScheduling(false);
      }
    },
    [reminderTime, selectedLanguage],
  );

  const handleDisableReminder = useCallback(async () => {
    setIsScheduling(true);
    try {
      await scheduleReminder({
        ...reminderTime,
        language: selectedLanguage,
        enabled: false,
        showAlert: false,
      });
      setIsReminderEnabled(false);
      setReminderModalVisible(false);
    } finally {
      setIsScheduling(false);
    }
  }, [reminderTime, selectedLanguage]);

  const handleBack = useCallback(() => {
    router.back();
  }, [router]);

  const openDailyVerseDetails = useCallback(() => {
    if (!dailyVerse?.surahId || !dailyVerse?.ayah) return;

    router.push({
      pathname: "/SurahDetails",
      params: {
        surahId: String(dailyVerse.surahId),
        ayahId: String(dailyVerse.ayah),
        verseId: String(dailyVerse.ayah),
      },
    });
  }, [dailyVerse, router]);

  const openDailyHadithDetails = useCallback(() => {
    if (!dailyHadith?.collection || !dailyHadith?.bookNumber) return;

    const targetHadithId = String(
      dailyHadith.id ??
        dailyHadith.hadithNumber ??
        dailyHadith.reference?.hadith ??
        1,
    );

    const routedBookName =
      dailyHadith.bookName && !/^\d+$/.test(String(dailyHadith.bookName))
        ? dailyHadith.bookName
        : getHadithBooks(
            dailyHadith.collection,
            selectedLanguage === "arabic" ? "arabic" : "english",
          ).find(
            (book) =>
              String(book.bookNumber) === String(dailyHadith.bookNumber),
          )?.bookName || `Book ${dailyHadith.bookNumber}`;

    router.push({
      pathname: "/Hadiths",
      params: {
        collection: dailyHadith.collection,
        bookNumber: String(dailyHadith.bookNumber),
        bookName: routedBookName,
        hadithNumber: targetHadithId,
        hadithId: targetHadithId,
      },
    });
  }, [dailyHadith, router, selectedLanguage]);

  const openReminderModal = useCallback(() => {
    setReminderModalVisible(true);
  }, []);

  const handleRefreshVerse = useCallback(() => {
    setVerseRefreshSeed((prev) => prev + 1);
  }, []);

  const handleRefreshHadith = useCallback(() => {
    setHadithRefreshSeed((prev) => prev + 1);
  }, []);

  return (
    <View
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      <View style={[styles.pillHeaderWrapper, { paddingTop: insets.top + 6 }]}>
        <View style={styles.pillRow}>
          <MiniPill
            onPress={handleBack}
            icon="arrow-left"
            label="Back"
            colors={{
              surface: theme.colors.surface,
              border: theme.colors.outlineVariant,
              text: theme.colors.onSurface,
            }}
          />

          <View
            style={[
              styles.titleCapsule,
              {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.outlineVariant,
              },
            ]}
          >
            <Text
              style={[styles.pillTitle, { color: theme.colors.onSurface }]}
              numberOfLines={1}
            >
              {t("Daily wisdom")}
            </Text>
          </View>

          <MiniPill
            onPress={openReminderModal}
            icon={isReminderEnabled ? "bell-ring" : "bell-outline"}
            label="Reminder"
            colors={{
              surface: theme.colors.surface,
              border: theme.colors.outlineVariant,
              text: isReminderEnabled
                ? theme.colors.primary
                : theme.colors.onSurface,
            }}
            badge={isReminderEnabled}
            badgeColor={theme.colors.primary}
          />
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 90 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View
          style={[styles.heroCard, { backgroundColor: theme.colors.surface }]}
        >
          <View style={styles.heroTopRow}>
            <View
              style={[
                styles.heroIcon,
                { backgroundColor: theme.colors.primary },
              ]}
            >
              <MaterialCommunityIcons
                name="book-open-page-variant"
                size={26}
                color={theme.colors.onPrimary || "#fff"}
              />
            </View>

            {isReminderEnabled && (
              <View
                style={[
                  styles.statusPill,
                  {
                    backgroundColor:
                      theme.colors.primaryContainer ||
                      theme.colors.surfaceVariant,
                  },
                ]}
              >
                <MaterialCommunityIcons
                  name="bell-check"
                  size={14}
                  color={theme.colors.primary}
                />
                <Text
                  style={[
                    styles.statusPillText,
                    { color: theme.colors.primary },
                  ]}
                >
                  {t("Active")}
                </Text>
              </View>
            )}
          </View>

          <Text style={[styles.heroLabel, { color: theme.colors.primary }]}>
            {t("Verse & Hadith of the Day")}
          </Text>
          <Text style={[styles.heroText, { color: theme.colors.onSurface }]}>
            {t("Daily guidance for reflection and remembrance")}
          </Text>

          {/* Only show the big "Set reminder" CTA when no reminder is set */}
          {!isReminderEnabled ? (
            <Pressable
              onPress={openReminderModal}
              style={[
                styles.heroButton,
                { backgroundColor: theme.colors.primary },
              ]}
            >
              <MaterialCommunityIcons
                name="bell-plus-outline"
                size={18}
                color={theme.colors.onPrimary || "#fff"}
              />
              <Text
                style={[
                  styles.heroButtonText,
                  { color: theme.colors.onPrimary || "#fff" },
                ]}
              >
                {t("Set reminder")}
              </Text>
            </Pressable>
          ) : (
            <Pressable
              onPress={openReminderModal}
              style={[
                styles.heroStatusRow,
                {
                  backgroundColor:
                    theme.colors.surfaceVariant || theme.colors.background,
                  borderColor: theme.colors.outlineVariant,
                },
              ]}
            >
              <View style={styles.heroStatusLeft}>
                <MaterialCommunityIcons
                  name="clock-outline"
                  size={18}
                  color={theme.colors.primary}
                />
                <View>
                  <Text
                    style={[
                      styles.heroStatusTime,
                      { color: theme.colors.onSurface },
                    ]}
                  >
                    {formatReminderTime(reminderTime)}
                  </Text>
                  <Text
                    style={[
                      styles.heroStatusMeta,
                      { color: theme.colors.onSurfaceVariant },
                    ]}
                  >
                    {LANGUAGE_OPTIONS.find((l) => l.value === selectedLanguage)
                      ?.label || "English"}{" "}
                    · {t("Daily")}
                  </Text>
                </View>
              </View>
              <MaterialCommunityIcons
                name="pencil-outline"
                size={18}
                color={theme.colors.onSurfaceVariant}
              />
            </Pressable>
          )}
        </View>

        <DailyCard
          title={t("Verse of the day")}
          icon="book-open-page-variant"
          accent="#0ea5e9"
          theme={theme}
          onPress={openDailyVerseDetails}
          onRefresh={handleRefreshVerse}
        >
          <Text
            style={[
              styles.verseText,
              {
                color: theme.colors.onSurface,
                ...selectedTextStyle,
              },
              isRTL(selectedLanguage) && styles.rtlText,
            ]}
          >
            {dailyVerse.text}
          </Text>
          <View style={[styles.metaRow, selectedMetaRowStyle]}>
            <Text
              style={[
                styles.metaLabel,
                { color: theme.colors.onSurfaceVariant },
              ]}
            >
              {dailyVerse.surah}
            </Text>
            <Text style={[styles.metaValue, { color: theme.colors.primary }]}>
              {dailyVerse.reference}
            </Text>
          </View>
        </DailyCard>

        <DailyCard
          title={t("Hadith of the day")}
          icon="format-quote-close"
          accent="#8b5cf6"
          theme={theme}
          onPress={openDailyHadithDetails}
          onRefresh={handleRefreshHadith}
        >
          <Text
            style={[
              styles.hadithText,
              {
                color: theme.colors.onSurface,
                ...selectedTextStyle,
              },
              isRTL(selectedLanguage) && styles.rtlText,
            ]}
          >
            {dailyHadith.text}
          </Text>
          <View style={[styles.metaRow, selectedMetaRowStyle]}>
            <Text
              style={[
                styles.metaLabel,
                { color: theme.colors.onSurfaceVariant },
              ]}
            >
              {dailyHadith.title}
            </Text>
            <Text style={[styles.metaValue, { color: theme.colors.primary }]}>
              {dailyHadith.source}
            </Text>
          </View>
        </DailyCard>
      </ScrollView>

      <ReminderModal
        visible={reminderModalVisible}
        theme={theme}
        selectedLanguage={selectedLanguage}
        reminderTime={reminderTime}
        isReminderEnabled={isReminderEnabled}
        isScheduling={isScheduling}
        onClose={() => setReminderModalVisible(false)}
        onSelectLanguage={setSelectedLanguage}
        onSave={handleReminderSave}
        onDisable={handleDisableReminder}
        onTimeChange={(nextTime) =>
          setReminderTime(normalizeReminderTime(nextTime))
        }
        hourOptions={hourOptions}
        minuteOptions={minuteOptions}
        textAlign={getTextAlignment(selectedLanguage)}
        writingDirection={getWritingDirection(selectedLanguage)}
        t={t}
        insets={insets}
      />
    </View>
  );
};

const DailyCard = ({
  title,
  icon,
  accent,
  theme,
  children,
  onPress,
  onRefresh,
}) => (
  <Pressable
    accessibilityRole="button"
    onPress={onPress}
    disabled={!onPress}
    style={({ pressed }) => [
      styles.card,
      { backgroundColor: theme.colors.surface, opacity: pressed ? 0.9 : 1 },
    ]}
  >
    <View style={styles.cardHeader}>
      <View style={styles.cardHeaderLeft}>
        <View style={[styles.cardBadge, { backgroundColor: accent }]}>
          <MaterialCommunityIcons name={icon} size={20} color="#ffffff" />
        </View>
        <Text style={[styles.cardTitle, { color: theme.colors.onSurface }]}>
          {title}
        </Text>
      </View>

      {onRefresh && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Refresh ${title}`}
          onPress={(event) => {
            event.stopPropagation();
            onRefresh();
          }}
          style={({ pressed }) => [
            styles.refreshButton,
            {
              backgroundColor:
                theme.colors.surfaceVariant || theme.colors.background,
              opacity: pressed ? 0.8 : 1,
            },
          ]}
        >
          <MaterialCommunityIcons
            name="refresh"
            size={18}
            color={theme.colors.onSurfaceVariant}
          />
        </Pressable>
      )}
    </View>
    {children}
  </Pressable>
);

const MiniPill = ({ onPress, icon, label, colors, badge, badgeColor }) => (
  <Pressable
    accessibilityRole="button"
    accessibilityLabel={label}
    onPress={onPress}
    style={[
      styles.miniPill,
      {
        backgroundColor: colors.surface,
        borderColor: colors.border,
      },
    ]}
  >
    <MaterialCommunityIcons name={icon} size={20} color={colors.text} />
    {badge ? (
      <View
        style={[
          styles.miniPillBadge,
          { backgroundColor: badgeColor || "#22c55e" },
        ]}
      />
    ) : null}
  </Pressable>
);

const TimePickerColumn = ({
  label,
  options,
  value,
  onChange,
  theme,
  formatValue,
}) => {
  const scrollRef = useRef(null);
  const ITEM_HEIGHT = 44;

  useEffect(() => {
    const index = options.indexOf(value);
    if (index >= 0 && scrollRef.current) {
      setTimeout(() => {
        scrollRef.current?.scrollTo({
          y: Math.max(0, index * ITEM_HEIGHT - ITEM_HEIGHT),
          animated: false,
        });
      }, 50);
    }
  }, [value, options]);

  return (
    <View style={styles.pickerColumn}>
      <Text
        style={[styles.pickerLabel, { color: theme.colors.onSurfaceVariant }]}
      >
        {label}
      </Text>
      <View
        style={[
          styles.pickerWindow,
          {
            backgroundColor:
              theme.colors.surfaceVariant || theme.colors.background,
            borderColor: theme.colors.outlineVariant,
          },
        ]}
      >
        <ScrollView
          ref={scrollRef}
          showsVerticalScrollIndicator={false}
          nestedScrollEnabled
          contentContainerStyle={styles.pickerScrollContent}
        >
          {options.map((opt) => {
            const isActive = opt === value;
            return (
              <Pressable
                key={opt}
                onPress={() => onChange(opt)}
                style={[
                  styles.pickerItem,
                  {
                    height: ITEM_HEIGHT,
                    backgroundColor: isActive
                      ? theme.colors.primary
                      : "transparent",
                  },
                ]}
              >
                <Text
                  style={[
                    styles.pickerItemText,
                    {
                      color: isActive
                        ? theme.colors.onPrimary || "#fff"
                        : theme.colors.onSurface,
                      fontWeight: isActive ? "800" : "600",
                    },
                  ]}
                >
                  {formatValue
                    ? formatValue(opt)
                    : String(opt).padStart(2, "0")}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    </View>
  );
};

const ReminderModal = ({
  visible,
  theme,
  selectedLanguage,
  reminderTime,
  isReminderEnabled,
  isScheduling,
  onClose,
  onSelectLanguage,
  onSave,
  onDisable,
  onTimeChange,
  hourOptions,
  minuteOptions,
  textAlign,
  writingDirection,
  t,
  insets,
}) => {
  const handleSave = async () => {
    await onSave({ ...reminderTime }, selectedLanguage, true);
    onClose();
  };

  return (
    <Modal
      transparent
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable
          style={[
            styles.reminderSheet,
            {
              backgroundColor: theme.colors.surface,
              paddingBottom: Math.max(insets.bottom, 20),
            },
          ]}
          onPress={(event) => event.stopPropagation()}
        >
          {/* Drag handle */}
          <View style={styles.sheetHandleRow}>
            <View
              style={[
                styles.sheetHandle,
                { backgroundColor: theme.colors.outlineVariant },
              ]}
            />
          </View>

          {/* Header */}
          <View style={styles.modalHeader}>
            <View
              style={[
                styles.modalHeaderBadge,
                { backgroundColor: theme.colors.primary },
              ]}
            >
              <MaterialCommunityIcons
                name="bell-ring-outline"
                size={20}
                color={theme.colors.onPrimary || "#fff"}
              />
            </View>
            <View style={styles.modalHeaderText}>
              <Text
                style={[styles.modalTitle, { color: theme.colors.onSurface }]}
              >
                {t("Reminder settings")}
              </Text>
              <Text
                style={[
                  styles.modalSubtitle,
                  { color: theme.colors.onSurfaceVariant },
                ]}
              >
                {isReminderEnabled
                  ? t("Currently active")
                  : t("Not yet enabled")}
              </Text>
            </View>
            <Pressable
              onPress={onClose}
              style={[
                styles.closeButton,
                {
                  backgroundColor:
                    theme.colors.surfaceVariant || theme.colors.background,
                },
              ]}
              hitSlop={8}
            >
              <MaterialCommunityIcons
                name="close"
                size={18}
                color={theme.colors.onSurface}
              />
            </Pressable>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.modalScrollContent}
            keyboardShouldPersistTaps="handled"
          >
            {/* Live time preview */}
            <View
              style={[
                styles.timePreviewCard,
                {
                  backgroundColor:
                    theme.colors.primaryContainer ||
                    theme.colors.surfaceVariant,
                },
              ]}
            >
              <MaterialCommunityIcons
                name="clock-outline"
                size={22}
                color={theme.colors.primary}
              />
              <Text
                style={[
                  styles.timePreviewText,
                  { color: theme.colors.onSurface },
                ]}
              >
                {formatReminderTime(reminderTime)}
              </Text>
              <Text
                style={[
                  styles.timePreviewHint,
                  { color: theme.colors.onSurfaceVariant },
                ]}
              >
                {t("Every day")}
              </Text>
            </View>

            {/* Language */}
            <Text
              style={[
                styles.modalSectionLabel,
                { color: theme.colors.onSurfaceVariant },
              ]}
            >
              {t("Translation language")}
            </Text>
            <View style={styles.languageGrid}>
              {LANGUAGE_OPTIONS.map((option) => {
                const isActive = selectedLanguage === option.value;
                return (
                  <Pressable
                    key={option.value}
                    onPress={() => onSelectLanguage(option.value)}
                    style={[
                      styles.languageChip,
                      {
                        backgroundColor: isActive
                          ? theme.colors.primary
                          : theme.colors.surfaceVariant,
                        borderColor: isActive
                          ? theme.colors.primary
                          : theme.colors.outlineVariant,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.languageChipText,
                        {
                          color: isActive
                            ? theme.colors.onPrimary || "#fff"
                            : theme.colors.onSurface,
                        },
                        { textAlign, writingDirection },
                      ]}
                    >
                      {t(option.label)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Time pickers */}
            <Text
              style={[
                styles.modalSectionLabel,
                { color: theme.colors.onSurfaceVariant },
              ]}
            >
              {t("Notification time")}
            </Text>

            <View style={styles.pickerRow}>
              <TimePickerColumn
                label={t("Hour")}
                options={hourOptions}
                value={reminderTime.hour}
                onChange={(hour) => onTimeChange({ ...reminderTime, hour })}
                theme={theme}
              />
              <View style={styles.pickerSeparator}>
                <Text
                  style={[
                    styles.pickerColon,
                    { color: theme.colors.onSurface },
                  ]}
                >
                  :
                </Text>
              </View>
              <TimePickerColumn
                label={t("Minute")}
                options={minuteOptions}
                value={reminderTime.minute}
                onChange={(minute) => onTimeChange({ ...reminderTime, minute })}
                theme={theme}
              />
            </View>
          </ScrollView>

          {/* Footer actions */}
          <View style={styles.modalFooter}>
            <Pressable
              onPress={handleSave}
              style={[
                styles.saveButton,
                { backgroundColor: theme.colors.primary },
              ]}
              disabled={isScheduling}
            >
              {isScheduling ? (
                <ActivityIndicator
                  color={theme.colors.onPrimary || "#fff"}
                  size="small"
                />
              ) : (
                <>
                  <MaterialCommunityIcons
                    name="check"
                    size={18}
                    color={theme.colors.onPrimary || "#fff"}
                  />
                  <Text
                    style={[
                      styles.saveButtonText,
                      { color: theme.colors.onPrimary || "#fff" },
                    ]}
                  >
                    {isReminderEnabled
                      ? t("Update reminder")
                      : t("Enable reminder")}
                  </Text>
                </>
              )}
            </Pressable>

            {isReminderEnabled && (
              <Pressable
                onPress={onDisable}
                style={[
                  styles.disableButton,
                  {
                    borderColor: theme.colors.error || "#ef4444",
                  },
                ]}
                disabled={isScheduling}
              >
                <MaterialCommunityIcons
                  name="bell-off-outline"
                  size={18}
                  color={theme.colors.error || "#ef4444"}
                />
                <Text
                  style={[
                    styles.disableButtonText,
                    { color: theme.colors.error || "#ef4444" },
                  ]}
                >
                  {t("Turn off reminder")}
                </Text>
              </Pressable>
            )}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
};

export default IslamicHistory;

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  pillHeaderWrapper: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 30,
    paddingHorizontal: 14,
  },
  pillRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  miniPill: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  miniPillBadge: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  titleCapsule: {
    flex: 1,
    minHeight: 42,
    borderRadius: 21,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 18,
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  pillTitle: {
    fontSize: 15,
    fontWeight: "800",
    textAlign: "center",
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 18,
    paddingBottom: 42,
  },
  heroCard: {
    borderRadius: 28,
    padding: 20,
    marginBottom: 18,
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
  heroTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  heroIcon: {
    width: 56,
    height: 56,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  statusPillText: {
    fontSize: 12,
    fontWeight: "700",
  },
  heroLabel: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  heroText: {
    fontSize: 18,
    fontWeight: "700",
    lineHeight: 26,
  },
  heroButton: {
    marginTop: 18,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  heroButtonText: {
    fontSize: 13,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  heroStatusRow: {
    marginTop: 18,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: StyleSheet.hairlineWidth,
  },
  heroStatusLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  heroStatusTime: {
    fontSize: 16,
    fontWeight: "700",
  },
  heroStatusMeta: {
    fontSize: 12,
    fontWeight: "500",
    marginTop: 2,
  },
  card: {
    borderRadius: 24,
    padding: 18,
    marginBottom: 18,
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 16,
  },
  cardBadge: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "700",
  },
  verseText: {
    fontSize: 22,
    lineHeight: 34,
    fontWeight: "600",
  },
  hadithText: {
    fontSize: 19,
    lineHeight: 31,
    fontWeight: "500",
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    marginTop: 18,
    flexWrap: "wrap",
  },
  metaLabel: {
    fontSize: 12,
    fontWeight: "600",
    flexShrink: 1,
  },
  metaValue: {
    fontSize: 12,
    fontWeight: "700",
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  reminderSheet: {
    width: "100%",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 8,
    maxHeight: "92%",
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: -8 },
    elevation: 12,
  },
  sheetHandleRow: {
    alignItems: "center",
    paddingVertical: 8,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 16,
  },
  modalHeaderBadge: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  modalHeaderText: {
    flex: 1,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "800",
  },
  modalSubtitle: {
    fontSize: 13,
    fontWeight: "500",
    marginTop: 2,
  },
  closeButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  modalScrollContent: {
    paddingBottom: 12,
  },
  timePreviewCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 16,
    paddingHorizontal: 18,
    borderRadius: 18,
    marginBottom: 20,
  },
  timePreviewText: {
    fontSize: 28,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  timePreviewHint: {
    fontSize: 13,
    fontWeight: "600",
    marginLeft: "auto",
  },
  modalSectionLabel: {
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 10,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  languageGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 22,
  },
  languageChip: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  languageChipText: {
    fontSize: 13,
    fontWeight: "700",
  },
  pickerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginBottom: 8,
  },
  pickerColumn: {
    flex: 1,
  },
  pickerLabel: {
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 8,
    textAlign: "center",
  },
  pickerWindow: {
    height: 176,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  pickerScrollContent: {
    paddingVertical: 8,
  },
  pickerItem: {
    alignItems: "center",
    justifyContent: "center",
    marginHorizontal: 8,
    borderRadius: 12,
  },
  pickerItemText: {
    fontSize: 17,
  },
  pickerSeparator: {
    width: 20,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 36,
  },
  pickerColon: {
    fontSize: 28,
    fontWeight: "700",
  },
  modalFooter: {
    gap: 10,
    paddingTop: 8,
  },
  saveButton: {
    minHeight: 52,
    borderRadius: 16,
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  saveButtonText: {
    fontSize: 15,
    fontWeight: "800",
  },
  disableButton: {
    minHeight: 48,
    borderRadius: 16,
    borderWidth: 1.5,
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  disableButtonText: {
    fontSize: 14,
    fontWeight: "700",
  },
  rtlText: {
    writingDirection: "rtl",
  },
});
