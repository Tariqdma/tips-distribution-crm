import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { Redirect, router } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from "react-native";
import { AppHeader, PrimaryButton, palette } from "@/components/crm-ui";
import { ScreenContainer } from "@/components/screen-container";
import { MultiTerritorySelect } from "@/components/multi-territory-select";
import { getApiBaseUrl } from "@/constants/oauth";
import { useCrm } from "@/lib/crm-store";
import { useSupabaseAuth } from "@/lib/supabase-auth";

type TeamMember = { profileId: string; fullName: string; email: string; roleKey: string; reportsToProfileId: string | null; reportsToName: string | null; isActive: boolean };
type TeamSetup = { members: TeamMember[]; salesSupervisors: TeamMember[]; medicalSupervisors: TeamMember[]; accountants: TeamMember[]; salesRepresentatives: TeamMember[]; medicalRepresentatives: TeamMember[]; eligibleSalesManagers: TeamMember[]; eligibleMedicalManagers: TeamMember[]; isTeamSetupStarted: boolean };
type RoleKey = "sales_supervisor" | "medical_supervisor" | "accountant" | "sales_rep" | "medical_rep";

const roles: { key: RoleKey; label: string; icon: keyof typeof MaterialIcons.glyphMap; tint: string }[] = [
  { key: "sales_supervisor", label: "مشرف مبيعات", icon: "supervisor-account", tint: "#7C3AED" },
  { key: "medical_supervisor", label: "مشرف طبي", icon: "biotech", tint: "#0E7490" },
  { key: "accountant", label: "محاسب", icon: "account-balance-wallet", tint: "#B45309" },
  { key: "sales_rep", label: "مندوب مبيعات", icon: "storefront", tint: "#2563EB" },
  { key: "medical_rep", label: "مندوب طبي", icon: "medical-services", tint: "#2563EB" },
];

const roleMeta = (roleKey: string) => roles.find((role) => role.key === roleKey) ?? { label: roleKey, icon: "person" as const, tint: palette.primary };
const isRepresentative = (roleKey: RoleKey) => roleKey === "sales_rep" || roleKey === "medical_rep";
const setupUrl = () => `${getApiBaseUrl()}/api/company/team-setup`;

