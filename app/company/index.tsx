import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { Redirect, router } from "expo-router";
import { ActivityIndicator, Linking, Platform, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from "react-native";
import { AdminDashboard } from "@/app/(tabs)/admin";
import { palette } from "@/components/crm-ui";
import { ScreenContainer } from "@/components/screen-container";
import { shouldUseCompanyDesktopShell } from "@/lib/portal-layout";
import { useSupabaseAuth } from "@/lib/supabase-auth";

export default function CompanyPortalGateway() {
  const { session, profile, loading, signOut } = useSupabaseAuth();
  const { width } = useWindowDimensions();
  const shouldUseDesktopPortal = Platform.OS === "web" && shouldUseCompanyDesktopShell(width);
  if (loading) return <ScreenContainer className="items-center justify-center"><ActivityIndicator color={palette.primary} size="large" /></ScreenContainer>;
  if (!session) return <Redirect href="/login" />;
  if (profile?.must_change_password) return <Redirect href="/change-password" />;
  if (profile?.is_platform_admin) {
    if (Platform.OS === "web") return <Redirect href="/platform" />;
    return <ScreenContainer className="px-5" containerClassName="bg-background"><View style={styles.center}><View style={styles.icon}><MaterialIcons name="laptop-mac" size={34} color={palette.primary} /></View><Text style={styles.title}>بوابة المنصة للويب فقط</Text><Text style={styles.copy}>هذا الحساب يدير منصة Tips كاملة، لذلك لا يستخدم تطبيق الموظفين. افتح بوابة المنصة من المتصفح لإدارة الشركات والطلبات.</Text><TouchableOpacity onPress={() => void Linking.openURL("https://tipscrm-vevc4ncu.manus.space/platform")} style={styles.primary}><MaterialIcons name="open-in-new" size={18} color="#FFFFFF" /><Text style={styles.primaryText}>فتح بوابة المنصة</Text></TouchableOpacity><TouchableOpacity onPress={() => { void signOut(); router.replace("/login" as never); }} style={styles.secondary}><Text style={styles.secondaryText}>تسجيل الخروج</Text></TouchableOpacity></View></ScreenContainer>;
  }
  const isCompanyManager = profile?.role_key === "company_manager" || profile?.role_key === "sales_manager" || profile?.role_key === "system_admin";
  if (!isCompanyManager) return <Redirect href={profile?.role_key === "sales_supervisor" || profile?.role_key === "medical_supervisor" ? "/supervisor" : "/"} />;
  if (shouldUseDesktopPortal) return <Redirect href="/admin" />;
  return <AdminDashboard />;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 24 }, icon: { width: 70, height: 70, borderRadius: 24, alignItems: "center", justifyContent: "center", backgroundColor: "#E9F8F2" }, title: { color: palette.ink, fontSize: 22, fontWeight: "900", textAlign: "center", marginTop: 16 }, copy: { color: palette.muted, fontSize: 13, lineHeight: 21, textAlign: "center", marginTop: 9, maxWidth: 320 }, primary: { alignSelf: "stretch", minHeight: 50, borderRadius: 15, backgroundColor: palette.primary, marginTop: 24, flexDirection: "row-reverse", gap: 7, alignItems: "center", justifyContent: "center" }, primaryText: { color: "#FFFFFF", fontSize: 13, fontWeight: "900" }, secondary: { alignItems: "center", marginTop: 16, padding: 8 }, secondaryText: { color: palette.muted, fontSize: 12, fontWeight: "800" },
});
