import { describe, expect, it } from "vitest";
import { buildNotificationInsert, isNotificationKind, notificationKindFor } from "../lib/notification-payload";

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
    expect(buildNotificationInsert({ title: "  تأكيد خطة الغد  ", body: " الرجاء المراجعة ", kind: "تنبيه", createdBy: "profile-1" })).toEqual({
      recipient_id: null,
      title: "تأكيد خطة الغد",
      body: "الرجاء المراجعة",
      kind: "alert",
      created_by: "profile-1",
    });
  });

  it("carries an explicit recipient through when one is given", () => {
    const row = buildNotificationInsert({ title: "t", body: "b", kind: "فريق", createdBy: "manager-1", recipientId: "rep-1" });
    expect(row.recipient_id).toBe("rep-1");
    expect(row.kind).toBe("team");
  });
});