export default function CompanyTeamSetupScreen() {
  const { session, profile } = useSupabaseAuth();
  const { data, refreshSharedCatalog } = useCrm();
  const [setup, setSetup] = useState<TeamSetup | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [roleKey, setRoleKey] = useState<RoleKey>("sales_supervisor");
  const [reportsToProfileId, setReportsToProfileId] = useState("");
  const [territoryIds, setTerritoryIds] = useState<string[]>([]);
  const [forcePasswordChange, setForcePasswordChange] = useState(true);
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const isManager = profile?.role_key === "company_manager" || profile?.role_key === "sales_manager" || (profile?.role_key === "system_admin" && !profile.is_platform_admin);
  const territoryOptions = data.territories.map((territory) => ({ id: territory.id, name: territory.name, state: territory.state, city: territory.city }));

  const load = useCallback(async () => {
    if (!session?.access_token) throw new Error("انتهت الجلسة. سجّل الدخول مرة أخرى.");
    const response = await fetch(setupUrl(), { headers: { Authorization: `Bearer ${session.access_token}` } });
    const payload = await response.json().catch(() => ({})) as { setup?: TeamSetup; message?: string };
    if (!response.ok || !payload.setup) throw new Error(payload.message || "تعذر تحميل فريق الشركة.");
    setSetup(payload.setup);
    return payload.setup;
  }, [session?.access_token]);

  useEffect(() => { if (!session || !isManager) return; void (async () => { try { setLoading(true); await load(); } catch (reason) { setFeedback({ tone: "error", text: reason instanceof Error ? reason.message : "تعذر تحميل فريق الشركة." }); } finally { setLoading(false); } })(); }, [isManager, load, session]);

  const supervisors = useMemo(() => setup ? [...setup.salesSupervisors, ...setup.medicalSupervisors] : [], [setup]);
  const directManagers = roleKey === "sales_rep" ? setup?.eligibleSalesManagers ?? [] : roleKey === "medical_rep" ? setup?.eligibleMedicalManagers ?? [] : setup?.members.filter((member) => member.roleKey === "company_manager") ?? [];
  const repsBlocked = isRepresentative(roleKey) && territoryOptions.length === 0;
  const selectedTerritories = territoryOptions.filter((territory) => territoryIds.includes(territory.id));

  const generatePassword = () => setPassword(`Tips!${Math.random().toString(36).slice(2, 7)}${Math.floor(10 + Math.random() * 90)}`);
  const resetForm = () => { setFullName(""); setEmail(""); setPassword(""); setRoleKey("sales_supervisor"); setReportsToProfileId(""); setTerritoryIds([]); setForcePasswordChange(true); };

  const createMember = async () => {
    if (!session?.access_token) { setFeedback({ tone: "error", text: "انتهت الجلسة. سجّل الدخول مرة أخرى." }); return; }
    if (!fullName.trim() || !/^\S+@\S+\.\S+$/.test(email.trim()) || password.length < 8) { setFeedback({ tone: "error", text: "أكمل الاسم والبريد الصحيح وكلمة مرور مؤقتة من 8 أحرف على الأقل." }); return; }
    if (repsBlocked) { setFeedback({ tone: "error", text: "أضف مناطق العمل أولاً قبل إنشاء حساب المندوب." }); return; }
    if (isRepresentative(roleKey) && (!territoryIds.length || !reportsToProfileId)) { setFeedback({ tone: "error", text: "اختر المدير المباشر ومنطقة عمل واحدة على الأقل للمندوب." }); return; }
    setSaving(true); setFeedback(null);
    try {
      const response = await fetch(`${getApiBaseUrl()}/api/employee-accounts`, {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ fullName: fullName.trim(), email: email.trim(), password, roleKey, reportsToProfileId: reportsToProfileId || undefined, territoryIds, territoryId: territoryIds[0], territoryLabels: selectedTerritories.map((territory) => territory.name), territoryLabel: selectedTerritories.map((territory) => territory.name).join("، "), forcePasswordChange }),
      });
      const result = await response.json().catch(() => ({})) as { message?: string; account?: { email?: string } };
      if (!response.ok) throw new Error(result.message || "تعذر إنشاء الحساب.");
      await Promise.all([load(), refreshSharedCatalog()]);
      setFeedback({ tone: "success", text: `تم إنشاء حساب ${result.account?.email || email.trim()} وربطه بهيكل الشركة.` });
      resetForm();
    } catch (reason) { setFeedback({ tone: "error", text: reason instanceof Error ? reason.message : "تعذر إنشاء الحساب." }); }
    finally { setSaving(false); }
  };

  if (!session) return <Redirect href="/login" />;
  if (!isManager) return <Redirect href="/company" />;
  if (loading) return <ScreenContainer className="items-center justify-center"><ActivityIndicator color={palette.primary} size="large" /><Text style={styles.loading}>جاري تحميل هيكل الفريق…</Text></ScreenContainer>;

  return <ScreenContainer className="px-5" containerClassName="bg-background"><ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
    <AppHeader eyebrow="المرحلة الثانية · مدير الشركة" title="إعداد فريق الشركة" right={<TouchableOpacity onPress={() => router.replace("/company" as never)} style={styles.back}><MaterialIcons name="arrow-forward" size={20} color={palette.primary} /></TouchableOpacity>} />
    <View style={styles.hero}><View style={styles.heroIcon}><MaterialIcons name="account-tree" size={26} color="#FFFFFF" /></View><View style={styles.alignEnd}><Text style={styles.heroTitle}>{setup?.isTeamSetupStarted ? "هيكل الفريق قيد التشغيل" : "ابدأ بهيكل فريقك"}</Text><Text style={styles.heroText}>أضف المشرفين والمحاسب أولاً. المندوبون يمكن ربطهم بمشرفهم وبمناطق عملهم بعد تجهيز المناطق.</Text></View></View>
    <View style={styles.metrics}><Metric label="مشرفو المبيعات" value={setup?.salesSupervisors.length ?? 0} color="#7C3AED" /><Metric label="المشرفون الطبيون" value={setup?.medicalSupervisors.length ?? 0} color="#0E7490" /><Metric label="المحاسبون" value={setup?.accountants.length ?? 0} color="#B45309" /></View>
    <View style={styles.notice}><MaterialIcons name="info-outline" size={19} color={palette.primary} /><Text style={styles.noticeText}>لا يخلط النظام أعضاء شركتك مع أي شركة أخرى. عند إضافة مندوب، يُحدّد مديره المباشر حتى تظهر المتابعة والاعتمادات بالشكل الصحيح.</Text></View>
    {feedback ? <View style={[styles.feedback, feedback.tone === "success" ? styles.feedbackSuccess : styles.feedbackError]}><MaterialIcons name={feedback.tone === "success" ? "check-circle" : "error-outline"} size={19} color={feedback.tone === "success" ? palette.success : palette.error} /><Text style={[styles.feedbackText, { color: feedback.tone === "success" ? palette.success : palette.error }]}>{feedback.text}</Text></View> : null}
    <Text style={styles.sectionTitle}>إضافة عضو إلى الهيكل</Text><View style={styles.formCard}>
      <Field label="الاسم الكامل" value={fullName} onChangeText={setFullName} placeholder="مثال: أحمد محمد" />
      <Field label="البريد الإلكتروني" value={email} onChangeText={setEmail} placeholder="name@company.sd" keyboardType="email-address" autoCapitalize="none" />
      <View style={styles.passwordLabel}><TouchableOpacity onPress={generatePassword}><Text style={styles.generateText}>توليد كلمة مرور</Text></TouchableOpacity><Text style={styles.labelNoMargin}>كلمة المرور المؤقتة</Text></View><TextInput value={password} onChangeText={setPassword} secureTextEntry textAlign="right" placeholder="8 أحرف على الأقل" placeholderTextColor="#94A39C" style={styles.input} />
      <Text style={styles.label}>الدور</Text><View style={styles.roles}>{roles.map((role) => <TouchableOpacity key={role.key} onPress={() => { setRoleKey(role.key); setReportsToProfileId(""); setTerritoryIds([]); }} style={[styles.roleChip, roleKey === role.key && styles.roleChipActive]}><MaterialIcons name={role.icon} size={15} color={roleKey === role.key ? palette.primary : palette.muted} /><Text style={[styles.roleChipText, roleKey === role.key && styles.roleChipTextActive]}>{role.label}</Text></TouchableOpacity>)}</View>
      {directManagers.length ? <><Text style={styles.label}>المدير المباشر {isRepresentative(roleKey) ? <Text style={styles.required}>*</Text> : null}</Text><View style={styles.managerChoices}>{directManagers.map((manager) => <TouchableOpacity key={manager.profileId} onPress={() => setReportsToProfileId(manager.profileId)} style={[styles.managerChoice, reportsToProfileId === manager.profileId && styles.managerChoiceActive]}><Text style={[styles.managerChoiceText, reportsToProfileId === manager.profileId && styles.managerChoiceTextActive]}>{manager.fullName} · {roleMeta(manager.roleKey).label}</Text></TouchableOpacity>)}</View></> : null}
      {isRepresentative(roleKey) ? <><Text style={styles.label}>مناطق العمل <Text style={styles.required}>*</Text></Text><MultiTerritorySelect territories={territoryOptions} values={territoryIds} onChange={setTerritoryIds} optional={false} />{repsBlocked ? <TouchableOpacity onPress={() => router.push("/territories" as never)} style={styles.territoryWarning}><MaterialIcons name="map" size={16} color={palette.warning} /><Text style={styles.territoryWarningText}>لا توجد مناطق معتمدة؛ افتح إدارة المناطق أولاً.</Text></TouchableOpacity> : null}</> : null}
      <View style={styles.switchRow}><Switch value={forcePasswordChange} onValueChange={setForcePasswordChange} trackColor={{ false: "#CBD8D3", true: "#75D0BB" }} thumbColor={forcePasswordChange ? palette.primary : "#FFFFFF"} /><View style={styles.alignEnd}><Text style={styles.switchTitle}>إلزام تغيير كلمة المرور عند أول دخول</Text><Text style={styles.switchCopy}>يحافظ على سرية الحساب بعد تسليمه للموظف.</Text></View></View>
      <PrimaryButton label={saving ? "جاري إنشاء الحساب…" : "إنشاء حساب العضو"} icon={saving ? "hourglass-top" : "person-add-alt-1"} disabled={saving || repsBlocked} onPress={() => void createMember()} style={{ marginTop: 18 }} />
    </View>
    <Text style={styles.sectionTitle}>الهيكل الحالي</Text><View style={styles.memberList}>{(setup?.members ?? []).map((member) => <View key={member.profileId} style={styles.member}><View style={[styles.memberIcon, { backgroundColor: `${roleMeta(member.roleKey).tint}1F` }]}><MaterialIcons name={roleMeta(member.roleKey).icon} size={19} color={roleMeta(member.roleKey).tint} /></View><View style={styles.alignEnd}><Text style={styles.memberName}>{member.fullName}</Text><Text style={styles.memberMeta}>{roleMeta(member.roleKey).label}{member.reportsToName ? ` · يتبع لـ ${member.reportsToName}` : ""}</Text></View></View>)}</View>
    {!supervisors.length ? <View style={styles.next}><MaterialIcons name="supervisor-account" size={19} color={palette.warning} /><Text style={styles.nextText}>ابدأ بإضافة مشرف مبيعات أو مشرف طبي حتى تستطيع توزيع المندوبين تحت مسؤوليات واضحة.</Text></View> : null}
    <TouchableOpacity onPress={() => router.replace("/company" as never)} style={styles.later}><Text style={styles.laterText}>العودة إلى لوحة الشركة</Text></TouchableOpacity>
  </ScrollView></ScreenContainer>;
}

