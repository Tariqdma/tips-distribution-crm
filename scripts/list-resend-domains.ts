import { ENV } from "../server/_core/env";

async function main() {
  const response = await fetch("https://api.resend.com/domains", { headers: { Authorization: `Bearer ${ENV.resendApiKey}` } });
  if (!response.ok) throw new Error(`تعذر قراءة نطاقات Resend: ${response.status}`);
  const payload = await response.json() as { data?: Array<{ name?: string; status?: string; region?: string }> };
  console.log(JSON.stringify((payload.data ?? []).map((domain) => ({ name: domain.name, status: domain.status, region: domain.region }))));
}

void main();
