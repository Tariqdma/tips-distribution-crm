export function getPublicAppUrl(): string {
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }
  return (
    process.env.EXPO_PUBLIC_APP_URL ??
    process.env.TIPS_CRM_PUBLIC_URL ??
    "https://tipscrm-vevc4ncu.manus.space"
  ).replace(/\/+$/, "");
}

export function buildPasswordRecoveryRedirect(baseUrl?: string) {
  const base = baseUrl ? baseUrl.replace(/\/+$/, "") : getPublicAppUrl();
  return `${base}/reset-password`;
}


export function getPasswordRecoveryRedirect() {
  return buildPasswordRecoveryRedirect();
}

export function buildInviteAcceptUrl(token: string, baseUrl?: string) {
  const base = baseUrl ? baseUrl.replace(/\/+$/, "") : getPublicAppUrl();
  return `${base}/invite?token=${encodeURIComponent(token)}`;
}
