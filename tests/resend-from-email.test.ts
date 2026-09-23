import { describe, expect, it } from "vitest";

describe("Resend sender configuration", () => {
  it("uses the verified notifications subdomain and an authenticated credential", async () => {
    const from = process.env.RESEND_FROM_EMAIL ?? "";
    const apiKey = process.env.RESEND_API_KEY ?? "";
    expect(from).toBe("invites@notifications.tips-sd.com");
    expect(apiKey.length).toBeGreaterThan(10);
    const response = await fetch("https://api.resend.com/domains", { headers: { Authorization: `Bearer ${apiKey}` } });
    expect(response.ok).toBe(true);
    const body = await response.json() as { data?: Array<{ name?: string; status?: string }> };
    expect(body.data?.some((domain) => domain.name === "notifications.tips-sd.com" && domain.status === "verified")).toBe(true);
  }, 15000);
});
