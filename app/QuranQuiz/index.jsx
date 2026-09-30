import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  BackHandler,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Animated, {
  FadeIn,
  FadeInDown,
  FadeInUp,
  ZoomIn,
  Layout,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  withSequence,
} from "react-native-reanimated";
import { useFocusEffect, useNavigation, useRouter } from "expo-router";
import { Icon, useTheme } from "react-native-paper";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getQuranVerses, getSurahNames } from "../../components/quranData";
import { useQuranTranslationStore } from "../../components/store/store";
import {
  getTextAlignment,
  getWritingDirection,
} from "../../components/utils/rtlUtils";
import FloatingLanguagePickerModal from "../../components/FloatingLanguagePickerModal";

const QUESTION_COUNT = 10;
const SURAH_NAMES = getSurahNames();

const shuffle = (items) => [...items].sort(() => Math.random() - 0.5);

const MODE_META = {
  surah: {
    key: "surah",
    icon: "book-open-page-variant",
    color: "#14b8a6",
    label: "Surah Sprint",
    description: "Find the surah from an ayah",
    accent: "#0f766e",
  },
  ayah: {
    key: "ayah",
    icon: "numeric",
    color: "#60a5fa",
    label: "Ayah Rush",
    description: "Spot the ayah number",
    accent: "#2563eb",
  },
  truefalse: {
    key: "truefalse",
    icon: "check-decagram",
    color: "#f59e0b",
    label: "True or False",
    description: "Trust your Quran knowledge",
    accent: "#b45309",
  },
  reference: {
    key: "reference",
    icon: "format-list-numbered",
    color: "#f472b6",
    label: "Verse Match",
    description: "Match the complete reference",
    accent: "#be185d",
  },
  sequence: {
    key: "sequence",
    icon: "arrow-right-thin-circle-outline",
    color: "#a78bfa",
    label: "Surah Flow",
    description: "Choose the next surah in order",
    accent: "#6d28d9",
  },
};

const createSequenceQuestion = () => {
  const baseSurah =
    SURAH_NAMES[Math.floor(Math.random() * (SURAH_NAMES.length - 1))];
  const nextSurah =
    SURAH_NAMES.find((entry) => entry.index === baseSurah.index + 1) ||
    SURAH_NAMES[0];
  const distractors = shuffle(
    SURAH_NAMES.filter(
      (entry) =>
        entry.index !== baseSurah.index && entry.index !== nextSurah.index,
    ),
  ).slice(0, 3);

  return {
    type: "sequence",
    baseSurah,
    correctSurah: nextSurah,
    options: shuffle([nextSurah, ...distractors]),
    promptKey: "Which surah comes next?",
    promptHint: `${baseSurah.tname}`,
  };
};

/* ------------------------------------------------------------------ */
/*  Question generators                                               */
/* ------------------------------------------------------------------ */

const createSurahQuestion = (verses) => {
  const verse = verses[Math.floor(Math.random() * verses.length)];
  const correctSurah = SURAH_NAMES.find((s) => s.index === verse.surah);
  const distractors = shuffle(
    SURAH_NAMES.filter((s) => s.index !== verse.surah),
  ).slice(0, 3);

  return {
    type: "surah",
    verse,
    correctSurah,
    options: shuffle([correctSurah, ...distractors]),
    promptKey: "Which surah contains this ayah?",
  };
};

const createAyahQuestion = (verses) => {
  const verse = verses[Math.floor(Math.random() * verses.length)];
  const correct = verse.ayah;
  const distractors = new Set();
  while (distractors.size < 3) {
    const offset = Math.floor(Math.random() * 9) + 1;
    const candidate =
      Math.random() > 0.5 ? correct + offset : Math.max(1, correct - offset);
    if (candidate !== correct) distractors.add(candidate);
  }

  return {
    type: "ayah",
    verse,
    correctAyah: correct,
    options: shuffle([correct, ...Array.from(distractors)]),
    promptKey: "What is the ayah number of this verse?",
  };
};

