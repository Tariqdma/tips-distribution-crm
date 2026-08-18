import { useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { router } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { AppHeader, PrimaryButton, palette } from "@/components/crm-ui";
import { ScreenContainer } from "@/components/screen-container";
import { supabase } from "@/lib/supabase-client";

export default function CompanyRequestScreen() {
  const [companyName, setCompanyName] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [userCount, setUserCount] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);

  const submit = async () => {
    if (companyName.trim().length < 2 || contactName.trim().length < 2 || !/^\S+@\S+\.\S+$/.test(contactEmail.trim())) {
      setError("اكتب اسم الشركة واسم مسؤول التواصل وبريداً إلكترونياً صحيحاً.");
      return;
    }
    if (!supabase) {
      setError("تعذر الاتصال بخدمة الطلبات الآن.");
      return;
    }
    setSubmitting(true);
    setError(null);
    const parsedUserCount = Number.parseInt(userCount, 10);
    const { data, error: requestError } = await supabase.rpc("tips_crm_create_company_request", {
      request_company_name: companyName.trim(),
      request_contact_name: contactName.trim(),
      request_contact_email: contactEmail.trim().toLowerCase(),
      request_contact_phone: contactPhone.trim() || null,
      request_expected_user_count: Number.isFinite(parsedUserCount) && parsedUserCount > 0 ? parsedUserCount : null,
      request_notes: notes.trim() || null,
    });
    setSubmitting(false);
    if (requestError || !data) {
      setError("تعذر إرسال الطلب الآن. تأكد من البيانات وحاول مرة أخرى.");
      return;
    }
    setRequestId(String(data));
  };

  return <ScreenContainer className="px-5" containerClassName="bg-background">
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      <AppHeader title="طلب انضمام شركة" eyebrow="Tips CRM للشركات" right={<TouchableOpacity onPress={() => requestId ? setRequestId(null) : router.replace("/login" as never)} style={styles.close}><MaterialIcons name={requestId ? "add" : "close"} size={20} color={palette.primary} /></TouchableOpacity>} />
      {requestId ? <View style={styles.successCard}>
        <View style={styles.successIcon}><MaterialIcons name="mark-email-read" size={32} color={palette.success} /></View>
        <Text style={styles.successTitle}>تم استلام طلب شركتك</Text>
        <Text style={styles.successText}>طلبك الآن قيد المراجعة لدى مدير منصة Tips. لا تحتاج إلى تسجيل الدخول أو الانتقال إلى أي لوحة في هذه المرحلة.</Text>
        <View style={styles.emailNotice}><MaterialIcons name="mail-outline" size={19} color={palette.primary} /><Text style={styles.emailNoticeText}>بعد اعتماد الطلب، سترسل رسالة إلى {contactEmail || "بريد جهة الاتصال"} فيها بيانات دخول مدير الشركة وخطوات البدء.</Text></View>
        <Text style={styles.requestRef}>رقم الطلب: {requestId.slice(0, 8).toUpperCase()}</Text>
      </View> : <>
        <View style={styles.intro}><MaterialIcons name="domain-add" size={24} color="#FFFFFF" /><View style={{ flex: 1 }}><Text style={styles.introTitle}>ابدأ بطلب واحد فقط</Text><Text style={styles.introText}>لا تحتاج إلى إنشاء حساب الآن. يعتمد مدير المنصة الطلب ثم ينشئ حساب مدير الشركة الأول.</Text></View></View>
        <Text style={styles.section}>بيانات الشركة</Text>
        <Field label="اسم الشركة" value={companyName} onChangeText={setCompanyName} placeholder="مثال: شركة النيل للتوزيع" />
        <Field label="عدد المستخدمين المتوقع" value={userCount} onChangeText={setUserCount} placeholder="مثال: 20" keyboardType="number-pad" />
        <Text style={styles.section}>مسؤول التواصل</Text>
        <Field label="الاسم الكامل" value={contactName} onChangeText={setContactName} placeholder="اسم المسؤول" />
        <Field label="البريد الإلكتروني" value={contactEmail} onChangeText={setContactEmail} placeholder="name@company.sd" keyboardType="email-address" autoCapitalize="none" />
        <Field label="رقم الهاتف (اختياري)" value={contactPhone} onChangeText={setContactPhone} placeholder="2499..." keyboardType="phone-pad" />
        <Text style={styles.label}>ملاحظات أو طبيعة النشاط (اختياري)</Text>
        <TextInput value={notes} onChangeText={setNotes} multiline textAlign="right" placeholder="مثال: توزيع أدوية في ولايتي الخرطوم والجزيرة" placeholderTextColor="#94A39C" style={styles.notes} />
        {error ? <View style={styles.error}><MaterialIcons name="error-outline" size={18} color={palette.error} /><Text style={styles.errorText}>{error}</Text></View> : null}
        <PrimaryButton label={submitting ? "جاري إرسال الطلب…" : "إرسال طلب الانضمام"} icon={submitting ? "hourglass-top" : "send"} disabled={submitting} onPress={() => void submit()} style={{ marginTop: 22 }} />
        {submitting ? <ActivityIndicator color={palette.primary} style={{ marginTop: 12 }} /> : null}
      </>}
    </ScrollView>
  </ScreenContainer>;
}

