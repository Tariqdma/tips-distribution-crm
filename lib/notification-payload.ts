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
  company_id: string;
  title: string;
  body: string;
  kind: NotificationKind;
  created_by: string;
};

// company_id is NOT NULL on tips_crm.notifications with no default, so every row must carry it.
export function buildNotificationInsert(input: { title: string; body: string; kind: CrmNotification["kind"]; createdBy: string; companyId: string; recipientId?: string | null }): NotificationInsert {
  return {
    recipient_id: input.recipientId ?? null,
    company_id: input.companyId,
    title: input.title.trim(),
    body: input.body.trim(),
    kind: notificationKindFor(input.kind),
    created_by: input.createdBy,
  };
}

// One row per recipient rather than a single recipient_id IS NULL broadcast: the read policy is
// recipient_id = auth.uid() OR view_team_data, and reps hold neither, so an unaddressed row never
// reaches the people it was written for.
export function buildTeamNotificationInserts(input: {
  title: string;
  body: string;
  kind: CrmNotification["kind"];
  createdBy: string;
  companyId: string;
  recipientIds: readonly string[];
}): NotificationInsert[] {
  const recipients = Array.from(new Set(input.recipientIds)).filter((id) => id.length > 0);
  return recipients.map((recipientId) => buildNotificationInsert({ ...input, recipientId }));
}
