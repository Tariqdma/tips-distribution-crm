import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Linking, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, useWindowDimensions } from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { Redirect, router } from "expo-router";
import { AppHeader, MetricCard, PrimaryButton, SectionTitle, palette } from "@/components/crm-ui";
import { ScreenContainer } from "@/components/screen-container";
import { getApiBaseUrl } from "@/constants/oauth";
import { supabase } from "@/lib/supabase-client";
import { useSupabaseAuth } from "@/lib/supabase-auth";

type Company = { id: string; name: string; slug: string; status: string; plan_key: string; primary_contact_name: string | null; primary_contact_email: string | null; created_at: string };
type CompanyRequest = { id: string; company_name: string; contact_name: string; contact_email: string; contact_phone: string | null; expected_user_count: number | null; notes: string | null; status: string; created_at: string; review_note: string | null };
type ApprovalForm = { companySlug: string; managerFullName: string; managerEmail: string; managerPassword: string; planKey: string };

const blankApproval: ApprovalForm = { companySlug: "", managerFullName: "", managerEmail: "", managerPassword: "", planKey: "standard" };

function withTimeout<T>(promise: Promise<T>, milliseconds: number) {
  return Promise.race<T>([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("انتهت مهلة الاتصال بخدمة المنصة.")), milliseconds)),
  ]);
}

function dateArabic(value: string) { return new Date(value).toLocaleDateString("ar", { year: "numeric", month: "short", day: "numeric" }); }
function slugFromCompanyName(value: string) { return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""); }

