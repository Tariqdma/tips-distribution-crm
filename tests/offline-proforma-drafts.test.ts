import { describe, expect, it } from "vitest";
import { createOfflineProformaDraft } from "../lib/offline-proforma-drafts";

describe("offline proforma drafts", () => {
  it("creates an idempotent local draft owned by one representative", () => {
    const draft = createOfflineProformaDraft({ id: "pf-local-1", profileId: "rep-1", now: "2026-08-30T12:00:00Z", payload: { accountId: "account-1", accountName: "صيدلية السلام", clientDraftRef: "pf-local-1", notes: "", lines: [{ productId: "product-1", quantity: "3" }] } });
    expect(draft).toMatchObject({ id: "pf-local-1", profileId: "rep-1", status: "pending", attempts: 0 });
    expect(draft.payload.lines).toHaveLength(1);
  });
});
