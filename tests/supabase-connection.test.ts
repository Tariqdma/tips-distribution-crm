import { config } from "dotenv";
import { describe, expect, it } from "vitest";

config();

describe("اتصال Supabase المعزول", () => {
  it("يصل إلى إعدادات المصادقة باستخدام مفتاح النشر العام", async () => {
    const url = process.env.VITE_SUPABASE_URL;
    const apiKey = process.env.VITE_SUPABASE_ANON_KEY;

    expect(url).toMatch(/^https:\/\/[^\s]+\.supabase\.co$/);
    expect(apiKey).toBeTruthy();

    const response = await fetch(`${url}/auth/v1/settings`, {
      headers: { apikey: apiKey as string },
    });

    expect(response.ok).toBe(true);
  });
});