export default function PlatformPortalScreen() {
  const { profile, session, loading, refreshProfile, signOut } = useSupabaseAuth();
  const { width } = useWindowDimensions();
  const isWide = Platform.OS === "web" && width >= 850;
  const [companies, setCompanies] = useState<Company[]>([]);
  const [requests, setRequests] = useState<CompanyRequest[]>([]);
  const [fetching, setFetching] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeApproval, setActiveApproval] = useState<CompanyRequest | null>(null);
  const [approval, setApproval] = useState<ApprovalForm>(blankApproval);
  const [reviewRequest, setReviewRequest] = useState<CompanyRequest | null>(null);
  const [reviewNote, setReviewNote] = useState("");
  const [creatingDirect, setCreatingDirect] = useState(false);
  const [direct, setDirect] = useState({ companyName: "", companySlug: "", contactName: "", contactEmail: "", contactPhone: "", expectedUserCount: "", notes: "", managerFullName: "", managerEmail: "", managerPassword: "", planKey: "standard" });
  const [submitting, setSubmitting] = useState(false);
  const [authTimedOut, setAuthTimedOut] = useState(false);

  const load = useCallback(async () => {
    if (!supabase || !profile?.is_platform_admin) { setFetching(false); return; }
    setFetching(true); setError(null);
    try {
      const [requestsResult, companiesResult] = await withTimeout(Promise.all([
        supabase.rpc("tips_crm_list_platform_company_requests"),
        supabase.rpc("tips_crm_list_platform_companies"),
      ]), 12_000);
      if (requestsResult.error || companiesResult.error) setError("تعذر تحميل بيانات المنصة. حدّث الصفحة ثم أعد المحاولة.");
      else {
        const platformCompanies = (companiesResult.data ?? []) as Array<{ company_id: string; company_name: string; company_slug: string; status: string; plan_key: string; primary_manager_name: string | null; primary_manager_email: string | null; created_at: string }>;
        setRequests((requestsResult.data ?? []) as CompanyRequest[]);
        setCompanies(platformCompanies.map((company) => ({ id: company.company_id, name: company.company_name, slug: company.company_slug, status: company.status, plan_key: company.plan_key, primary_contact_name: company.primary_manager_name, primary_contact_email: company.primary_manager_email, created_at: company.created_at })));
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "تعذر تحميل بيانات المنصة.");
    } finally {
      setFetching(false);
    }
  }, [profile?.is_platform_admin]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!loading) { setAuthTimedOut(false); return; }
    const timer = setTimeout(() => setAuthTimedOut(true), 10_000);
    return () => clearTimeout(timer);
  }, [loading]);

  const retryPortal = async () => {
    setAuthTimedOut(false);
    await refreshProfile();
    await load();
  };

  const requestApi = async (path: string, body: Record<string, unknown>) => {
    if (!session?.access_token) throw new Error("انتهت الجلسة. سجّل الدخول مرة أخرى.");
    const response = await fetch(`${getApiBaseUrl()}${path}`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify(body) });
    const payload = await response.json().catch(() => ({})) as { message?: string };
    if (!response.ok) throw new Error(payload.message || "تعذر تنفيذ الإجراء.");
  };

  const startApproval = (request: CompanyRequest) => {
    setMessage(null); setError(null); setReviewRequest(null);
    setActiveApproval(request);
    setApproval({ companySlug: slugFromCompanyName(request.company_name), managerFullName: request.contact_name, managerEmail: request.contact_email, managerPassword: "", planKey: "standard" });
  };

  const approve = async () => {
    if (!activeApproval) return;
    setSubmitting(true); setError(null);
    try {
      await requestApi(`/api/platform/company-requests/${activeApproval.id}/approve`, approval);
      setMessage(`تم اعتماد ${activeApproval.company_name} وإنشاء حساب مدير الشركة. سلّم كلمة المرور المؤقتة للمدير عبر قناة آمنة.`);
      setActiveApproval(null); setApproval(blankApproval); await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "تعذر اعتماد الشركة."); }
    setSubmitting(false);
  };

  const reject = async () => {
    if (!reviewRequest) return;
    if (!reviewNote.trim()) { setError("اكتب سبب الرفض حتى يصل القرار واضحاً لجهة الاتصال."); return; }
    setSubmitting(true); setError(null);
    try {
      await requestApi(`/api/platform/company-requests/${reviewRequest.id}/review`, { status: "rejected", reviewNote });
      setMessage(`تم رفض طلب ${reviewRequest.company_name} مع حفظ سبب القرار.`);
      setReviewRequest(null); setReviewNote(""); await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "تعذر رفض الطلب."); }
    setSubmitting(false);
  };

  const createDirect = async () => {
    setSubmitting(true); setError(null);
    try {
      await requestApi("/api/platform/companies", { ...direct, expectedUserCount: Number.parseInt(direct.expectedUserCount, 10) || null });
      setMessage(`تم إنشاء ${direct.companyName} وحساب مديرها الأول. سلّم بيانات الدخول للمدير عبر قناة آمنة.`);
      setDirect({ companyName: "", companySlug: "", contactName: "", contactEmail: "", contactPhone: "", expectedUserCount: "", notes: "", managerFullName: "", managerEmail: "", managerPassword: "", planKey: "standard" });
      setCreatingDirect(false); await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "تعذر إنشاء الشركة."); }
    setSubmitting(false);
  };

  const pendingRequests = useMemo(() => requests.filter((request) => request.status === "pending"), [requests]);
  if (Platform.OS !== "web") return <ScreenContainer className="px-5" containerClassName="bg-background"><View style={styles.locked}><View style={styles.lockIcon}><MaterialIcons name="laptop-mac" size={32} color={palette.primary} /></View><Text style={styles.lockedTitle}>بوابة المنصة للويب فقط</Text><Text style={styles.lockedText}>إدارة منصة Tips والشركات مخصصة للمتصفح. افتحها من الويب ولا تستخدم تطبيق الموظفين لهذه المهمة.</Text><PrimaryButton label="فتح بوابة المنصة في المتصفح" icon="open-in-new" onPress={() => void Linking.openURL("https://tipscrm-vevc4ncu.manus.space/platform")} style={{ alignSelf: "stretch", marginTop: 20 }} /></View></ScreenContainer>;
  if (!session) return <Redirect href="/login" />;
  if (loading && !authTimedOut) return <ScreenContainer className="items-center justify-center"><ActivityIndicator color={palette.primary} size="large" /><Text style={styles.loadingText}>جاري تحميل بوابة المنصة…</Text></ScreenContainer>;
  if (loading && authTimedOut) return <ScreenContainer className="px-5" containerClassName="bg-background"><View style={styles.locked}><View style={styles.lockIcon}><MaterialIcons name="sync-problem" size={32} color={palette.warning} /></View><Text style={styles.lockedTitle}>تعذر تحميل الجلسة</Text><Text style={styles.lockedText}>لم تصل صلاحية الحساب خلال الوقت المتوقع. أعد المحاولة، أو سجّل الخروج ثم ادخل من جديد.</Text><View style={styles.retryActions}><PrimaryButton label="إعادة المحاولة" icon="refresh" onPress={() => void retryPortal()} style={{ flex: 1 }} /><TouchableOpacity onPress={() => { void signOut(); router.replace("/login" as never); }} style={styles.signOutTextButton}><Text style={styles.signOutText}>تسجيل الخروج</Text></TouchableOpacity></View></View></ScreenContainer>;
  if (fetching) return <ScreenContainer className="items-center justify-center"><ActivityIndicator color={palette.primary} size="large" /><Text style={styles.loadingText}>جاري تحميل بيانات المنصة…</Text></ScreenContainer>;
  if (!profile?.is_platform_admin) return <ScreenContainer className="px-5" containerClassName="bg-background"><View style={styles.locked}><View style={styles.lockIcon}><MaterialIcons name="admin-panel-settings" size={32} color={palette.primary} /></View><Text style={styles.lockedTitle}>بوابة مدير المنصة</Text><Text style={styles.lockedText}>هذه البوابة مخصصة لمالك منصة Tips فقط. لإدارة العمليات داخل شركتك، استخدم لوحة إدارة الشركة.</Text><PrimaryButton label="الانتقال إلى لوحة الشركة" icon="dashboard" onPress={() => router.replace("/admin" as never)} style={{ alignSelf: "stretch", marginTop: 20 }} /></View></ScreenContainer>;

  return <ScreenContainer className="px-5" containerClassName="bg-background"><ScrollView contentContainerStyle={[styles.content, isWide && styles.wideContent]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
    <AppHeader eyebrow="إدارة مركزية · جميع الشركات" title="بوابة مدير المنصة" right={<TouchableOpacity onPress={() => { void signOut(); router.replace("/login" as never); }} style={styles.signOut}><MaterialIcons name="logout" size={19} color={palette.primary} /></TouchableOpacity>} />
    <View style={styles.hero}><View style={styles.heroIcon}><MaterialIcons name="account-tree" size={25} color="#FFFFFF" /></View><View style={{ flex: 1, alignItems: "flex-end" }}><Text style={styles.heroTitle}>أهلاً {profile.full_name}</Text><Text style={styles.heroText}>من هنا فقط تدير الشركات، طلبات الانضمام، ومديري الشركات الأوائل.</Text></View></View>
    <View style={styles.metrics}><MetricCard label="شركات نشطة" value={String(companies.filter((company) => company.status === "active").length)} icon="domain" /><MetricCard label="طلبات معلقة" value={String(pendingRequests.length)} icon="pending-actions" tone="amber" /><MetricCard label="إجمالي الشركات" value={String(companies.length)} icon="business" tone="blue" /></View>
    {message ? <View style={styles.message}><MaterialIcons name="check-circle" size={19} color={palette.success} /><Text style={styles.messageText}>{message}</Text></View> : null}
    {error ? <View style={styles.error}><MaterialIcons name="error-outline" size={19} color={palette.error} /><Text style={styles.errorText}>{error}</Text></View> : null}
    <View style={styles.actions}><TouchableOpacity onPress={() => { setCreatingDirect((current) => !current); setActiveApproval(null); setReviewRequest(null); setError(null); }} style={styles.createButton}><MaterialIcons name="add-business" size={19} color="#FFFFFF" /><Text style={styles.createButtonText}>إنشاء شركة مباشرة</Text></TouchableOpacity><TouchableOpacity onPress={() => void load()} style={styles.refreshButton}><MaterialIcons name="refresh" size={19} color={palette.primary} /><Text style={styles.refreshText}>تحديث البيانات</Text></TouchableOpacity></View>
    {creatingDirect ? <CompanyForm title="إنشاء شركة ومديرها الأول" values={direct} onChange={(key, value) => setDirect((current) => ({ ...current, [key]: value }))} submitting={submitting} onSubmit={() => void createDirect()} onCancel={() => setCreatingDirect(false)} /> : null}
    <SectionTitle title="طلبات الشركات المعلقة" action={`${pendingRequests.length} قيد المراجعة`} />
    {pendingRequests.length ? <View style={isWide ? styles.wideGrid : undefined}>{pendingRequests.map((request) => <View style={[styles.requestCard, isWide && styles.wideCard]} key={request.id}><View style={styles.cardTop}><View style={styles.requestIcon}><MaterialIcons name="business-center" size={20} color={palette.warning} /></View><View style={{ flex: 1, alignItems: "flex-end" }}><Text style={styles.cardTitle}>{request.company_name}</Text><Text style={styles.cardMeta}>{request.contact_name} · {request.contact_email}</Text><Text style={styles.cardMeta}>طلب في {dateArabic(request.created_at)}{request.expected_user_count ? ` · ${request.expected_user_count} مستخدم متوقع` : ""}</Text></View></View>{request.contact_phone ? <Text style={styles.phone}>{request.contact_phone}</Text> : null}{request.notes ? <Text style={styles.notes}>{request.notes}</Text> : null}<View style={styles.cardActions}><TouchableOpacity onPress={() => { setReviewRequest(request); setActiveApproval(null); setReviewNote(""); setError(null); }} style={styles.rejectButton}><Text style={styles.rejectText}>رفض الطلب</Text></TouchableOpacity><TouchableOpacity onPress={() => startApproval(request)} style={styles.approveButton}><MaterialIcons name="how-to-reg" size={17} color="#FFFFFF" /><Text style={styles.approveText}>اعتماد وإنشاء المدير</Text></TouchableOpacity></View></View>)}</View> : <View style={styles.empty}><MaterialIcons name="task-alt" size={26} color={palette.success} /><Text style={styles.emptyTitle}>لا توجد طلبات معلقة</Text><Text style={styles.emptyText}>تظهر هنا الطلبات التي ترسلها الشركات من نموذج الانضمام.</Text></View>}
    {activeApproval ? <CompanyForm title={`اعتماد ${activeApproval.company_name}`} values={approval} onChange={(key, value) => setApproval((current) => ({ ...current, [key]: value }))} submitting={submitting} onSubmit={() => void approve()} onCancel={() => setActiveApproval(null)} /> : null}
    {reviewRequest ? <View style={styles.reviewCard}><Text style={styles.formTitle}>رفض طلب {reviewRequest.company_name}</Text><Text style={styles.formHint}>اكتب سبباً واضحاً قبل إغلاق الطلب. لا يمكن استعادته إلى حالة معلقة من هنا.</Text><TextInput value={reviewNote} onChangeText={setReviewNote} multiline textAlign="right" placeholder="مثال: يرجى استكمال بيانات التواصل ثم إعادة الطلب." placeholderTextColor="#94A39C" style={styles.reviewInput} /><View style={styles.formActions}><TouchableOpacity onPress={() => setReviewRequest(null)} style={styles.cancelButton}><Text style={styles.cancelText}>إلغاء</Text></TouchableOpacity><TouchableOpacity disabled={submitting} onPress={() => void reject()} style={[styles.dangerButton, submitting && styles.dimmed]}><Text style={styles.dangerText}>{submitting ? "جاري الحفظ…" : "تأكيد الرفض"}</Text></TouchableOpacity></View></View> : null}
    <SectionTitle title="الشركات على المنصة" action={`${companies.length} شركة`} />
    <View style={isWide ? styles.wideGrid : undefined}>{companies.map((company) => <View key={company.id} style={[styles.companyCard, isWide && styles.wideCard]}><View style={styles.cardTop}><View style={[styles.companyIcon, company.status === "active" ? styles.activeIcon : styles.inactiveIcon]}><MaterialIcons name="domain" size={20} color={company.status === "active" ? palette.success : palette.warning} /></View><View style={{ flex: 1, alignItems: "flex-end" }}><Text style={styles.cardTitle}>{company.name}</Text><Text style={styles.cardMeta}>رمز الشركة: {company.slug}</Text><Text style={styles.cardMeta}>الخطة: {company.plan_key || "standard"} · {dateArabic(company.created_at)}</Text></View></View><View style={styles.companyFooter}><View style={[styles.status, company.status === "active" ? styles.statusActive : styles.statusMuted]}><Text style={[styles.statusText, company.status === "active" ? styles.statusActiveText : styles.statusMutedText]}>{company.status === "active" ? "نشطة" : company.status}</Text></View><Text style={styles.contact}>{company.primary_contact_name || "—"}</Text></View></View>)}</View>
  </ScrollView></ScreenContainer>;
}

