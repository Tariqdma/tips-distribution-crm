import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { router } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Alert, Modal, ScrollView, Share, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from "react-native";
import { AdminWebShell } from "@/components/admin-web-shell";
import { palette } from "@/components/crm-ui";
import { EmployeeDirectory } from "@/components/employee-directory";
import { TerritorySelect } from "@/components/territory-select";
import { getApiBaseUrl } from "@/constants/oauth";
import { useCrm } from "@/lib/crm-store";
import { useSupabaseAuth } from "@/lib/supabase-auth";
import { useInvitationEmail } from "@/lib/use-invitation-email";

const roles = [
  { key: "sales_manager", label: "مدير مبيعات" },
  { key: "sales_rep", label: "مندوب مبيعات" },
  { key: "medical_rep", label: "مندوب طبي" },
] as const;

export default function AdminTeamPage() {
  const { data, resendInvite, revokeInvite } = useCrm();
  const { session } = useSupabaseAuth();
  const { send: sendInvitationEmail } = useInvitationEmail();
  const [busyInviteId, setBusyInviteId] = useState<string | null>(null);
  const [showAccountForm, setShowAccountForm] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [temporaryPassword, setTemporaryPassword] = useState("");
  const [roleKey, setRoleKey] = useState<(typeof roles)[number]["key"]>("sales_rep");
  const [territoryId, setTerritoryId] = useState("");
  const [forcePasswordChange, setForcePasswordChange] = useState(true);
  const [creating, setCreating] = useState(false);
  const territoryOptions = data.boundaries.map((boundary) => ({ id: boundary.territoryId, name: boundary.name, state: boundary.state, city: boundary.city }));

  const resetForm = () => {
    setFullName(""); setEmail(""); setTemporaryPassword(""); setRoleKey("sales_rep"); setTerritoryId(""); setForcePasswordChange(true);
  };
  const closeAccountForm = () => { if (!creating) { setShowAccountForm(false); resetForm(); } };
  const generatePassword = () => setTemporaryPassword(`Tips!${Math.random().toString(36).slice(2, 7)}${Math.floor(10 + Math.random() * 90)}`);

  const createAccount = async () => {
    if (!session?.access_token) { Alert.alert("انتهت الجلسة", "سجّل الدخول مرة أخرى ثم أعد المحاولة."); return; }
    if (!fullName.trim() || !email.trim() || !temporaryPassword) { Alert.alert("بيانات ناقصة", "أكمل الاسم والبريد وكلمة المرور المؤقتة."); return; }
    if (roleKey !== "sales_manager" && !territoryId) { Alert.alert("المنطقة مطلوبة", "اختر منطقة تغطية للمندوب من المناطق المعتمدة."); return; }
    const territoryLabel = territoryOptions.find((territory) => territory.id === territoryId)?.name ?? "";
    setCreating(true);
    try {
      const response = await fetch(`${getApiBaseUrl()}/api/employee-accounts`, {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ fullName, email, password: temporaryPassword, roleKey, territoryId: territoryId || undefined, territoryLabel, forcePasswordChange }),
      });
      const result = await response.json() as { message?: string; account?: { email: string } };
      if (!response.ok) throw new Error(result.message ?? "تعذر إنشاء الحساب.");
      Alert.alert("تم إنشاء الحساب", `أُنشئ حساب ${result.account?.email ?? email.trim()} بنجاح. سلّم بيانات الدخول للموظف عبر قناة آمنة.`);
      closeAccountForm();
    } catch (error) { Alert.alert("تعذر إنشاء الحساب", error instanceof Error ? error.message : "حاول مرة أخرى."); }
    finally { setCreating(false); }
  };

  const resend = async (invite: typeof data.invites[number]) => {
    setBusyInviteId(invite.id);
    const updated = await resendInvite(invite);
    setBusyInviteId(null);
    if (!updated) { Alert.alert("تعذر إعادة الإرسال", "تحقق من صلاحياتك ثم أعد المحاولة."); return; }
    try { await sendInvitationEmail(updated.id); Alert.alert("تمت إعادة الإرسال", `أُرسلت الدعوة المحدّثة إلى ${updated.email}.`); }
    catch { if (updated.acceptUrl) await Share.share({ message: `دعوة Tips CRM المحدثة: ${updated.acceptUrl}` }); Alert.alert("تم إنشاء رابط جديد", "تعذر تسليم البريد آلياً؛ فُتحت نافذة المشاركة لإرسال الرابط يدوياً."); }
  };
  const revoke = (invite: typeof data.invites[number]) => Alert.alert("إلغاء الدعوة", `هل تريد إلغاء دعوة ${invite.email}؟`, [
    { text: "رجوع", style: "cancel" },
    { text: "إلغاء", style: "destructive", onPress: async () => { setBusyInviteId(invite.id); const success = await revokeInvite(invite.id); setBusyInviteId(null); Alert.alert(success ? "تم الإلغاء" : "تعذر الإلغاء", success ? "لم يعد الرابط صالحاً." : "حاول مرة أخرى."); } },
  ]);

  return <AdminWebShell title="الفريق والدعوات">
    <ScrollView contentContainerStyle={styles.page}>
      <View style={styles.hero}>
        <View style={styles.heroActions}><TouchableOpacity onPress={() => setShowAccountForm(true)} style={styles.secondary}><MaterialIcons name="vpn-key" size={18} color={palette.primary} /><Text style={styles.secondaryText}>إنشاء حساب مباشر</Text></TouchableOpacity><TouchableOpacity onPress={() => router.push("/team" as never)} style={styles.primary}><MaterialIcons name="person-add-alt-1" size={19} color="#FFFFFF" /><Text style={styles.primaryText}>دعوة عضو</Text></TouchableOpacity></View>
        <View style={styles.heroText}><Text style={styles.heroTitle}>إدارة فريق التوزيع</Text><Text style={styles.heroCopy}>اختر منطقة معتمدة عند إنشاء حساب للمندوب، ثم عدّل حدودها من شاشة المناطق.</Text></View>
      </View>
      <Text style={styles.sectionTitle}>الأعضاء النشطون</Text>
      <View style={styles.table}>{data.teamMembers.map((member, index) => <View key={member.id} style={[styles.row, index < data.teamMembers.length - 1 && styles.line]}><TouchableOpacity onPress={() => router.push("/team" as never)} style={styles.edit}><MaterialIcons name="edit" size={17} color={palette.primary} /></TouchableOpacity><Text style={styles.area}>{member.territory}</Text><View style={styles.rolePill}><Text style={styles.roleText}>{member.role}</Text></View><View style={styles.memberText}><Text style={styles.memberName}>{member.name}</Text><Text style={styles.memberType}>{member.type}</Text></View><View style={styles.avatar}><Text style={styles.avatarText}>{member.initials}</Text></View></View>)}</View>
      <EmployeeDirectory accessToken={session?.access_token} />
      <Text style={styles.sectionTitle}>دعوات الفريق</Text>
      <View style={styles.invites}>{data.invites.map((invite) => <View key={invite.id} style={styles.invite}><View style={styles.inviteTop}><View style={styles.pending}><Text style={styles.pendingText}>{invite.status}</Text></View><View style={styles.memberText}><Text style={styles.inviteEmail}>{invite.email}</Text><Text style={styles.inviteMeta}>{invite.role} · {invite.territory} · تنتهي {invite.expiresAt}</Text></View><MaterialIcons name="mail-outline" size={20} color={palette.primary} /></View>{invite.status === "بانتظار الرد" && <View style={styles.inviteActions}><TouchableOpacity disabled={busyInviteId === invite.id} onPress={() => revoke(invite)} style={styles.revoke}><Text style={styles.revokeText}>إلغاء الدعوة</Text></TouchableOpacity><TouchableOpacity disabled={busyInviteId === invite.id} onPress={() => void resend(invite)} style={styles.resend}><MaterialIcons name="refresh" size={16} color="#FFFFFF" /><Text style={styles.resendText}>{busyInviteId === invite.id ? "جارٍ التنفيذ…" : "إعادة الإرسال"}</Text></TouchableOpacity></View>}</View>)}</View>
    </ScrollView>
    <Modal visible={showAccountForm} transparent animationType="fade" onRequestClose={closeAccountForm}>
      <View style={styles.modalShade}><View style={styles.modalCard}><View style={styles.modalHeader}><TouchableOpacity onPress={closeAccountForm} style={styles.close}><MaterialIcons name="close" size={20} color={palette.muted} /></TouchableOpacity><View style={styles.heroText}><Text style={styles.modalTitle}>إنشاء حساب موظف</Text><Text style={styles.modalCopy}>اختر منطقة تغطية من القائمة المعتمدة؛ لا تُرسل كلمة المرور بالبريد.</Text></View></View><ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled"><Text style={styles.label}>الاسم الكامل</Text><TextInput value={fullName} onChangeText={setFullName} textAlign="right" style={styles.input} placeholder="مثال: أحمد محمد" placeholderTextColor="#94A39C" /><Text style={styles.label}>البريد الإلكتروني</Text><TextInput value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" textAlign="right" style={styles.input} placeholder="name@tips-sd.com" placeholderTextColor="#94A39C" /><View style={styles.passwordLabel}><TouchableOpacity onPress={generatePassword}><Text style={styles.generateText}>توليد كلمة مرور</Text></TouchableOpacity><Text style={styles.labelNoMargin}>كلمة المرور المؤقتة</Text></View><TextInput value={temporaryPassword} onChangeText={setTemporaryPassword} secureTextEntry style={styles.input} textAlign="right" placeholder="8 أحرف على الأقل" placeholderTextColor="#94A39C" /><Text style={styles.label}>الدور</Text><View style={styles.roleChoices}>{roles.map((role) => <TouchableOpacity key={role.key} onPress={() => setRoleKey(role.key)} style={[styles.roleChoice, roleKey === role.key && styles.roleChoiceActive]}><Text style={[styles.roleChoiceText, roleKey === role.key && styles.roleChoiceTextActive]}>{role.label}</Text></TouchableOpacity>)}</View><View style={styles.labelRow}><Text style={styles.optional}>{roleKey === "sales_manager" ? "اختياري للمدير" : "مطلوبة للمندوب"}</Text><Text style={styles.labelNoMargin}>منطقة التغطية</Text></View><TerritorySelect territories={territoryOptions} value={territoryId} onChange={setTerritoryId} optional={roleKey === "sales_manager"} /><TouchableOpacity onPress={() => router.push("/territories" as never)} style={styles.boundaryLink}><MaterialIcons name="map" size={16} color={palette.primary} /><Text style={styles.boundaryLinkText}>إدارة حدود المناطق المعتمدة</Text></TouchableOpacity><View style={styles.switchRow}><Switch value={forcePasswordChange} onValueChange={setForcePasswordChange} trackColor={{ false: "#CBD8D3", true: "#75D0BB" }} thumbColor={forcePasswordChange ? palette.primary : "#FFFFFF"} /><View style={styles.memberText}><Text style={styles.switchTitle}>إلزام تغيير كلمة المرور عند أول دخول</Text><Text style={styles.switchCopy}>ينصح بتفعيله لكل الحسابات الجديدة.</Text></View></View><TouchableOpacity disabled={creating} onPress={() => void createAccount()} style={[styles.create, creating && styles.disabled]}>{creating ? <ActivityIndicator color="#FFFFFF" /> : <><MaterialIcons name="person-add-alt-1" color="#FFFFFF" size={19} /><Text style={styles.createText}>إنشاء الحساب</Text></>}</TouchableOpacity></ScrollView></View></View>
    </Modal>
  </AdminWebShell>;
}

