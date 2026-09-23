import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { AppHeader, PrimaryButton, palette } from "@/components/crm-ui";
import { ScreenContainer } from "@/components/screen-container";
import { getApiBaseUrl } from "@/constants/oauth";

type PublicRequest = { reference_number: string; company_name: string; status: string; submitted_at: string; updated_at: string };

const statusInfo: Record<string, { title: string; description: string; icon: keyof typeof MaterialIcons.glyphMap; color: string; background: string }> = {
  draft: { title: "الطلب لم يكتمل", description: "ما زال الطلب في مرحلة الحفظ الأولي.", icon: "edit-note", color: palette.warning, background: "#FFF6E5" },
  submitted: { title: "الطلب قيد المراجعة", description: "استلم مدير منصة Tips طلبكم وجارٍ مراجعته.", icon: "hourglass-top", color: palette.warning, background: "#FFF6E5" },
  awaiting_info: { title: "مطلوب استكمال معلومات", description: "راجع بريد مسؤول التواصل لمعرفة البيانات التي طلبها مدير المنصة.", icon: "contact-mail", color: palette.warning, background: "#FFF6E5" },
  approved: { title: "تم اعتماد الطلب", description: "يجري تجهيز حساب مدير الشركة وإرسال رابط إعداد آمن إليه.", icon: "verified", color: palette.primary, background: "#E9F8F2" },
  invitation_sent: { title: "أُرسلت دعوة مدير الشركة", description: "تم إرسال رابط إعداد كلمة المرور إلى بريد مدير الشركة. يرجى فحص البريد الوارد والرسائل غير المرغوب فيها.", icon: "mark-email-read", color: palette.primary, background: "#E9F8F2" },
  manager_activated: { title: "تم تفعيل حساب المدير", description: "أصبح حساب مدير الشركة نشطاً ويمكنه الدخول إلى لوحة الشركة.", icon: "task-alt", color: palette.success, background: "#E9F8F2" },
  rejected: { title: "تم إغلاق الطلب", description: "راجع بريد مسؤول التواصل للاطلاع على سبب القرار أو تواصل مع فريق Tips.", icon: "cancel", color: palette.error, background: "#FFF0F0" },
  cancelled: { title: "تم إلغاء دعوة الإعداد", description: "تم إلغاء دعوة إعداد حساب مدير الشركة. تواصل مع مدير المنصة إذا كان ذلك غير متوقع.", icon: "block", color: palette.error, background: "#FFF0F0" },
};

function arabicDate(value: string) {
  return new Date(value).toLocaleDateString("ar", { year: "numeric", month: "long", day: "numeric" });
}