function Metric({ label, value, color }: { label: string; value: number; color: string }) { return <View style={styles.metric}><Text style={[styles.metricValue, { color }]}>{value}</Text><Text style={styles.metricLabel}>{label}</Text></View>; }
function Field({ label, value, onChangeText, placeholder, keyboardType, autoCapitalize }: { label: string; value: string; onChangeText: (value: string) => void; placeholder: string; keyboardType?: "default" | "email-address"; autoCapitalize?: "none" | "sentences" | "words" | "characters" }) { return <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput value={value} onChangeText={onChangeText} textAlign="right" placeholder={placeholder} placeholderTextColor="#94A39C" keyboardType={keyboardType} autoCapitalize={autoCapitalize} style={styles.input} /></View>; }

const styles = StyleSheet.create({
  content: { paddingTop: 10, paddingBottom: 34, maxWidth: 640, width: "100%", alignSelf: "center" }, loading: { color: palette.muted, fontSize: 13, marginTop: 12 }, back: { width: 39, height: 39, borderRadius: 13, backgroundColor: "#E9F8F2", alignItems: "center", justifyContent: "center" }, alignEnd: { flex: 1, alignItems: "flex-end" }, hero: { flexDirection: "row-reverse", gap: 12, alignItems: "center", backgroundColor: "#143D35", borderRadius: 21, padding: 17 }, heroIcon: { width: 48, height: 48, borderRadius: 16, backgroundColor: "#28715F", alignItems: "center", justifyContent: "center" }, heroTitle: { color: "#FFFFFF", fontSize: 16, fontWeight: "900", textAlign: "right" }, heroText: { color: "#C6E6DD", fontSize: 11, lineHeight: 17, marginTop: 4, textAlign: "right" },
  metrics: { flexDirection: "row-reverse", gap: 8, marginTop: 13 }, metric: { flex: 1, backgroundColor: "#FFFFFF", borderRadius: 15, borderWidth: 1, borderColor: palette.line, paddingVertical: 12, alignItems: "center" }, metricValue: { fontSize: 21, fontWeight: "900" }, metricLabel: { color: palette.muted, textAlign: "center", fontSize: 9, marginTop: 4 }, notice: { flexDirection: "row-reverse", gap: 8, alignItems: "flex-start", backgroundColor: "#EAF4FA", borderRadius: 15, padding: 12, marginTop: 13 }, noticeText: { color: palette.primary, flex: 1, textAlign: "right", fontSize: 10, lineHeight: 16 }, feedback: { flexDirection: "row-reverse", gap: 7, alignItems: "center", padding: 11, borderRadius: 13, marginTop: 12, borderWidth: 1 }, feedbackSuccess: { backgroundColor: "#E9F8F2", borderColor: "#B9DED3" }, feedbackError: { backgroundColor: "#FFF0F0", borderColor: "#F2C1C1" }, feedbackText: { flex: 1, textAlign: "right", fontSize: 11, lineHeight: 16, fontWeight: "700" },
  sectionTitle: { color: palette.ink, fontSize: 16, fontWeight: "900", textAlign: "right", marginTop: 22, marginBottom: 9 }, formCard: { backgroundColor: "#FFFFFF", borderRadius: 18, borderWidth: 1, borderColor: palette.line, padding: 14 }, field: { marginBottom: 12 }, label: { color: palette.ink, fontSize: 11, fontWeight: "900", textAlign: "right", marginBottom: 6 }, labelNoMargin: { color: palette.ink, fontSize: 11, fontWeight: "900" }, required: { color: palette.error }, input: { minHeight: 47, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: "#DCE8E3", color: palette.ink, fontSize: 13 }, passwordLabel: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }, generateText: { color: palette.primary, fontSize: 11, fontWeight: "900" }, roles: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 7, marginBottom: 14 }, roleChip: { flexDirection: "row-reverse", alignItems: "center", gap: 5, borderWidth: 1, borderColor: palette.line, borderRadius: 10, paddingHorizontal: 9, paddingVertical: 9 }, roleChipActive: { backgroundColor: "#E9F8F2", borderColor: "#9DD3C4" }, roleChipText: { color: palette.muted, fontSize: 10, fontWeight: "800" }, roleChipTextActive: { color: palette.primary }, managerChoices: { gap: 7, marginBottom: 14 }, managerChoice: { minHeight: 39, borderRadius: 11, borderWidth: 1, borderColor: palette.line, paddingHorizontal: 11, justifyContent: "center" }, managerChoiceActive: { borderColor: palette.primary, backgroundColor: "#E9F8F2" }, managerChoiceText: { textAlign: "right", color: palette.muted, fontSize: 10, fontWeight: "700" }, managerChoiceTextActive: { color: palette.primary }, territoryWarning: { flexDirection: "row-reverse", gap: 6, alignItems: "center", justifyContent: "flex-end", marginTop: 9 }, territoryWarningText: { color: palette.warning, fontSize: 10, fontWeight: "800" }, switchRow: { flexDirection: "row", alignItems: "center", gap: 11, marginTop: 17 }, switchTitle: { color: palette.ink, fontSize: 11, fontWeight: "900", textAlign: "right" }, switchCopy: { color: palette.muted, fontSize: 9, marginTop: 3, textAlign: "right" },
  memberList: { gap: 8 }, member: { flexDirection: "row-reverse", gap: 9, alignItems: "center", backgroundColor: "#FFFFFF", borderRadius: 15, borderWidth: 1, borderColor: palette.line, padding: 12 }, memberIcon: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center" }, memberName: { color: palette.ink, fontSize: 12, fontWeight: "900", textAlign: "right" }, memberMeta: { color: palette.muted, fontSize: 10, marginTop: 3, textAlign: "right" }, next: { flexDirection: "row-reverse", gap: 8, backgroundColor: "#FFF8E7", borderRadius: 14, padding: 12, marginTop: 12, alignItems: "flex-start" }, nextText: { flex: 1, color: "#8B6500", textAlign: "right", fontSize: 10, lineHeight: 16 }, later: { alignItems: "center", justifyContent: "center", minHeight: 45, marginTop: 10 }, laterText: { color: palette.muted, fontSize: 12, fontWeight: "800" },
});
