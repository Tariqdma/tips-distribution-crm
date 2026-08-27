import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { useSupabaseAuth } from "@/lib/supabase-auth";
import { supabase } from "@/lib/supabase-client";

export default function PlatformLoginScreen() {
  const { session, profile, loading, refreshProfile, signOut } = useSupabaseAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (session && !loading && profile) {
      if (profile.is_platform_admin) {
        if (Platform.OS === "web" && typeof window !== "undefined") {
          window.location.href = "/platform";
        } else {
          router.replace("/platform" as never);
        }
      }
    }
  }, [session, profile, loading]);

  if (Platform.OS !== "web") {
    return (
      <ScreenContainer className="px-5" containerClassName="bg-[#0F1F1B]">
        <View style={styles.webOnlyWrap}>
          <View style={styles.webOnlyIcon}>
            <MaterialIcons name="laptop-mac" size={36} color="#10B981" />
          </View>
          <Text style={styles.webOnlyTitle}>بوابة المنصة للويب فقط</Text>
          <Text style={styles.webOnlyText}>
            إدارة منصة Tips والشركات مخصصة لمتصفح الويب. افتح هذه البوابة من متصفح الكمبيوتر.
          </Text>
          <TouchableOpacity onPress={() => router.replace("/login" as never)} style={styles.backButton}>
            <Text style={styles.backButtonText}>العودة لتطبيق الموظفين</Text>
          </TouchableOpacity>
        </View>
      </ScreenContainer>
    );
  }

  const submit = async () => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !trimmedEmail.includes("@")) {
      setErrorMessage("اكتب بريداً إلكترونياً صحيحاً لمدير المنصة.");
      return;
    }
    if (!password) {
      setErrorMessage("أدخل كلمة المرور الخاصة بمدير المنصة.");
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);

    try {
      if (!supabase) throw new Error("تعذر الاتصال بخدمة المصادقة.");
      const { error } = await supabase.auth.signInWithPassword({
        email: trimmedEmail,
        password,
      });
      if (error) throw error;

      const nextProfile = await refreshProfile();
      if (!nextProfile?.is_platform_admin) {
        await signOut();
        setErrorMessage("هذا الحساب غير مخوّل لدخول بوابة المنصة. سجّل الدخول من التطبيق أو شاشة الدخول الرئيسية.");
        return;
      }

      window.location.href = "/platform";
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "تعذر تسجيل الدخول ببوابة المنصة.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <ScreenContainer className="items-center justify-center" containerClassName="bg-[#0F1F1B]">
        <ActivityIndicator color="#10B981" size="large" />
      </ScreenContainer>
    );
  }

  if (session && profile?.is_platform_admin) {
    return (
      <ScreenContainer className="items-center justify-center" containerClassName="bg-[#0F1F1B]">
        <View style={styles.card}>
          <Text style={styles.cardTitle}>مرحباً مدير المنصة</Text>
          <Text style={styles.cardText}>{profile.full_name} ({profile.email})</Text>
          <TouchableOpacity onPress={() => { window.location.href = "/platform"; }} style={styles.button}>
            <Text style={styles.buttonText}>الانتقال إلى لوحة المنصة</Text>
          </TouchableOpacity>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer className="px-5" containerClassName="bg-[#0F1F1B]">
      <View style={styles.wrap}>
        <View style={styles.hero}>
          <View style={styles.badge}>
            <MaterialIcons name="security" size={28} color="#10B981" />
          </View>
          <Text style={styles.title}>بوابة إدارة منصة Tips</Text>
          <Text style={styles.subtitle}>مخصصة لإدارة جميع الشركات والاشتراكات على مستوى المنصة</Text>
        </View>

        {errorMessage ? (
          <View style={styles.errorBanner}>
            <MaterialIcons name="error-outline" size={20} color="#F87171" />
            <Text style={styles.errorText}>{errorMessage}</Text>
          </View>
        ) : null}

        <Text style={styles.label}>بريد مدير المنصة</Text>
        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder="admin@tips-sd.com"
          placeholderTextColor="#526E65"
          autoCapitalize="none"
          keyboardType="email-address"
          textAlign="right"
          style={styles.input}
        />

        <Text style={styles.label}>كلمة المرور</Text>
        <TextInput
          value={password}
          onChangeText={setPassword}
          placeholder="••••••••"
          placeholderTextColor="#526E65"
          secureTextEntry
          textAlign="right"
          style={styles.input}
        />

        <TouchableOpacity disabled={submitting} onPress={() => void submit()} style={[styles.button, submitting && styles.dimmed]}>
          {submitting ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <>
              <MaterialIcons name="lock-open" size={20} color="#FFFFFF" />
              <Text style={styles.buttonText}>تسجيل دخول مدير المنصة</Text>
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity onPress={() => router.push("/login" as never)} style={styles.appLoginLink}>
          <Text style={styles.appLoginLinkText}>دخول مدير الشركة والمندوب (تطبيق الموظفين)</Text>
        </TouchableOpacity>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, justifyContent: "center", maxWidth: 420, width: "100%", alignSelf: "center", paddingVertical: 20 },
  hero: { alignItems: "center", marginBottom: 24 },
  badge: { width: 64, height: 64, borderRadius: 20, backgroundColor: "#14332B", borderColor: "#1F4D41", borderWidth: 1, alignItems: "center", justifyContent: "center", marginBottom: 14 },
  title: { color: "#FFFFFF", fontSize: 24, fontWeight: "900", textAlign: "center" },
  subtitle: { color: "#9CA3AF", fontSize: 13, lineHeight: 20, textAlign: "center", marginTop: 7, maxWidth: 300 },
  label: { color: "#D1D5DB", fontSize: 12, fontWeight: "800", textAlign: "right", marginBottom: 6, marginTop: 14 },
  input: { height: 50, backgroundColor: "#142923", borderColor: "#204239", borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, color: "#FFFFFF", fontSize: 14 },
  errorBanner: { flexDirection: "row-reverse", alignItems: "center", gap: 9, backgroundColor: "#3B1818", borderColor: "#7F1D1D", borderWidth: 1, padding: 13, borderRadius: 14, marginBottom: 10 },
  errorText: { color: "#FCA5A5", fontSize: 12, fontWeight: "700", flex: 1, textAlign: "right" },
  button: { height: 52, backgroundColor: "#059669", borderRadius: 15, marginTop: 22, alignItems: "center", justifyContent: "center", flexDirection: "row-reverse", gap: 8 },
  buttonText: { color: "#FFFFFF", fontSize: 14, fontWeight: "900" },
  dimmed: { opacity: 0.6 },
  appLoginLink: { marginTop: 20, alignItems: "center", padding: 10 },
  appLoginLinkText: { color: "#10B981", fontSize: 12, fontWeight: "800" },
  card: { maxWidth: 380, width: "100%", backgroundColor: "#142923", borderColor: "#204239", borderWidth: 1, borderRadius: 22, padding: 24, alignItems: "center" },
  cardTitle: { color: "#FFFFFF", fontSize: 20, fontWeight: "900" },
  cardText: { color: "#9CA3AF", fontSize: 13, marginTop: 8 },
  webOnlyWrap: { flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: 20 },
  webOnlyIcon: { width: 64, height: 64, borderRadius: 20, backgroundColor: "#14332B", alignItems: "center", justifyContent: "center", marginBottom: 16 },
  webOnlyTitle: { color: "#FFFFFF", fontSize: 20, fontWeight: "900" },
  webOnlyText: { color: "#9CA3AF", textAlign: "center", lineHeight: 22, marginTop: 8, fontSize: 13 },
  backButton: { marginTop: 24, minHeight: 46, paddingHorizontal: 20, borderRadius: 13, backgroundColor: "#14332B", justifyContent: "center" },
  backButtonText: { color: "#10B981", fontWeight: "900", fontSize: 13 },
});
