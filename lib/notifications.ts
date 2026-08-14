import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

if (Platform.OS !== "web") {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: false,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

export async function sendOperationalNotification(title: string, body: string) {
  if (Platform.OS === "web") return;
  try {
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("tips-operations", {
        name: "تنبيهات العمليات",
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }
    const permissions = await Notifications.getPermissionsAsync();
    const status = permissions.status === "granted" ? permissions.status : (await Notifications.requestPermissionsAsync()).status;
    if (status !== "granted") return;
    await Notifications.scheduleNotificationAsync({
      content: { title, body, data: { source: "tips-crm" } },
      trigger: null,
    });
  } catch {
    // يبقى التنبيه متاحاً داخل مركز التنبيهات حتى إن لم يدعم الجهاز الإشعار المحلي.
  }
}