const styles = StyleSheet.create({
  page: { paddingBottom: 30 }, hero: { minHeight: 130, padding: 24, borderRadius: 20, backgroundColor: "#143D35", flexDirection: "row", gap: 20, alignItems: "center", marginBottom: 19 }, heroActions: { gap: 8 }, heroText: { flex: 1, alignItems: "flex-end" }, heroTitle: { color: "#FFFFFF", fontSize: 22, fontWeight: "900", textAlign: "right" }, heroCopy: { color: "#C6E6DD", fontSize: 12, marginTop: 6, textAlign: "right" }, primary: { backgroundColor: "#13A284", paddingHorizontal: 15, minHeight: 42, borderRadius: 12, flexDirection: "row", gap: 6, alignItems: "center", justifyContent: "center" }, primaryText: { color: "#FFFFFF", fontSize: 12, fontWeight: "900" }, secondary: { backgroundColor: "#FFFFFF", paddingHorizontal: 15, minHeight: 42, borderRadius: 12, flexDirection: "row", gap: 6, alignItems: "center", justifyContent: "center" }, secondaryText: { color: palette.primary, fontSize: 12, fontWeight: "900" }, sectionTitle: { color: palette.ink, fontSize: 16, fontWeight: "900", textAlign: "right", marginBottom: 10, marginTop: 20 }, table: { backgroundColor: "#FFFFFF", borderRadius: 17, borderWidth: 1, borderColor: "#E2EBE7", paddingHorizontal: 17 }, row: { minHeight: 74, flexDirection: "row", alignItems: "center", gap: 16 }, line: { borderBottomWidth: 1, borderBottomColor: "#EDF2F0" }, avatar: { height: 40, width: 40, borderRadius: 13, backgroundColor: "#137F6D", alignItems: "center", justifyContent: "center" }, avatarText: { color: "#FFFFFF", fontSize: 11, fontWeight: "900" }, memberText: { flex: 1, alignItems: "flex-end" }, memberName: { color: palette.ink, fontSize: 14, fontWeight: "900", textAlign: "right" }, memberType: { color: palette.muted, fontSize: 10, marginTop: 3, textAlign: "right" }, rolePill: { backgroundColor: "#EAF7F2", paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8 }, roleText: { color: palette.success, fontSize: 10, fontWeight: "800" }, area: { color: palette.muted, width: 150, fontSize: 11, textAlign: "right" }, edit: { width: 34, height: 34, borderRadius: 10, backgroundColor: "#F1F7F5", alignItems: "center", justifyContent: "center" }, invites: { gap: 10 }, invite: { backgroundColor: "#FFFFFF", borderRadius: 15, borderWidth: 1, borderColor: "#E2EBE7", padding: 14 }, inviteTop: { flexDirection: "row", gap: 12, alignItems: "center" }, inviteActions: { flexDirection: "row", gap: 8, marginTop: 12 }, inviteEmail: { color: palette.ink, fontSize: 13, fontWeight: "900", textAlign: "right" }, inviteMeta: { color: palette.muted, fontSize: 10, marginTop: 4, textAlign: "right" }, pending: { backgroundColor: "#FFF6E5", paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8 }, pendingText: { color: palette.warning, fontSize: 10, fontWeight: "800" }, resend: { flex: 1, minHeight: 34, borderRadius: 9, backgroundColor: palette.primary, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5 }, resendText: { color: "#FFFFFF", fontSize: 11, fontWeight: "900" }, revoke: { minWidth: 100, minHeight: 34, borderRadius: 9, borderWidth: 1, borderColor: "#F4C9C4", backgroundColor: "#FFF8F7", alignItems: "center", justifyContent: "center" }, revokeText: { color: palette.error, fontSize: 11, fontWeight: "900" }, modalShade: { flex: 1, backgroundColor: "rgba(8,35,29,.52)", alignItems: "center", justifyContent: "center", padding: 18 }, modalCard: { width: "100%", maxWidth: 560, maxHeight: "92%", backgroundColor: "#FFFFFF", borderRadius: 22, padding: 22 }, modalHeader: { flexDirection: "row", gap: 14, alignItems: "flex-start", marginBottom: 10 }, close: { width: 34, height: 34, borderRadius: 10, backgroundColor: "#F1F6F4", alignItems: "center", justifyContent: "center" }, modalTitle: { color: palette.ink, fontSize: 18, fontWeight: "900", textAlign: "right" }, modalCopy: { color: palette.muted, fontSize: 11, marginTop: 4, textAlign: "right", lineHeight: 16 }, label: { color: palette.ink, fontSize: 12, fontWeight: "900", marginTop: 14, marginBottom: 7, textAlign: "right" }, labelNoMargin: { color: palette.ink, fontSize: 12, fontWeight: "900" }, labelRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 14, marginBottom: 7 }, optional: { color: palette.muted, fontSize: 10, fontWeight: "600" }, input: { height: 48, borderRadius: 12, borderWidth: 1, borderColor: "#DCE8E3", paddingHorizontal: 12, fontSize: 13, color: palette.ink, backgroundColor: "#FFFFFF" }, passwordLabel: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 14, marginBottom: 7 }, generateText: { color: palette.primary, fontSize: 11, fontWeight: "900" }, roleChoices: { flexDirection: "row", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }, roleChoice: { borderWidth: 1, borderColor: "#DCE8E3", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 }, roleChoiceActive: { backgroundColor: "#E8F6F1", borderColor: palette.primary }, roleChoiceText: { color: palette.muted, fontSize: 11, fontWeight: "800" }, roleChoiceTextActive: { color: palette.primary }, boundaryLink: { marginTop: 9, flexDirection: "row", justifyContent: "flex-end", gap: 5, alignItems: "center" }, boundaryLinkText: { color: palette.primary, fontSize: 10, fontWeight: "800" }, switchRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingTop: 18 }, switchTitle: { color: palette.ink, fontSize: 12, fontWeight: "900", textAlign: "right" }, switchCopy: { color: palette.muted, fontSize: 10, textAlign: "right", marginTop: 3 }, create: { height: 50, borderRadius: 14, backgroundColor: palette.primary, marginTop: 22, flexDirection: "row", gap: 7, alignItems: "center", justifyContent: "center" }, createText: { color: "#FFFFFF", fontSize: 13, fontWeight: "900" }, disabled: { opacity: 0.6 },
});
