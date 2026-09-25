import { describe, expect, it } from "vitest";
import { buildNotificationInsert, buildTeamNotificationInserts, isNotificationKind, notificationKindFor } from "../lib/notification-payload";

describe("notificationKindFor", () => {
  it("maps every Arabic CrmNotification kind to its CHECK-constrained English value", () => {
    expect(notificationKindFor("خطة")).toBe("plan");
    expect(notificationKindFor("زيارة")).toBe("visit");
    expect(notificationKindFor("تنبيه")).toBe("alert");
    expect(notificationKindFor("فريق")).toBe("team");
  });
});

describe("isNotificationKind", () => {
  it("accepts every value the notifications.kind CHECK constraint allows", () => {
    expect(isNotificationKind("plan")).toBe(true);
    expect(isNotificationKind("visit")).toBe(true);
    expect(isNotificationKind("alert")).toBe(true);
    expect(isNotificationKind("team")).toBe(true);
    expect(isNotificationKind("duty")).toBe(true);
  });

  it("rejects anything outside the constraint, including a raw Arabic label", () => {
    expect(isNotificationKind("خطة")).toBe(false);
    expect(isNotificationKind("urgent")).toBe(false);
    expect(isNotificationKind("")).toBe(false);
  });
});

describe("buildNotificationInsert", () => {
  it("builds a broadcast row (null recipient) trimmed of whitespace, with the mapped kind", () => {
    expect(buildNotificationInsert({ title: "  تأكيد خطة الغد  ", body: " الرجاء المراجعة ", kind: "تنبيه", createdBy: "profile-1", companyId: "company-1" })).toEqual({
      recipient_id: null,
      company_id: "company-1",
      title: "تأكيد خطة الغد",
      body: "الرجاء المراجعة",
      kind: "alert",
      created_by: "profile-1",
    });
  });

  it("carries an explicit recipient through when one is given", () => {
    const row = buildNotificationInsert({ title: "t", body: "b", kind: "فريق", createdBy: "manager-1", companyId: "company-1", recipientId: "rep-1" });
    expect(row.recipient_id).toBe("rep-1");
    expect(row.kind).toBe("team");
  });
});

describe("team fan-out", () => {
  const base = { title: " تنبيه ", body: " النص ", kind: "تنبيه" as const, createdBy: "sender-1", companyId: "company-1" };

  it("addresses one row per recipient instead of a single untargeted broadcast", () => {
    const rows = buildTeamNotificationInserts({ ...base, recipientIds: ["a", "b", "c"] });
    expect(rows).toHaveLength(3);
    expect(rows.map((row) => row.recipient_id)).toEqual(["a", "b", "c"]);
    expect(rows.every((row) => row.recipient_id !== null)).toBe(true);
  });

  it("trims content and maps the Arabic kind on every row", () => {
    const [row] = buildTeamNotificationInserts({ ...base, recipientIds: ["a"] });
    expect(row.title).toBe("تنبيه");
    expect(row.body).toBe("النص");
    expect(row.kind).toBe("alert");
    expect(row.created_by).toBe("sender-1");
  });

  it("drops duplicate and empty recipient ids", () => {
    const rows = buildTeamNotificationInserts({ ...base, recipientIds: ["a", "a", "", "b"] });
    expect(rows.map((row) => row.recipient_id)).toEqual(["a", "b"]);
  });

  it("returns nothing when there are no recipients, so the caller can refuse to send", () => {
    expect(buildTeamNotificationInserts({ ...base, recipientIds: [] })).toEqual([]);
  });
});
