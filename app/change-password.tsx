import { router } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { palette } from "@/components/crm-ui";
import { validateNewPassword } from "@/lib/password-policy";
import { supabase } from "@/lib/supabase-client";
import { useSupabaseAuth } from "@/lib/supabase-auth";
import { getPostLoginRoute } from "@/lib/post-login-route";

export default function ChangePasswordScreen() {
  const { profile, refreshProfile, signOut } = useSupabaseAuth();
  const [password, setPassword] = useState(""); const [confirmation, setConfirmation] = useState(""); const [saving, setSaving] = useState(false);
  const save = async () => {
    const validation = validateNewPassword(password, confirmation); if (validation) { Alert.alert("تحقق من كلمة المرور", validation); return; }
    if (!supabase) return; setSaving(true);
    try { const { error } = await supabase.auth.updateUser({ password }); if (error) throw error; const { error: profileError } = await supabase.rpc("tips_crm_mark_password_changed"); if (profileError) throw profileError; const updated = await refreshProfile(); Alert.alert("تم الحفظ", "تم تغيير كلمة المرور بنجاح."); router.replace(getPostLoginRoute({ roleKey: updated?.role_key, isPlatformAdmin: Boolean(updated?.is_platform_admin), isWeb: false }) as never); }
    catch (error) { Alert.alert("تعذر الحفظ", error instanceof Error ? error.message : "حاول مرة أخرى."); }
    finally { setSaving(false); }
  };
  return <ScreenContainer className="items-center justify-center px-5"><View style={styles.card}><View style={styles.mark}><Text style={styles.markText}>T</Text></View><Text style={styles.title}>غيّر كلمة المرور المؤقتة</Text><Text style={styles.copy}>مرحباً {profile?.full_name ?? "بك"}. اختر كلمة مرور خاصة بك قبل متابعة استخدام النظام.</Text><Text style={styles.label}>كلمة المرور الجديدة</Text><TextInput value={password} onChangeText={setPassword} secureTextEntry style={styles.input} textAlign="right" placeholder="ثمانية أحرف على الأقل" placeholderTextColor="#94A39C" /><Text style={styles.label}>تأكيد كلمة المرور</Text><TextInput value={confirmation} onChangeText={setConfirmation} secureTextEntry style={styles.input} textAlign="right" placeholder="أعد كتابة كلمة المرور" placeholderTextColor="#94A39C" /><TouchableOpacity disabled={saving} onPress={() => void save()} style={[styles.button, saving && { opacity: .6 }]}>{saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.buttonText}>حفظ كلمة المرور والمتابعة</Text>}</TouchableOpacity><TouchableOpacity onPress={() => void signOut()} style={styles.signOut}><Text style={styles.signOutText}>تسجيل الخروج</Text></TouchableOpacity></View></ScreenContainer>;
}

const styles = StyleSheet.create({ card: { width: "100%", maxWidth: 410, backgroundColor: "#FFFFFF", borderRadius: 24, borderColor: "#E1EBE6", borderWidth: 1, padding: 26 }, mark: { width: 52, height: 52, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: palette.primary, alignSelf: "center", marginBottom: 14 }, markText: { color: "#FFFFFF", fontWeight: "900", fontSize: 25 }, title: { color: palette.ink, fontSize: 21, fontWeight: "900", textAlign: "center" }, copy: { color: palette.muted, fontSize: 13, lineHeight: 20, marginTop: 8, textAlign: "center" }, label: { color: palette.ink, fontSize: 12, fontWeight: "900", marginTop: 18, marginBottom: 7, textAlign: "right" }, input: { height: 50, borderRadius: 14, borderWidth: 1, borderColor: "#DCE8E3", backgroundColor: "#FFFFFF", paddingHorizontal: 13, color: palette.ink }, button: { height: 52, borderRadius: 15, backgroundColor: palette.primary, alignItems: "center", justifyContent: "center", marginTop: 24 }, buttonText: { color: "#FFFFFF", fontWeight: "900", fontSize: 14 }, signOut: { alignItems: "center", marginTop: 14, padding: 6 }, signOutText: { color: palette.muted, fontSize: 12, fontWeight: "800" } });
