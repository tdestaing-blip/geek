import * as Haptics from "expo-haptics";
import { Platform } from "react-native";

async function supported(effect: () => Promise<void>): Promise<boolean> {
  if (Platform.OS === "web") return false;
  try {
    await effect();
    return true;
  } catch {
    return false;
  }
}

export function copyConfirmedHaptic(): Promise<boolean> {
  return supported(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
}

export function albumTargetArrivedHaptic(): Promise<boolean> {
  return supported(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
}

export function albumRevealHaptic(): Promise<boolean> {
  return supported(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
}
