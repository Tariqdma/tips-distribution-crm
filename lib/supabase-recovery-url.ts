export type RecoveryUrlTokens = {
  code?: string;
  accessToken?: string;
  refreshToken?: string;
  type?: string;
};

export function parseSupabaseRecoveryUrl(input: string): RecoveryUrlTokens {
  const url = new URL(input);
  const query = new URLSearchParams(url.search);
  const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
  return {
    code: query.get("code") ?? undefined,
    accessToken: hash.get("access_token") ?? undefined,
    refreshToken: hash.get("refresh_token") ?? undefined,
    type: hash.get("type") ?? undefined,
  };
}

export function hasRecoverySessionTokens(tokens: RecoveryUrlTokens) {
  return Boolean(tokens.accessToken && tokens.refreshToken && (!tokens.type || tokens.type === "recovery"));
}
