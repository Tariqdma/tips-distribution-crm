import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Image, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { palette } from "@/components/crm-ui";
import { useSupabaseAuth } from "@/lib/supabase-auth";
import { sendPasswordRecoveryEmail, supabase } from "@/lib/supabase-client";
import { getPasswordRecoveryRedirect } from "@/lib/auth-redirect";
import { permissionsFromMembership } from "@shared/auth/permission-set";
import { getPostLoginRoute } from "@shared/lib/post-login-route";

function translateAuthError(error: unknown): string {
  if (!error) return "حدث خطأ غير متوقع. يرجى المحاولة مجدداً.";
  const msg = (error instanceof Error ? error.message : String(error)).toLowerCase();

  if (msg.includes("invalid login credentials") || msg.includes("invalid_credentials")) {
    return "البريد الإلكتروني أو كلمة المرور غير صحيحة. يرجى التحقق من بياناتك والمحاولة مجدداً.";
  }
  if (msg.includes("email not confirmed")) {
    return "البريد الإلكتروني غير مفعل بعد. يرجى مراجعة بريدك أو التواصل مع مسؤول النظام.";
  }
  if (msg.includes("too many requests") || msg.includes("rate limit")) {
    return "تمت محاولة تسجيل الدخول عدة مرات بشكل خاطئ. يرجى الانتظار قليلاً ثم المحاولة مجدداً.";
  }
  if (msg.includes("user not found")) {
    return "البريد الإلكتروني أو كلمة المرور غير صحيحة. يرجى التحقق من بياناتك والمحاولة مجدداً.";
  }
  if (msg.includes("database error") || msg.includes("schema") || msg.includes("500") || msg.includes("server_error")) {
    return "حدث خطأ أثناء الاتصال بالنظام. يرجى المحاولة لاحقاً أو التواصل مع الدعم الفني.";
  }
  if (msg.includes("fetch") || msg.includes("network") || msg.includes("timeout")) {
    return "تعذر الاتصال بالخادم. يرجى التأكد من اتصالك بالإنترنت والمحاولة مجدداً.";
  }
  return "تعذر تسجيل الدخول حالياً. يرجى التأكد من بياناتك والمحاولة مجدداً.";
}

