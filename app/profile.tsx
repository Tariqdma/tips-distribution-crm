import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { router } from "expo-router";
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { ScreenContainer } from "@/components/screen-container";
import { palette } from "@/components/crm-ui";
import { useSupabaseAuth } from "@/lib/supabase-auth";

const roleLabels: Record<string, string> = {
  system_admin: "مدير النظام",
  company_manager: "مدير الشركة",
  sales_manager: "مشرف المبيعات",
  medical_manager: "المشرف الطبي",
  sales_supervisor: "مشرف المبيعات",
  medical_supervisor: "المشرف الطبي",
  sales_rep: "مندوب مبيعات",
  medical_rep: "مندوب طبي",
  accountant: "محاسب",
};

export default function ProfileScreen() {
  const { profile, signOut, signOutOtherDevices } = useSupabaseAuth();
  const roleLabel = profile?.role_name || roleLabels[profile?.role_key ?? ""] || "مستخدم";
  const territories = profile?.territory_labels?.filter(Boolean) ?? (profile?.territory_label ? [profile.territory_label] : []);

  const handleSignOutOtherDevices = () => {
    Alert.alert("تسجيل الخروج من الأجهزة الأخرى", "سيتم إبقاء هذا الجهاز متصلاً وإغلاق الجلسات الأخرى. هل تريد المتابعة؟", [
      { text: "إلغاء", style: "cancel" },
      {
        text: "تسجيل الخروج من الأجهزة الأخرى",
        style: "destructive",
        onPress: () => {
          void signOutOtherDevices().then((success) => {
            Alert.alert(success ? "تم التنفيذ" : "تعذر التنفيذ", success ? "تم تسجيل الخروج من الجلسات الأخرى." : "تعذر إنهاء الجلسات الأخرى. تحقق من الاتصال وحاول مرة أخرى.");
          });
        },
      },
    ]);
  };

  const handleSignOut = () => {
    Alert.alert("تسجيل الخروج", "هل تريد تسجيل الخروج من هذا الجهاز؟", [
      { text: "إلغاء", style: "cancel" },
      {
        text: "تسجيل الخروج",
        style: "destructive",
        onPress: () => {
          void signOut().then(() => router.replace("/login" as never));
        },
      },
    ]);
  };

  return (
    <ScreenContainer className="px-5" containerClassName="bg-background">
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton} accessibilityLabel="العودة">
            <MaterialIcons name="arrow-forward" size={22} color={palette.ink} />
          </TouchableOpacity>
          <View style={styles.headerCopy}>
            <Text style={styles.eyebrow}>الحساب والأمان</Text>
            <Text style={styles.title}>ملفي الشخصي</Text>
          </View>
          <View style={styles.headerIcon}><MaterialIcons name="person" size={22} color={palette.primary} /></View>
        </View>

        <View style={styles.identityCard}>
          <View style={styles.avatar}><Text style={styles.avatarText}>{(profile?.full_name ?? "م").split(" ").slice(0, 2).map((part) => part[0]).join("")}</Text></View>
          <Text style={styles.name}>{profile?.full_name ?? "المستخدم"}</Text>
          <Text style={styles.role}>{roleLabel}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>بيانات الحساب</Text>
          <InfoRow icon="email" label="البريد الإلكتروني" value={profile?.email ?? "غير متوفر"} />
          <InfoRow icon="badge" label="الدور" value={roleLabel} />
          <InfoRow icon="business" label="الشركة النشطة" value={profile?.active_company_name ?? "غير محددة"} />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>نطاق العمل</Text>
          <InfoRow icon="supervisor-account" label="المشرف المباشر" value={profile?.reports_to_profile_id ? "مشرف معين" : "غير معين"} />
          <InfoRow icon="map" label="مناطق العمل" value={territories.length ? territories.join("، ") : "لا توجد مناطق مسندة"} />
        </View>

        <View style={styles.sessionCard}>
          <View style={styles.sessionIcon}><MaterialIcons name="phonelink-lock" size={22} color={palette.primary} /></View>
          <View style={styles.sessionCopy}><Text style={styles.sessionTitle}>الجلسة الحالية</Text><Text style={styles.sessionHint}>هذا الجهاز متصل الآن. يمكنك إنهاء الجلسات على الأجهزة الأخرى دون تسجيل خروجك هنا.</Text></View>
        </View>
        <TouchableOpacity onPress={handleSignOutOtherDevices} style={styles.otherSessionsButton} accessibilityRole="button">
          <MaterialIcons name="devices" size={21} color={palette.primary} />
          <Text style={styles.otherSessionsText}>تسجيل الخروج من الأجهزة الأخرى</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => router.push("/change-password" as never)} style={styles.actionRow} accessibilityRole="button">
          <MaterialIcons name="lock-reset" size={22} color={palette.primary} />
          <View style={styles.actionCopy}><Text style={styles.actionTitle}>تغيير كلمة المرور</Text><Text style={styles.actionHint}>حدّث كلمة المرور من خلال المسار الآمن</Text></View>
          <MaterialIcons name="chevron-left" size={22} color={palette.muted} />
        </TouchableOpacity>

        <TouchableOpacity onPress={handleSignOut} style={styles.signOut} accessibilityRole="button">
          <MaterialIcons name="logout" size={21} color="#B42318" />
          <Text style={styles.signOutText}>تسجيل الخروج</Text>
        </TouchableOpacity>
      </ScrollView>
    </ScreenContainer>
  );
}

