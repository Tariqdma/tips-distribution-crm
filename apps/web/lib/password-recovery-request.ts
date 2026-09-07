export type PasswordRecoveryRequest = {
  url: string;
  options: { method: "POST"; headers: { "Content-Type": string; apikey: string }; body: string };
};

export function buildPasswordRecoveryRequest({
  supabaseUrl,
  supabaseAnonKey,
  email,
  redirectTo,
}: {
  supabaseUrl: string;
  supabaseAnonKey: string;
  email: string;
  redirectTo: string;
}): PasswordRecoveryRequest {
  if (!supabaseUrl || !supabaseAnonKey) throw new Error("إعدادات Supabase غير مكتملة.");
  return {
    url: `${supabaseUrl.replace(/\/$/, "")}/auth/v1/recover`,
    options: {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: supabaseAnonKey },
      body: JSON.stringify({ email: email.trim().toLowerCase(), redirect_to: redirectTo }),
    },
  };
}
