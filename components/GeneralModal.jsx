import React, { memo, useCallback } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { Icon, IconButton, Text, useTheme } from "react-native-paper";

const GeneralModal = ({
  visible,
  title,
  description,
  options = [],
  selectedValue,
  onSelect,
  onClose,
  children,
  writingDirection = "ltr",
  textAlign = writingDirection === "rtl" ? "right" : "left",
}) => {
  const theme = useTheme();
  const colors = theme?.colors || {};
  const textColor = colors.textColor || colors.onSurface || "#111111";
  const accentColor = colors.progressColor || colors.primary || "#2587d8";
  const surfaceColor = colors.surface || colors.background || "#ffffff";

  const handleOptionPress = useCallback(
    async (option) => {
      if (option.disabled) return;

      if (option.onPress) {
        await option.onPress(option.value);
      } else if (onSelect) {
        await onSelect(option.value);
      }

      if (option.closeOnPress !== false) onClose?.();
    },
    [onClose, onSelect],
  );

  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close modal"
        style={styles.backdrop}
        onPress={onClose}
      >
        <Pressable
          style={[styles.sheet, { backgroundColor: surfaceColor }]}
          onPress={(event) => event.stopPropagation()}
        >
          <View
            style={[
              styles.headerRow,
              { flexDirection: writingDirection === "rtl" ? "row-reverse" : "row" },
            ]}
          >
            <View
              style={[
                styles.titleBlock,
                writingDirection === "rtl" ? styles.titleBlockRtl : null,
              ]}
            >
              <Text
                style={[styles.title, { color: textColor, textAlign, writingDirection }]}
                variant="titleMedium"
              >
                {title}
              </Text>
              {description ? (
                <Text
                  numberOfLines={4}
                  ellipsizeMode="tail"
                  style={[styles.description, { color: textColor, textAlign, writingDirection }]}
                >
                  {description}
                </Text>
              ) : null}
            </View>
            <IconButton
              accessibilityLabel="Close modal"
              icon="close"
              iconColor={textColor}
              size={20}
              onPress={onClose}
              style={styles.closeButton}
            />
          </View>

          {children}

          {options.length > 0 ? (
            <ScrollView
              bounces={false}
              contentContainerStyle={styles.optionList}
              showsVerticalScrollIndicator={false}
            >
              {options.map((option) => {
                const isActive = selectedValue === option.value;
                const optionColor = option.destructive
                  ? colors.error || "#c62828"
                  : isActive
                    ? accentColor
                    : textColor;

                return (
                  <Pressable
                    key={option.key || option.value || option.label}
                    accessibilityRole="button"
                    accessibilityState={{
                      disabled: option.disabled,
                      selected: isActive,
                    }}
                    disabled={option.disabled}
                    onPress={() => handleOptionPress(option)}
                    style={({ pressed }) => [
                      styles.optionRow,
                      {
                        backgroundColor: isActive
                          ? colors.background || "#f0f4f8"
                          : surfaceColor,
                        borderColor: isActive ? accentColor : colors.outline || "#00000012",
                        opacity: option.disabled ? 0.45 : pressed ? 0.72 : 1,
                        flexDirection: writingDirection === "rtl" ? "row-reverse" : "row",
                      },
                    ]}
                  >
                    {option.icon ? (
                      <Icon source={option.icon} size={20} color={optionColor} />
                    ) : null}
                    <Text style={[styles.optionLabel, { color: optionColor }]}>
                      {option.label}
                    </Text>
                    {isActive ? (
                      <Icon source="check" size={20} color={accentColor} />
                    ) : null}
                    {option.secondaryAction ? (
                      <Pressable
                        accessibilityLabel={option.secondaryAction.label}
                        accessibilityRole="button"
                        hitSlop={8}
                        onPress={(event) => {
                          event.stopPropagation();
                          option.secondaryAction.onPress(option.value);
                        }}
                        style={styles.secondaryAction}
                      >
                        <Icon
                          source={option.secondaryAction.icon || "delete-outline"}
                          size={20}
                          color={option.secondaryAction.color || colors.error || "#c62828"}
                        />
                      </Pressable>
                    ) : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  sheet: {
    width: "100%",
    maxWidth: 440,
    maxHeight: "85%",
    borderRadius: 20,
    padding: 16,
    elevation: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  titleBlock: {
    flex: 1,
    paddingTop: 8,
    paddingRight: 8,
  },
  titleBlockRtl: {
    paddingRight: 0,
    paddingLeft: 8,
  },
  title: {
    fontWeight: "700",
  },
  description: {
    marginTop: 6,
    opacity: 0.7,
  },
  closeButton: {
    margin: 0,
  },
  optionList: {
    gap: 10,
    paddingTop: 12,
    paddingBottom: 2,
  },
  optionRow: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  optionLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: "600",
  },
});

export default memo(GeneralModal);