import { Platform } from "react-native";
import { requestNotificationPermissionsAsync } from "expo-audio";

let permissionRequest;

export async function requestAudioNotificationPermission() {
  if (Platform.OS !== "android") return true;
  if (permissionRequest) return permissionRequest;

  permissionRequest = requestNotificationPermissionsAsync()
    .then((permission) => permission?.granted === true)
    .catch(() => false);

  return permissionRequest;
}
