export const DEFAULT_PUBLIC_APP_URL = "https://tipscrm-vevc4ncu.manus.space";

export function buildPasswordRecoveryRedirect(baseUrl: string) {
  return `${baseUrl.replace(/\/+$/, "")}/reset-password`;
}

export function getPasswordRecoveryRedirect() {
  return buildPasswordRecoveryRedirect(DEFAULT_PUBLIC_APP_URL);
}
