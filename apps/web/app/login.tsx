import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { palette } from "@/components/crm-ui";
import { ScreenContainer } from "@/components/screen-container";
import { useSupabaseAuth } from "@/lib/supabase-auth";
import { sendPasswordRecoveryEmail, supabase } from "@/lib/supabase-client";
import { getPasswordRecoveryRedirect } from "@/lib/auth-redirect";
import { getPostLoginRoute } from "@/lib/post-login-route";

function translateAuthError(error: unknown): string {
  if (!error) return "حدث خطأ غير متوقع. يرجى المحاولة مجدداً.";
  const msg = (error instanceof Error ? error.message : String(error)).toLowerCase();

  if (msg.includes("invalid login credentials") || msg.includes("invalid_credentials")) {
    return "البريد الإلكتروني أو كلمة المرور غير صحيحة. يرجى التأكد من البيانات والمحاولة مجدداً.";
  }
  if (msg.includes("email not confirmed")) {
    return "البريد الإلكتروني غير مفعل بعد. يرجى مراجعة بريدك أو التواصل مع مسؤول النظام.";
  }
  if (msg.includes("too many requests") || msg.includes("rate limit")) {
    return "تمت محاولة تسجيل الدخول عدة مرات بشكل خاطئ. يرجى الانتظار قليلاً ثم المحاولة مجدداً.";
  }
  if (msg.includes("user not found")) {
    return "بيانات الحساب غير مسجلة لدينا. يرجى التواصل مع مسؤول النظام لإنشاء حسابك.";
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

  const routeToAccount = (roleKey?: string, mustChangePassword?: boolean, isPlatformAdmin?: boolean) => {
    const destination = getPostLoginRoute({ roleKey, mustChangePassword, isPlatformAdmin, isWeb: Platform.OS === "web" });
    if (Platform.OS === "web" && typeof window !== "undefined") {
      window.location.href = destination;
      return;
    }
    router.replace(destination as never);
  };

  // Auto-redirect if already logged in
  useEffect(() => {
    if (session && !loading && profile) {
      routeToAccount(profile.role_key, profile.must_change_password, profile.is_platform_admin);
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
      routeToAccount(updatedProfile?.role_key, updatedProfile?.must_change_password, updatedProfile?.is_platform_admin);
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
      <ScreenContainer className="items-center justify-center">
        <ActivityIndicator color={palette.primary} size="large" />
      </ScreenContainer>
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
        <ScreenContainer className="items-center justify-center px-6">
          <View style={styles.card}>
            <View style={styles.mark}>
              <Text style={styles.markText}>T</Text>
            </View>
            <Text style={styles.title}>حساب مدير المنصة</Text>
            <Text style={styles.copy}>
              حساب مدير المنصة يُدار من بوابة المنصة عبر الويب.
            </Text>

            <TouchableOpacity onPress={() => router.push("/platform/login" as never)} style={styles.button}>
              <Text style={styles.buttonText}>فتح بوابة المنصة</Text>
            </TouchableOpacity>
          </View>
        </ScreenContainer>
      );
    }

    return (
      <ScreenContainer className="items-center justify-center px-6">
        <View style={styles.card}>
          <View style={styles.mark}>
            <Text style={styles.markText}>T</Text>
          </View>
          <Text style={styles.title}>تم تسجيل الدخول بنجاح</Text>
          <Text style={styles.copy}>
            {profile ? `مرحباً بك، ${profile.full_name} (${profile.role_name || profile.role_key}).` : "مرحباً بك في نظام Tips CRM."}
          </Text>

          {token ? (
            <TouchableOpacity onPress={() => router.replace(`/invite?token=${token}` as never)} style={styles.claim}>
              <Text style={styles.claimText}>متابعة قبول الدعوة</Text>
            </TouchableOpacity>
          ) : null}

          <TouchableOpacity onPress={() => routeToAccount(profile?.role_key, profile?.must_change_password, profile?.is_platform_admin)} style={styles.button}>
            <Text style={styles.buttonText}>
              {profile?.must_change_password ? "تغيير كلمة المرور الآن" : "الانتقال إلى لوحة التحكم"}
            </Text>
          </TouchableOpacity>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer className="px-5" containerClassName="bg-background">
      <View style={styles.wrap}>
        <View style={styles.hero}>
          <View style={styles.mark}>
            <Text style={styles.markText}>T</Text>
          </View>
          <Text style={styles.title}>Tips CRM</Text>
          <Text style={styles.copy}>سجّل الدخول ببيانات الحساب التي أنشأها لك مسؤول النظام.</Text>
        </View>

        {errorMessage ? (
          <View style={styles.bannerError}>
            <MaterialIcons name="error-outline" size={20} color={palette.error} />
            <Text style={styles.bannerErrorText}>{errorMessage}</Text>
          </View>
        ) : null}

        <Text style={styles.label}>البريد الإلكتروني</Text>
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
          style={[styles.input, emailError ? styles.inputError : null]}
          textAlign="right"
          placeholder="admin@tips.sd"
          placeholderTextColor="#94A39C"
        />
        {emailError ? <Text style={styles.fieldErrorText}>{emailError}</Text> : null}

        <Text style={styles.label}>كلمة المرور</Text>
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
          style={[styles.input, passwordError ? styles.inputError : null]}
          textAlign="right"
          placeholder="أدخل كلمة المرور"
          placeholderTextColor="#94A39C"
        />
        {passwordError ? <Text style={styles.fieldErrorText}>{passwordError}</Text> : null}

        <TouchableOpacity disabled={submitting} onPress={() => void submit()} style={[styles.button, submitting && { opacity: 0.7 }]}>
          {submitting ? (
            <View style={styles.submittingRow}>
              <ActivityIndicator color="#FFFFFF" size="small" />
              <Text style={styles.buttonText}>جاري التحقق وتسجيل الدخول...</Text>
            </View>
          ) : (
            <>
              <MaterialIcons name="login" size={20} color="#FFFFFF" />
              <Text style={styles.buttonText}>تسجيل الدخول</Text>
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

        <TouchableOpacity onPress={() => router.push("/platform/login" as never)} style={{ alignSelf: "center", marginTop: 12, padding: 6 }}>
          <Text style={{ color: palette.muted, fontSize: 11, fontWeight: "700" }}>مدير المنصة؟ ادخل من بوابة المنصة</Text>
        </TouchableOpacity>

        <Text style={styles.support}>الحسابات الفردية ينشئها مدير الشركة أو المشرف المسؤول.</Text>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, justifyContent: "center", maxWidth: 420, width: "100%", alignSelf: "center" },
  hero: { alignItems: "center", marginBottom: 20 },
  mark: { width: 62, height: 62, borderRadius: 20, backgroundColor: palette.primary, alignItems: "center", justifyContent: "center", marginBottom: 13 },
  markText: { color: "#FFFFFF", fontSize: 30, fontWeight: "900" },
  title: { color: palette.ink, fontSize: 25, fontWeight: "900", textAlign: "center" },
  copy: { color: palette.muted, fontSize: 13, lineHeight: 20, textAlign: "center", marginTop: 7 },
  label: { color: palette.ink, fontSize: 12, fontWeight: "900", textAlign: "right", marginBottom: 6, marginTop: 12 },
  input: { height: 50, backgroundColor: "#FFFFFF", borderColor: "#DCE8E3", borderWidth: 1, borderRadius: 14, paddingHorizontal: 13, color: palette.ink, fontSize: 14 },
  inputError: { borderColor: palette.error, backgroundColor: "#FFF5F5" },
  fieldErrorText: { color: palette.error, fontSize: 11, textAlign: "right", marginTop: 4 },
  bannerError: { flexDirection: "row-reverse", alignItems: "center", gap: 9, backgroundColor: "#FDF2F2", borderColor: "#F8B4B4", borderWidth: 1, padding: 13, borderRadius: 14, marginBottom: 10 },
  bannerErrorText: { color: palette.error, fontSize: 12, fontWeight: "700", flex: 1, textAlign: "right", lineHeight: 18 },
  button: { height: 52, backgroundColor: palette.primary, borderRadius: 15, marginTop: 22, alignItems: "center", justifyContent: "center", flexDirection: "row-reverse", gap: 8 },
  submittingRow: { flexDirection: "row-reverse", alignItems: "center", gap: 8 },
  buttonText: { color: "#FFFFFF", fontSize: 14, fontWeight: "900" },
  recovery: { alignItems: "center", paddingTop: 14 },
  recoveryText: { color: palette.primary, fontSize: 12, fontWeight: "900" },
  companyRequest: { flexDirection: "row-reverse", alignSelf: "center", alignItems: "center", gap: 6, marginTop: 17, paddingVertical: 7, paddingHorizontal: 10 },
  companyRequestText: { color: palette.primary, fontSize: 12, fontWeight: "900" },
  claim: { marginTop: 16, padding: 11, borderRadius: 12, backgroundColor: "#FFF6E5" },
  claimText: { color: palette.warning, fontSize: 11, fontWeight: "900", textAlign: "center" },
  support: { color: palette.muted, fontSize: 11, textAlign: "center", lineHeight: 17, marginTop: 16 },
  card: { width: "100%", maxWidth: 380, backgroundColor: "#FFFFFF", borderColor: "#E1EBE6", borderWidth: 1, borderRadius: 22, padding: 24, alignItems: "center" },
});
