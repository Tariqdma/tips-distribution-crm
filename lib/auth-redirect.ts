import { Platform } from "react-native";
import Constants from "expo-constants";

export function getPublicAppUrl(): string {
  if (Platform.OS === "web" && typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }
  const extra = Constants.expoConfig?.extra as { publicAppUrl?: string } | undefined;
  return (
    process.env.EXPO_PUBLIC_APP_URL ??
    process.env.TIPS_CRM_PUBLIC_URL ??
    extra?.publicAppUrl ??
    "https://crm.tips-sd.com"
  ).replace(/\/+$/, "");
}

export function buildPasswordRecoveryRedirect(baseUrl?: string) {
  const base = baseUrl ? baseUrl.replace(/\/+$/, "") : getPublicAppUrl();
  return `${base}/reset-password`;


export function getPasswordRecoveryRedirect() {
  return buildPasswordRecoveryRedirect();
}

export function buildInviteAcceptUrl(token: string, baseUrl?: string) {
  const base = baseUrl ? baseUrl.replace(/\/+$/, "") : getPublicAppUrl();
  return `${base}/invite?token=${encodeURIComponent(token)}`;
}

