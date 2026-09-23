import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { router, useLocalSearchParams } from "expo-router";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { AccountAvatar, AppHeader, InfoRow, PrimaryButton, SectionTitle, StatusBadge, palette } from "@/components/crm-ui";
import { ScreenContainer } from "@/components/screen-container";
import { useCrm } from "@/lib/crm-store";
import { getFieldDataScope } from "@/lib/field-data-scope";
import { useSupabaseAuth } from "@/lib/supabase-auth";

export default function AccountDetailScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const { data, accountById, visitsForAccount } = useCrm(); const { profile } = useSupabaseAuth(); const scope = getFieldDataScope(data, profile);
  const account = scope.accounts.find((item) => item.id === params.id);
  const visits = visitsForAccount(params.id).filter((visit) => scope.visits.some((allowed) => allowed.id === visit.id));
  if (!account) return <ScreenContainer className="items-center justify-center px-5"><Text style={{ color: palette.muted, textAlign: "center" }}>هذه الجهة غير موجودة أو ليست ضمن نطاق زياراتك.</Text></ScreenContainer>;
  const nextVisit = visits.find((visit) => visit.status === "مجدولة");
  return <ScreenContainer className="px-5" containerClassName="bg-background"><ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
    <AppHeader eyebrow="ملف الجهة" title="التفاصيل" right={<TouchableOpacity onPress={() => router.back()} style={styles.back}><MaterialIcons name="arrow-forward" size={22} color={palette.primary} /></TouchableOpacity>} />
    <View style={styles.profileCard}><AccountAvatar account={account} size={68} /><View style={{ flex: 1, alignItems: "flex-end" }}><Text style={styles.name}>{account.name}</Text><Text style={styles.meta}>{account.type}{account.specialty ? ` · ${account.specialty}` : ""}</Text><View style={styles.location}><MaterialIcons name="location-on" size={14} color={palette.primary} /><Text style={styles.locationText}>{account.area} · {account.city}</Text></View></View></View>
    {nextVisit ? <View style={styles.nextVisit}><View style={{ flex: 1, alignItems: "flex-end" }}><Text style={styles.nextTitle}>زيارة مجدولة</Text><Text style={styles.nextMeta}>{nextVisit.date} · {nextVisit.time}</Text></View><TouchableOpacity style={styles.nextAction} onPress={() => router.push(`/visit/${nextVisit.id}` as never)}><MaterialIcons name="arrow-back" size={20} color="#FFFFFF" /></TouchableOpacity></View> : null}
    <SectionTitle title="بيانات التواصل" />
    <View style={styles.infoCard}><InfoRow icon="call" title="الهاتف" value={account.contact} /><InfoRow icon="location-on" title="العنوان" value={account.address} /><InfoRow icon="history" title="آخر زيارة" value={account.lastVisit} /></View>
    <SectionTitle title="سجل الزيارات" />
    <View style={styles.historyCard}>{visits.length ? visits.map((visit, index) => <View key={visit.id} style={[styles.historyRow, index < visits.length - 1 && styles.historyLine]}><StatusBadge status={visit.status} /><View style={{ flex: 1, alignItems: "flex-end" }}><Text style={styles.historyTitle}>{visit.date} · {visit.time}</Text><Text style={styles.historyMeta}>{visit.result ?? "زيارة ضمن الخطة"}</Text></View></View>) : <Text style={styles.noVisits}>لا توجد زيارات مسجلة بعد.</Text>}</View>
    <PrimaryButton label="إضافة زيارة إلى خطتي" icon="add" onPress={() => router.push("/plan/new" as never)} style={{ marginTop: 20 }} />
  </ScrollView></ScreenContainer>;
}

const styles = StyleSheet.create({
  content: { paddingTop: 10, paddingBottom: 28 },
  back: { width: 40, height: 40, borderRadius: 14, backgroundColor: "#E9F8F2", alignItems: "center", justifyContent: "center" },
  profileCard: { backgroundColor: "#FFFFFF", borderRadius: 22, padding: 17, borderWidth: 1, borderColor: palette.line, flexDirection: "row", gap: 14, alignItems: "center" },
  name: { color: palette.ink, fontSize: 20, fontWeight: "800", textAlign: "right" },
  meta: { color: palette.muted, fontSize: 13, marginTop: 4, textAlign: "right" },
  location: { flexDirection: "row", gap: 3, alignItems: "center", marginTop: 10 },
  locationText: { color: palette.primary, fontSize: 12, fontWeight: "700" },
  nextVisit: { backgroundColor: "#E9F8F2", padding: 14, borderRadius: 17, marginTop: 12, flexDirection: "row", gap: 10, alignItems: "center" },
  nextTitle: { color: palette.ink, fontWeight: "800", fontSize: 14, textAlign: "right" },
  nextMeta: { color: palette.muted, fontSize: 12, marginTop: 3, textAlign: "right" },
  nextAction: { width: 37, height: 37, borderRadius: 12, backgroundColor: palette.primary, alignItems: "center", justifyContent: "center" },
  infoCard: { backgroundColor: "#FFFFFF", borderRadius: 19, borderWidth: 1, borderColor: palette.line, paddingHorizontal: 14 },
  historyCard: { backgroundColor: "#FFFFFF", borderRadius: 19, borderWidth: 1, borderColor: palette.line, paddingHorizontal: 14 },
  historyRow: { paddingVertical: 13, flexDirection: "row", alignItems: "center", gap: 10 },
  historyLine: { borderBottomWidth: 1, borderBottomColor: "#EDF1EF" },
  historyTitle: { color: palette.ink, fontWeight: "800", fontSize: 13, textAlign: "right" },
  historyMeta: { color: palette.muted, fontSize: 11, marginTop: 3, textAlign: "right" },
  noVisits: { padding: 18, textAlign: "center", color: palette.muted, fontSize: 13 },
});
