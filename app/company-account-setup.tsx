import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as DocumentPicker from "expo-document-picker";
import { File } from "expo-file-system";
import { Redirect, router } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import * as XLSX from "xlsx";
import { AppHeader, PrimaryButton, palette } from "@/components/crm-ui";
import { ScreenContainer } from "@/components/screen-container";
import { accountImportTemplateColumns, parseAccountImportRows, type AccountImportPreviewRow } from "@/lib/account-import";
import { getApiBaseUrl } from "@/constants/oauth";
import { useCrm } from "@/lib/crm-store";
import { useSupabaseAuth } from "@/lib/supabase-auth";

type AccountSetup = { accountCount: number; doctorCount: number; pharmacyCount: number; hospitalCount: number; distributorCount: number; territoryChoices: Array<{ clientKey: string; name: string; state: string; city: string }>; isAccountSetupStarted: boolean };
type ImportOutcome = { itemKey: string; status: "created" | "updated" | "duplicate" | "rejected"; accountId?: string; accountName: string; message: string };
type ImportSummary = { createdCount: number; updatedCount: number; duplicateCount: number; rejectedCount: number };

const endpoint = () => `${getApiBaseUrl()}/api/company/account-setup`;
const typeMeta = { doctor: { label: "أطباء", icon: "medical-services" as const, tint: "#0F766E" }, pharmacy: { label: "صيدليات", icon: "local-pharmacy" as const, tint: "#B45309" }, hospital: { label: "مستشفيات", icon: "local-hospital" as const, tint: "#2563EB" }, distributor: { label: "موزعون", icon: "local-shipping" as const, tint: "#7C3AED" } };

async function rowsFromAsset(asset: DocumentPicker.DocumentPickerAsset) {
  const bytes = Platform.OS === "web" && asset.file ? await asset.file.arrayBuffer() : await new File(asset as never).arrayBuffer();
  const workbook = XLSX.read(bytes, { type: "array" });
  const firstSheet = workbook.SheetNames[0];
  if (!firstSheet) throw new Error("لم نجد ورقة بيانات داخل الملف.");
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[firstSheet], { defval: "" });
}

function rowsFromPastedText(value: string) {
  const workbook = XLSX.read(value, { type: "string" });
  const firstSheet = workbook.SheetNames[0];
  if (!firstSheet) throw new Error("ألصق بيانات CSV أو جدولا يحتوي على صف عناوين.");
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[firstSheet], { defval: "" });
}