function CompanyForm({ title, values, onChange, submitting, onSubmit, onCancel }: { title: string; values: Record<string, string>; onChange: (key: string, value: string) => void; submitting: boolean; onSubmit: () => void; onCancel: () => void }) {
  const direct = "companyName" in values;
  return <View style={styles.formCard}><Text style={styles.formTitle}>{title}</Text><Text style={styles.formHint}>{direct ? "ينشئ النظام الشركة وحساب مديرها الأول فوراً. سلّم كلمة المرور المؤقتة للمدير عبر قناة آمنة." : "راجع رمز الشركة وبيانات مديرها الأول. سيُطلب من المدير تغيير كلمة المرور عند الدخول."}</Text>
    {direct ? <><Input label="اسم الشركة" value={values.companyName} onChangeText={(value) => onChange("companyName", value)} placeholder="شركة النيل للتوزيع" /><Input label="رمز الشركة" value={values.companySlug} onChangeText={(value) => onChange("companySlug", value)} placeholder="nile-distribution" autoCapitalize="none" /><Input label="اسم جهة الاتصال" value={values.contactName} onChangeText={(value) => onChange("contactName", value)} placeholder="اسم المسؤول" /><Input label="بريد جهة الاتصال" value={values.contactEmail} onChangeText={(value) => onChange("contactEmail", value)} placeholder="contact@company.sd" autoCapitalize="none" keyboardType="email-address" /><Input label="الهاتف (اختياري)" value={values.contactPhone} onChangeText={(value) => onChange("contactPhone", value)} placeholder="249..." keyboardType="phone-pad" /><Input label="عدد المستخدمين المتوقع (اختياري)" value={values.expectedUserCount} onChangeText={(value) => onChange("expectedUserCount", value)} placeholder="20" keyboardType="number-pad" /></> : <Input label="رمز الشركة" value={values.companySlug} onChangeText={(value) => onChange("companySlug", value)} placeholder="company-slug" autoCapitalize="none" />}
    <Text style={styles.subheading}>حساب مدير الشركة الأول</Text><Input label="اسم المدير" value={values.managerFullName} onChangeText={(value) => onChange("managerFullName", value)} placeholder="الاسم الكامل" /><Input label="بريد المدير" value={values.managerEmail} onChangeText={(value) => onChange("managerEmail", value)} placeholder="manager@company.sd" autoCapitalize="none" keyboardType="email-address" /><Input label="كلمة مرور مؤقتة" value={values.managerPassword} onChangeText={(value) => onChange("managerPassword", value)} placeholder="8 أحرف على الأقل" secureTextEntry /><View style={styles.planRow}><TouchableOpacity onPress={() => onChange("planKey", "standard")} style={[styles.plan, values.planKey === "standard" && styles.planActive]}><Text style={[styles.planText, values.planKey === "standard" && styles.planTextActive]}>قياسية</Text></TouchableOpacity><TouchableOpacity onPress={() => onChange("planKey", "starter")} style={[styles.plan, values.planKey === "starter" && styles.planActive]}><Text style={[styles.planText, values.planKey === "starter" && styles.planTextActive]}>بداية</Text></TouchableOpacity></View><View style={styles.formActions}><TouchableOpacity onPress={onCancel} style={styles.cancelButton}><Text style={styles.cancelText}>إلغاء</Text></TouchableOpacity><TouchableOpacity disabled={submitting} onPress={onSubmit} style={[styles.submitButton, submitting && styles.dimmed]}><MaterialIcons name="verified" size={17} color="#FFFFFF" /><Text style={styles.submitText}>{submitting ? "جاري الحفظ…" : direct ? "إنشاء الشركة" : "اعتماد الشركة"}</Text></TouchableOpacity></View></View>;
}

