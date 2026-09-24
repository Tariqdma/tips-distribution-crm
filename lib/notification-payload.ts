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