const createReferenceQuestion = (verses) => {
  const verse = verses[Math.floor(Math.random() * verses.length)];
  const correctReference = `${verse.surah}:${verse.ayah}`;
  const distractors = shuffle(verses.filter((item) => item.id !== verse.id))
    .slice(0, 3)
    .map((item) => `${item.surah}:${item.ayah}`);

  return {
    type: "reference",
    verse,
    correctReference,
    options: shuffle([correctReference, ...distractors]),
    promptKey: "Which reference matches this ayah?",
  };
};

const createTrueFalseQuestion = (verses) => {
  const verse = verses[Math.floor(Math.random() * verses.length)];
  const correctSurah = SURAH_NAMES.find((s) => s.index === verse.surah);
  const isTrue = Math.random() > 0.45;

  let claimedSurah = correctSurah;
  if (!isTrue) {
    claimedSurah = shuffle(
      SURAH_NAMES.filter((s) => s.index !== verse.surah),
    )[0];
  }

  return {
    type: "truefalse",
    verse,
    correctSurah,
    claimedSurah,
    isTrue,
    options: [
      { label: "True", value: true },
      { label: "False", value: false },
    ],
    promptKey: "Does this ayah belong to the following surah?",
  };
};

const createQuestion = (verses, mode) => {
  if (mode === "ayah") return createAyahQuestion(verses);
  if (mode === "truefalse") return createTrueFalseQuestion(verses);
  if (mode === "reference") return createReferenceQuestion(verses);
  if (mode === "sequence") return createSequenceQuestion();
  return createSurahQuestion(verses);
};

const getModeList = (t) =>
  Object.keys(MODE_META).map((key) => ({
    ...MODE_META[key],
    label:
      key === "surah"
        ? t("Surah Finder")
        : key === "ayah"
          ? t("Ayah Number")
          : key === "truefalse"
            ? t("True or False")
            : key === "reference"
              ? t("Verse Match")
              : "Surah Flow",
    description:
      key === "surah"
        ? t("Find the surah from an ayah")
        : key === "ayah"
          ? t("Spot the ayah number")
          : key === "truefalse"
            ? t("Trust your Quran knowledge")
            : key === "reference"
              ? t("Match the complete reference")
              : "Choose the next surah in order",
  }));

