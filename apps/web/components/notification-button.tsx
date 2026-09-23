import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { router } from "expo-router";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { palette } from "@/components/crm-ui";

export function NotificationButton({ count }: { count: number }) {
  return <TouchableOpacity onPress={() => router.push("/notifications" as never)} style={styles.button} activeOpacity={0.75}><MaterialIcons name="notifications-none" size={21} color={palette.primary} />{count ? <View style={styles.badge}><Text style={styles.badgeText}>{count > 9 ? "9+" : count}</Text></View> : null}</TouchableOpacity>;
}
const styles = StyleSheet.create({ button: { width: 40, height: 40, borderRadius: 14, backgroundColor: "#E9F8F2", alignItems: "center", justifyContent: "center", position: "relative" }, badge: { position: "absolute", top: -3, right: -3, minWidth: 16, height: 16, borderRadius: 8, backgroundColor: palette.error, alignItems: "center", justifyContent: "center", paddingHorizontal: 3 }, badgeText: { color: "#FFFFFF", fontSize: 9, fontWeight: "800" } });
