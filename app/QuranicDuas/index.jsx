import React, { memo, useCallback, useMemo, useState } from "react";
import {
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { useRouter } from "expo-router";
import { Snackbar, useTheme } from "react-native-paper";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  useAppLanguageStore,
  useQuranTranslationStore,
} from "../../components/store/store";
import FloatingLanguagePickerModal from "../../components/FloatingLanguagePickerModal";
import {
  getTextAlignment,
  getWritingDirection,
} from "../../components/utils/rtlUtils";
import quranicDuas from "../../assets/Dua/QuranicDuas.json";

const COPY_LABELS = {
  en: {
    title: "Quranic Duas",
    eyebrow: "PRAYERS FROM THE QURAN",
    description: "Explore heartfelt supplications from the Quran.",
    copied: "Dua copied",
    copy: "Copy dua",
    count: "duas",
    back: "Back",
    translate: "Choose translation language",
  },
  pa: {
    title: "قرآني دعاګانې",
    eyebrow: "له قرآن څخه دعاګانې",
    description: "د قرآن کریم دعاګانې ولولئ.",
    copied: "دعا کاپي شوه",
    copy: "دعا کاپي کړئ",
    count: "دعاګانې",
    back: "شاته",
    translate: "د ژباړې ژبه وټاکئ",
  },
  da: {
    title: "دعاهای قرآنی",
    eyebrow: "دعاهایی از قرآن",
    description: "دعاهای قرآن کریم را بخوانید.",
    copied: "دعا کپی شد",
    copy: "کپی دعا",
    count: "دعا",
    back: "بازگشت",
    translate: "انتخاب زبان ترجمه",
  },
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
            {dua.surah} · {dua.ayah}
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
  const [snackbarVisible, setSnackbarVisible] = useState(false);
  const [pickerVisible, setPickerVisible] = useState(false);

  const labels = COPY_LABELS[language] || COPY_LABELS.en;
  const textAlign = getTextAlignment(language);
  const writingDir = getWritingDirection(language);
  const translationTextAlign = getTextAlignment(contentLanguage);
  const translationWritingDir = getWritingDirection(contentLanguage);
  const translationField =
    contentLanguage === "pashto"
      ? "pashto"
      : contentLanguage === "dari"
        ? "dari"
        : "english";

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
        `${dua.arabic}\n${translation}\n${dua.surah} · ${dua.ayah}`,
      );
      setSnackbarVisible(true);
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
        style={[
          styles.heroCard,
          {
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.outlineVariant,
          },
        ]}
      >
        <View style={styles.heroTopRow}>
          <View
            style={[
              styles.heroIcon,
              { backgroundColor: theme.colors.primary },
            ]}
          >
            <MaterialCommunityIcons
              name="hands-pray"
              size={26}
              color={theme.colors.onPrimary || "#fff"}
            />
          </View>
          <View
            style={[
              styles.countPill,
              {
                backgroundColor:
                  theme.colors.primaryContainer ||
                  theme.colors.surfaceVariant ||
                  theme.colors.background,
              },
            ]}
          >
            <Text style={[styles.countText, { color: theme.colors.primary }]}>
              {quranicDuas.length} {labels.count}
            </Text>
          </View>
        </View>
        <Text style={[styles.heroEyebrow, { color: theme.colors.primary }]}>
          {labels.eyebrow}
        </Text>
        <Text
          style={[
            styles.heroTitle,
            {
              color: theme.colors.onSurface,
              textAlign,
              writingDirection: writingDir,
            },
          ]}
        >
          {labels.title}
        </Text>
        <Text
          style={[
            styles.heroDescription,
            {
              color: theme.colors.onSurfaceVariant,
              textAlign,
              writingDirection: writingDir,
            },
          ]}
        >
          {labels.description}
        </Text>
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
              style={[styles.pillTitle, { color: theme.colors.onSurface }]}
              numberOfLines={1}
            >
              {labels.title}
            </Text>
          </View>
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
        data={quranicDuas}
        renderItem={renderDua}
        keyExtractor={(item) => String(item.id)}
        ListHeaderComponent={listHeader}
        style={styles.list}
        contentContainerStyle={[
          styles.listContent,
          { paddingTop: insets.top + 90 },
        ]}
        showsVerticalScrollIndicator={false}
        initialNumToRender={6}
        maxToRenderPerBatch={8}
        windowSize={7}
      />
      <Snackbar
        visible={snackbarVisible}
        onDismiss={() => setSnackbarVisible(false)}
        duration={1800}
      >
        {labels.copied}
      </Snackbar>
      <FloatingLanguagePickerModal
        visible={pickerVisible}
        title={t("Select Quran translation language")}
        options={translationOptions}
        selectedValue={contentLanguage}
        onSelect={setTranslationLanguage}
        onClose={() => setPickerVisible(false)}
        theme={theme}
      />
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
  countPill: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
  },
  countText: {
    fontSize: 12,
    fontWeight: "700",
  },
  heroEyebrow: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1,
    marginBottom: 8,
  },
  heroTitle: {
    fontSize: 22,
    fontWeight: "700",
    lineHeight: 30,
  },
  heroDescription: {
    fontSize: 14,
    lineHeight: 21,
    marginTop: 5,
    marginBottom: 16,
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
  emptyMessage: {
    fontSize: 14,
    paddingVertical: 24,
  },
});