export default function LoginScreen() {
  const { session, profile, loading, refreshProfile, claimFirstSystemAdmin } = useSupabaseAuth();
  const { token } = useLocalSearchParams<{ token?: string }>();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const routeToAccount = (membershipPermissions: string[], mustChangePassword?: boolean, isPlatformAdmin?: boolean) => {
    const permissions = permissionsFromMembership({ membershipPermissions, isPlatformAdmin });
    const destination = getPostLoginRoute({ permissions, mustChangePassword, isWeb: Platform.OS === "web" });
    if (Platform.OS === "web" && typeof window !== "undefined") {
      window.location.href = destination;
      return;
    }
    router.replace(destination as never);
  };

  // Auto-redirect if already logged in
  useEffect(() => {
    if (session && !loading && profile) {
      routeToAccount(profile.membership_permissions, profile.must_change_password, profile.is_platform_admin);
    }
  }, [session, profile, loading]);

  const validateInputs = (): boolean => {
    let isValid = true;
    setEmailError(null);
    setPasswordError(null);
    setErrorMessage(null);

    const trimmedEmail = email.trim();

    if (!trimmedEmail) {
      setEmailError("الرجاء إدخال البريد الإلكتروني.");
      setErrorMessage("يرجى كتابة البريد الإلكتروني وكلمة المرور.");
      isValid = false;
    } else if (!trimmedEmail.includes("@")) {
      setEmailError("صيغة البريد الإلكتروني غير صحيحة (مثال: name@tips.sd).");
      setErrorMessage("يرجى كتابة بريد إلكتروني صحيح.");
      isValid = false;
    }

    if (!password) {
      setPasswordError("الرجاء إدخال كلمة المرور.");
      if (isValid) setErrorMessage("يرجى كتابة كلمة المرور.");
      isValid = false;
    }

    return isValid;
  };

  const submit = async () => {
    if (!validateInputs()) return;

    setSubmitting(true);
    setErrorMessage(null);

    try {
      if (!supabase) {
        throw new Error("تعذر الاتصال بخدمة المصادقة.");
      }

      console.log("[LoginScreen] Attempting sign-in with email:", email.trim());
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        console.error("[LoginScreen] Sign-in error:", error);
        throw error;
      }

      console.log("[LoginScreen] Sign-in succeeded:", data.user?.id);
      const nextProfile = await refreshProfile();

      // If sales_rep profile with no system_admin existing yet, auto-attempt bootstrap claim
      if (!nextProfile?.role_key || nextProfile.role_key === "sales_rep") {
        await claimFirstSystemAdmin().catch(() => false);
      }

      const updatedProfile = await refreshProfile();
      routeToAccount(updatedProfile?.membership_permissions ?? [], updatedProfile?.must_change_password, updatedProfile?.is_platform_admin);
    } catch (error) {
      console.error("[LoginScreen] Catch block error:", error);
      const arabicMsg = translateAuthError(error);
      setErrorMessage(arabicMsg);
    } finally {
      setSubmitting(false);
    }
  };

  const requestPasswordReset = async () => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !trimmedEmail.includes("@")) {
      setEmailError("اكتب بريدك الإلكتروني الصحيح أولاً استعادة كلمة المرور.");
      setErrorMessage("اكتب البريد الإلكتروني في الحقل أعلاه أولاً.");
      return;
    }

    setResetting(true);
    setErrorMessage(null);

    try {
      await sendPasswordRecoveryEmail(trimmedEmail, getPasswordRecoveryRedirect());
      const successMsg = "تم إرسال رابط استعادة كلمة المرور إلى بريدك الإلكتروني بنجاح.";
      if (Platform.OS === "web" && typeof window !== "undefined") {
        window.alert(successMsg);
      } else {
        Alert.alert("تأكيد الاستعادة", successMsg);
      }
    } catch (error) {
      const arabicMsg = translateAuthError(error);
      setErrorMessage(arabicMsg);
    } finally {
      setResetting(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.wrap, { alignItems: "center", justifyContent: "center" }]}>
        <ActivityIndicator color={palette.primary} size="large" />
      </View>
    );
  }

  const claimAdmin = async () => {
    const success = await claimFirstSystemAdmin();
    if (success) {
      Alert.alert("تمت التهيئة", "أصبح حسابك مدير النظام الأول. يمكنك الآن الدخول إلى بوابة الإدارة.");
    } else {
      Alert.alert("تعذر التهيئة", "يوجد مدير نظام بالفعل أو لم يكتمل تجهيز ملفك بعد.");
    }
  };


  if (session) {
    if (profile?.is_platform_admin) {
      return (
        <View style={styles.wrap}>
          <View style={styles.centerWrap}>
            <View style={styles.statusCard}>
              <View style={styles.statusHeader}>
                <View style={styles.logoMark}>
                  <Image source={require("@/assets/images/icon.png")} style={styles.logoImage} resizeMode="contain" />
                </View>
                <Text style={styles.appName}>Tips CRM</Text>
              </View>
              <View style={styles.statusBody}>
                <Text style={styles.statusTitle}>حساب مدير المنصة</Text>
                <Text style={styles.statusCopy}>
                  حساب مدير المنصة يُدار من بوابة المنصة عبر الويب.
                </Text>

                <TouchableOpacity onPress={() => router.push("/platform/login" as never)} style={styles.button} activeOpacity={0.86}>
                  <MaterialIcons name="arrow-back" size={20} color="#FFFFFF" />
                  <Text style={styles.buttonText}>فتح بوابة المنصة</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      );
    }

    return (
      <View style={styles.wrap}>
        <View style={styles.centerWrap}>
          <View style={styles.statusCard}>
            <View style={styles.statusHeader}>
              <View style={styles.logoMark}>
                <Image source={require("@/assets/images/icon.png")} style={styles.logoImage} resizeMode="contain" />
              </View>
              <Text style={styles.appName}>Tips CRM</Text>
            </View>
            <View style={styles.statusBody}>
              <Text style={styles.statusTitle}>تم تسجيل الدخول بنجاح</Text>
              <Text style={styles.statusCopy}>
                {profile ? `مرحباً بك، ${profile.full_name} (${profile.role_name || profile.role_key}).` : "مرحباً بك في نظام Tips CRM."}
              </Text>

              {token ? (
                <TouchableOpacity onPress={() => router.replace(`/invite?token=${token}` as never)} style={styles.claim}>
                  <Text style={styles.claimText}>متابعة قبول الدعوة</Text>
                </TouchableOpacity>
              ) : null}

              <TouchableOpacity
                onPress={() => routeToAccount(profile?.membership_permissions ?? [], profile?.must_change_password, profile?.is_platform_admin)}
                style={styles.button}
                activeOpacity={0.86}
              >
                <MaterialIcons name="arrow-back" size={20} color="#FFFFFF" />
                <Text style={styles.buttonText}>
                  {profile?.must_change_password ? "تغيير كلمة المرور الآن" : "الانتقال إلى لوحة التحكم"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <View style={styles.logoMark}>
            <Image source={require("@/assets/images/icon.png")} style={styles.logoImage} resizeMode="contain" />
          </View>
          <Text style={styles.appName}>Tips CRM</Text>
          <Text style={styles.tagline}>منصة الفرق الميدانية</Text>
        </View>

        <View style={styles.card}>
          <View style={styles.form}>
            <Text style={styles.sectionTitle}>أدخل بياناتك للمتابعة</Text>

            {errorMessage ? (
              <View style={styles.errorBanner}>
                <MaterialIcons name="error-outline" size={20} color={palette.error} />
                <Text style={styles.errorBannerText}>{errorMessage}</Text>
              </View>
            ) : null}

            <Text style={styles.label}>البريد الإلكتروني</Text>
            <View style={[styles.inputWrapper, emailError ? styles.inputError : null]}>
              <Text style={styles.inputIcon}>✉</Text>
              <TextInput
                value={email}
                onChangeText={(text) => {
                  setEmail(text);
                  if (emailError) setEmailError(null);
                  if (errorMessage) setErrorMessage(null);
                }}
                onSubmitEditing={() => void submit()}
                returnKeyType="next"
                autoCapitalize="none"
                keyboardType="email-address"
                autoComplete="email"
                textContentType="username"
                // @ts-ignore - React Native Web HTML Attributes
                name="username"
                id="username"
                style={styles.input}
                textAlign="right"
                placeholder="admin@tips.sd"
                placeholderTextColor="#94A39C"
              />
            </View>
            {emailError ? <Text style={styles.fieldError}>{emailError}</Text> : null}

            <Text style={styles.label}>كلمة المرور</Text>
            <View style={[styles.inputWrapper, passwordError ? styles.inputError : null]}>
              <Text style={styles.inputIcon}>🔒</Text>
              <TextInput
                value={password}
                onChangeText={(text) => {
                  setPassword(text);
                  if (passwordError) setPasswordError(null);
                  if (errorMessage) setErrorMessage(null);
                }}
                onSubmitEditing={() => void submit()}
                returnKeyType="go"
                secureTextEntry
                autoComplete="current-password"
                textContentType="password"
                // @ts-ignore - React Native Web HTML Attributes
                name="password"
                id="password"
                style={styles.input}
                textAlign="right"
                placeholder="أدخل كلمة المرور"
                placeholderTextColor="#94A39C"
              />
            </View>
            {passwordError ? <Text style={styles.fieldError}>{passwordError}</Text> : null}

            <TouchableOpacity
              disabled={submitting}
              onPress={() => void submit()}
              style={[styles.button, submitting && { opacity: 0.7 }]}
              activeOpacity={0.86}
            >
              {submitting ? (
                <View style={styles.submittingRow}>
                  <ActivityIndicator color="#FFFFFF" size="small" />
                  <Text style={styles.buttonText}>جاري التحقق وتسجيل الدخول...</Text>
                </View>
              ) : (
                <>
                  <MaterialIcons name="arrow-back" size={20} color="#FFFFFF" />
                  <Text style={styles.buttonText}>دخول</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity disabled={resetting} onPress={() => void requestPasswordReset()} style={styles.recovery}>
              <Text style={styles.recoveryText}>{resetting ? "جارٍ إرسال الرابط…" : "نسيت كلمة المرور؟"}</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => router.push("/company-request" as never)} style={styles.companyRequest}>
              <MaterialIcons name="business" size={17} color={palette.primary} />
              <Text style={styles.companyRequestText}>شركتك جديدة؟ قدّم طلب انضمام</Text>
            </TouchableOpacity>

            <Text style={styles.support}>الحسابات الفردية ينشئها مدير الشركة أو المشرف المسؤول.</Text>

            <TouchableOpacity onPress={() => router.push("/platform/login" as never)} style={styles.platformLink}>
              <Text style={styles.platformLinkText}>مدير المنصة؟ ادخل من بوابة المنصة</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: "#F0F7F4" },
  centerWrap: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 24 },
  hero: { backgroundColor: "#0A1F1A", paddingTop: 60, paddingBottom: 50, alignItems: "center", justifyContent: "center" },
  logoMark: { width: 72, height: 72, borderRadius: 22, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center", marginBottom: 16, shadowColor: "#059669", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.35, shadowRadius: 16, elevation: 8 },
  logoImage: { width: 56, height: 56 },
  appName: { color: "#FFFFFF", fontSize: 28, fontWeight: "900" },
  tagline: { color: "#9BB8AE", fontSize: 14, marginTop: 6 },
  card: { flex: 1, backgroundColor: "#F0F7F4", borderTopLeftRadius: 28, borderTopRightRadius: 28, marginTop: -24, paddingHorizontal: 24, paddingTop: 32, paddingBottom: 24 },
  form: { width: "100%", maxWidth: 420, alignSelf: "center" },
  sectionTitle: { color: "#0D1F1A", fontSize: 20, fontWeight: "800", textAlign: "right", marginBottom: 24 },
  label: { color: "#0D1F1A", fontSize: 12, fontWeight: "800", textAlign: "right", marginBottom: 8, marginTop: 16 },
  inputWrapper: { flexDirection: "row-reverse", alignItems: "center", backgroundColor: "#FFFFFF", borderWidth: 1.5, borderColor: "#D4E8E0", borderRadius: 16, height: 54, paddingHorizontal: 14, gap: 10, shadowColor: "#059669", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 1 },
  inputIcon: { fontSize: 18, color: "#5A6E68" },
  input: { flex: 1, height: "100%", color: "#0D1F1A", fontSize: 15, textAlign: "right", ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as any) : null) },
  inputError: { borderColor: "#B63838", backgroundColor: "#FFF8F8" },
  button: { height: 56, backgroundColor: "#059669", borderRadius: 16, marginTop: 28, alignItems: "center", justifyContent: "center", flexDirection: "row-reverse", gap: 10, paddingHorizontal: 18, shadowColor: "#059669", shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.28, shadowRadius: 14, elevation: 6 },
  buttonText: { color: "#FFFFFF", fontSize: 16, fontWeight: "900" },
  recovery: { alignItems: "center", paddingTop: 18 },
  recoveryText: { color: "#059669", fontSize: 13, fontWeight: "800" },
  companyRequest: { flexDirection: "row-reverse", alignSelf: "center", alignItems: "center", gap: 6, marginTop: 14, paddingVertical: 8, paddingHorizontal: 12, backgroundColor: "#E6F7F1", borderRadius: 12 },
  companyRequestText: { color: "#059669", fontSize: 13, fontWeight: "800" },
  platformLink: { alignSelf: "center", marginTop: 16, padding: 8 },
  platformLinkText: { color: "#5A6E68", fontSize: 11, fontWeight: "700" },
  errorBanner: { flexDirection: "row-reverse", alignItems: "center", gap: 9, backgroundColor: "#FFF0F0", borderColor: "#F8B4B4", borderWidth: 1, padding: 13, borderRadius: 14, marginBottom: 14 },
  errorBannerText: { color: "#B63838", fontSize: 12, fontWeight: "700", flex: 1, textAlign: "right", lineHeight: 18 },
  fieldError: { color: "#B63838", fontSize: 11, textAlign: "right", marginTop: 4 },
  submittingRow: { flexDirection: "row-reverse", alignItems: "center", gap: 8 },
  support: { color: "#5A6E68", fontSize: 11, textAlign: "center", marginTop: 20, lineHeight: 17 },
  statusCard: { width: "100%", maxWidth: 380, backgroundColor: "#FFFFFF", borderColor: "#D4E8E0", borderWidth: 1, borderRadius: 24, overflow: "hidden", shadowColor: "#059669", shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.08, shadowRadius: 16, elevation: 4 },
  statusHeader: { backgroundColor: "#0A1F1A", alignItems: "center", justifyContent: "center", paddingTop: 32, paddingBottom: 24 },
  statusBody: { padding: 24 },
  statusTitle: { color: "#0D1F1A", fontSize: 20, fontWeight: "800", textAlign: "center" },
  statusCopy: { color: "#5A6E68", fontSize: 13, lineHeight: 20, textAlign: "center", marginTop: 8 },
  claim: { marginTop: 16, padding: 12, borderRadius: 14, backgroundColor: "#FFF6E5" },
  claimText: { color: "#B86D08", fontSize: 12, fontWeight: "900", textAlign: "center" },
});
