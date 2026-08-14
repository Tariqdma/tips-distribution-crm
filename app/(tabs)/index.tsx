import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { router } from "expo-router";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { AppHeader, AccountAvatar, MetricCard, SectionTitle, StatusBadge, palette } from "@/components/crm-ui";
import { ScreenContainer } from "@/components/screen-container";
import { useCrm } from "@/lib/crm-store";
import { NotificationButton } from "@/components/notification-button";

export default function TodayScreen() {
  const { data, accountById, unreadNotificationCount } = useCrm();
  const todayVisits = data.visits.filter((visit) => visit.date === "اليوم");
  const completed = todayVisits.filter((visit) => visit.status === "مكتملة").length;
  const progress = todayVisits.length ? Math.round((completed / todayVisits.length) * 100) : 0;

  return (
    <ScreenContainer className="px-5" containerClassName="bg-background">
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <AppHeader eyebrow="الأربعاء، 14 أغسطس" title="صباح الخير، محمد" right={<View style={styles.headerActions}><NotificationButton count={unreadNotificationCount} /><View style={styles.profile}><Text style={styles.profileText}>م أ</Text></View></View>} />

        <View style={styles.hero}>
          <View style={styles.heroTop}><View style={styles.todayIcon}><MaterialIcons name="today" color="#FFFFFF" size={18} /></View><View style={{ flex: 1, alignItems: "flex-end" }}><Text style={styles.heroEyebrow}>خطة اليوم المعتمدة</Text><Text style={styles.heroTitle}>{completed} من {todayVisits.length} زيارات مكتملة</Text></View></View>
          <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${progress}%` }]} /></View>
          <View style={styles.heroBottom}><Text style={styles.heroHint}>تابع الزيارة التالية لتأكيد الحضور</Text><Text style={styles.progressText}>{progress}%</Text></View>
        </View>

        <View style={styles.metrics}><MetricCard label="زيارات اليوم" value={String(todayVisits.length)} icon="event-available" /><MetricCard label="داخل المنطقة" value="100%" icon="my-location" tone="blue" /><MetricCard label="متابعات مفتوحة" value="3" icon="forum" tone="amber" /></View>

        <SectionTitle title="جدول الزيارات" action="عرض الخطة" onPress={() => router.push("/(tabs)/plans" as never)} />
        <View style={styles.scheduleCard}>
          {todayVisits.map((visit, index) => {
            const account = accountById(visit.accountId);
            if (!account) return null;
            return <TouchableOpacity key={visit.id} activeOpacity={0.78} onPress={() => router.push(`/visit/${visit.id}` as never)} style={[styles.visitRow, index < todayVisits.length - 1 && styles.divider]}>
              <View style={styles.timeCol}><Text style={styles.time}>{visit.time}</Text><View style={[styles.dot, { backgroundColor: visit.status === "مكتملة" ? palette.success : palette.info }]} /></View>
              <View style={styles.visitMiddle}><Text style={styles.visitType}>{account.type}{account.specialty ? ` · ${account.specialty}` : ""}</Text><Text style={styles.visitAddress} numberOfLines={1}>{account.area} · {account.address}</Text><StatusBadge status={visit.status} /></View>
              <AccountAvatar account={account} size={46} />
            </TouchableOpacity>;
          })}
        </View>

        <View style={styles.tip}><MaterialIcons name="lightbulb-outline" size={21} color={palette.warning} /><Text style={styles.tipText}>أفضل نتيجة لليوم هي إكمال الزيارة مع توثيق الموقع والملاحظة المختصرة.</Text></View>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: 10, paddingBottom: 28 },
  headerActions: { flexDirection: "row", gap: 8, alignItems: "center" },
  profile: { height: 38, width: 38, borderRadius: 19, backgroundColor: "#DFF2EC", alignItems: "center", justifyContent: "center" },
  profileText: { color: palette.primary, fontWeight: "800", fontSize: 12 },
  hero: { backgroundColor: palette.primary, borderRadius: 22, padding: 18, shadowColor: "#075E54", shadowOpacity: 0.14, shadowRadius: 12, elevation: 3 },
  heroTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  todayIcon: { height: 38, width: 38, borderRadius: 12, backgroundColor: "#0B7A6D", alignItems: "center", justifyContent: "center" },
  heroEyebrow: { color: "#CBEDE6", fontSize: 12, marginBottom: 3, textAlign: "right" },
  heroTitle: { color: "#FFFFFF", fontWeight: "800", fontSize: 18, textAlign: "right" },
  progressTrack: { height: 7, borderRadius: 5, backgroundColor: "#277C70", overflow: "hidden", marginTop: 19 },
  progressFill: { height: "100%", borderRadius: 5, backgroundColor: "#8BE3CA" },
  heroBottom: { flexDirection: "row", justifyContent: "space-between", marginTop: 9, alignItems: "center" },
  heroHint: { color: "#CBEDE6", fontSize: 11, flex: 1, textAlign: "right" },
  progressText: { color: "#FFFFFF", fontSize: 12, fontWeight: "800" },
  metrics: { flexDirection: "row", gap: 8, marginTop: 15 },
  scheduleCard: { backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.line, borderRadius: 20, paddingHorizontal: 14 },
  visitRow: { flexDirection: "row", gap: 11, alignItems: "center", paddingVertical: 14 },
  divider: { borderBottomWidth: 1, borderBottomColor: "#EDF1EF" },
  timeCol: { width: 50, alignItems: "flex-start", gap: 6 },
  time: { color: palette.ink, fontSize: 12, fontWeight: "700" },
  dot: { width: 7, height: 7, borderRadius: 4, marginLeft: 7 },
  visitMiddle: { flex: 1, alignItems: "flex-end" },
  visitType: { color: palette.ink, fontSize: 15, fontWeight: "800", textAlign: "right" },
  visitAddress: { color: palette.muted, fontSize: 11, marginTop: 3, textAlign: "right", maxWidth: 190 },
  tip: { marginTop: 17, padding: 14, backgroundColor: "#FFF9EB", borderRadius: 16, flexDirection: "row", alignItems: "flex-start", gap: 10 },
  tipText: { color: "#725922", flex: 1, fontSize: 12, lineHeight: 18, textAlign: "right" },
});
