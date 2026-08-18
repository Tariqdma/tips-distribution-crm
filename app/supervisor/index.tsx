import { useMemo } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { router } from "expo-router";
import { AppHeader, MetricCard, PrimaryButton, SectionTitle, palette } from "@/components/crm-ui";
import { ScreenContainer } from "@/components/screen-container";
import { useCrm } from "@/lib/crm-store";
import { useSupabaseAuth } from "@/lib/supabase-auth";

const supervisorMeta = {
  sales_supervisor: { title: "لوحة مشرف المبيعات", subtitle: "تابع مندوبي المبيعات والخطط والزيارات ضمن فريقك.", role: "مندوب مبيعات" },
  medical_supervisor: { title: "لوحة المشرف الطبي", subtitle: "تابع المناديب الطبيين وتغطية الأطباء والأنشطة الطبية ضمن فريقك.", role: "مندوب طبي" },
} as const;

export default function SupervisorDashboard() {
  const { profile, signOut } = useSupabaseAuth();
  const { data } = useCrm();
  const meta = supervisorMeta[profile?.role_key as keyof typeof supervisorMeta];
  const reps = useMemo(() => data.teamMembers.filter((member) => member.role === meta?.role), [data.teamMembers, meta?.role]);
  const pendingPlans = useMemo(() => data.plans.filter((plan) => plan.status === "بانتظار الاعتماد"), [data.plans]);
  const completedVisits = useMemo(() => data.visits.filter((visit) => visit.status === "مكتملة").length, [data.visits]);

  if (!meta) return <ScreenContainer className="px-5" containerClassName="bg-background"><View style={styles.locked}><MaterialIcons name="lock-outline" size={34} color={palette.primary} /><Text style={styles.lockedTitle}>وصول مقيّد</Text><Text style={styles.lockedText}>هذه الصفحة مخصصة لمشرف المبيعات أو المشرف الطبي ضمن شركة معتمدة.</Text><PrimaryButton label="العودة لتسجيل الدخول" icon="login" onPress={() => router.replace("/login" as never)} style={{ alignSelf: "stretch", marginTop: 20 }} /></View></ScreenContainer>;

  return <ScreenContainer className="px-5" containerClassName="bg-background"><ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
    <AppHeader eyebrow={profile?.active_company_name || "شركة Tips CRM"} title={meta.title} right={<TouchableOpacity onPress={() => { void signOut(); router.replace("/login" as never); }} style={styles.signOut}><MaterialIcons name="logout" size={19} color={palette.primary} /></TouchableOpacity>} />
    <View style={styles.hero}><View style={styles.heroIcon}><MaterialIcons name="supervisor-account" size={23} color="#FFFFFF" /></View><View style={{ flex: 1, alignItems: "flex-end" }}><Text style={styles.heroTitle}>مرحباً {profile?.full_name}</Text><Text style={styles.heroText}>{meta.subtitle}</Text></View></View>
    <View style={styles.metrics}><MetricCard label="أعضاء الفريق" value={String(reps.length)} icon="groups" /><MetricCard label="خطط للمراجعة" value={String(pendingPlans.length)} icon="pending-actions" tone="amber" /><MetricCard label="زيارات مكتملة" value={String(completedVisits)} icon="task-alt" tone="blue" /></View>
    <SectionTitle title="فريقك المباشر" />
    {reps.length ? reps.map((rep) => <View key={rep.id} style={styles.repCard}><View style={styles.avatar}><Text style={styles.avatarText}>{rep.initials}</Text></View><View style={{ flex: 1, alignItems: "flex-end" }}><Text style={styles.repName}>{rep.name}</Text><Text style={styles.repMeta}>{rep.territory || "لم تُحدد منطقة"}</Text></View><MaterialIcons name={meta.role === "مندوب طبي" ? "medical-services" : "storefront"} size={19} color={palette.primary} /></View>) : <View style={styles.empty}><MaterialIcons name="groups" size={24} color={palette.muted} /><Text style={styles.emptyText}>لا يوجد مندوبون ضمن فريقك المباشر بعد.</Text></View>}
    <SectionTitle title="الخطط بانتظار المراجعة" />
    {pendingPlans.length ? pendingPlans.map((plan) => <View key={plan.id} style={styles.planCard}><View style={styles.planIcon}><MaterialIcons name="event-note" size={19} color={palette.warning} /></View><View style={{ flex: 1, alignItems: "flex-end" }}><Text style={styles.planTitle}>{plan.title}</Text><Text style={styles.planMeta}>{plan.repName} · {plan.visitIds.length} زيارات · {plan.period}</Text></View></View>) : <View style={styles.empty}><MaterialIcons name="task-alt" size={24} color={palette.success} /><Text style={styles.emptyText}>لا توجد خطط تحتاج مراجعة حالياً.</Text></View>}
    <PrimaryButton label="فتح إدارة الفريق" icon="groups" onPress={() => router.push("/team" as never)} style={{ marginTop: 24 }} />
  </ScrollView></ScreenContainer>;
}

const styles = StyleSheet.create({
  content: { paddingTop: 10, paddingBottom: 34, maxWidth: 760, width: "100%", alignSelf: "center" }, signOut: { width: 40, height: 40, borderRadius: 14, backgroundColor: "#E9F8F2", alignItems: "center", justifyContent: "center" }, hero: { backgroundColor: "#143D35", borderRadius: 20, padding: 16, flexDirection: "row-reverse", alignItems: "center", gap: 12 }, heroIcon: { width: 44, height: 44, borderRadius: 15, backgroundColor: "#28715F", alignItems: "center", justifyContent: "center" }, heroTitle: { color: "#FFFFFF", fontSize: 16, fontWeight: "900", textAlign: "right" }, heroText: { color: "#C6E6DD", fontSize: 11, lineHeight: 17, textAlign: "right", marginTop: 4 }, metrics: { flexDirection: "row", gap: 8, marginTop: 14 }, repCard: { flexDirection: "row-reverse", gap: 11, alignItems: "center", borderWidth: 1, borderColor: palette.line, backgroundColor: "#FFFFFF", borderRadius: 17, padding: 13, marginBottom: 9 }, avatar: { width: 39, height: 39, borderRadius: 13, backgroundColor: "#E9F8F2", alignItems: "center", justifyContent: "center" }, avatarText: { color: palette.primary, fontSize: 12, fontWeight: "900" }, repName: { color: palette.ink, fontSize: 14, fontWeight: "900", textAlign: "right" }, repMeta: { color: palette.muted, fontSize: 10, textAlign: "right", marginTop: 3 }, planCard: { flexDirection: "row-reverse", gap: 11, alignItems: "center", borderWidth: 1, borderColor: "#E8DED0", backgroundColor: "#FFFFFF", borderRadius: 17, padding: 13, marginBottom: 9 }, planIcon: { width: 38, height: 38, borderRadius: 13, backgroundColor: "#FFF6E5", alignItems: "center", justifyContent: "center" }, planTitle: { color: palette.ink, fontSize: 14, fontWeight: "900", textAlign: "right" }, planMeta: { color: palette.muted, fontSize: 10, marginTop: 3, textAlign: "right" }, empty: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#F7FAF8", borderRadius: 16, padding: 16 }, emptyText: { color: palette.muted, fontSize: 12, fontWeight: "700" }, locked: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 28 }, lockedTitle: { color: palette.ink, fontSize: 21, fontWeight: "900", marginTop: 12 }, lockedText: { color: palette.muted, textAlign: "center", fontSize: 13, lineHeight: 20, marginTop: 7 },
});
