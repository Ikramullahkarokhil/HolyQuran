import React, { memo, useCallback, useMemo, useState } from "react";
import {
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  ScrollView,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { useRouter } from "expo-router";
import { useTheme } from "react-native-paper";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import GeneralModal from "../../components/GeneralModal";
import {
  useAppLanguageStore,
  useHadithTranslationStore,
  useQuranTranslationStore,
} from "../../components/store/store";
import FloatingLanguagePickerModal from "../../components/FloatingLanguagePickerModal";
import {
  getTextAlignment,
  getWritingDirection,
} from "../../components/utils/rtlUtils";
import quranicDuas from "../../assets/Dua/QuranicDuas.json";
import duaInfo from "../../assets/Dua/DuaInfo.json";

const COPY_LABELS = {
  en: {
    title: "Duas",
    info: "About this dua collection",
    quran: "Quran",
    hadith: "Hadith",
    noResults: "No duas available in this category",
    copy: "Copy dua",
    count: "duas",
    back: "Back",
    translate: "Choose translation language",
  },
  pa: {
    title: "دعاګانې",
    info: "د دې دعاګانو ټولګې په اړه",
    quran: "قرآن",
    hadith: "حديث",
    noResults: "په دې برخه کې دعا نشته",
    copy: "دعا کاپي کړئ",
    count: "دعاګانې",
    back: "شاته",
    translate: "د ژباړې ژبه وټاکئ",
  },
  da: {
    title: "دعاها",
    info: "درباره این مجموعه دعا",
    quran: "قرآن",
    hadith: "حدیث",
    noResults: "در این دسته دعایی موجود نیست",
    copy: "کپی دعا",
    count: "دعا",
    back: "بازگشت",
    translate: "انتخاب زبان ترجمه",
  },
};

const getLocalizedInfo = (item, field, language) => {
  const languageName =
    language === "pa" || language === "pashto"
      ? "pashto"
      : language === "da" || language === "dari"
        ? "dari"
        : "english";
  return item?.[`${field}_${languageName}`] || item?.[`${field}_english`] || "";
};

const HeaderPill = memo(({ onPress, icon, label, theme, children, isAction }) => (
  <Pressable
    accessibilityRole="button"
    accessibilityLabel={label}
    onPress={onPress}
    style={[
      styles.headerPill,
      {
        backgroundColor: theme.colors.surface,
        borderColor: theme.colors.outlineVariant,
      },
      isAction && styles.headerAction,
    ]}
  >
    {children || (
      <MaterialCommunityIcons
        name={icon}
        size={20}
        color={theme.colors.onSurface}
      />
    )}
  </Pressable>
));
HeaderPill.displayName = "HeaderPill";

const DuaCard = memo(
  ({
    dua,
    translation,
    labels,
    theme,
    textAlign,
    writingDir,
    translationTextAlign,
    translationWritingDir,
    onCopy,
  }) => (
    <View
      style={[
        styles.duaCard,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.outlineVariant,
        },
      ]}
    >
      <View style={styles.cardHeader}>
        <View style={styles.referenceRow}>
          <MaterialCommunityIcons
            name="book-open-page-variant-outline"
            size={16}
            color={theme.colors.primary}
          />
          <Text
            style={[
              styles.reference,
              {
                color: theme.colors.primary,
                textAlign,
                writingDirection: writingDir,
              },
            ]}
          >
            {dua.source === "hadith"
              ? dua.reference
              : `${dua.surah} · ${dua.ayah}`}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={labels.copy}
          onPress={() => onCopy(dua, translation)}
          hitSlop={8}
          style={({ pressed }) => [
            styles.copyButton,
            {
              backgroundColor:
                theme.colors.surfaceVariant || theme.colors.background,
              opacity: pressed ? 0.75 : 1,
            },
          ]}
        >
          <MaterialCommunityIcons
            name="content-copy"
            size={17}
            color={theme.colors.onSurfaceVariant}
          />
        </Pressable>
      </View>
      <Text style={[styles.arabic, { color: theme.colors.onSurface }]}>
        {dua.arabic}
      </Text>
      <Text
        style={[
          styles.translation,
          {
            color: theme.colors.onSurfaceVariant,
            textAlign: translationTextAlign,
            writingDirection: translationWritingDir,
          },
        ]}
      >
        {translation}
      </Text>
    </View>
  ),
);
DuaCard.displayName = "DuaCard";

