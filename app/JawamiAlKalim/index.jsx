import React, {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { LegendList } from "@legendapp/list/react-native";
import { IconButton, Text, useTheme } from "react-native-paper";
import { MaterialIcons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useFocusEffect, useNavigation } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Clipboard from "expo-clipboard";
import { useHadithTranslationStore } from "../../components/store/store";
import FloatingLanguagePickerModal from "../../components/FloatingLanguagePickerModal";
import GeneralModal from "../../components/GeneralModal";
import { useAppAlert } from "../../components/AppAlertProvider";
import dummyHadiths from "../../assets/Hadiths/jawami_al_kalim.json";

const LANGUAGE_FIELDS = {
  en: "english",
  english: "english",
  pa: "pashto",
  pashto: "pashto",
  da: "dari",
  dari: "dari",
};

const RTL_LANGUAGES = new Set(["pa", "pashto", "da", "dari"]);

const getLocaleCode = (language) => {
  if (language === "pashto" || language === "pa") return "pa";
  if (language === "dari" || language === "da") return "da";
  return "en";
};

const getLocalizedText = (item, language) => {
  if (!item || typeof item !== "object") return "";
  const preferredField = LANGUAGE_FIELDS[language] || LANGUAGE_FIELDS.en;
  const fallbackFields = [preferredField, "english", "pashto", "dari"];
  return (
    fallbackFields
      .map((field) => item[field])
      .find((value) => typeof value === "string" && value.trim()) || ""
  );
};

const getWritingDirection = (language) =>
  RTL_LANGUAGES.has(language) ? "rtl" : "ltr";

const getLocalizedNumber = (number, language) => {
  if (language === "en" || language === "english") return String(number);
  return String(number).replace(/[0-9]/g, (digit) => "۰۱۲۳۴۵۶۷۸۹"[digit]);
};

const HadithCard = memo(({ item, language, theme, t, isPinned, onLongPress }) => {
  const writingDirection = getWritingDirection(language);
  const textAlign = writingDirection === "rtl" ? "right" : "left";
  const title = getLocalizedText(item.title, language);
  const translation = getLocalizedText(item, language);
  const source = getLocalizedText(item.source, language);
  const number = getLocalizedNumber(item.id, language);
  const translationLabel = t("Translation");
  const sourceLabel = t("Source");

  return (
    <Pressable
      onLongPress={() => onLongPress(item)}
      delayLongPress={350}
      style={[
        styles.card,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.outlineVariant,
        },
      ]}
    >
      {isPinned ? (
        <View style={[styles.pinBadge, { backgroundColor: theme.colors.progressColor }]}>
          <MaterialIcons name="push-pin" size={14} color="#ffffff" />
          <Text style={styles.pinBadgeText}>{t("Pinned")}</Text>
        </View>
      ) : null}

      <Text
        style={[
          styles.title,
          { color: theme.colors.onSurface, textAlign, writingDirection },
        ]}
      >
        {number} - {title}
      </Text>

      <Text
        selectable
        style={[
          styles.arabic,
          {
            color: theme.colors.activeColor,
            textAlign: "right",
            writingDirection: "rtl",
          },
        ]}
      >
        {item.arabic}
      </Text>

      <Text
        selectable
        style={[
          styles.translation,
          { color: theme.colors.onSurface, textAlign, writingDirection },
        ]}
      >
        <Text style={[styles.labelText, { writingDirection, textAlign }]}>
          {translationLabel}:{" "}
        </Text>
        <Text style={[styles.contentText, { writingDirection, textAlign }]}>
          {translation}
        </Text>
      </Text>

      <Text
        style={[
          styles.source,
          { color: theme.colors.onSurfaceVariant, textAlign, writingDirection },
        ]}
      >
        <Text
          style={[
            styles.sourceLabel,
            {
              color: theme.colors.progressColor,
              writingDirection,
              textAlign,
            },
          ]}
        >
          {sourceLabel}:{" "}
        </Text>
        <Text style={[styles.contentText, { writingDirection, textAlign }]}>
          {source}
        </Text>
      </Text>
    </Pressable>
  );
});

HadithCard.displayName = "HadithCard";

