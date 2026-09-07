import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Modal, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from "react-native";
import { palette } from "@/components/crm-ui";
import { getApiBaseUrl } from "@/constants/oauth";

type DirectoryEmployee = { id: string; fullName: string; email: string; roleKey: string; mustChangePassword: boolean; temporaryPasswordIssuedAt: string | null; lastSignedInAt: string | null; emailConfirmed: boolean };

const roleLabels: Record<string, string> = { system_admin: "مدير النظام", sales_manager: "مدير مبيعات", sales_rep: "مندوب مبيعات", medical_rep: "مندوب طبي" };
const formatDate = (value: string | null) => value ? new Date(value).toLocaleString("ar", { dateStyle: "medium", timeStyle: "short" }) : "لم يسجل دخولاً بعد";

export function EmployeeDirectory({ accessToken }: { accessToken?: string }) {
  const [employees, setEmployees] = useState<DirectoryEmployee[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [target, setTarget] = useState<DirectoryEmployee | null>(null);
  const [password, setPassword] = useState("");
  const [forceChange, setForceChange] = useState(true);
  const [resetting, setResetting] = useState(false);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true); setError("");
    try {
      const response = await fetch(`${getApiBaseUrl()}/api/employee-accounts`, { headers: { Authorization: `Bearer ${accessToken}` } });
      const result = await response.json() as { accounts?: DirectoryEmployee[]; message?: string };
      if (!response.ok) throw new Error(result.message ?? "تعذر تحميل دليل الحسابات.");
      setEmployees(result.accounts ?? []);
    } catch (loadError) { setError(loadError instanceof Error ? loadError.message : "تعذر تحميل دليل الحسابات."); }
    finally { setLoading(false); }
  }, [accessToken]);
  useEffect(() => { void load(); }, [load]);

  const openReset = (employee: DirectoryEmployee) => { setTarget(employee); setPassword(""); setForceChange(true); };
  const generate = () => setPassword(`Tips!${Math.random().toString(36).slice(2, 7)}${Math.floor(10 + Math.random() * 90)}`);
  const reset = async () => {
    if (!target || !accessToken) return;
    if (password.length < 8) { Alert.alert("كلمة مرور ضعيفة", "اكتب أو ولّد كلمة مرور مؤقتة من 8 أحرف على الأقل."); return; }
    setResetting(true);
    try {
      const response = await fetch(`${getApiBaseUrl()}/api/employee-accounts/${target.id}/reset-password`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` }, body: JSON.stringify({ password, forcePasswordChange: forceChange }) });
      const result = await response.json() as { message?: string };
      if (!response.ok) throw new Error(result.message ?? "تعذر إعادة تعيين كلمة المرور.");
      Alert.alert("تمت إعادة التعيين", `تم إصدار كلمة مرور مؤقتة جديدة لـ ${target.fullName}. سلّمها عبر قناة آمنة.`);
      setTarget(null); void load();
    } catch (resetError) { Alert.alert("تعذر إعادة التعيين", resetError instanceof Error ? resetError.message : "حاول مرة أخرى."); }
    finally { setResetting(false); }
  };

  return <View>
    <View style={styles.heading}><TouchableOpacity onPress={() => void load()} style={styles.refresh}><MaterialIcons name="refresh" size={17} color={palette.primary} /></TouchableOpacity><View style={styles.headingText}><Text style={styles.title}>دليل الحسابات وحالة الدخول</Text><Text style={styles.copy}>الحالة تُقرأ من حسابات Supabase، وإعادة التعيين تُسجل في سجل التدقيق.</Text></View></View>
    <View style={styles.card}>{loading ? <View style={styles.loading}><ActivityIndicator color={palette.primary} /><Text style={styles.loadingText}>جارٍ تحميل الحسابات…</Text></View> : error ? <View style={styles.loading}><MaterialIcons name="error-outline" size={22} color={palette.error} /><Text style={styles.errorText}>{error}</Text></View> : employees.map((employee, index) => <View key={employee.id} style={[styles.row, index < employees.length - 1 && styles.line]}><TouchableOpacity onPress={() => openReset(employee)} style={styles.resetButton}><MaterialIcons name="lock-reset" size={16} color={palette.primary} /><Text style={styles.resetText}>إعادة تعيين</Text></TouchableOpacity><View style={styles.statusColumn}><View style={[styles.status, employee.mustChangePassword ? styles.statusWarning : styles.statusReady]}><Text style={[styles.statusText, employee.mustChangePassword ? styles.statusWarningText : styles.statusReadyText]}>{employee.mustChangePassword ? "ينتظر تغيير كلمة المرور" : "نشط"}</Text></View><Text style={styles.lastSignIn}>{formatDate(employee.lastSignedInAt)}</Text></View><View style={styles.employeeText}><Text style={styles.name}>{employee.fullName}</Text><Text style={styles.meta}>{roleLabels[employee.roleKey] ?? employee.roleKey} · {employee.email}</Text></View></View>)}</View>
    <Modal visible={Boolean(target)} transparent animationType="fade" onRequestClose={() => !resetting && setTarget(null)}><View style={styles.shade}><View style={styles.modal}><View style={styles.modalHeader}><TouchableOpacity disabled={resetting} onPress={() => setTarget(null)} style={styles.close}><MaterialIcons name="close" size={20} color={palette.muted} /></TouchableOpacity><View style={styles.employeeText}><Text style={styles.modalTitle}>إعادة تعيين كلمة المرور</Text><Text style={styles.modalCopy}>{target?.fullName} · سيتم تسجيل الإجراء في سجل التدقيق.</Text></View></View><Text style={styles.label}>كلمة المرور المؤقتة الجديدة</Text><View style={styles.passwordRow}><TouchableOpacity onPress={generate}><Text style={styles.generate}>توليد تلقائي</Text></TouchableOpacity><TextInput value={password} onChangeText={setPassword} secureTextEntry textAlign="right" placeholder="8 أحرف على الأقل" placeholderTextColor="#93A099" style={[styles.input, { flex: 1 }]} /></View><View style={styles.switchRow}><Switch value={forceChange} onValueChange={setForceChange} trackColor={{ false: "#CBD8D3", true: "#75D0BB" }} thumbColor={forceChange ? palette.primary : "#FFFFFF"} /><View style={styles.employeeText}><Text style={styles.switchTitle}>إلزام تغيير كلمة المرور عند أول دخول</Text><Text style={styles.switchCopy}>يوصى به عند إعادة إصدار كلمة مرور للموظف.</Text></View></View><TouchableOpacity disabled={resetting} onPress={() => void reset()} style={[styles.confirm, resetting && { opacity: 0.6 }]}>{resetting ? <ActivityIndicator color="#FFFFFF" /> : <><MaterialIcons name="lock-reset" size={18} color="#FFFFFF" /><Text style={styles.confirmText}>إصدار كلمة المرور المؤقتة</Text></>}</TouchableOpacity></View></View></Modal>
  </View>;
}

const styles = StyleSheet.create({
  heading: { marginTop: 23, marginBottom: 10, flexDirection: "row", gap: 10, alignItems: "center" }, refresh: { width: 34, height: 34, borderRadius: 10, backgroundColor: "#E9F8F2", alignItems: "center", justifyContent: "center" }, headingText: { flex: 1, alignItems: "flex-end" }, title: { color: palette.ink, fontSize: 16, fontWeight: "900", textAlign: "right" }, copy: { color: palette.muted, fontSize: 10, marginTop: 4, textAlign: "right" }, card: { backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#E0EBE6", borderRadius: 16, overflow: "hidden" }, row: { minHeight: 78, padding: 13, flexDirection: "row", gap: 12, alignItems: "center" }, line: { borderBottomWidth: 1, borderBottomColor: "#EDF2F0" }, employeeText: { flex: 1, alignItems: "flex-end" }, name: { color: palette.ink, fontSize: 13, fontWeight: "900", textAlign: "right" }, meta: { color: palette.muted, fontSize: 10, marginTop: 4, textAlign: "right" }, statusColumn: { width: 148, alignItems: "flex-end" }, status: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 }, statusWarning: { backgroundColor: "#FFF6E5" }, statusReady: { backgroundColor: "#E9F8F2" }, statusText: { fontSize: 9, fontWeight: "900" }, statusWarningText: { color: palette.warning }, statusReadyText: { color: palette.success }, lastSignIn: { color: palette.muted, fontSize: 9, marginTop: 5, textAlign: "right" }, resetButton: { minHeight: 34, minWidth: 88, borderRadius: 9, borderWidth: 1, borderColor: "#9DD3C4", backgroundColor: "#F5FCF9", flexDirection: "row", gap: 4, alignItems: "center", justifyContent: "center" }, resetText: { color: palette.primary, fontSize: 10, fontWeight: "900" }, loading: { minHeight: 95, alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 20 }, loadingText: { color: palette.muted, fontSize: 11 }, errorText: { color: palette.error, fontSize: 11, textAlign: "center" }, shade: { flex: 1, backgroundColor: "rgba(8,35,29,.52)", alignItems: "center", justifyContent: "center", padding: 18 }, modal: { width: "100%", maxWidth: 470, backgroundColor: "#FFFFFF", borderRadius: 22, padding: 20 }, modalHeader: { flexDirection: "row", gap: 12, alignItems: "flex-start" }, close: { width: 34, height: 34, borderRadius: 10, backgroundColor: "#F1F6F4", alignItems: "center", justifyContent: "center" }, modalTitle: { color: palette.ink, fontSize: 16, fontWeight: "900", textAlign: "right" }, modalCopy: { color: palette.muted, fontSize: 10, marginTop: 4, textAlign: "right" }, label: { color: palette.ink, fontSize: 12, fontWeight: "900", marginTop: 20, marginBottom: 7, textAlign: "right" }, passwordRow: { flexDirection: "row", alignItems: "center", gap: 9 }, generate: { color: palette.primary, fontSize: 10, fontWeight: "900" }, input: { height: 46, borderWidth: 1, borderColor: "#DCE8E3", borderRadius: 12, paddingHorizontal: 12, color: palette.ink, fontSize: 13 }, switchRow: { flexDirection: "row", gap: 12, alignItems: "center", marginTop: 18 }, switchTitle: { color: palette.ink, fontSize: 11, fontWeight: "900", textAlign: "right" }, switchCopy: { color: palette.muted, fontSize: 9, marginTop: 3, textAlign: "right" }, confirm: { minHeight: 48, marginTop: 22, borderRadius: 13, backgroundColor: palette.primary, flexDirection: "row", gap: 6, alignItems: "center", justifyContent: "center" }, confirmText: { color: "#FFFFFF", fontSize: 12, fontWeight: "900" },
});
