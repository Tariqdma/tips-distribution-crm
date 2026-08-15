import { Platform } from "react-native";
import * as Notifications from "expo-notifications";

const channelId = "tips-operations";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export function isMobileNotificationsAvailable() {
  return Platform.OS !== "web";
}

export async function enableMobileNotifications() {
  if (!isMobileNotificationsAvailable()) return false;
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync(channelId, {
      name: "متابعات Tips CRM",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 180, 100, 180],
      lightColor: "#075E54",
    });
  }
  const existing = await Notifications.getPermissionsAsync();
  const permission = existing.status === "granted" ? existing : await Notifications.requestPermissionsAsync();
  return permission.status === "granted";
}

export async function getMobileNotificationPermission() {
  if (!isMobileNotificationsAvailable()) return "unsupported" as const;
  const permission = await Notifications.getPermissionsAsync();
  return permission.status;
}

function dateFromInput(input: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input)) return null;
  const due = new Date(`${input}T09:00:00`);
  return Number.isNaN(due.getTime()) ? null : due;
}

export async function scheduleFollowUpReminder({ action, dueDate, accountName }: { action: string; dueDate: string; accountName: string }) {
  if (!isMobileNotificationsAvailable()) return null;
  const permission = await Notifications.getPermissionsAsync();
  if (permission.status !== "granted") return null;
  const due = dateFromInput(dueDate);
  if (!due) return null;
  const trigger = due.getTime() <= Date.now() ? null : { type: Notifications.SchedulableTriggerInputTypes.DATE, date: due, channelId } as Notifications.DateTriggerInput;
  return Notifications.scheduleNotificationAsync({
    content: {
      title: "متابعة مستحقة",
      body: `${accountName}: ${action || "راجع الخطوة التالية"}`,
      data: { type: "follow_up", dueDate },
      sound: true,
    },
    trigger,
  });
}
