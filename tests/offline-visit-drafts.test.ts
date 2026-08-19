import { describe, expect, it } from "vitest";
import { createOfflineVisitDraft, normalizeOfflineVisitDrafts } from "../lib/offline-visit-drafts";

describe("offline visit drafts", () => {
  it("creates a pending report with a stable client reference", () => {
    const draft = createOfflineVisitDraft({ id: "local-visit-1", visitId: "visit-1", accountId: "account-1", profileId: "rep-1", payload: { result: "متابعة", note: "ملخص مكتمل", reportPriority: "متوسطة", isInsideTerritory: true }, now: "2026-08-19T00:00:00.000Z" });
    expect(draft).toMatchObject({ id: "local-visit-1", status: "pending", attempts: 0, profileId: "rep-1" });
  });

  it("keeps only the current representative's valid drafts ordered by submission time", () => {
    const base = { payload: { result: "متابعة", note: "ملخص", reportPriority: "متوسطة" as const, isInsideTerritory: true }, status: "pending" as const, attempts: 0 };
    const result = normalizeOfflineVisitDrafts([{ ...base, id: "new", visitId: "v2", accountId: "a2", profileId: "rep-1", createdAt: "2026-08-19T10:00:00.000Z", updatedAt: "2026-08-19T10:00:00.000Z" }, { ...base, id: "old", visitId: "v1", accountId: "a1", profileId: "rep-1", createdAt: "2026-08-19T09:00:00.000Z", updatedAt: "2026-08-19T09:00:00.000Z" }, { ...base, id: "other", visitId: "v3", accountId: "a3", profileId: "rep-2", createdAt: "2026-08-19T08:00:00.000Z", updatedAt: "2026-08-19T08:00:00.000Z" }], "rep-1");
    expect(result.map((item) => item.id)).toEqual(["old", "new"]);
  });
});
