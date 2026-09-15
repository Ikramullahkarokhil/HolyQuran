import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import { Modal, Pressable, StyleSheet, View } from "react-native";
import { Icon, IconButton, Snackbar, Text, useTheme } from "react-native-paper";

const AppAlertContext = createContext(null);

export const AppAlertProvider = ({ children }) => {
  const theme = useTheme();
  const [alert, setAlert] = useState(null);
  const [toast, setToast] = useState(null);
  const colors = theme?.colors || {};
  const textColor = colors.onSurface || colors.textColor || "#111111";
  const accentColor = colors.progressColor || "#2587d8";
  const surfaceColor = colors.surface || colors.primary || "#ffffff";

  const dismissAlert = useCallback(() => setAlert(null), []);
  const dismissToast = useCallback(() => setToast(null), []);

  const showAlert = useCallback((title, message, buttons = []) => {
    setAlert({
      title,
      message,
      buttons: buttons.length > 0 ? buttons : [{ text: "OK" }],
    });
  }, []);

  const showToast = useCallback((message, duration = 2000) => {
    setToast({ message, duration });
  }, []);

  const contextValue = useMemo(
    () => ({ showAlert, showToast, dismissAlert, dismissToast }),
    [dismissAlert, dismissToast, showAlert, showToast],
  );

  const handleButtonPress = useCallback(
    async (button) => {
      dismissAlert();
      await button.onPress?.();
    },
    [dismissAlert],
  );

  return (
    <AppAlertContext.Provider value={contextValue}>
      {children}
      <Modal
        transparent
        visible={Boolean(alert)}
        animationType="fade"
        onRequestClose={dismissAlert}
        statusBarTranslucent
      >
        <View style={styles.backdrop}>
          <View style={[styles.dialog, { backgroundColor: surfaceColor }]}>
            <View style={styles.headerRow}>
              <View style={styles.titleBlock}>
                <Icon source="information-outline" size={22} color={accentColor} />
                <Text style={[styles.title, { color: textColor }]} variant="titleMedium">
                  {alert?.title}
                </Text>
              </View>
              <IconButton
                accessibilityLabel="Close alert"
                icon="close"
                iconColor={textColor}
                size={19}
                onPress={dismissAlert}
                style={styles.closeButton}
              />
            </View>
            {alert?.message ? (
              <Text style={[styles.message, { color: textColor }]}>
                {alert.message}
              </Text>
            ) : null}
            <View style={styles.actions}>
              {alert?.buttons.map((button, index) => (
                <Pressable
                  key={`${button.text}-${index}`}
                  accessibilityRole="button"
                  onPress={() => handleButtonPress(button)}
                  style={({ pressed }) => [
                    styles.action,
                    {
                      backgroundColor: button.style === "destructive"
                        ? colors.error || "#c62828"
                        : index === alert.buttons.length - 1
                          ? accentColor
                          : colors.background || "#f0f4f8",
                      opacity: pressed ? 0.78 : 1,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.actionText,
                      {
                        color:
                          button.style === "destructive" ||
                          index === alert.buttons.length - 1
                            ? colors.buttonText || "#ffffff"
                            : textColor,
                      },
                    ]}
                  >
                    {button.text}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        </View>
      </Modal>

      <Snackbar
        visible={Boolean(toast)}
        onDismiss={dismissToast}
        duration={toast?.duration ?? 2000}
        style={[
          styles.toast,
          {
            backgroundColor: surfaceColor,
            borderColor: colors.outline || "rgba(17,17,17,0.12)",
            borderWidth: 1,
          },
        ]}
        contentStyle={[
          styles.toastContent,
          { color: textColor },
        ]}
      >
        {toast?.message}
      </Snackbar>
    </AppAlertContext.Provider>
  );
};

export const useAppAlert = () => {
  const context = useContext(AppAlertContext);
  if (!context) {
    throw new Error("useAppAlert must be used inside AppAlertProvider");
  }
  return context;
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  dialog: {
    width: "100%",
    maxWidth: 420,
    borderRadius: 20,
    padding: 18,
    elevation: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.24,
    shadowRadius: 16,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  titleBlock: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  title: {
    flex: 1,
    fontWeight: "700",
  },
  closeButton: {
    margin: 0,
  },
  message: {
    marginTop: 14,
    fontSize: 15,
    lineHeight: 22,
    opacity: 0.82,
  },
  actions: {
    gap: 10,
    marginTop: 20,
  },
  action: {
    minHeight: 46,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    paddingHorizontal: 16,
  },
  actionText: {
    fontSize: 15,
    fontWeight: "700",
  },
  toast: {
    marginBottom: 24,
    borderRadius: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 6,
    elevation: 4,
  },
  toastContent: {
    fontSize: 14,
    fontWeight: "600",
  },
});
