import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { Platform } from "react-native";
import { createClient } from "@supabase/supabase-js";
import { getApiBaseUrl } from "@/constants/oauth";

const DEFAULT_SUPABASE_URL = "https://luqrrjhvaremronfcvaf.supabase.co";
const DEFAULT_SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx1cXJyamh2YXJlbXJvbmZjdmFmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA3MzM2MzgsImV4cCI6MjA3NjMwOTYzOH0.8g_QSxyxra1uVVJFboe45Dilq3X1CCdgHoZTY3UPESk";

const extra = Constants.expoConfig?.extra as { supabaseUrl?: string; supabaseAnonKey?: string } | undefined;

export const supabaseUrl =
  process.env.EXPO_PUBLIC_SUPABASE_URL ??
  extra?.supabaseUrl ??
  process.env.VITE_SUPABASE_URL ??
  DEFAULT_SUPABASE_URL;

export const supabaseAnonKey =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??
  extra?.supabaseAnonKey ??
  process.env.VITE_SUPABASE_ANON_KEY ??
  DEFAULT_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        storage: Platform.OS === "web" ? undefined : AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: Platform.OS === "web",
        flowType: "pkce",
      },
    })
  : null;

/**
 * Password recovery links are opened in an external mobile browser, which may
 * not share the PKCE verifier storage of the app/browser that requested them.
 * The recovery endpoint intentionally omits a code challenge so Supabase sends
 * a short-lived recovery token in the redirect fragment instead.
 */
export async function sendPasswordRecoveryEmail(email: string, _redirectTo: string) {
  const apiBaseUrl = getApiBaseUrl();
  const response = await fetch(`${apiBaseUrl}/api/auth/password-recovery`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: email.trim().toLowerCase() }),
  });
  if (response.ok) return;
  const body = (await response.json().catch(() => ({}))) as { message?: string; error_description?: string };
  throw new Error(body.message || body.error_description || "تعذر إرسال رابط الاستعادة.");
}