export default function CompanyAccountSetupScreen() {
  const { session, profile } = useSupabaseAuth();
  const { refreshSharedCatalog } = useCrm();
  const [setup, setSetup] = useState<AccountSetup | null>(null);
  const [previewRows, setPreviewRows] = useState<AccountImportPreviewRow[]>([]);
  const [outcomes, setOutcomes] = useState<ImportOutcome[]>([]);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pastedText, setPastedText] = useState("");
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const isManager = profile?.role_key === "company_manager" || profile?.role_key === "sales_manager" || (profile?.role_key === "system_admin" && !profile.is_platform_admin);
  const validPreviewRows = previewRows.filter((row) => !row.errors.length && row.accountType);
  const invalidPreviewRows = previewRows.filter((row) => row.errors.length);

  const load = useCallback(async () => {
    if (!session?.access_token) throw new Error("انتهت الجلسة. سجّل الدخول مرة أخرى.");
    const response = await fetch(endpoint(), { headers: { Authorization: `Bearer ${session.access_token}` } });
    const payload = await response.json().catch(() => ({})) as { setup?: AccountSetup; message?: string };
    if (!response.ok || !payload.setup) throw new Error(payload.message || "تعذر تحميل جهات الشركة.");
    setSetup(payload.setup);
    return payload.setup;
  }, [session?.access_token]);

  useEffect(() => { if (!session || !isManager) return; void (async () => { try { setLoading(true); await load(); } catch (reason) { setFeedback({ tone: "error", text: reason instanceof Error ? reason.message : "تعذر تحميل جهات الشركة." }); } finally { setLoading(false); } })(); }, [isManager, load, session]);

  const previewRawRows = (rows: Array<Record<string, unknown>>) => {
    if (!setup) return;
    const parsed = parseAccountImportRows(rows, setup.territoryChoices);
    if (!parsed.length) { setFeedback({ tone: "error", text: "لم نجد صفوف جهات داخل الملف. تأكد من صف العناوين والبيانات." }); return; }
    setPreviewRows(parsed.slice(0, 500)); setOutcomes([]); setSummary(null); setFeedback(null);
  };
  const pickFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: ["text/csv", "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"], copyToCacheDirectory: true });
      if (result.canceled) return;
      setParsing(true); previewRawRows(await rowsFromAsset(result.assets[0]));
    } catch (reason) { setFeedback({ tone: "error", text: reason instanceof Error ? `تعذر قراءة الملف: ${reason.message}` : "تعذر قراءة الملف." }); }
    finally { setParsing(false); }
  };
  const previewPastedData = () => { try { previewRawRows(rowsFromPastedText(pastedText)); setPasteOpen(false); } catch (reason) { setFeedback({ tone: "error", text: reason instanceof Error ? reason.message : "تعذر قراءة البيانات الملصقة." }); } };
  const importRows = async () => {
    if (!session?.access_token || !validPreviewRows.length) return;
    setImporting(true); setFeedback(null);
    try {
      const response = await fetch(`${endpoint()}/import`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify({ rows: validPreviewRows.map(({ errors, ...row }) => row) }) });
      const payload = await response.json().catch(() => ({})) as { results?: ImportOutcome[]; summary?: ImportSummary; message?: string };
      if (!response.ok || !payload.results || !payload.summary) throw new Error(payload.message || "تعذر استيراد الجهات.");
      setOutcomes(payload.results); setSummary({ ...payload.summary, rejectedCount: payload.summary.rejectedCount + invalidPreviewRows.length });
      await Promise.all([load(), refreshSharedCatalog()]);
      setFeedback({ tone: "success", text: `تمت معالجة ${payload.results.length} جهة. راجع النتيجة أدناه قبل البدء في التخطيط.` });
    } catch (reason) { setFeedback({ tone: "error", text: reason instanceof Error ? reason.message : "تعذر استيراد الجهات." }); }
    finally { setImporting(false); }
  };
  const metrics = useMemo(() => setup ? [{ key: "doctor", value: setup.doctorCount }, { key: "pharmacy", value: setup.pharmacyCount }, { key: "hospital", value: setup.hospitalCount }, { key: "distributor", value: setup.distributorCount }] as const : [], [setup]);

  if (!session) return <Redirect href="/login" />;
  if (!isManager) return <Redirect href="/company" />;
  if (loading) return <ScreenContainer className="items-center justify-center"><ActivityIndicator color={palette.primary} size="large" /><Text style={styles.loading}>جاري تحميل دليل الجهات…</Text></ScreenContainer>;

  return <ScreenContainer className="px-5" containerClassName="bg-background"><ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
    <AppHeader eyebrow="المرحلة الرابعة · مدير الشركة" title="استيراد الجهات" right={<TouchableOpacity onPress={() => router.replace("/company" as never)} style={styles.back}><MaterialIcons name="arrow-forward" size={20} color={palette.primary} /></TouchableOpacity>} />
    <View style={styles.hero}><View style={styles.heroIcon}><MaterialIcons name="upload-file" size={26} color="#FFFFFF" /></View><View style={styles.alignEnd}><Text style={styles.heroTitle}>{setup?.isAccountSetupStarted ? "وسّع دليل جهات الشركة" : "أضف جهات الشركة أولاً"}</Text><Text style={styles.heroText}>استورد ملف Excel أو CSV، راجع الصفوف، ثم احفظ الجهات السليمة فقط داخل شركتك.</Text></View></View>
    <View style={styles.total}><Text style={styles.totalValue}>{setup?.accountCount ?? 0}</Text><Text style={styles.totalLabel}>إجمالي الجهات المسجلة</Text></View>
    <View style={styles.metrics}>{metrics.map(({ key, value }) => <View key={key} style={styles.metric}><MaterialIcons name={typeMeta[key].icon} size={17} color={typeMeta[key].tint} /><Text style={[styles.metricValue, { color: typeMeta[key].tint }]}>{value}</Text><Text style={styles.metricLabel}>{typeMeta[key].label}</Text></View>)}</View>
    <View style={styles.info}><MaterialIcons name="verified-user" size={19} color={palette.info} /><Text style={styles.infoText}>لا تصل الجهات المستوردة إلا لشركتك. الجهة التي تطابق الاسم والنوع والمدينة لن تُكرر، بل تظهر في المعاينة كعنصر موجود.</Text></View>
    {feedback ? <View style={[styles.feedback, feedback.tone === "success" ? styles.feedbackSuccess : styles.feedbackError]}><MaterialIcons name={feedback.tone === "success" ? "check-circle" : "error-outline"} size={18} color={feedback.tone === "success" ? palette.success : palette.error} /><Text style={[styles.feedbackText, { color: feedback.tone === "success" ? palette.success : palette.error }]}>{feedback.text}</Text></View> : null}
    <View style={styles.importCard}><Text style={styles.cardTitle}>اختر طريقة الإدخال</Text><Text style={styles.cardCopy}>استخدم ملف Excel أو CSV فيه صف عناوين. يمكنك أيضاً لصق جدول CSV مباشرة من Excel.</Text><View style={styles.importActions}><TouchableOpacity onPress={() => void pickFile()} disabled={parsing || importing} style={[styles.fileButton, (parsing || importing) && styles.disabled]}>{parsing ? <ActivityIndicator color="#FFFFFF" /> : <MaterialIcons name="upload-file" size={19} color="#FFFFFF" />}<Text style={styles.fileButtonText}>{parsing ? "جاري قراءة الملف…" : "اختيار ملف Excel أو CSV"}</Text></TouchableOpacity><TouchableOpacity onPress={() => setPasteOpen(true)} disabled={importing} style={styles.pasteButton}><MaterialIcons name="content-paste" size={18} color={palette.primary} /><Text style={styles.pasteButtonText}>لصق بيانات CSV</Text></TouchableOpacity></View><TouchableOpacity onPress={() => router.push("/account/new" as never)} style={styles.manual}><MaterialIcons name="add-circle-outline" size={17} color={palette.primary} /><Text style={styles.manualText}>إضافة جهة يدوياً</Text></TouchableOpacity></View>
    <View style={styles.template}><Text style={styles.templateTitle}>أعمدة الملف المعتمدة</Text><Text style={styles.templateCopy}>الحد الأدنى: الاسم، نوع الجهة، الولاية، المدينة. يمكن ربط الصف بمنطقة العمل باستخدام اسم المنطقة أو مفتاحها.</Text><View style={styles.columns}>{accountImportTemplateColumns.map((column) => <View key={column} style={styles.column}><Text style={styles.columnText}>{column}</Text></View>)}</View></View>
    {previewRows.length ? <><View style={styles.previewHead}><Text style={styles.previewMeta}>{invalidPreviewRows.length ? `${invalidPreviewRows.length} يحتاج مراجعة` : "كل الصفوف صالحة للمراجعة"}</Text><Text style={styles.sectionTitle}>معاينة الاستيراد · {previewRows.length} صف</Text></View><View style={styles.previewStats}><PreviewStat label="جاهزة" value={validPreviewRows.length} color={palette.success} /><PreviewStat label="تحتاج تصحيح" value={invalidPreviewRows.length} color={palette.error} /></View><View style={styles.previewList}>{previewRows.slice(0, 12).map((row) => <PreviewRow key={row.localRef} row={row} />)}</View>{previewRows.length > 12 ? <Text style={styles.moreRows}>تظهر أول 12 جهة فقط. ستتم معالجة كل الصفوف عند الحفظ.</Text> : null}<PrimaryButton label={importing ? "جاري استيراد الجهات…" : `استيراد ${validPreviewRows.length} جهة سليمة`} icon={importing ? "hourglass-top" : "save"} disabled={importing || !validPreviewRows.length} onPress={() => void importRows()} style={{ marginTop: 15 }} /></> : null}
    {summary ? <View style={styles.results}><Text style={styles.sectionTitle}>نتيجة الاستيراد</Text><View style={styles.resultGrid}><ResultMetric label="أضيفت" value={summary.createdCount} tint={palette.success} /><ResultMetric label="تحدّثت" value={summary.updatedCount} tint={palette.info} /><ResultMetric label="مكررة" value={summary.duplicateCount} tint={palette.warning} /><ResultMetric label="مرفوضة" value={summary.rejectedCount} tint={palette.error} /></View>{outcomes.filter((item) => item.status !== "created").slice(0, 6).map((item) => <View key={`${item.itemKey}-${item.status}`} style={styles.outcome}><Text style={styles.outcomeMessage}>{item.message}</Text><Text style={styles.outcomeName}>{item.accountName || "صف غير صالح"}</Text></View>)}</View> : null}
    <View style={styles.next}><MaterialIcons name="calendar-month" size={19} color="#7C3AED" /><View style={styles.alignEnd}><Text style={styles.nextTitle}>بعد إعداد الجهات</Text><Text style={styles.nextText}>راجع الجهات في الدليل، ثم أنشئ الخطة الأسبوعية الأولى ووزّع الزيارات على أيامها.</Text></View><TouchableOpacity onPress={() => router.push("/account/new" as never)}><Text style={styles.nextLink}>الدليل</Text></TouchableOpacity></View>
  </ScrollView><Modal visible={pasteOpen} transparent animationType="slide" onRequestClose={() => setPasteOpen(false)}><View style={styles.modalBackdrop}><View style={styles.sheet}><View style={styles.sheetHead}><TouchableOpacity onPress={() => setPasteOpen(false)}><Text style={styles.closeText}>إغلاق</Text></TouchableOpacity><Text style={styles.sheetTitle}>لصق جدول CSV</Text></View><Text style={styles.sheetCopy}>الصق صف العناوين ثم البيانات، بفواصل عربية أو إنجليزية، أو انسخ مباشرة من Excel.</Text><TextInput value={pastedText} onChangeText={setPastedText} multiline textAlign="right" placeholder="الاسم,نوع الجهة,الولاية,المدينة…" placeholderTextColor="#93A099" style={styles.pasteInput} /><PrimaryButton label="معاينة البيانات" icon="visibility" onPress={previewPastedData} style={{ marginTop: 13 }} /></View></View></Modal></ScreenContainer>;
}

