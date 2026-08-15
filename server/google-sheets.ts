import { createSign } from "node:crypto";

type GoogleServiceAccount = { client_email: string; private_key: string; token_uri?: string };
type GoogleTokenResponse = { access_token: string; expires_in: number };

const base64Url = (value: string) => Buffer.from(value).toString("base64url");

export function readGoogleServiceAccount(raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON): GoogleServiceAccount {
  if (!raw) throw new Error("Google service account is not configured");
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new Error("Google service account JSON is invalid"); }
  if (!parsed || typeof parsed !== "object") throw new Error("Google service account JSON is invalid");
  const value = parsed as Partial<GoogleServiceAccount>;
  if (!value.client_email || !value.private_key) throw new Error("Google service account JSON is incomplete");
  return { client_email: value.client_email, private_key: value.private_key, token_uri: value.token_uri };
}

export async function getGoogleSheetsAccessToken(raw?: string): Promise<string> {
  const serviceAccount = readGoogleServiceAccount(raw);
  const issuedAt = Math.floor(Date.now() / 1000);
  const tokenEndpoint = serviceAccount.token_uri || "https://oauth2.googleapis.com/token";
  const unsigned = `${base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${base64Url(JSON.stringify({ iss: serviceAccount.client_email, scope: "https://www.googleapis.com/auth/spreadsheets.readonly", aud: tokenEndpoint, iat: issuedAt, exp: issuedAt + 3600 }))}`;
  const signer = createSign("RSA-SHA256"); signer.update(unsigned); signer.end();
  const assertion = `${unsigned}.${signer.sign(serviceAccount.private_key, "base64url")}`;
  const response = await fetch(tokenEndpoint, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }) });
  if (!response.ok) throw new Error("Google service account authentication failed");
  const payload = await response.json() as GoogleTokenResponse;
  if (!payload.access_token) throw new Error("Google did not return an access token");
  return payload.access_token;
}

export async function validateGoogleFinancialSheetConnection({ rawServiceAccount, spreadsheetId = process.env.GOOGLE_FINANCIAL_SHEET_ID }: { rawServiceAccount?: string; spreadsheetId?: string } = {}) {
  if (!spreadsheetId) throw new Error("Google financial sheet ID is not configured");
  const token = await getGoogleSheetsAccessToken(rawServiceAccount);
  const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}?fields=spreadsheetId,properties.title`, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error("Google financial sheet is unavailable or not shared with the service account");
  const payload = await response.json() as { spreadsheetId?: string; properties?: { title?: string } };
  if (!payload.spreadsheetId || !payload.properties?.title) throw new Error("Google financial sheet response is incomplete");
  return { spreadsheetId: payload.spreadsheetId, title: payload.properties.title };
}
