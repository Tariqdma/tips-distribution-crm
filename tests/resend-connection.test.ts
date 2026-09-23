import { describe, expect, it } from "vitest";

describe("Resend invitation mail configuration", () => {
  it("authenticates and accepts the configured sender address format", async () => {
    const apiKey = process.env.RESEND_API_KEY;
    const fromAddress = process.env.RESEND_FROM_EMAIL;
    expect(apiKey).toBeTruthy();
    expect(fromAddress).toBeTruthy();

    const domainMatch = fromAddress?.match(/@([^>\s]+)>?$/);
    expect(domainMatch?.[1]).toBeTruthy();

    const response = await fetch("https://api.resend.com/domains", {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "User-Agent": "Tips-CRM/1.0",
      },
    });
    expect(response.ok).toBe(true);

    await response.json();
    expect(domainMatch?.[1]).toContain(".");
  }, 20_000);
});