const QuranQuiz = () => {
  const theme = useTheme();
  const navigation = useNavigation();
  const router = useRouter();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { translationLanguage, setTranslationLanguage } =
    useQuranTranslationStore();

  const verses = useMemo(
    () => getQuranVerses(translationLanguage),
    [translationLanguage],
  );

  const [mode, setMode] = useState("surah");
  const [question, setQuestion] = useState(() =>
    createQuestion(verses, "surah"),
  );
  const [selected, setSelected] = useState(null);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [round, setRound] = useState(1);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [finished, setFinished] = useState(false);
  const [showHub, setShowHub] = useState(true);

  const progress = useSharedValue(0);
  const cardScale = useSharedValue(1);
  const feedbackOpacity = useSharedValue(0);

  const textAlign = getTextAlignment(translationLanguage);
  const writingDirection = getWritingDirection(translationLanguage);
  const isAnswered = selected !== null;

  const modeCards = useMemo(() => getModeList(t), [t]);

  const isCorrect = useMemo(() => {
    if (!isAnswered) return false;
    if (question.type === "surah") {
      return selected === question.correctSurah.index;
    }
    if (question.type === "ayah") {
      return selected === question.correctAyah;
    }
    if (question.type === "reference") {
      return selected === question.correctReference;
    }
    if (question.type === "sequence") {
      return selected === question.correctSurah.index;
    }
    return selected === question.isTrue;
  }, [isAnswered, selected, question]);

  const handleBack = useCallback(() => {
    if (showHub) {
      router.back();
      return true;
    }

    setShowHub(true);
    return true;
  }, [router, showHub]);

  useFocusEffect(
    useCallback(() => {
      navigation.setOptions({ headerShown: false });

      const backAction = () => handleBack();
      const subscription = BackHandler.addEventListener(
        "hardwareBackPress",
        backAction,
      );

      return () => subscription.remove();
    }, [handleBack, navigation]),
  );

  useEffect(() => {
    progress.value = withTiming((round - 1) / QUESTION_COUNT, {
      duration: 400,
    });
  }, [progress, round]);

  const progressStyle = useAnimatedStyle(() => ({
    width: `${progress.value * 100}%`,
  }));

  const cardAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: cardScale.value }],
  }));

  const answerQuestion = useCallback(
    (value) => {
      if (isAnswered) return;

      setSelected(value);

      let correct = false;
      if (question.type === "surah") {
        correct = value === question.correctSurah.index;
      } else if (question.type === "ayah") {
        correct = value === question.correctAyah;
      } else if (question.type === "reference") {
        correct = value === question.correctReference;
      } else if (question.type === "sequence") {
        correct = value === question.correctSurah.index;
      } else {
        correct = value === question.isTrue;
      }

      if (correct) {
        const bonus = Math.min(streak + 1, 5);
        setScore((s) => s + 1 + Math.floor(bonus / 2));
        setStreak((s) => {
          const next = s + 1;
          setBestStreak((b) => Math.max(b, next));
          return next;
        });
        cardScale.set(
          withSequence(withSpring(1.03, { damping: 12 }), withSpring(1)),
        );
      } else {
        setStreak(0);
        cardScale.set(
          withSequence(withTiming(0.97, { duration: 80 }), withSpring(1)),
        );
      }

      feedbackOpacity.set(withTiming(1, { duration: 250 }));
    },
    [cardScale, feedbackOpacity, isAnswered, question, streak],
  );

  const nextQuestion = useCallback(() => {
    if (round >= QUESTION_COUNT) {
      setFinished(true);
      return;
    }

    feedbackOpacity.set(0);
    setQuestion(createQuestion(verses, mode));
    setSelected(null);
    setRound((r) => r + 1);
  }, [feedbackOpacity, mode, round, verses]);

  const restart = useCallback(() => {
    setQuestion(createQuestion(verses, mode));
    setSelected(null);
    setScore(0);
    setStreak(0);
    setBestStreak(0);
    setRound(1);
    setFinished(false);
    setShowHub(false);
    progress.set(0);
  }, [mode, progress, verses]);

  const changeMode = useCallback(
    (newMode) => {
      setMode(newMode);
      setQuestion(createQuestion(verses, newMode));
      setSelected(null);
      setScore(0);
      setStreak(0);
      setBestStreak(0);
      setRound(1);
      setFinished(false);
      setShowHub(false);
      progress.set(0);
    },
    [progress, verses],
  );

  const handleLanguageSelect = useCallback(
    (value) => {
      const nextVerses = getQuranVerses(value);
      setTranslationLanguage(value);
      setQuestion(createQuestion(nextVerses, mode));
      setSelected(null);
      setScore(0);
      setStreak(0);
      setBestStreak(0);
      setRound(1);
      setFinished(false);
      setPickerVisible(false);
    },
    [setTranslationLanguage, mode],
  );

  const translationOptions = useMemo(
    () => [
      { label: t("English"), value: "english", icon: "translate" },
      { label: t("Pashto"), value: "pashto", icon: "translate" },
      { label: t("Dari"), value: "dari", icon: "translate" },
      { label: t("Arabic"), value: "arabic", icon: "translate" },
    ],
    [t],
  );

  const modeLabels = {
    surah: t("Surah Finder"),
    ayah: t("Ayah Number"),
    truefalse: t("True or False"),
    reference: t("Verse Match"),
    sequence: "Surah Flow",
  };

  const currentModeMeta = MODE_META[mode] || MODE_META.surah;

  const renderOptions = () => {
    if (question.type === "truefalse") {
      return question.options.map((opt, idx) => {
        const isSelected = selected === opt.value;
        const isAnswer = opt.value === question.isTrue;

        let bg = theme.colors.surface;
        let borderColor = theme.colors.outlineVariant;
        let color = theme.colors.onSurface;

        if (isAnswered) {
          if (isAnswer) {
            bg = "#dcfce7";
            borderColor = "#22c55e";
            color = "#166534";
          } else if (isSelected) {
            bg = "#fee2e2";
            borderColor = "#ef4444";
            color = "#991b1b";
          } else {
            color = theme.colors.onSurfaceVariant;
          }
        }

        return (
          <Animated.View
            key={opt.label}
            entering={FadeInDown.delay(idx * 80).springify()}
            layout={Layout.springify()}
          >
            <Pressable
              onPress={() => answerQuestion(opt.value)}
              style={[
                styles.tfOption,
                {
                  backgroundColor: bg,
                  borderColor,
                },
              ]}
            >
              <Text style={[styles.tfText, { color }]}>{t(opt.label)}</Text>
              {isAnswered && (isAnswer || isSelected) && (
                <Icon
                  source={isAnswer ? "check-circle" : "close-circle"}
                  size={24}
                  color={color}
                />
              )}
            </Pressable>
          </Animated.View>
        );
      });
    }

    return question.options.map((option, idx) => {
      const isSurahOption =
        question.type === "surah" || question.type === "sequence";
      const value = isSurahOption ? option.index : option;
      const label = isSurahOption
        ? option.tname || option.name || option
        : question.type === "reference"
          ? option
          : String(option);

      const isSelected = selected === value;
      const isAnswer =
        question.type === "surah"
          ? value === question.correctSurah.index
          : question.type === "reference"
            ? value === question.correctReference
            : question.type === "sequence"
              ? value === question.correctSurah.index
              : value === question.correctAyah;

      let bg = theme.colors.surface;
      let borderColor = "transparent";
      let color = theme.colors.onSurface;

      if (isAnswered) {
        if (isAnswer) {
          bg = "#dcfce7";
          borderColor = "#22c55e";
          color = "#166534";
        } else if (isSelected) {
          bg = "#fee2e2";
          borderColor = "#ef4444";
          color = "#991b1b";
        } else {
          color = theme.colors.onSurfaceVariant;
        }
      }

      return (
        <Animated.View
          key={`${question.type}-${value}-${idx}`}
          entering={FadeInDown.delay(idx * 70).springify()}
          layout={Layout.springify()}
        >
          <Pressable
            onPress={() => answerQuestion(value)}
            style={[
              styles.option,
              {
                backgroundColor: bg,
                borderColor,
                borderWidth: isAnswered ? 1.5 : 0,
              },
            ]}
          >
            {(question.type === "surah" || question.type === "sequence") && (
              <View
                style={[
                  styles.optionBadge,
                  { backgroundColor: theme.colors.surfaceVariant },
                ]}
              >
                <Text style={[styles.optionNumber, { color }]}>
                  {option.index}
                </Text>
              </View>
            )}
            <Text
              style={[
                styles.optionText,
                { color, textAlign, writingDirection },
              ]}
              numberOfLines={2}
            >
              {label}
            </Text>
            {isAnswered && (isAnswer || isSelected) && (
              <Icon
                source={isAnswer ? "check-circle" : "close-circle"}
                size={22}
                color={color}
              />
            )}
          </Pressable>
        </Animated.View>
      );
    });
  };

  if (showHub) {
    return (
      <ScrollView
        style={[styles.container, { backgroundColor: theme.colors.background }]}
        contentContainerStyle={[
          styles.hubContent,
          { paddingTop: insets.top + 18 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View entering={FadeInDown.duration(450)}>
          <View style={styles.heroHeader}>
            <Pressable
              onPress={handleBack}
              style={styles.hubBack}
              accessibilityRole="button"
              accessibilityLabel={t("Go back")}
            >
              <Icon
                source="arrow-left"
                size={21}
                color={theme.colors.onSurface}
              />
            </Pressable>
            <View style={styles.heroBadge}>
              <Text
                style={[styles.heroBadgeText, { color: theme.colors.primary }]}
              >
                {t("Quran Challenge")}
              </Text>
            </View>
          </View>

          <Text style={[styles.hubTitle, { color: theme.colors.onSurface }]}>
            {t("Learn through play")}
          </Text>
          <Text
            style={[
              styles.hubSubtitle,
              { color: theme.colors.onSurfaceVariant },
            ]}
          >
            {t("Choose a challenge and sharpen your Quran memory.")}
          </Text>

          <Animated.View
            entering={FadeInUp.delay(120).duration(600)}
            style={[
              styles.featureCard,
              {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.outlineVariant,
              },
            ]}
          >
            <View
              style={[
                styles.featurePill,
                { backgroundColor: currentModeMeta.color },
              ]}
            >
              <Icon source={currentModeMeta.icon} size={24} color="#fff" />
            </View>
            <View style={styles.featureTextWrap}>
              <Text
                style={[styles.featureEyebrow, { color: theme.colors.primary }]}
              >
                {t("Featured mode")}
              </Text>
              <Text
                style={[styles.featureTitle, { color: theme.colors.onSurface }]}
              >
                {modeLabels[mode]}
              </Text>
              <Text
                style={[
                  styles.featureDescription,
                  { color: theme.colors.onSurfaceVariant },
                ]}
              >
                {currentModeMeta.description}
              </Text>
            </View>
            <Pressable
              onPress={() => changeMode(mode)}
              style={[
                styles.playButton,
                { backgroundColor: currentModeMeta.color },
              ]}
            >
              <Text style={styles.playButtonText}>{t("Play")}</Text>
            </Pressable>
          </Animated.View>
        </Animated.View>

        <View style={styles.modeGrid}>
          {modeCards.map((card, index) => (
            <Animated.View
              key={card.key}
              entering={FadeInDown.delay(160 + index * 70).springify()}
              style={styles.modeCardWrap}
            >
              <Pressable
                onPress={() => changeMode(card.key)}
                style={({ pressed }) => [
                  styles.modeCard,
                  {
                    backgroundColor: theme.colors.surface,
                    borderColor: theme.colors.outlineVariant,
                    opacity: pressed ? 0.82 : 1,
                  },
                ]}
                accessibilityRole="button"
                accessibilityLabel={card.description}
              >
                <View
                  style={[styles.modeIcon, { backgroundColor: card.color }]}
                >
                  <Icon source={card.icon} size={24} color="#ffffff" />
                </View>
                <Text
                  style={[
                    styles.modeCardTitle,
                    { color: theme.colors.onSurface },
                  ]}
                >
                  {card.label}
                </Text>
                <Text
                  style={[
                    styles.modeCardDescription,
                    { color: theme.colors.onSurfaceVariant },
                  ]}
                >
                  {card.description}
                </Text>
                <View style={styles.modeArrow}>
                  <Icon
                    source="arrow-top-right"
                    size={18}
                    color={card.accent}
                  />
                </View>
              </Pressable>
            </Animated.View>
          ))}
        </View>

        <Animated.View
          entering={FadeInUp.delay(380).duration(500)}
          style={[
            styles.hubTip,
            { backgroundColor: theme.colors.primaryContainer },
          ]}
        >
          <Icon
            source="lightbulb-on-outline"
            size={21}
            color={theme.colors.onPrimaryContainer}
          />
          <Text
            style={[
              styles.hubTipText,
              { color: theme.colors.onPrimaryContainer },
            ]}
          >
            {t(
              "Every round has 10 questions. Keep your streak alive for bonus points!",
            )}
          </Text>
        </Animated.View>
      </ScrollView>
    );
  }

  if (finished) {
    return (
      <View
        style={[styles.container, { backgroundColor: theme.colors.background }]}
      >
        <Animated.View
          entering={ZoomIn.springify()}
          style={[
            styles.finishedCard,
            { backgroundColor: theme.colors.surface },
          ]}
        >
          <Text style={styles.finishedEmoji}>🎉</Text>
          <Text
            style={[styles.finishedTitle, { color: theme.colors.onSurface }]}
          >
            {t("Round Complete!")}
          </Text>

          <View style={styles.finishedStats}>
            <View style={styles.finishedStat}>
              <Text
                style={[
                  styles.finishedStatValue,
                  { color: theme.colors.primary },
                ]}
              >
                {score}
              </Text>
              <Text
                style={[
                  styles.finishedStatLabel,
                  { color: theme.colors.onSurfaceVariant },
                ]}
              >
                {t("Score")}
              </Text>
            </View>
            <View style={styles.finishedStat}>
              <Text
                style={[
                  styles.finishedStatValue,
                  { color: theme.colors.primary },
                ]}
              >
                {bestStreak}
              </Text>
              <Text
                style={[
                  styles.finishedStatLabel,
                  { color: theme.colors.onSurfaceVariant },
                ]}
              >
                {t("Best Streak")}
              </Text>
            </View>
          </View>

          <Pressable
            onPress={restart}
            style={[
              styles.primaryButton,
              { backgroundColor: theme.colors.primary },
            ]}
          >
            <Text
              style={[
                styles.primaryButtonText,
                {
                  color:
                    theme.colors.onPrimary || theme.colors.buttonText || "#fff",
                },
              ]}
            >
              {t("Play again")}
            </Text>
          </Pressable>

          <Pressable
            onPress={() => setShowHub(true)}
            style={styles.secondaryButton}
          >
            <Text
              style={[
                styles.secondaryButtonText,
                { color: theme.colors.primary },
              ]}
            >
              {t("Change mode")}
            </Text>
          </Pressable>
        </Animated.View>
      </View>
    );
  }

  return (
    <View
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      <View style={[styles.floatingHeader, { paddingTop: insets.top + 8 }]}>
        <Pressable
          onPress={handleBack}
          style={[
            styles.headerPill,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.outlineVariant,
            },
          ]}
        >
          <Icon source="arrow-left" size={22} color={theme.colors.onSurface} />
        </Pressable>

        <Pressable
          onPress={() => setShowHub(true)}
          style={[
            styles.titleCapsule,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.outlineVariant,
            },
          ]}
        >
          <Text
            style={[styles.headerTitle, { color: theme.colors.onSurface }]}
            numberOfLines={1}
          >
            {modeLabels[mode]}
          </Text>
          <Icon
            source="chevron-down"
            size={18}
            color={theme.colors.onSurfaceVariant}
          />
        </Pressable>

        <Pressable
          onPress={() => setPickerVisible(true)}
          style={[
            styles.headerPill,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.outlineVariant,
            },
          ]}
        >
          <Icon source="translate" size={20} color={theme.colors.onSurface} />
        </Pressable>
      </View>

      <View
        style={[
          styles.progressTrack,
          {
            top: insets.top + 62,
            backgroundColor: theme.colors.surfaceVariant,
          },
        ]}
      >
        <Animated.View
          style={[
            styles.progressFill,
            { backgroundColor: theme.colors.primary },
            progressStyle,
          ]}
        />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 84 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View entering={FadeIn.duration(400)} style={styles.statsRow}>
          <Stat
            label={t("Question")}
            value={`${round}/${QUESTION_COUNT}`}
            theme={theme}
          />
          <Stat label={t("Score")} value={`${score}`} theme={theme} highlight />
          <Stat
            label={t("Streak")}
            value={streak > 0 ? `🔥 ${streak}` : "0"}
            theme={theme}
          />
        </Animated.View>

        <Animated.View style={cardAnimStyle}>
          <View
            style={[
              styles.prompt,
              {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.outlineVariant,
              },
            ]}
          >
            <Text style={[styles.eyebrow, { color: theme.colors.primary }]}>
              {question.type === "sequence"
                ? "Next in the sequence"
                : t(question.promptKey)}
            </Text>

            {question.type === "sequence" && (
              <View
                style={[
                  styles.sequenceBadge,
                  { backgroundColor: theme.colors.primaryContainer },
                ]}
              >
                <Text
                  style={[
                    styles.sequenceBadgeText,
                    { color: theme.colors.onPrimaryContainer },
                  ]}
                >
                  {question.baseSurah.tname}
                </Text>
              </View>
            )}

            {question.type === "truefalse" && (
              <View
                style={[
                  styles.claimedSurah,
                  { backgroundColor: theme.colors.primaryContainer },
                ]}
              >
                <Text
                  style={[
                    styles.claimedSurahText,
                    { color: theme.colors.onPrimaryContainer },
                  ]}
                >
                  {question.claimedSurah.tname}
                </Text>
              </View>
            )}

            <Text
              style={[
                styles.verse,
                {
                  color: theme.colors.onSurface,
                  textAlign,
                  writingDirection,
                },
              ]}
            >
              {question.verse ? question.verse.verse : question.baseSurah.tname}
            </Text>

            <Text
              style={[
                styles.ayah,
                {
                  color: theme.colors.onSurfaceVariant,
                  textAlign,
                  writingDirection,
                },
              ]}
            >
              {question.type === "ayah"
                ? t("Guess the ayah number")
                : question.type === "sequence"
                  ? "Pick the next surah in order"
                  : `${t("Ayah")} ${question.verse.ayah}`}
            </Text>
          </View>
        </Animated.View>

        <View style={styles.options}>{renderOptions()}</View>

        {isAnswered && (
          <Animated.View
            entering={FadeInUp.springify()}
            style={styles.feedbackArea}
          >
            <Text
              style={[
                styles.feedback,
                {
                  color: isCorrect ? "#15803d" : "#b91c1c",
                },
              ]}
            >
              {isCorrect
                ? streak >= 3
                  ? t("🔥 Amazing streak!")
                  : t("Correct!")
                : question.type === "surah"
                  ? t("The answer is {{surah}}", {
                      surah: question.correctSurah.tname,
                    })
                  : question.type === "ayah"
                    ? t("The correct ayah is {{n}}", {
                        n: question.correctAyah,
                      })
                    : question.type === "reference"
                      ? t("The correct reference is {{reference}}", {
                          reference: question.correctReference,
                        })
                      : question.type === "sequence"
                        ? t("The next surah is {{surah}}", {
                            surah: question.correctSurah.tname,
                          })
                        : t(
                            question.isTrue
                              ? "Yes, it belongs to that surah"
                              : "No, it belongs to {{surah}}",
                            { surah: question.correctSurah.tname },
                          )}
            </Text>

            <Pressable
              onPress={nextQuestion}
              style={[
                styles.nextButton,
                { backgroundColor: theme.colors.primary },
              ]}
            >
              <Text
                style={[
                  styles.nextButtonText,
                  {
                    color:
                      theme.colors.onPrimary ||
                      theme.colors.buttonText ||
                      "#fff",
                  },
                ]}
              >
                {round === QUESTION_COUNT
                  ? t("See results")
                  : t("Next question")}
              </Text>
              <Icon
                source="arrow-right"
                size={20}
                color={
                  theme.colors.onPrimary || theme.colors.buttonText || "#fff"
                }
              />
            </Pressable>
          </Animated.View>
        )}
      </ScrollView>

      <FloatingLanguagePickerModal
        visible={pickerVisible}
        title={t("Select Quran translation language")}
        options={translationOptions}
        selectedValue={translationLanguage}
        onSelect={handleLanguageSelect}
        onClose={() => setPickerVisible(false)}
      />
    </View>
  );
};