function Input({ label, value, onChangeText, placeholder, autoCapitalize, keyboardType, secureTextEntry }: { label: string; value: string; onChangeText: (value: string) => void; placeholder: string; autoCapitalize?: "none" | "sentences" | "words" | "characters"; keyboardType?: "default" | "email-address" | "number-pad" | "phone-pad"; secureTextEntry?: boolean }) { return <View style={styles.formField}><Text style={styles.fieldLabel}>{label}</Text><TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor="#94A39C" textAlign="right" autoCapitalize={autoCapitalize} keyboardType={keyboardType} secureTextEntry={secureTextEntry} style={styles.input} /></View>; }

const styles = StyleSheet.create({
  content: { paddingTop: 10, paddingBottom: 34 }, wideContent: { maxWidth: 1180, width: "100%", alignSelf: "center" }, loadingText: { color: palette.muted, fontSize: 13, marginTop: 12 },
  signOut: { width: 40, height: 40, borderRadius: 14, backgroundColor: "#E9F8F2", alignItems: "center", justifyContent: "center" },
  hero: { backgroundColor: "#143D35", borderRadius: 21, padding: 17, flexDirection: "row-reverse", gap: 12, alignItems: "center" }, heroIcon: { width: 46, height: 46, borderRadius: 15, backgroundColor: "#28715F", alignItems: "center", justifyContent: "center" }, heroTitle: { color: "#FFFFFF", fontSize: 17, fontWeight: "900", textAlign: "right" }, heroText: { color: "#C6E6DD", fontSize: 12, lineHeight: 18, marginTop: 4, textAlign: "right" },
  metrics: { flexDirection: "row", gap: 8, marginTop: 14 }, actions: { flexDirection: "row-reverse", gap: 8, marginTop: 15 }, createButton: { flex: 1, minHeight: 47, backgroundColor: palette.primary, borderRadius: 14, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 7 }, createButtonText: { color: "#FFFFFF", fontSize: 12, fontWeight: "900" }, refreshButton: { minWidth: 123, minHeight: 47, paddingHorizontal: 13, backgroundColor: "#E9F8F2", borderRadius: 14, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 7, borderWidth: 1, borderColor: "#B9DED3" }, refreshText: { color: palette.primary, fontSize: 12, fontWeight: "900" },
  message: { flexDirection: "row-reverse", alignItems: "center", gap: 8, borderColor: "#B9DED3", borderWidth: 1, borderRadius: 14, backgroundColor: "#E9F8F2", padding: 12, marginTop: 14 }, messageText: { flex: 1, color: palette.success, textAlign: "right", fontSize: 12, fontWeight: "700", lineHeight: 18 }, error: { flexDirection: "row-reverse", alignItems: "center", gap: 8, borderColor: "#F2C1C1", borderWidth: 1, borderRadius: 14, backgroundColor: "#FFF0F0", padding: 12, marginTop: 14 }, errorText: { flex: 1, color: palette.error, textAlign: "right", fontSize: 12, fontWeight: "700", lineHeight: 18 },
  wideGrid: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 12 }, wideCard: { flexBasis: "48%", flexGrow: 1 }, requestCard: { backgroundColor: "#FFFFFF", borderRadius: 19, borderWidth: 1, borderColor: "#E8DED0", padding: 15, marginBottom: 10 }, companyCard: { backgroundColor: "#FFFFFF", borderRadius: 19, borderWidth: 1, borderColor: palette.line, padding: 15, marginBottom: 10 }, cardTop: { flexDirection: "row-reverse", gap: 11, alignItems: "flex-start" }, requestIcon: { width: 38, height: 38, borderRadius: 13, backgroundColor: "#FFF6E5", alignItems: "center", justifyContent: "center" }, companyIcon: { width: 38, height: 38, borderRadius: 13, alignItems: "center", justifyContent: "center" }, activeIcon: { backgroundColor: "#E9F8F2" }, inactiveIcon: { backgroundColor: "#FFF6E5" }, cardTitle: { color: palette.ink, fontSize: 15, fontWeight: "900", textAlign: "right" }, cardMeta: { color: palette.muted, fontSize: 11, lineHeight: 17, marginTop: 3, textAlign: "right" }, phone: { alignSelf: "flex-end", color: palette.primary, fontSize: 11, fontWeight: "800", marginTop: 8 }, notes: { color: palette.muted, fontSize: 11, lineHeight: 17, marginTop: 9, textAlign: "right", backgroundColor: "#F7FAF8", padding: 9, borderRadius: 10 }, cardActions: { flexDirection: "row", gap: 8, justifyContent: "flex-end", marginTop: 14 }, rejectButton: { minHeight: 36, borderRadius: 10, paddingHorizontal: 11, justifyContent: "center", borderWidth: 1, borderColor: "#E4B5B5" }, rejectText: { color: palette.error, fontWeight: "900", fontSize: 11 }, approveButton: { minHeight: 36, borderRadius: 10, paddingHorizontal: 11, backgroundColor: palette.primary, flexDirection: "row-reverse", gap: 5, alignItems: "center", justifyContent: "center" }, approveText: { color: "#FFFFFF", fontWeight: "900", fontSize: 11 },
  empty: { padding: 24, borderRadius: 18, alignItems: "center", backgroundColor: "#E9F8F2", borderWidth: 1, borderColor: "#B9DED3" }, emptyTitle: { color: palette.success, fontSize: 15, fontWeight: "900", marginTop: 7 }, emptyText: { color: palette.muted, fontSize: 11, textAlign: "center", marginTop: 4 }, companyFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 13, paddingTop: 10, borderTopColor: "#EDF1EF", borderTopWidth: 1 }, status: { borderRadius: 9, paddingHorizontal: 8, paddingVertical: 5 }, statusActive: { backgroundColor: "#E9F8F2" }, statusMuted: { backgroundColor: "#FFF6E5" }, statusText: { fontSize: 10, fontWeight: "900" }, statusActiveText: { color: palette.success }, statusMutedText: { color: palette.warning }, contact: { color: palette.muted, fontSize: 11, fontWeight: "700" },
  formCard: { marginTop: 18, backgroundColor: "#FFFFFF", borderColor: "#B9DED3", borderWidth: 1, borderRadius: 20, padding: 16 }, formTitle: { color: palette.ink, fontSize: 17, fontWeight: "900", textAlign: "right" }, formHint: { color: palette.muted, fontSize: 11, lineHeight: 17, textAlign: "right", marginTop: 6 }, formField: { marginTop: 11 }, fieldLabel: { color: palette.ink, fontSize: 11, fontWeight: "900", textAlign: "right", marginBottom: 6 }, input: { minHeight: 45, borderRadius: 12, borderWidth: 1, borderColor: "#DCE8E3", paddingHorizontal: 11, color: palette.ink, fontSize: 13 }, subheading: { color: palette.primary, fontSize: 13, fontWeight: "900", textAlign: "right", marginTop: 17 }, planRow: { flexDirection: "row-reverse", gap: 8, marginTop: 13 }, plan: { flex: 1, borderRadius: 11, minHeight: 37, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#DCE8E3" }, planActive: { borderColor: "#77BBAA", backgroundColor: "#E9F8F2" }, planText: { color: palette.muted, fontSize: 11, fontWeight: "900" }, planTextActive: { color: palette.primary }, formActions: { flexDirection: "row", gap: 8, justifyContent: "flex-end", marginTop: 17 }, cancelButton: { minHeight: 42, borderWidth: 1, borderColor: "#C7DAD3", borderRadius: 12, paddingHorizontal: 16, alignItems: "center", justifyContent: "center" }, cancelText: { color: palette.primary, fontSize: 12, fontWeight: "900" }, submitButton: { minHeight: 42, borderRadius: 12, backgroundColor: palette.primary, paddingHorizontal: 15, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 5 }, submitText: { color: "#FFFFFF", fontSize: 12, fontWeight: "900" }, dimmed: { opacity: 0.55 }, reviewCard: { marginTop: 18, backgroundColor: "#FFFFFF", borderColor: "#F2C1C1", borderWidth: 1, borderRadius: 20, padding: 16 }, reviewInput: { minHeight: 92, borderRadius: 12, borderWidth: 1, borderColor: "#F1CDCD", padding: 11, color: palette.ink, marginTop: 13, textAlignVertical: "top", fontSize: 13 }, dangerButton: { minHeight: 42, borderRadius: 12, backgroundColor: palette.error, paddingHorizontal: 15, alignItems: "center", justifyContent: "center" }, dangerText: { color: "#FFFFFF", fontSize: 12, fontWeight: "900" },
  locked: { flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: 25 }, lockIcon: { width: 68, height: 68, borderRadius: 24, backgroundColor: "#E9F8F2", alignItems: "center", justifyContent: "center", marginBottom: 15 }, lockedTitle: { color: palette.ink, fontWeight: "900", fontSize: 22 }, lockedText: { color: palette.muted, textAlign: "center", lineHeight: 21, marginTop: 8, fontSize: 14 }, retryActions: { flexDirection: "row-reverse", gap: 10, width: "100%", marginTop: 20, alignItems: "center" }, signOutTextButton: { minHeight: 44, paddingHorizontal: 12, justifyContent: "center" }, signOutText: { color: palette.primary, fontWeight: "900", fontSize: 12 },
});
