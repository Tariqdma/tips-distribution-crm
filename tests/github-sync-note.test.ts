import { describe, expect, it } from "vitest";

describe("GitHub sync configuration", () => {
  it("can reach the local API with the sync configuration header", async () => {
    const note = process.env.TIPS_GITHUB_SYNC_NOTE ?? "not_required";
    expect(note).toBe("not_required");

    const response = await fetch("http://127.0.0.1:3000/", {
      headers: { "x-tips-github-sync-note": note },
    });

    expect(response.status).toBeLessThan(500);
  });
});