function PreviewStat({ label, value, color }: { label: string; value: number; color: string }) { return <View style={styles.previewStat}><Text style={[styles.previewStatValue, { color }]}>{value}</Text><Text style={styles.previewStatLabel}>{label}</Text></View>; }
function ResultMetric({ label, value, tint }: { label: string; value: number; tint: string }) { return <View style={styles.resultMetric}><Text style={[styles.resultValue, { color: tint }]}>{value}</Text><Text style={styles.resultLabel}>{label}</Text></View>; }
function PreviewRow({ row }: { row: AccountImportPreviewRow }) { const meta = row.accountType ? typeMeta[row.accountType].label : "نوع غير صالح"; return <View style={[styles.previewRow, row.errors.length > 0 && styles.previewRowError]}><View style={styles.previewIcon}><MaterialIcons name={row.errors.length ? "error-outline" : "check-circle"} size={18} color={row.errors.length ? palette.error : palette.success} /></View><View style={styles.alignEnd}><Text style={styles.previewName}>{row.name || "اسم غير مكتمل"}</Text><Text style={styles.previewCopy}>{meta} · {row.city || "مدينة غير مكتملة"}{row.territoryKey ? " · منطقة مربوطة" : ""}</Text>{row.errors.length ? <Text style={styles.previewError}>{row.errors.join("، ")}</Text> : null}</View></View>; }

