// The project URL and anon key are public (they ship inside the app and the
// website), so the server falls back to them; only the service-role key is secret.
const DEFAULT_SUPABASE_URL = "https://luqrrjhvaremronfcvaf.supabase.co";
const DEFAULT_SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx1cXJyamh2YXJlbXJvbmZjdmFmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA3MzM2MzgsImV4cCI6MjA3NjMwOTYzOH0.8g_QSxyxra1uVVJFboe45Dilq3X1CCdgHoZTY3UPESk";

export const ENV = {
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  resendApiKey: process.env.RESEND_API_KEY ?? "",
  resendFromEmail: process.env.RESEND_FROM_EMAIL ?? "",
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? DEFAULT_SUPABASE_URL,
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY ?? DEFAULT_SUPABASE_ANON_KEY,
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  crmPublicUrl: (process.env.TIPS_CRM_PUBLIC_URL ?? process.env.PUBLIC_APP_URL ?? "https://crm.tips-sd.com").replace(/\/+$/, ""),
};