const JawamiAlKalim = () => {
  const theme = useTheme();
  const navigation = useNavigation();
  const { t } = useTranslation();
  const { showAlert } = useAppAlert();
  const { translationLanguage: contentLanguage, setTranslationLanguage } =
    useHadithTranslationStore();
  const [searchQuery, setSearchQuery] = useState("");
  const [pickerVisible, setPickerVisible] = useState(false);
  const [actionHadith, setActionHadith] = useState(null);
  const [actionIsBookmarked, setActionIsBookmarked] = useState(false);
  const [pins, setPins] = useState([]);
  const [pinsVisible, setPinsVisible] = useState(false);
  const [infoVisible, setInfoVisible] = useState(false);

  const listRef = useRef(null);

  const textColor = theme.colors.onSurface;
  const inactiveColor = theme.colors.inactiveColor || theme.colors.onSurfaceVariant;
  const writingDirection = getWritingDirection(contentLanguage);
  const textAlign = writingDirection === "rtl" ? "right" : "left";

  const pageT = useCallback(
    (key, options) =>
      t(key, { ...(options || {}), lng: getLocaleCode(contentLanguage) }),
    [contentLanguage, t],
  );

  useFocusEffect(
    useCallback(() => {
      navigation.setOptions({
        headerShown: true,
        title: pageT("Jawami al-Kalim"),
        headerTitleAlign: "center",
        headerRight: () => (
          <View style={styles.headerActions}>
            <IconButton
              icon="pin-outline"
              iconColor={theme.colors.onSurface}
              size={22}
              onPress={() => setPinsVisible(true)}
              style={styles.headerIcon}
              accessibilityLabel={pageT("Pinned locations")}
            />
            <IconButton
              icon="translate"
              iconColor={theme.colors.onSurface}
              size={22}
              onPress={() => setPickerVisible(true)}
              style={styles.headerIcon}
              accessibilityLabel={pageT("Hadith Translation")}
            />
          </View>
        ),
        headerStyle: {
          backgroundColor: theme.colors.surface,
          elevation: 0,
          shadowOpacity: 0,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: theme.colors.outlineVariant,
        },
        headerTintColor: theme.colors.onSurface,
      });
    }, [navigation, pageT, theme]),
  );

  useEffect(() => {
    AsyncStorage.getItem("jawami_al_kalim_pins")
      .then((value) => {
        const storedPins = JSON.parse(value || "[]");
        setPins(Array.isArray(storedPins) ? storedPins : []);
      })
      .catch(() => setPins([]));
  }, []);

  const filteredHadiths = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return dummyHadiths;

    return dummyHadiths.filter((item) => {
      const searchable = [
        item.arabic,
        item.english,
        item.pashto,
        item.dari,
        item.title?.english,
        item.title?.pashto,
        item.title?.dari,
        item.source?.english,
        item.source?.pashto,
        item.source?.dari,
      ]
        .join(" ")
        .toLowerCase();

      return searchable.includes(query) || String(item.id).includes(query);
    });
  }, [searchQuery]);

  const savePins = useCallback((nextPins) => {
    setPins(nextPins);
    AsyncStorage.setItem("jawami_al_kalim_pins", JSON.stringify(nextPins)).catch(
      () => {},
    );
  }, []);

  const toggleHadithPin = useCallback(
    (item) => {
      const pinId = String(item.id);
      const isPinned = pins.some((pin) => pin.id === pinId);
      const nextPins = isPinned
        ? pins.filter((pin) => pin.id !== pinId)
        : [
            ...pins,
            { id: pinId, index: dummyHadiths.indexOf(item), hadith: pinId },
          ];
      savePins(nextPins);
    },
    [pins, savePins],
  );

  const handleBookmark = useCallback(
    async (item) => {
      try {
        const existing = JSON.parse(
          (await AsyncStorage.getItem("hadithBookmarks")) || "[]",
        );
        const hadithNumber = String(item.id);
        const already = existing.some(
          (bookmark) =>
            bookmark.collection === "jawami_al_kalim" &&
            String(bookmark.hadithnumber) === hadithNumber,
        );

        if (already) {
          showAlert(pageT("Already Bookmarked"));
          return;
        }

        existing.push({
          ...item,
          collection: "jawami_al_kalim",
          hadithnumber: hadithNumber,
          bookName: pageT("Jawami al-Kalim"),
          text: getLocalizedText(item, contentLanguage),
          language: contentLanguage,
          createdAt: Date.now(),
        });

        await AsyncStorage.setItem("hadithBookmarks", JSON.stringify(existing));
        showAlert(
          pageT("Bookmarked"),
          pageT("Hadith #{{number}} added to bookmarks", { number: hadithNumber }),
        );
      } catch {
        showAlert(pageT("Error"), pageT("Could not bookmark hadith"));
      }
    },
    [contentLanguage, pageT, showAlert],
  );

  const handleLongPress = useCallback(async (item) => {
    try {
      const existing = JSON.parse(
        (await AsyncStorage.getItem("hadithBookmarks")) || "[]",
      );
      const isBookmarked = existing.some(
        (bookmark) =>
          bookmark.collection === "jawami_al_kalim" &&
          String(bookmark.hadithnumber) === String(item.id),
      );
      setActionIsBookmarked(isBookmarked);
    } catch {
      setActionIsBookmarked(false);
    }
    setActionHadith(item);
  }, []);

  const goToHadithPin = useCallback((pin) => {
    setPinsVisible(false);
    setTimeout(() => {
      listRef.current?.scrollToIndex({ index: pin.index, animated: true });
    }, 0);
  }, []);

  const pinOptions = useMemo(
    () =>
      pins.map((pin) => ({
        label: `${pageT("Hadith")} #${pin.hadith}`,
        value: pin.id,
        icon: "pin",
        onPress: () => goToHadithPin(pin),
        secondaryAction: {
          label: pageT("Remove pin"),
          icon: "pin-off-outline",
          onPress: () => savePins(pins.filter((item) => item.id !== pin.id)),
        },
      })),
    [goToHadithPin, pageT, pins, savePins],
  );

  const actionOptions = useMemo(() => {
    if (!actionHadith) return [];

    const isPinned = pins.some((pin) => pin.id === String(actionHadith.id));
    const message = [
      actionHadith.arabic,
      getLocalizedText(actionHadith, contentLanguage),
      getLocalizedText(actionHadith.source, contentLanguage),
    ]
      .filter(Boolean)
      .join("\n\n");

    return [
      {
        label: actionIsBookmarked ? pageT("Already Bookmarked") : pageT("Bookmark"),
        value: "bookmark",
        icon: "bookmark-outline",
        disabled: actionIsBookmarked,
        onPress: () => handleBookmark(actionHadith),
      },
      {
        label: pageT("Copy"),
        value: "copy",
        icon: "content-copy",
        onPress: async () => {
          try {
            await Clipboard.setStringAsync(message);
            showAlert(pageT("Copied to Clipboard"));
          } catch {
            showAlert(pageT("Error"), pageT("Could not copy"));
          }
        },
      },
      {
        label: pageT("Share"),
        value: "share",
        icon: "share-variant",
        onPress: async () => {
          try {
            await Share.share({ message });
          } catch {
            showAlert(pageT("Error"), pageT("Could not share"));
          }
        },
      },
      {
        label: isPinned ? pageT("Remove pin") : pageT("Pin this location"),
        value: "pin",
        icon: isPinned ? "pin-off-outline" : "pin-outline",
        onPress: () => toggleHadithPin(actionHadith),
      },
    ];
  }, [
    actionHadith,
    actionIsBookmarked,
    contentLanguage,
    handleBookmark,
    pins,
    showAlert,
    pageT,
    toggleHadithPin,
  ]);

  const translationOptions = useMemo(
    () => [
      { label: "English", value: "english", icon: "translate" },
      { label: "پښتو", value: "pashto", icon: "translate" },
      { label: "دری", value: "dari", icon: "translate" },
    ],
    [],
  );

  const renderItem = useCallback(
    ({ item }) => (
      <HadithCard
        item={item}
        language={contentLanguage}
        theme={theme}
        t={pageT}
        isPinned={pins.some((pin) => pin.id === String(item.id))}
        onLongPress={handleLongPress}
      />
    ),
    [contentLanguage, handleLongPress, pageT, pins, theme],
  );

  const keyExtractor = useCallback((item) => String(item.id), []);

  const listHeader = useMemo(
    () => (
      <View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={pageT("Jawami al-Kalim")}
          onPress={() => setInfoVisible(true)}
          style={[
            styles.infoButton,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.outlineVariant,
            },
          ]}
        >
          <View
            style={[
              styles.infoButtonContent,
              { flexDirection: writingDirection === "rtl" ? "row-reverse" : "row" },
            ]}
          >
            <View style={[styles.infoIcon, { backgroundColor: theme.colors.background }]}>
              <MaterialIcons
                name="info-outline"
                size={22}
                color={theme.colors.progressColor}
              />
            </View>
            <Text
              variant="titleMedium"
              style={[
                styles.infoTitle,
                { color: theme.colors.onSurface, textAlign, writingDirection },
              ]}
            >
              {pageT("Jawami al-Kalim")}
            </Text>
            <MaterialIcons
              name={writingDirection === "rtl" ? "chevron-left" : "chevron-right"}
              size={22}
              color={theme.colors.onSurfaceVariant}
            />
          </View>
        </Pressable>

        <View style={styles.searchWrap}>
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder={pageT("Search hadiths")}
            placeholderTextColor={inactiveColor}
            returnKeyType="search"
            style={[
              styles.search,
              {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.outlineVariant,
                color: textColor,
                textAlign,
                writingDirection,
              },
            ]}
          />
          <MaterialIcons
            name="search"
            size={21}
            color={inactiveColor}
            style={[
              styles.searchIcon,
              writingDirection === "rtl" ? styles.searchIconRtl : null,
            ]}
          />
        </View>
      </View>
    ),
    [inactiveColor, pageT, searchQuery, textAlign, textColor, theme, writingDirection],
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <LegendList
        ref={listRef}
        data={filteredHadiths}
        extraData={`${contentLanguage}|${pins.length}`}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={
          <View style={styles.empty}>
            <MaterialIcons name="search-off" size={42} color={inactiveColor} />
            <Text style={[styles.emptyText, { color: textColor }]}>
              {pageT("No results found")}
            </Text>
          </View>
        }
        contentContainerStyle={styles.listContent}
        estimatedItemSize={300}
        drawDistance={500}
        recycleItems
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      />

      <FloatingLanguagePickerModal
        visible={pickerVisible}
        title={pageT("Select Hadith translation language")}
        options={translationOptions}
        selectedValue={contentLanguage}
        onSelect={(value) => {
          setTranslationLanguage(value);
          setPickerVisible(false);
        }}
        onClose={() => setPickerVisible(false)}
      />

      <GeneralModal
        visible={infoVisible}
        title={pageT("Jawami al-Kalim")}
        writingDirection={writingDirection}
        textAlign={textAlign}
        onClose={() => setInfoVisible(false)}
      >
        <ScrollView
          bounces={false}
          contentContainerStyle={styles.infoModalContent}
          showsVerticalScrollIndicator={false}
        >
          <Text
            style={[
              styles.infoModalText,
              { color: theme.colors.onSurfaceVariant, textAlign, writingDirection },
            ]}
          >
            {pageT("Jawami al-Kalim introduction")}
          </Text>
          <View
            style={[
              styles.infoModalObjective,
              {
                flexDirection: writingDirection === "rtl" ? "row-reverse" : "row",
                borderColor: theme.colors.outlineVariant,
              },
            ]}
          >
            <MaterialIcons
              name="lightbulb-outline"
              size={20}
              color={theme.colors.progressColor}
            />
            <Text
              style={[
                styles.infoModalObjectiveText,
                { color: theme.colors.progressColor, textAlign, writingDirection },
              ]}
            >
              {pageT("Jawami al-Kalim objective")}
            </Text>
          </View>
        </ScrollView>
      </GeneralModal>

      <GeneralModal
        visible={Boolean(actionHadith)}
        title={pageT("Hadith #{{number}} Actions", { number: actionHadith?.id || "" })}
        description={
          actionHadith ? getLocalizedText(actionHadith, contentLanguage) : undefined
        }
        options={actionOptions}
        onClose={() => setActionHadith(null)}
      />

      <GeneralModal
        visible={pinsVisible}
        title={pageT("Pinned locations")}
        description={pins.length === 0 ? pageT("No pins yet") : undefined}
        options={pinOptions}
        onClose={() => setPinsVisible(false)}
      />
    </View>
  );
};

