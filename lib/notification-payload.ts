import type { CrmNotification } from "@/lib/crm-store";

export type NotificationKind = "plan" | "visit" | "alert" | "team" | "duty";

const NOTIFICATION_KINDS: readonly NotificationKind[] = ["plan", "visit", "alert", "team", "duty"];

export function isNotificationKind(value: string): value is NotificationKind {
  return (NOTIFICATION_KINDS as readonly string[]).includes(value);
}

const ARABIC_KIND_TO_NOTIFICATION_KIND: Record<CrmNotification["kind"], NotificationKind> = {
  خطة: "plan",
  زيارة: "visit",
  تنبيه: "alert",
  فريق: "team",
};

export function notificationKindFor(kind: CrmNotification["kind"]): NotificationKind {
  return ARABIC_KIND_TO_NOTIFICATION_KIND[kind];
}

export type NotificationInsert = {
  recipient_id: string | null;
  title: string;
  body: string;
  kind: NotificationKind;
  created_by: string;
};

export function buildNotificationInsert(input: { title: string; body: string; kind: CrmNotification["kind"]; createdBy: string; recipientId?: string | null }): NotificationInsert {
  return {
    recipient_id: input.recipientId ?? null,
    title: input.title.trim(),
    body: input.body.trim(),
    kind: notificationKindFor(input.kind),
    created_by: input.createdBy,
  };
}

// One row per recipient rather than a single recipient_id IS NULL broadcast. The notifications
// table has no company_id, so a broadcast row carries no tenant scope at all — and the read policy
// (recipient_id = auth.uid() OR view_team_data) makes it invisible to reps, who hold neither.
// Addressing each recipient satisfies both without a schema change.
export function buildTeamNotificationInserts(input: {
  title: string;
  body: string;
  kind: CrmNotification["kind"];
  createdBy: string;
  recipientIds: readonly string[];
}): NotificationInsert[] {
  const recipients = Array.from(new Set(input.recipientIds)).filter((id) => id.length > 0);
  return recipients.map((recipientId) => buildNotificationInsert({ ...input, recipientId }));
}
