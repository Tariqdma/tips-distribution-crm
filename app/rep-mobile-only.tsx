import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { router } from "expo-router";
import { Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { palette } from "@/components/crm-ui";
import { ScreenContainer } from "@/components/screen-container";
import { useSupabaseAuth } from "@/lib/supabase-auth";

export default function RepMobileOnlyScreen() {
  const { profile, signOut } = useSupabaseAuth();

  const handleSignOut = async () => {
    await signOut();
    if (Platform.OS === "web" && typeof window !== "undefined") {
      window.location.href = "/login";
      return;
    }
    router.replace("/login" as never);
  };

  return (
    <ScreenContainer className="px-5" containerClassName="bg-[#0D1E19]">
      <View style={styles.container}>
        <View style={styles.iconWrap}>
          <MaterialIcons name="phone-android" size={44} color="#10B981" />
        </View>

        <Text style={styles.title}>تطبيق المندوب الميداني للأجهزة الذكية فقط</Text>
        <Text style={styles.subtitle}>Field Operations — Android App Only</Text>

        <View style={styles.card}>
          <Text style={styles.greeting}>
            مرحباً {profile?.full_name || "بالمندوب الميداني"}
          </Text>
          <Text style={styles.bodyText}>
            تم تصميم واجهة المندوب الميداني لتعمل حصرياً عبر **تطبيق الهاتف الذكي (Android App)** لضمان:
          </Text>

          <View style={styles.featureList}>
            <View style={styles.featureItem}>
              <MaterialIcons name="gps-fixed" size={20} color="#10B981" />
              <Text style={styles.featureText}>التقاط إحداثيات الـ GPS المباشرة لإثبات الحضور عند العملاء.</Text>
            </View>
            <View style={styles.featureItem}>
              <MaterialIcons name="cloud-off" size={20} color="#10B981" />
              <Text style={styles.featureText}>العمل في وضع عدم الاتصال (Offline-First) وحفظ المسودات محلياً.</Text>
            </View>
            <View style={styles.featureItem}>
              <MaterialIcons name="touch-app" size={20} color="#10B981" />
              <Text style={styles.featureText}>واجهة سريعة مخصصة للاستخدام بيد واحدة أثناء العمل الميداني.</Text>
            </View>
          </View>

          <View style={styles.noticeBox}>
            <MaterialIcons name="info-outline" size={18} color="#0D9488" />
            <Text style={styles.noticeText}>
              يرجى فتح حسابك من خلال تطبيق Android المخصص للمناديب، أو مراجعة مدير شركتك للحصول على ملف التطبيق.
            </Text>
          </View>
        </View>

        <TouchableOpacity onPress={() => void handleSignOut()} style={styles.logoutButton}>
          <MaterialIcons name="logout" size={18} color="#FFFFFF" />
          <Text style={styles.logoutButtonText}>تسجيل الخروج</Text>
        </TouchableOpacity>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    maxWidth: 540,
    width: "100%",
    alignSelf: "center",
    paddingVertical: 32,
  },
  iconWrap: {
    width: 80,
    height: 80,
    borderRadius: 28,
    backgroundColor: "rgba(16, 185, 129, 0.15)",
    borderWidth: 1,
    borderColor: "rgba(16, 185, 129, 0.3)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  title: {
    color: "#FFFFFF",
    fontSize: 22,
    fontWeight: "900",
    textAlign: "center",
    marginBottom: 6,
  },
  subtitle: {
    color: "#6EE7B7",
    fontSize: 13,
    fontWeight: "600",
    textAlign: "center",
    marginBottom: 24,
  },
  card: {
    backgroundColor: "#162B25",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: 20,
    padding: 24,
    width: "100%",
  },
  greeting: {
    color: "#A7F3D0",
    fontSize: 15,
    fontWeight: "800",
    textAlign: "right",
    marginBottom: 8,
  },
  bodyText: {
    color: "#D1FAE5",
    fontSize: 13,
    lineHeight: 20,
    textAlign: "right",
    marginBottom: 16,
  },
  featureList: {
    gap: 12,
    marginBottom: 20,
  },
  featureItem: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 10,
    backgroundColor: "rgba(0, 0, 0, 0.2)",
    padding: 12,
    borderRadius: 12,
  },
  featureText: {
    color: "#ECFDF5",
    fontSize: 12,
    flex: 1,
    textAlign: "right",
    lineHeight: 18,
  },
  noticeBox: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(13, 148, 136, 0.15)",
    borderWidth: 1,
    borderColor: "rgba(13, 148, 136, 0.3)",
    padding: 12,
    borderRadius: 12,
  },
  noticeText: {
    color: "#5EEAD4",
    fontSize: 11,
    flex: 1,
    textAlign: "right",
    lineHeight: 16,
  },
  logoutButton: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#EF4444",
    minHeight: 48,
    borderRadius: 14,
    width: "100%",
    marginTop: 20,
  },
  logoutButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
  },
});
