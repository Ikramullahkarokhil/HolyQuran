import React, { memo } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Icon, Text } from "react-native-paper";

const BookmarkCard = ({
  item,
  kind,
  theme,
  language,
  onNavigate,
  onDelete,
  t,
}) => {
  const isQuran = kind === "quran";
  const isEnglish = language === "english" || language === "en";
  const number = item.hadithnumber || item.reference?.hadith;
  const title = isQuran ? t("Quran") : t("Hadith");
  const ayahNumber = item.ayahNumber || item.ayah || item.id;
  const surahName = (item.surahName || t("Quran")).replace(
    /[\u064B-\u065F\u0670\u06D6-\u06ED]/g,
    "",
  );
  const rtlSurahName =
    language === "pashto" ? surahName.replace(/ة/g, "ه") : surahName;
  const displayAyahNumber = isEnglish
    ? String(ayahNumber)
    : String(ayahNumber).replace(/[0-9]/g, (digit) => "۰۱۲۳۴۵۶۷۸۹"[digit]);
  const ayahLabel = language === "pashto" ? "ايه" : t("Ayah");
  const body = isQuran ? item.translationVerse : item.text;
  const isRTLLayout = !isEnglish;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t("Open bookmark")}
      onPress={() => onNavigate(item)}
      onLongPress={() => onDelete(item)}
      style={({ pressed }) => [
        styles.card,
        {
          borderColor: theme.colors.outlineVariant || "rgba(0,0,0,0.08)",
          backgroundColor: pressed
            ? theme.colors.background
            : theme.colors.surface || theme.colors.primary,
        },
      ]}
    >
      <View style={styles.content}>
        <View style={styles.metaRow}>
          <View style={styles.badgeSlot}>
            <View
              style={[
                styles.badge,
                { backgroundColor: theme.colors.background || "#f0f4f8" },
              ]}
            >
              <Icon
                source={isQuran ? "book-open-page-variant-outline" : "book-outline"}
                size={15}
                color={theme.colors.progressColor}
              />
              <Text style={[styles.badgeText, { color: theme.colors.progressColor }]}>
                {title}
              </Text>
            </View>
          </View>

          <View
            style={[
              styles.locationPill,
              {
                backgroundColor: theme.colors.background || "#f0f4f8",
                flexDirection: isRTLLayout ? "row-reverse" : "row",
              },
            ]}
          >
            {isQuran ? (
              <Text
                numberOfLines={1}
                style={[
                  styles.locationText,
                  styles.locationName,
                  {
                    color: theme.colors.inactiveColor,
                    textAlign: isRTLLayout ? "right" : "left",
                    writingDirection: isRTLLayout ? "rtl" : "ltr",
                  },
                ]}
              >
                {`${t("Surah")} ${rtlSurahName} · ${ayahLabel} ${displayAyahNumber}`}
              </Text>
            ) : (
              <Text
                style={[
                  styles.locationText,
                  {
                    color: theme.colors.inactiveColor,
                    textAlign: isRTLLayout ? "right" : "left",
                    writingDirection: isRTLLayout ? "rtl" : "ltr",
                  },
                ]}
              >
                {item.bookName || t("Hadith")} · #{number}
              </Text>
            )}
          </View>

          <Icon
            source="chevron-right"
            size={20}
            color={theme.colors.inactiveColor}
          />
        </View>

        {isQuran ? (
          <Text
            selectable
            style={[styles.arabicText, { color: theme.colors.activeColor }]}
          >
            {item.verse}
          </Text>
        ) : null}

        <Text
          selectable
          style={[
            styles.body,
            {
              color: theme.colors.textColor,
              textAlign: isEnglish ? "left" : "right",
              writingDirection: isEnglish ? "ltr" : "rtl",
            },
          ]}
        >
          {body}
        </Text>
      </View>
      
    </Pressable>
  );
};

const styles = StyleSheet.create({
  card: {
    minHeight: 112,
    flexDirection: "row",
    alignItems: "flex-start",
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
    elevation: 0,
  },
  content: {
    flex: 1,
    minWidth: 0,
  },
  metaRow: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    // justifyContent: "space-between",
    marginBottom: 12,
  },
  badge: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 10,
  },
  badgeSlot: {
    flex: 1,
    flexGrow: 1,
    flexBasis: 0,
    minWidth: 0,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: "700",
  },
  number: {
    fontSize: 12,
    fontWeight: "700",
    textAlign: "right",
  },
  locationText: {
    fontSize: 12,
    fontWeight: "700",
    writingDirection: "inherit",
  },
  locationName: {
    maxWidth: 110,
  },
  locationDivider: {
    marginHorizontal: 4,
    fontSize: 12,
    fontWeight: "700",
  },
  locationPill: {
    flexShrink: 0,
    maxWidth: "58%",
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 10,
  },
  arabicText: {
    fontSize: 20,
    fontWeight: "600",
    lineHeight: 34,
    textAlign: "right",
    writingDirection: "rtl",
    marginBottom: 10,
  },
  body: {
    fontSize: 15,
    lineHeight: 23,
  },
});

export default memo(BookmarkCard);