export default function RequestStatusScreen() {
  const params = useLocalSearchParams<{ ref?: string | string[] }>();
  const initialReference = typeof params.ref === "string" ? params.ref : "";
  const [reference, setReference] = useState(initialReference.toUpperCase());
  const [request, setRequest] = useState<PublicRequest | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lookup = async (referenceToFind = reference) => {
    const normalized = referenceToFind.trim().toUpperCase();
    if (!/^[A-F0-9]{8}$/.test(normalized)) {
      setRequest(null);
      setError("اكتب رقم طلب صحيحاً من 8 أحرف أو أرقام.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${getApiBaseUrl()}/api/company-requests/${normalized}/status`);
      const payload = await response.json().catch(() => ({})) as { request?: PublicRequest | null; message?: string };
      if (!response.ok) throw new Error(payload.message || "تعذر التحقق من الحالة الآن.");
      if (!payload.request) {
        setRequest(null);
        setError("لم نجد طلباً بهذا الرقم. تأكد من كتابة الرقم كما ظهر لك بعد الإرسال.");
      } else {
        setRequest(payload.request);
      }
    } catch (reason) {
      setRequest(null);
      setError(reason instanceof Error ? reason.message : "تعذر التحقق من الحالة الآن.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (/^[A-F0-9]{8}$/.test(initialReference.toUpperCase())) void lookup(initialReference);
  // The reference is read only when this public screen opens.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const current = request ? (statusInfo[request.status] ?? statusInfo.submitted) : null;

  return <ScreenContainer className="px-5" containerClassName="bg-background">
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      <AppHeader eyebrow="Tips CRM للشركات" title="متابعة طلب الانضمام" right={<TouchableOpacity onPress={() => router.replace("/company-request" as never)} style={styles.back}><MaterialIcons name="arrow-forward" size={20} color={palette.primary} /></TouchableOpacity>} />
      <View style={styles.intro}><MaterialIcons name="manage-search" size={26} color="#FFFFFF" /><View style={{ flex: 1 }}><Text style={styles.introTitle}>تابع طلب شركتك</Text><Text style={styles.introText}>اكتب رقم الطلب الذي ظهر لك بعد الإرسال. لا تحتاج إلى تسجيل دخول.</Text></View></View>
      <Text style={styles.label}>رقم الطلب</Text>
      <View style={styles.searchRow}><TextInput value={reference} onChangeText={(value) => setReference(value.replace(/[^a-fA-F0-9]/g, "").slice(0, 8).toUpperCase())} placeholder="مثال: A12B34C5" placeholderTextColor="#94A39C" autoCapitalize="characters" maxLength={8} textAlign="center" style={styles.input} /><TouchableOpacity disabled={loading} onPress={() => void lookup()} style={[styles.searchButton, loading && styles.dimmed]}>{loading ? <ActivityIndicator color="#FFFFFF" /> : <MaterialIcons name="search" size={21} color="#FFFFFF" />}</TouchableOpacity></View>
      {error ? <View style={styles.error}><MaterialIcons name="error-outline" size={18} color={palette.error} /><Text style={styles.errorText}>{error}</Text></View> : null}
      {current && request ? <View style={styles.resultCard}><View style={[styles.statusIcon, { backgroundColor: current.background }]}><MaterialIcons name={current.icon} size={29} color={current.color} /></View><Text style={styles.resultTitle}>{current.title}</Text><Text style={styles.company}>{request.company_name}</Text><Text style={styles.resultText}>{current.description}</Text><View style={styles.meta}><Text style={styles.metaText}>رقم الطلب: {request.reference_number}</Text><Text style={styles.metaText}>آخر تحديث: {arabicDate(request.updated_at)}</Text></View></View> : null}
      <PrimaryButton label="تقديم طلب شركة جديد" icon="add-business" onPress={() => router.replace("/company-request" as never)} style={{ marginTop: 22 }} />
    </ScrollView>
  </ScreenContainer>;
}

const styles = StyleSheet.create({
  content: { paddingTop: 10, paddingBottom: 34, maxWidth: 560, width: "100%", alignSelf: "center" },
  back: { width: 38, height: 38, borderRadius: 13, backgroundColor: "#E9F8F2", alignItems: "center", justifyContent: "center" },
  intro: { flexDirection: "row-reverse", alignItems: "flex-start", gap: 12, backgroundColor: "#143D35", padding: 17, borderRadius: 20, marginBottom: 18 },
  introTitle: { color: "#FFFFFF", fontSize: 16, fontWeight: "900", textAlign: "right" }, introText: { color: "#C6E6DD", fontSize: 12, lineHeight: 18, textAlign: "right", marginTop: 4 },
  label: { color: "#E9F8F2", fontSize: 12, fontWeight: "900", textAlign: "right", marginBottom: 7 }, searchRow: { flexDirection: "row-reverse", gap: 8 },
  input: { flex: 1, height: 52, backgroundColor: "#FFFFFF", borderRadius: 14, borderColor: "#DCE8E3", borderWidth: 1, color: palette.ink, fontSize: 16, letterSpacing: 2, fontWeight: "800" },
  searchButton: { width: 54, height: 52, borderRadius: 14, backgroundColor: palette.primary, alignItems: "center", justifyContent: "center" }, dimmed: { opacity: 0.55 },
  error: { flexDirection: "row-reverse", alignItems: "center", gap: 7, backgroundColor: "#FFF0F0", borderColor: "#F2C1C1", borderWidth: 1, borderRadius: 13, padding: 11, marginTop: 14 }, errorText: { color: palette.error, fontSize: 12, fontWeight: "700", flex: 1, textAlign: "right" },
  resultCard: { backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#CBE7DD", borderRadius: 22, padding: 22, alignItems: "center", marginTop: 18 }, statusIcon: { width: 65, height: 65, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  resultTitle: { color: palette.ink, fontSize: 19, fontWeight: "900", marginTop: 15, textAlign: "center" }, company: { color: palette.primary, fontSize: 13, fontWeight: "900", marginTop: 5, textAlign: "center" }, resultText: { color: palette.muted, fontSize: 13, lineHeight: 20, textAlign: "center", marginTop: 11 },
  meta: { alignSelf: "stretch", gap: 5, backgroundColor: "#F7FAF8", borderRadius: 12, padding: 11, marginTop: 16 }, metaText: { color: palette.muted, fontSize: 11, fontWeight: "700", textAlign: "right" },
});