const Stat = ({ label, value, theme, highlight = false }) => (
  <View
    style={[
      styles.stat,
      highlight && {
        backgroundColor: theme.colors.primaryContainer,
      },
    ]}
  >
    <Text
      style={[
        styles.statValue,
        {
          color: highlight
            ? theme.colors.onPrimaryContainer
            : theme.colors.onSurface,
        },
      ]}
    >
      {value}
    </Text>
    <Text
      style={[
        styles.statLabel,
        {
          color: highlight
            ? theme.colors.onPrimaryContainer
            : theme.colors.onSurfaceVariant,
        },
      ]}
    >
      {label}
    </Text>
  </View>
);

export default QuranQuiz;

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { flex: 1 },
  heroHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 22,
  },
  heroBadge: {
    borderRadius: 999,
    backgroundColor: "rgba(37, 135, 216, 0.12)",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  heroBadgeText: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  hubContent: {
    paddingHorizontal: 20,
    paddingBottom: 36,
  },
  hubBack: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(128,128,128,0.12)",
  },
  hubTitle: {
    fontSize: 38,
    lineHeight: 42,
    fontWeight: "900",
    letterSpacing: -0.9,
  },
  hubSubtitle: {
    fontSize: 16,
    lineHeight: 24,
    marginTop: 10,
    maxWidth: 330,
  },
  featureCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginTop: 28,
    borderRadius: 26,
    borderWidth: 1,
    padding: 16,
  },
  featurePill: {
    width: 54,
    height: 54,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  featureTextWrap: {
    flex: 1,
  },
  featureEyebrow: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  featureTitle: {
    fontSize: 18,
    fontWeight: "800",
    marginBottom: 2,
  },
  featureDescription: {
    fontSize: 12,
    lineHeight: 18,
  },
  playButton: {
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  playButtonText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  modeGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginTop: 30,
  },
  modeCardWrap: {
    width: "48%",
    flexGrow: 1,
    minWidth: 145,
  },
  modeCard: {
    minHeight: 190,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
  },
  modeIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 18,
  },
  modeCardTitle: {
    fontSize: 16,
    lineHeight: 21,
    fontWeight: "800",
  },
  modeCardDescription: {
    fontSize: 12,
    lineHeight: 17,
    marginTop: 5,
    paddingRight: 4,
  },
  modeArrow: {
    position: "absolute",
    right: 14,
    bottom: 14,
  },
  hubTip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 18,
    padding: 15,
    marginTop: 18,
  },
  hubTipText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "600",
  },
  content: {
    paddingHorizontal: 18,
    paddingBottom: 48,
  },
  floatingHeader: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
  },
  headerPill: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  titleCapsule: {
    flex: 1,
    minHeight: 42,
    borderRadius: 21,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "700",
    maxWidth: "80%",
  },
  progressTrack: {
    position: "absolute",
    left: 16,
    right: 16,
    height: 4,
    borderRadius: 2,
    overflow: "hidden",
    zIndex: 15,
  },
  progressFill: {
    height: "100%",
    borderRadius: 2,
  },
  statsRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 18,
  },
  stat: {
    flex: 1,
    backgroundColor: "rgba(128,128,128,0.08)",
    borderRadius: 16,
    paddingVertical: 12,
    alignItems: "center",
  },
  statValue: {
    fontSize: 18,
    fontWeight: "800",
  },
  statLabel: {
    fontSize: 11,
    marginTop: 2,
    fontWeight: "500",
  },
  prompt: {
    borderRadius: 24,
    padding: 22,
    minHeight: 210,
    justifyContent: "center",
    marginBottom: 20,
    borderWidth: StyleSheet.hairlineWidth,
    elevation: 2,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
  },
  sequenceBadge: {
    alignSelf: "center",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    marginBottom: 16,
  },
  sequenceBadgeText: {
    fontSize: 15,
    fontWeight: "700",
  },
  eyebrow: {
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 14,
    textAlign: "center",
    letterSpacing: 0.3,
  },
  claimedSurah: {
    alignSelf: "center",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginBottom: 16,
  },
  claimedSurahText: {
    fontSize: 15,
    fontWeight: "700",
  },
  verse: {
    fontSize: 20,
    lineHeight: 32,
    fontWeight: "600",
  },
  ayah: {
    fontSize: 13,
    marginTop: 16,
    textAlign: "center",
    fontWeight: "500",
  },
  options: {
    gap: 12,
  },
  option: {
    minHeight: 60,
    borderRadius: 16,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  optionBadge: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  optionNumber: {
    fontSize: 13,
    fontWeight: "700",
  },
  optionText: {
    flex: 1,
    fontSize: 16,
    fontWeight: "600",
  },
  tfOption: {
    minHeight: 64,
    borderRadius: 18,
    borderWidth: 1.5,
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  tfText: {
    fontSize: 18,
    fontWeight: "700",
  },
  feedbackArea: {
    alignItems: "center",
    marginTop: 28,
  },
  feedback: {
    fontSize: 17,
    fontWeight: "700",
    marginBottom: 16,
    textAlign: "center",
  },
  nextButton: {
    minHeight: 54,
    borderRadius: 16,
    paddingHorizontal: 28,
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  nextButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
  finishedCard: {
    marginHorizontal: 24,
    marginTop: 120,
    borderRadius: 28,
    padding: 32,
    alignItems: "center",
  },
  finishedEmoji: {
    fontSize: 56,
    marginBottom: 12,
  },
  finishedTitle: {
    fontSize: 24,
    fontWeight: "800",
    marginBottom: 28,
  },
  finishedStats: {
    flexDirection: "row",
    gap: 32,
    marginBottom: 32,
  },
  finishedStat: {
    alignItems: "center",
  },
  finishedStatValue: {
    fontSize: 36,
    fontWeight: "800",
  },
  finishedStatLabel: {
    fontSize: 13,
    marginTop: 4,
  },
  primaryButton: {
    width: "100%",
    height: 54,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  primaryButtonText: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "700",
  },
  secondaryButton: {
    paddingVertical: 10,
  },
  secondaryButtonText: {
    fontSize: 15,
    fontWeight: "600",
  },
});
