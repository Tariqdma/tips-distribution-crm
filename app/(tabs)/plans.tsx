import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { router } from "expo-router";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { AppHeader, PrimaryButton, SectionTitle, StatusBadge, palette } from "@/components/crm-ui";
import { ScreenContainer } from "@/components/screen-container";
import { useCrm } from "@/lib/crm-store";
import { getFieldDataScope } from "@/lib/field-data-scope";
import { useSupabaseAuth } from "@/lib/supabase-auth";

export default function PlansScreen() {
  const { data, role } = useCrm(); const { profile } = useSupabaseAuth(); const scope = getFieldDataScope(data, profile); const currentPlan = scope.plans.find((plan) => plan.status === "معتمدة");
  return <ScreenContainer className="px-5" containerClassName="bg-background"><ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
    <AppHeader eyebrow={`التزام الزيارة يبدأ بخطة واضحة · ${role}`} title="مخططي" right={scope.isManager ? <TouchableOpacity onPress={() => router.push("/team" as never)} style={styles.roleButton}><MaterialIcons name="groups" size={19} color={palette.primary} /></TouchableOpacity> : undefined} />
    <View style={styles.currentPlan}><View style={styles.calendar}><MaterialIcons name="calendar-month" size={24} color={palette.primary} /></View><View style={{ flex: 1, alignItems: "flex-end" }}><StatusBadge status={currentPlan?.status ?? "مسودة"} /><Text style={styles.currentTitle}>{currentPlan?.title ?? "لا توجد خطة معتمدة"}</Text><Text style={styles.currentMeta}>{currentPlan ? `${currentPlan.visitIds.length} زيارات · ${currentPlan.period}` : "أنشئ خطتك ثم أرسلها للاعتماد"}</Text></View></View>
    <PrimaryButton label="إنشاء خطة جديدة" icon="add" onPress={() => router.push("/plan/new" as never)} style={{ marginTop: 14 }} />
    <SectionTitle title="الخطط الأخيرة" />
    {scope.plans.map((plan) => <View key={plan.id} style={styles.planCard}><View style={styles.planTop}><StatusBadge status={plan.status} /><View style={{ alignItems: "flex-end", flex: 1 }}><Text style={styles.planTitle}>{plan.title}</Text><Text style={styles.planMeta}>{plan.kind} · {plan.period}</Text></View></View><View style={styles.planLine}><View style={styles.repTag}><MaterialIcons name="person-outline" size={15} color={palette.muted} /><Text style={styles.repTagText}>{scope.isManager ? plan.repName : "خطتك"}</Text></View><Text style={styles.visitCount}>{plan.visitIds.length} زيارات</Text></View>{plan.managerNote ? <View style={styles.note}><MaterialIcons name="chat-bubble-outline" size={16} color={palette.error} /><Text style={styles.noteText}>{plan.managerNote}</Text></View> : null}</View>)}
    <View style={styles.explainer}><MaterialIcons name="info-outline" size={20} color={palette.info} /><Text style={styles.explainerText}>بعد إرسال الخطة، تظهر للإدارة للاعتماد. الزيارات المعتمدة فقط تدخل في جدولك اليومي.</Text></View>
  </ScrollView></ScreenContainer>;
}

const styles = StyleSheet.create({
  content: { paddingTop: 10, paddingBottom: 28 },
  roleButton: { width: 40, height: 40, borderRadius: 14, backgroundColor: "#E9F8F2", alignItems: "center", justifyContent: "center" },
  currentPlan: { minHeight: 115, backgroundColor: "#EAF7F2", borderWidth: 1, borderColor: "#C8E5DB", borderRadius: 21, padding: 16, flexDirection: "row", alignItems: "center", gap: 13 },
  calendar: { width: 46, height: 46, borderRadius: 15, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center" },
  currentTitle: { color: palette.ink, fontSize: 17, fontWeight: "800", marginTop: 8, textAlign: "right" },
  currentMeta: { color: palette.muted, fontSize: 12, marginTop: 4, textAlign: "right" },
  planCard: { backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: palette.line, borderRadius: 19, padding: 15, marginBottom: 10 },
  planTop: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  planTitle: { color: palette.ink, fontSize: 16, fontWeight: "800", textAlign: "right" },
  planMeta: { color: palette.muted, marginTop: 4, fontSize: 12, textAlign: "right" },
  planLine: { paddingTop: 13, marginTop: 13, borderTopWidth: 1, borderTopColor: "#EDF1EF", flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  repTag: { flexDirection: "row", gap: 4, alignItems: "center" },
  repTagText: { color: palette.muted, fontSize: 11 },
  visitCount: { color: palette.primary, fontWeight: "800", fontSize: 12 },
  note: { marginTop: 13, backgroundColor: "#FFF3F3", borderRadius: 12, padding: 10, gap: 7, flexDirection: "row", alignItems: "flex-start" },
  noteText: { color: palette.error, fontSize: 11, lineHeight: 17, flex: 1, textAlign: "right" },
  explainer: { marginTop: 7, flexDirection: "row", gap: 9, padding: 13, backgroundColor: "#EFF6FF", borderRadius: 16, alignItems: "flex-start" },
  explainerText: { color: "#285A8E", fontSize: 11, lineHeight: 17, textAlign: "right", flex: 1 },
});
