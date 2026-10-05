import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import { Platform } from "react-native";
import { ensureOperationalNotificationChannel } from "@/lib/mobile-notifications";
import { supabase } from "@/lib/supabase-client";

// Links this phone to the signed-in account so tips_crm.notifications rows
// reach it as push notifications (see the send_notification_push trigger).

let registeredToken: string | null = null;

function projectId() {
  return (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId ?? Constants.easConfig?.projectId;
}

/**
 * Registers the device for push. With prompt, asks for permission when the
 * system still allows asking (Android shows the dialog at most a few times).
 */
export async function registerPushToken({ prompt = false }: { prompt?: boolean } = {}) {
  if (Platform.OS === "web" || !supabase) return null;
  try {
    let permission = await Notifications.getPermissionsAsync();
    if (permission.status !== "granted" && prompt && permission.canAskAgain) {
      await ensureOperationalNotificationChannel();
      permission = await Notifications.requestPermissionsAsync();
    }
    if (permission.status !== "granted") return null;
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId: projectId() });
    const { error } = await supabase.rpc("tips_crm_register_push_token", { token_input: token, platform_input: Platform.OS });
    if (error) throw error;
    registeredToken = token;
    return token;
  } catch (error) {
    // Missing Firebase config or no Play services: local reminders still work.
    console.warn("[push] registration failed", error);
    return null;
  }
}

/** Call before signing out, while the session is still valid. */
export async function unregisterPushToken() {
  if (!registeredToken || !supabase) return;
  const token = registeredToken;
  registeredToken = null;
  try {
    await supabase.rpc("tips_crm_unregister_push_token", { token_input: token });
  } catch {
    // The next sign-in on this phone re-binds the token anyway.
  }
}

const routeForKind: Record<string, string> = {
  plan: "/(tabs)/plans",
  duty: "/notifications",
  visit: "/notifications",
};

/** Opens the relevant screen when a push notification is tapped. Returns the cleanup. */
export function handleNotificationTaps() {
  if (Platform.OS === "web") return () => undefined;
  const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
    const kind = (response.notification.request.content.data as { kind?: string } | undefined)?.kind;
    if (!kind) return;
    router.push((routeForKind[kind] ?? "/notifications") as never);
  });
  return () => subscription.remove();
}