function Field({ label, value, onChangeText, placeholder, keyboardType, autoCapitalize }: { label: string; value: string; onChangeText: (value: string) => void; placeholder: string; keyboardType?: "default" | "email-address" | "number-pad" | "phone-pad"; autoCapitalize?: "none" | "sentences" | "words" | "characters" }) {
  return <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor="#94A39C" textAlign="right" keyboardType={keyboardType} autoCapitalize={autoCapitalize} style={styles.input} /></View>;
}

const styles = StyleSheet.create({
  content: { paddingTop: 10, paddingBottom: 32, maxWidth: 560, width: "100%", alignSelf: "center" },
  close: { width: 38, height: 38, borderRadius: 13, backgroundColor: "#E9F8F2", alignItems: "center", justifyContent: "center" },
  intro: { flexDirection: "row-reverse", gap: 12, padding: 16, borderRadius: 19, backgroundColor: "#143D35", alignItems: "flex-start", marginBottom: 9 },
  introTitle: { color: "#FFFFFF", fontSize: 16, fontWeight: "900", textAlign: "right" },
  introText: { color: "#C6E6DD", fontSize: 12, lineHeight: 18, textAlign: "right", marginTop: 4 },
  section: { color: "#E9F8F2", fontSize: 16, fontWeight: "900", textAlign: "right", marginTop: 18, marginBottom: 4 },
  field: { marginTop: 10 }, label: { color: "#E9F8F2", fontSize: 12, fontWeight: "800", textAlign: "right", marginBottom: 6 },
  input: { minHeight: 50, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#DCE8E3", borderRadius: 14, paddingHorizontal: 13, color: palette.ink, fontSize: 14 },
  notes: { minHeight: 94, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#DCE8E3", borderRadius: 14, padding: 13, color: palette.ink, fontSize: 14, textAlignVertical: "top" },
  error: { flexDirection: "row-reverse", alignItems: "center", gap: 7, backgroundColor: "#FFF0F0", borderColor: "#F2C1C1", borderWidth: 1, borderRadius: 13, padding: 11, marginTop: 14 },
  errorText: { color: palette.error, fontSize: 12, fontWeight: "700", flex: 1, textAlign: "right" },
  successCard: { backgroundColor: "#FFFFFF", borderColor: "#CBE7DD", borderWidth: 1, borderRadius: 22, padding: 24, alignItems: "center", marginTop: 32 },
  successIcon: { width: 68, height: 68, borderRadius: 24, backgroundColor: "#E9F8F2", alignItems: "center", justifyContent: "center" },
  successTitle: { color: palette.ink, fontSize: 20, fontWeight: "900", marginTop: 16 },
  successText: { color: palette.muted, textAlign: "center", fontSize: 13, lineHeight: 20, marginTop: 8 },
  emailNotice: { flexDirection: "row-reverse", alignItems: "flex-start", gap: 8, backgroundColor: "#E9F8F2", borderRadius: 13, padding: 12, marginTop: 15 },
  emailNoticeText: { color: palette.primary, fontSize: 12, fontWeight: "700", lineHeight: 18, flex: 1, textAlign: "right" },
  requestRef: { color: palette.primary, fontSize: 12, fontWeight: "900", marginTop: 13, backgroundColor: "#E9F8F2", paddingVertical: 7, paddingHorizontal: 10, borderRadius: 10 },
});
