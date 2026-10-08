import { Platform } from "react-native";
import { requestNotificationPermissionsAsync } from "expo-audio";

let permissionRequest;

export async function requestAudioNotificationPermission() {
  if (Platform.OS !== "android") return true;
  if (permissionRequest) return permissionRequest;

  permissionRequest = requestNotificationPermissionsAsync();
  try {
    const permission = await permissionRequest;
    return permission?.granted === true;
  } catch (error) {
    console.warn("Audio notification permission request failed:", error);
    return false;
  } finally {
    permissionRequest = undefined;
  }
}
