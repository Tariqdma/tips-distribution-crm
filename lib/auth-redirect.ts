export const DEFAULT_PUBLIC_APP_URL = "https://tipscrm-vevc4ncu.manus.space";

export function buildPasswordRecoveryRedirect(baseUrl: string) {
  const base = typeof window !== "undefined" && window.location?.origin ? window.location.origin : baseUrl;
  return `${base.replace(/\/+$/, "")}/reset-password`;
}

export function getPasswordRecoveryRedirect() {
  return buildPasswordRecoveryRedirect(DEFAULT_PUBLIC_APP_URL);
}
