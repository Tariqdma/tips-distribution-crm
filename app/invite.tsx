import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { palette } from "@/components/crm-ui";
import { ScreenContainer } from "@/components/screen-container";
import { useSupabaseAuth } from "@/lib/supabase-auth";
import { supabase } from "@/lib/supabase-client";
import { getPostLoginRoute } from "@/lib/post-login-route";

export default function InviteAcceptanceScreen() {
  const { token } = useLocalSearchParams<{ token: string }>(); const { session, loading, refreshProfile } = useSupabaseAuth(); const [processing, setProcessing] = useState(false); const [message, setMessage] = useState("سجّل الدخول بالحساب الذي وصلته الدعوة للمتابعة."); const [nextRoute, setNextRoute] = useState("/(tabs)");
  const accept = async () => { if (!token || !supabase || !session) return; setProcessing(true); const { data, error } = await supabase.rpc("tips_crm_accept_invite", { token }); if (error) { setMessage(error.message); setProcessing(false); return; } const updated = await refreshProfile(); setNextRoute(getPostLoginRoute({ roleKey: updated?.role_key, mustChangePassword: updated?.must_change_password, isPlatformAdmin: Boolean(updated?.is_platform_admin), isWeb: false })); setMessage(`تم قبول الدعوة وتعيين دورك بنجاح: ${data?.[0]?.role_key ?? "الموظف"}.`); setProcessing(false); };
  useEffect(() => { if (session && token) void accept(); }, [session, token]);
  if (loading) return <ScreenContainer className="items-center justify-center"><ActivityIndicator color={palette.primary} /></ScreenContainer>;
  return <ScreenContainer className="px-6" containerClassName="bg-background"><View style={styles.card}><View style={styles.icon}><MaterialIcons name="mark-email-read" size={30} color="#FFFFFF" /></View><Text style={styles.title}>دعوة فريق Tips CRM</Text><Text style={styles.copy}>{message}</Text>{!session ? <TouchableOpacity onPress={() => router.replace(`/login?token=${token}` as never)} style={styles.button}><Text style={styles.buttonText}>تسجيل الدخول لقبول الدعوة</Text></TouchableOpacity> : processing ? <ActivityIndicator color={palette.primary} style={{ marginTop: 22 }} /> : <TouchableOpacity onPress={() => router.replace(nextRoute as never)} style={styles.button}><Text style={styles.buttonText}>فتح حسابي</Text></TouchableOpacity>}</View></ScreenContainer>;
}
const styles = StyleSheet.create({ card: { flex: 1, justifyContent: "center", alignItems: "center", maxWidth: 410, alignSelf: "center", width: "100%" }, icon: { width: 64, height: 64, borderRadius: 21, backgroundColor: palette.primary, alignItems: "center", justifyContent: "center", marginBottom: 15 }, title: { color: palette.ink, fontSize: 23, fontWeight: "900", textAlign: "center" }, copy: { color: palette.muted, fontSize: 13, lineHeight: 21, textAlign: "center", marginTop: 9 }, button: { minHeight: 50, paddingHorizontal: 18, backgroundColor: palette.primary, borderRadius: 14, marginTop: 22, justifyContent: "center" }, buttonText: { color: "#FFFFFF", fontWeight: "900", fontSize: 13 } });