const styles = StyleSheet.create({
  content: { paddingTop: 10, paddingBottom: 34, maxWidth: 680, width: "100%", alignSelf: "center" }, loading: { color: palette.muted, fontSize: 13, marginTop: 12 }, alignEnd: { flex: 1, alignItems: "flex-end" }, back: { width: 39, height: 39, borderRadius: 13, backgroundColor: "#E9F8F2", alignItems: "center", justifyContent: "center" }, hero: { flexDirection: "row-reverse", gap: 12, alignItems: "center", backgroundColor: "#143D35", borderRadius: 21, padding: 17 }, heroIcon: { width: 48, height: 48, borderRadius: 16, backgroundColor: "#28715F", alignItems: "center", justifyContent: "center" }, heroTitle: { color: "#FFFFFF", fontSize: 16, fontWeight: "900", textAlign: "right" }, heroText: { color: "#C6E6DD", fontSize: 11, lineHeight: 17, marginTop: 4, textAlign: "right" }, total: { backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: palette.line, borderRadius: 16, paddingVertical: 12, alignItems: "center", marginTop: 13 }, totalValue: { color: palette.primary, fontSize: 25, fontWeight: "900" }, totalLabel: { color: palette.muted, fontSize: 10, marginTop: 3 }, metrics: { flexDirection: "row-reverse", gap: 7, marginTop: 9 }, metric: { flex: 1, minHeight: 70, paddingVertical: 8, alignItems: "center", justifyContent: "center", backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: palette.line, borderRadius: 13, gap: 2 }, metricValue: { fontSize: 15, fontWeight: "900" }, metricLabel: { color: palette.muted, fontSize: 9, textAlign: "center" }, info: { flexDirection: "row-reverse", gap: 8, alignItems: "flex-start", backgroundColor: "#EFF6FF", borderRadius: 15, padding: 12, marginTop: 13 }, infoText: { color: "#285A8E", fontSize: 10, lineHeight: 16, flex: 1, textAlign: "right" }, feedback: { flexDirection: "row-reverse", gap: 7, alignItems: "center", padding: 11, borderRadius: 13, marginTop: 12, borderWidth: 1 }, feedbackSuccess: { backgroundColor: "#E9F8F2", borderColor: "#B9DED3" }, feedbackError: { backgroundColor: "#FFF0F0", borderColor: "#F2C1C1" }, feedbackText: { flex: 1, textAlign: "right", fontSize: 11, lineHeight: 16, fontWeight: "700" }, importCard: { backgroundColor: "#FFFFFF", borderRadius: 18, borderWidth: 1, borderColor: palette.line, padding: 14, marginTop: 15 }, cardTitle: { color: palette.ink, fontSize: 15, fontWeight: "900", textAlign: "right" }, cardCopy: { color: palette.muted, fontSize: 10, lineHeight: 16, textAlign: "right", marginTop: 5 }, importActions: { gap: 9, marginTop: 14 }, fileButton: { minHeight: 47, borderRadius: 12, backgroundColor: palette.primary, flexDirection: "row-reverse", gap: 7, justifyContent: "center", alignItems: "center" }, fileButtonText: { color: "#FFFFFF", fontSize: 12, fontWeight: "900" }, pasteButton: { minHeight: 43, borderRadius: 12, borderWidth: 1, borderColor: "#B9DED3", backgroundColor: "#E9F8F2", flexDirection: "row-reverse", gap: 6, justifyContent: "center", alignItems: "center" }, pasteButtonText: { color: palette.primary, fontSize: 11, fontWeight: "900" }, disabled: { opacity: .6 }, manual: { flexDirection: "row-reverse", gap: 5, alignSelf: "flex-end", alignItems: "center", marginTop: 13 }, manualText: { color: palette.primary, fontSize: 11, fontWeight: "900" }, template: { backgroundColor: "#F7FAF9", borderRadius: 16, padding: 13, marginTop: 13, borderWidth: 1, borderColor: "#E2ECE8" }, templateTitle: { color: palette.ink, fontSize: 12, fontWeight: "900", textAlign: "right" }, templateCopy: { color: palette.muted, fontSize: 10, lineHeight: 15, textAlign: "right", marginTop: 4 }, columns: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 6, marginTop: 10 }, column: { backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#DDE9E4", borderRadius: 8, paddingHorizontal: 7, paddingVertical: 5 }, columnText: { color: palette.primary, fontSize: 9, fontWeight: "800" }, previewHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 19, marginBottom: 8 }, sectionTitle: { color: palette.ink, fontSize: 15, fontWeight: "900", textAlign: "right" }, previewMeta: { color: palette.muted, fontSize: 10, fontWeight: "800" }, previewStats: { flexDirection: "row-reverse", gap: 8 }, previewStat: { flex: 1, backgroundColor: "#FFFFFF", borderRadius: 12, borderWidth: 1, borderColor: palette.line, paddingVertical: 9, alignItems: "center" }, previewStatValue: { fontSize: 17, fontWeight: "900" }, previewStatLabel: { color: palette.muted, fontSize: 9, marginTop: 2 }, previewList: { gap: 7, marginTop: 9 }, previewRow: { flexDirection: "row-reverse", alignItems: "center", gap: 9, borderRadius: 13, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: palette.line, padding: 11 }, previewRowError: { borderColor: "#F3C4C4", backgroundColor: "#FFF9F9" }, previewIcon: { width: 28, height: 28, borderRadius: 9, backgroundColor: "#F4F8F6", alignItems: "center", justifyContent: "center" }, previewName: { color: palette.ink, fontSize: 11, fontWeight: "900", textAlign: "right" }, previewCopy: { color: palette.muted, fontSize: 9, marginTop: 3, textAlign: "right" }, previewError: { color: palette.error, fontSize: 9, marginTop: 4, textAlign: "right" }, moreRows: { color: palette.muted, fontSize: 10, textAlign: "center", marginTop: 9 }, results: { marginTop: 20 }, resultGrid: { flexDirection: "row-reverse", gap: 7, marginTop: 9 }, resultMetric: { flex: 1, backgroundColor: "#FFFFFF", borderRadius: 12, borderWidth: 1, borderColor: palette.line, paddingVertical: 9, alignItems: "center" }, resultValue: { fontSize: 17, fontWeight: "900" }, resultLabel: { color: palette.muted, fontSize: 9, marginTop: 2 }, outcome: { flexDirection: "row-reverse", justifyContent: "space-between", gap: 9, borderBottomWidth: 1, borderBottomColor: "#EAF0ED", paddingVertical: 9 }, outcomeName: { color: palette.ink, fontSize: 10, fontWeight: "900", textAlign: "right" }, outcomeMessage: { color: palette.muted, fontSize: 10, textAlign: "left", flex: 1 }, next: { flexDirection: "row-reverse", gap: 8, alignItems: "flex-start", backgroundColor: "#F5F0FF", borderRadius: 15, padding: 12, marginTop: 17 }, nextTitle: { color: "#6343A4", fontSize: 11, fontWeight: "900", textAlign: "right" }, nextText: { color: "#725E9B", fontSize: 10, lineHeight: 15, marginTop: 3, textAlign: "right" }, nextLink: { color: "#6343A4", fontSize: 11, fontWeight: "900" }, modalBackdrop: { flex: 1, backgroundColor: "rgba(11,34,28,0.4)", justifyContent: "flex-end" }, sheet: { borderTopLeftRadius: 25, borderTopRightRadius: 25, backgroundColor: "#FFFFFF", paddingTop: 17, paddingHorizontal: 20, paddingBottom: 28 }, sheetHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingBottom: 13, borderBottomWidth: 1, borderBottomColor: "#E8EEEB" }, sheetTitle: { color: palette.ink, fontSize: 16, fontWeight: "900" }, closeText: { color: palette.primary, fontWeight: "800", fontSize: 13 }, sheetCopy: { color: palette.muted, fontSize: 10, lineHeight: 16, textAlign: "right", marginTop: 13 }, pasteInput: { minHeight: 160, borderRadius: 13, borderWidth: 1, borderColor: palette.line, padding: 11, color: palette.ink, fontSize: 11, marginTop: 11, textAlignVertical: "top" },
});