export default JawamiAlKalim;

const styles = StyleSheet.create({
  container: { flex: 1 },
  listContent: { padding: 16, paddingBottom: 32 },
  headerActions: { flexDirection: "row", alignItems: "center" },
  headerIcon: { margin: 0 },

  infoButton: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 14,
  },
  infoButtonContent: {
    alignItems: "center",
    gap: 10,
  },
  infoIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  infoTitle: { flex: 1, fontWeight: "700", minWidth: 0 },
  infoModalContent: { paddingTop: 12, paddingBottom: 4 },
  infoModalText: { fontSize: 16, lineHeight: 27 },
  infoModalObjective: {
    alignItems: "flex-start",
    gap: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: 18,
    paddingTop: 16,
  },
  infoModalObjectiveText: {
    flex: 1,
    fontSize: 15,
    lineHeight: 24,
    fontWeight: "700",
  },
  searchWrap: { position: "relative", marginBottom: 14 },
  search: {
    height: 48,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 44,
    fontSize: 15,
  },
  searchIcon: { position: "absolute", left: 14, top: 14 },
  searchIconRtl: { left: undefined, right: 14 },

  card: {
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
    marginBottom: 12,
  },
  pinBadge: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    marginBottom: 8,
  },
  pinBadgeText: { color: "#ffffff", fontSize: 11, fontWeight: "700" },
  title: { fontSize: 18, lineHeight: 27, fontWeight: "800", marginBottom: 14 },
  arabic: { fontSize: 23, lineHeight: 38, marginBottom: 14 },
  translation: { fontSize: 16, lineHeight: 29, fontWeight: "600", marginBottom: 14 },
  labelText: { fontWeight: "800" },
  contentText: {},
  source: { fontSize: 14, lineHeight: 22, fontWeight: "600" },
  sourceLabel: { fontWeight: "800" },

  empty: { alignItems: "center", paddingVertical: 64 },
  emptyText: { marginTop: 12, fontSize: 16, fontWeight: "600" },
});