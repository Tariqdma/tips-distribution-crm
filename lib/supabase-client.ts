import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { Platform } from "react-native";
import { createClient } from "@supabase/supabase-js";
import { buildPasswordRecoveryRequest } from "./password-recovery-request";

const extra = Constants.expoConfig?.extra as { supabaseUrl?: string; supabaseAnonKey?: string } | undefined;
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? extra?.supabaseUrl ?? process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? extra?.supabaseAnonKey ?? process.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl as string, supabaseAnonKey as string, {
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
export async function sendPasswordRecoveryEmail(email: string, redirectTo: string) {
  const request = buildPasswordRecoveryRequest({ supabaseUrl: supabaseUrl ?? "", supabaseAnonKey: supabaseAnonKey ?? "", email, redirectTo });
  const response = await fetch(request.url, request.options);
  if (response.ok) return;
  const body = await response.json().catch(() => ({})) as { message?: string; error_description?: string };
  throw new Error(body.message || body.error_description || "تعذر إرسال رابط الاستعادة.");
}