function InfoRow({ icon, label, value }: { icon: keyof typeof MaterialIcons.glyphMap; label: string; value: string }) {
  return <View style={styles.infoRow}><MaterialIcons name={icon} size={20} color={palette.primary} /><View style={styles.infoCopy}><Text style={styles.infoLabel}>{label}</Text><Text style={styles.infoValue}>{value}</Text></View></View>;
}

const styles = StyleSheet.create({
  content: { paddingTop: 18, paddingBottom: 34, gap: 14 },
  header: { flexDirection: "row-reverse", alignItems: "center", gap: 11, marginBottom: 4 },
  headerCopy: { flex: 1, alignItems: "flex-end" },
  eyebrow: { color: palette.muted, fontSize: 11, fontWeight: "700" },
  title: { color: palette.ink, fontSize: 24, fontWeight: "900", marginTop: 3 },
  headerIcon: { width: 42, height: 42, borderRadius: 15, backgroundColor: "#E7F6F0", alignItems: "center", justifyContent: "center" },
  backButton: { width: 42, height: 42, borderRadius: 15, backgroundColor: "#F4F7F5", alignItems: "center", justifyContent: "center" },
  identityCard: { backgroundColor: palette.primary, borderRadius: 24, padding: 22, alignItems: "center", marginTop: 4 },
  avatar: { width: 66, height: 66, borderRadius: 23, backgroundColor: "#DDF8EE", alignItems: "center", justifyContent: "center" },
  avatarText: { color: palette.primary, fontSize: 22, fontWeight: "900" },
  name: { color: "#FFFFFF", fontSize: 20, fontWeight: "900", marginTop: 10 },
  role: { color: "#DDF8EE", fontSize: 13, fontWeight: "800", marginTop: 4 },
  section: { backgroundColor: "#FFFFFF", borderRadius: 21, padding: 16, borderWidth: 1, borderColor: "#E2ECE8", gap: 10 },
  sectionTitle: { color: palette.ink, fontSize: 15, fontWeight: "900", textAlign: "right", marginBottom: 2 },
  infoRow: { flexDirection: "row-reverse", alignItems: "center", gap: 11, paddingVertical: 7, borderTopWidth: 1, borderTopColor: "#EEF3F1" },
  infoCopy: { flex: 1, alignItems: "flex-end" },
  infoLabel: { color: palette.muted, fontSize: 11, fontWeight: "700" },
  infoValue: { color: palette.ink, fontSize: 13, fontWeight: "800", textAlign: "right", marginTop: 2 },
  sessionCard: { flexDirection: "row-reverse", alignItems: "center", gap: 11, backgroundColor: "#E7F6F0", borderRadius: 18, padding: 15, borderWidth: 1, borderColor: "#BDE9D8" },
  sessionIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center" },
  sessionCopy: { flex: 1, alignItems: "flex-end" },
  sessionTitle: { color: palette.ink, fontSize: 14, fontWeight: "900", textAlign: "right" },
  sessionHint: { color: palette.muted, fontSize: 11, lineHeight: 17, textAlign: "right", marginTop: 3 },
  otherSessionsButton: { minHeight: 52, borderRadius: 17, borderWidth: 1, borderColor: "#A9DCCB", backgroundColor: "#F4FFFA", flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 8 },
  otherSessionsText: { color: palette.primary, fontSize: 13, fontWeight: "900" },
  actionRow: { flexDirection: "row-reverse", alignItems: "center", gap: 11, backgroundColor: "#FFFFFF", borderRadius: 18, padding: 16, borderWidth: 1, borderColor: "#E2ECE8" },
  actionCopy: { flex: 1, alignItems: "flex-end" },
  actionTitle: { color: palette.ink, fontSize: 14, fontWeight: "900" },
  actionHint: { color: palette.muted, fontSize: 11, marginTop: 3, textAlign: "right" },
  signOut: { minHeight: 52, borderRadius: 17, borderWidth: 1, borderColor: "#F1B7B3", backgroundColor: "#FFF5F4", flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 2 },
  signOutText: { color: "#B42318", fontSize: 14, fontWeight: "900" },
});