const QuranicDuas = () => {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { language } = useAppLanguageStore();
  const {
    translationLanguage: contentLanguage,
    setTranslationLanguage,
  } = useQuranTranslationStore();
  const {
    translationLanguage: hadithContentLanguage,
    setTranslationLanguage: setHadithTranslationLanguage,
  } = useHadithTranslationStore();
  const [pickerVisible, setPickerVisible] = useState(false);
  const [infoVisible, setInfoVisible] = useState(false);
  const [selectedSource, setSelectedSource] = useState("quran");

  const labels = COPY_LABELS[language] || COPY_LABELS.en;
  const isHadith = selectedSource === "hadith";
  const activeContentLanguage = isHadith
    ? hadithContentLanguage
    : contentLanguage;
  const activeSetTranslationLanguage = isHadith
    ? setHadithTranslationLanguage
    : setTranslationLanguage;
  const sourceInfo = duaInfo.find(
    (item) => item.id === (isHadith ? 1 : 3),
  );
  const sourceTitle = getLocalizedInfo(
    sourceInfo,
    "title",
    activeContentLanguage,
  );
  const sourceDescription = getLocalizedInfo(
    sourceInfo,
    "content",
    activeContentLanguage,
  );
  const textAlign = getTextAlignment(language);
  const writingDir = getWritingDirection(language);
  const translationTextAlign = getTextAlignment(activeContentLanguage);
  const translationWritingDir = getWritingDirection(activeContentLanguage);
  const translationField =
    activeContentLanguage === "pashto"
      ? "pashto"
      : activeContentLanguage === "dari"
        ? "dari"
        : "english";
  const sourceDuas = useMemo(
    () => quranicDuas.filter((dua) => dua.source === selectedSource),
    [selectedSource],
  );
  const quranCount = useMemo(
    () => quranicDuas.filter((dua) => dua.source === "quran").length,
    [],
  );
  const hadithCount = quranicDuas.length - quranCount;

  const translationOptions = useMemo(
    () => [
      { label: t("English"), value: "english", icon: "translate" },
      { label: t("Pashto"), value: "pashto", icon: "translate" },
      { label: t("Dari"), value: "dari", icon: "translate" },
    ],
    [t],
  );

  const handleCopy = useCallback(async (dua, translation) => {
    try {
      await Clipboard.setStringAsync(
        `${dua.arabic}\n${translation}\n${
          dua.source === "hadith" ? dua.reference : `${dua.surah} · ${dua.ayah}`
        }`,
      );
    } catch (error) {
      console.error("Failed to copy Quranic dua:", error);
    }
  }, []);

  const renderDua = useCallback(
    ({ item }) => (
      <DuaCard
        dua={item}
        translation={item[translationField] || item.english}
        labels={labels}
        theme={theme}
        textAlign={textAlign}
        writingDir={writingDir}
        translationTextAlign={translationTextAlign}
        translationWritingDir={translationWritingDir}
        onCopy={handleCopy}
      />
    ),
    [
      handleCopy,
      labels,
      textAlign,
      theme,
      translationField,
      translationTextAlign,
      translationWritingDir,
      writingDir,
    ],
  );

  const listHeader = (
    <View>
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel={`${labels.quran} / ${labels.hadith}`}
        style={[
          styles.sourceSelector,
          {
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.outlineVariant,
          },
        ]}
      >
        {[
          { source: "quran", label: labels.quran, count: quranCount },
          { source: "hadith", label: labels.hadith, count: hadithCount },
        ].map((option) => {
          const selected = selectedSource === option.source;
          return (
            <Pressable
              key={option.source}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              onPress={() => setSelectedSource(option.source)}
              style={[
                styles.sourceOption,
                selected && {
                  backgroundColor: theme.colors.primary,
                },
              ]}
            >
              <Text
                style={[
                  styles.sourceOptionText,
                  {
                    color: selected
                      ? theme.colors.buttonText || "#fff"
                      : theme.colors.onSurfaceVariant,
                  },
                ]}
              >
                {option.label}
              </Text>
              <Text
                style={[
                  styles.sourceCount,
                  {
                    color: selected
                      ? theme.colors.buttonText || "#fff"
                      : theme.colors.onSurfaceVariant,
                    opacity: selected ? 0.85 : 0.7,
                  },
                ]}
              >
                {option.count}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: theme.colors.background },
      ]}
    >
      <View style={[styles.pillHeader, { paddingTop: insets.top + 6 }]}>
        <View style={styles.pillRow}>
          <HeaderPill
            onPress={() => router.back()}
            icon="arrow-left"
            label={labels.back}
            theme={theme}
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
              style={[
                styles.pillTitle,
                {
                  color: theme.colors.onSurface,
                  textAlign: "center",
                  writingDirection: translationWritingDir,
                },
              ]}
              numberOfLines={1}
            >
              {labels.title}
            </Text>
          </View>
          <HeaderPill
            icon="information-outline"
            label={labels.info}
            onPress={() => setInfoVisible(true)}
            theme={theme}
          />
          <HeaderPill
            icon="translate"
            label={labels.translate}
            onPress={() => setPickerVisible(true)}
            theme={theme}
            isAction
          />
        </View>
      </View>

      <FlatList
        data={sourceDuas}
        renderItem={renderDua}
        keyExtractor={(item) => String(item.id)}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <MaterialCommunityIcons
              name="text-search"
              size={34}
              color={theme.colors.inactiveColor}
            />
            <Text
              style={[
                styles.emptyTitle,
                { color: theme.colors.onSurface },
              ]}
            >
              {labels.noResults}
            </Text>
          </View>
        }
        style={styles.list}
        contentContainerStyle={[
          styles.listContent,
          { paddingTop: insets.top + 64 },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={6}
        maxToRenderPerBatch={8}
        windowSize={7}
      />
      <FloatingLanguagePickerModal
        visible={pickerVisible}
        title={t(
          isHadith
            ? "Select Hadith translation language"
            : "Select Quran translation language",
        )}
        options={translationOptions}
        selectedValue={activeContentLanguage}
        onSelect={activeSetTranslationLanguage}
        onClose={() => setPickerVisible(false)}
        theme={theme}
      />
      <GeneralModal
        visible={infoVisible}
        title={sourceTitle}
        onClose={() => setInfoVisible(false)}
        writingDirection={translationWritingDir}
        textAlign={translationTextAlign}
      >
        <ScrollView
          bounces={false}
          contentContainerStyle={styles.infoModalContent}
          showsVerticalScrollIndicator={false}
        >
          <Text
            style={[
              styles.infoModalText,
              {
                color: theme.colors.onSurfaceVariant,
                textAlign: translationTextAlign,
                writingDirection: translationWritingDir,
              },
            ]}
          >
            {sourceDescription}
          </Text>
        </ScrollView>
      </GeneralModal>
    </View>
  );
};

export default QuranicDuas;

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  pillHeader: {
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
  headerPill: {
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
  headerAction: {
    opacity: 0.9,
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
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 18,
    paddingBottom: 42,
  },
  sourceSelector: {
    flexDirection: "row",
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 4,
    marginBottom: 12,
  },
  sourceOption: {
    flex: 1,
    minHeight: 44,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 12,
  },
  sourceOptionText: {
    fontSize: 14,
    fontWeight: "700",
  },
  sourceCount: {
    fontSize: 12,
    fontWeight: "700",
  },
  duaCard: {
    borderRadius: 24,
    padding: 18,
    marginBottom: 14,
    borderWidth: StyleSheet.hairlineWidth,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOpacity: 0.05,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 8 },
      },
      android: {
        elevation: 2,
      },
    }),
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 12,
  },
  referenceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    flex: 1,
  },
  reference: {
    fontSize: 13,
    fontWeight: "700",
    flexShrink: 1,
  },
  copyButton: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  arabic: {
    fontSize: 24,
    lineHeight: 42,
    textAlign: "right",
    writingDirection: "rtl",
    marginBottom: 12,
  },
  translation: {
    fontSize: 15,
    lineHeight: 24,
  },
  emptyContainer: {
    alignItems: "center",
    paddingHorizontal: 24,
    paddingTop: 38,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "700",
    marginTop: 12,
  },
  infoModalContent: {
    paddingTop: 12,
    paddingBottom: 4,
  },
  infoModalText: {
    fontSize: 15,
    lineHeight: 25,
  },
});
