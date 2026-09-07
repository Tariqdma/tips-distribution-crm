import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { Redirect, router } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { GeographicMap } from "@/components/geographic-map";
import { AppHeader, PrimaryButton, palette } from "@/components/crm-ui";
import { ScreenContainer } from "@/components/screen-container";
import { getApiBaseUrl } from "@/constants/oauth";
import { type TerritoryBoundary, useCrm } from "@/lib/crm-store";
import { citiesForState, SUDAN_STATES } from "@/lib/sudan-locations";
import { useSupabaseAuth } from "@/lib/supabase-auth";

type Point = { latitude: number; longitude: number };
type Territory = { clientKey: string; name: string; state: string; city: string; centerLatitude: number; centerLongitude: number; radiusMeters: number; polygonPoints: Point[]; assignedMemberCount: number; isBoundaryComplete: boolean };
type TerritorySetup = { territories: Territory[]; territoryCount: number; assignedTerritoryCount: number; isTerritorySetupStarted: boolean };
type PickerType = "state" | "city" | null;

const cityCenters: Record<string, Point> = { "الخرطوم": { latitude: 15.5581, longitude: 32.5372 }, "الخرطوم بحري": { latitude: 15.6236, longitude: 32.5327 }, "أم درمان": { latitude: 15.647, longitude: 32.4803 }, "بورتسودان": { latitude: 19.6158, longitude: 37.2164 }, "مدني": { latitude: 14.4012, longitude: 33.5199 } };
const radiusChoices = [1000, 2500, 5000, 10000];
const defaultPoint = cityCenters["الخرطوم"];
const endpoint = () => `${getApiBaseUrl()}/api/company/territory-setup`;

export default function CompanyTerritorySetupScreen() {
  const { session, profile } = useSupabaseAuth();
  const { refreshSharedCatalog } = useCrm();
  const [setup, setSetup] = useState<TerritorySetup | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [clientKey, setClientKey] = useState<string | undefined>();
  const [name, setName] = useState("");
  const [state, setState] = useState("ولاية الخرطوم");
  const [city, setCity] = useState("الخرطوم");
  const [center, setCenter] = useState<Point>(defaultPoint);
  const [radiusMeters, setRadiusMeters] = useState(2500);
  const [polygonPoints, setPolygonPoints] = useState<Point[]>([]);
  const [picker, setPicker] = useState<PickerType>(null);
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const isManager = profile?.role_key === "company_manager" || profile?.role_key === "sales_manager" || (profile?.role_key === "system_admin" && !profile.is_platform_admin);
  const cities = citiesForState(state);

  const load = useCallback(async () => {
    if (!session?.access_token) throw new Error("انتهت الجلسة. سجّل الدخول مرة أخرى.");
    const response = await fetch(endpoint(), { headers: { Authorization: `Bearer ${session.access_token}` } });
    const payload = await response.json().catch(() => ({})) as { setup?: TerritorySetup; message?: string };
    if (!response.ok || !payload.setup) throw new Error(payload.message || "تعذر تحميل مناطق العمل.");
    setSetup(payload.setup);
    return payload.setup;
  }, [session?.access_token]);

  useEffect(() => { if (!session || !isManager) return; void (async () => { try { setLoading(true); await load(); } catch (reason) { setFeedback({ tone: "error", text: reason instanceof Error ? reason.message : "تعذر تحميل مناطق العمل." }); } finally { setLoading(false); } })(); }, [isManager, load, session]);

  const draftBoundary = useMemo<TerritoryBoundary>(() => ({ territoryId: clientKey ?? "draft-territory", name: name.trim() || "منطقة جديدة", state, city, centerLatitude: String(center.latitude), centerLongitude: String(center.longitude), radiusMeters, polygonPoints: polygonPoints.length >= 3 ? polygonPoints : undefined, updatedAt: "الآن" }), [center.latitude, center.longitude, city, clientKey, name, polygonPoints, radiusMeters, state]);
  const options = picker === "state" ? SUDAN_STATES.map((item) => item.name) : cities;

  const reset = () => { setClientKey(undefined); setName(""); setState("ولاية الخرطوم"); setCity("الخرطوم"); setCenter(defaultPoint); setRadiusMeters(2500); setPolygonPoints([]); setFeedback(null); };
  const selectTerritory = (territory: Territory) => { setClientKey(territory.clientKey); setName(territory.name); setState(territory.state); setCity(territory.city); setCenter({ latitude: territory.centerLatitude, longitude: territory.centerLongitude }); setRadiusMeters(territory.radiusMeters); setPolygonPoints(territory.polygonPoints); setFeedback(null); };
  const selectPicker = (value: string) => { if (picker === "state") { const nextCities = citiesForState(value); const nextCity = nextCities[0] ?? ""; setState(value); setCity(nextCity); setCenter(cityCenters[nextCity] ?? defaultPoint); } else { setCity(value); setCenter(cityCenters[value] ?? center); } setPicker(null); };
  const addPoint = (point: Point) => setPolygonPoints((items) => [...items, point]);
  const save = async () => {
    if (!session?.access_token) { setFeedback({ tone: "error", text: "انتهت الجلسة. سجّل الدخول مرة أخرى." }); return; }
    if (!name.trim()) { setFeedback({ tone: "error", text: "اكتب اسماً واضحاً لمنطقة العمل." }); return; }
    if (polygonPoints.length > 0 && polygonPoints.length < 3) { setFeedback({ tone: "error", text: "أضف ثلاث نقاط للحد المضلع أو امسح النقاط لاستخدام النطاق الدائري." }); return; }
    setSaving(true); setFeedback(null);
    try {
      const response = await fetch(endpoint(), { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify({ clientKey, name, state, city, centerLatitude: center.latitude, centerLongitude: center.longitude, radiusMeters, polygonPoints }) });
      const payload = await response.json().catch(() => ({})) as { territory?: Territory; message?: string };
      if (!response.ok || !payload.territory) throw new Error(payload.message || "تعذر حفظ منطقة العمل.");
      await Promise.all([load(), refreshSharedCatalog()]);
      selectTerritory(payload.territory);
      setFeedback({ tone: "success", text: `تم حفظ منطقة ${payload.territory.name} وربط حدودها بالشركة.` });
    } catch (reason) { setFeedback({ tone: "error", text: reason instanceof Error ? reason.message : "تعذر حفظ منطقة العمل." }); }
    finally { setSaving(false); }
  };

  if (!session) return <Redirect href={"/login" as never} />;
  if (!isManager) return <Redirect href={"/company" as never} />;
  if (loading) return <ScreenContainer className="items-center justify-center"><ActivityIndicator color={palette.primary} size="large" /><Text style={styles.loading}>جاري تحميل مناطق الشركة…</Text></ScreenContainer>;

  return <ScreenContainer className="px-5" containerClassName="bg-background"><ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
    <AppHeader eyebrow="المرحلة الثالثة · مدير الشركة" title="إعداد مناطق العمل" right={<TouchableOpacity onPress={() => router.replace("/company" as never)} style={styles.back}><MaterialIcons name="arrow-forward" size={20} color={palette.primary} /></TouchableOpacity>} />
    <View style={styles.hero}><View style={styles.heroIcon}><MaterialIcons name="map" size={26} color="#FFFFFF" /></View><View style={styles.alignEnd}><Text style={styles.heroTitle}>{setup?.isTerritorySetupStarted ? "مناطق التغطية جاهزة للتوسعة" : "حدّد مناطق تغطية الشركة"}</Text><Text style={styles.heroText}>أنشئ المنطقة، اختر موقعها، ثم ارسم حدودها. يمكن إسنادها لاحقاً للمشرفين والمندوبين.</Text></View></View>
    <View style={styles.metrics}><Metric value={setup?.territoryCount ?? 0} label="مناطق مسجلة" tint={palette.primary} /><Metric value={setup?.assignedTerritoryCount ?? 0} label="مناطق معيّنة" tint="#7C3AED" /></View>
    <View style={styles.info}><MaterialIcons name="draw" size={19} color={palette.info} /><Text style={styles.infoText}>النطاق الدائري يحمي الزيارات فوراً. وإذا رسمت ثلاث نقاط أو أكثر، يصبح المضلع هو الحد الأدق للتغطية.</Text></View>
    {feedback ? <View style={[styles.feedback, feedback.tone === "success" ? styles.feedbackSuccess : styles.feedbackError]}><MaterialIcons name={feedback.tone === "success" ? "check-circle" : "error-outline"} size={18} color={feedback.tone === "success" ? palette.success : palette.error} /><Text style={[styles.feedbackText, { color: feedback.tone === "success" ? palette.success : palette.error }]}>{feedback.text}</Text></View> : null}
    {setup?.territories.length ? <><View style={styles.sectionHead}><TouchableOpacity onPress={reset}><Text style={styles.addNew}>منطقة جديدة</Text></TouchableOpacity><Text style={styles.sectionTitle}>المناطق الحالية</Text></View><View style={styles.territoryChoices}>{setup.territories.map((territory) => <TouchableOpacity key={territory.clientKey} onPress={() => selectTerritory(territory)} style={[styles.choice, clientKey === territory.clientKey && styles.choiceActive]}><View style={styles.choiceTop}><Text style={styles.choiceCount}>{territory.assignedMemberCount} أعضاء</Text><Text style={[styles.choiceName, clientKey === territory.clientKey && styles.choiceNameActive]}>{territory.name}</Text></View><Text style={styles.choiceMeta}>{territory.city}{territory.polygonPoints.length >= 3 ? " · حد مضلع" : " · نطاق دائري"}</Text></TouchableOpacity>)}</View></> : null}
    <View style={styles.formCard}><Text style={styles.formTitle}>{clientKey ? "تعديل منطقة العمل" : "إضافة منطقة عمل جديدة"}</Text><Text style={styles.label}>اسم المنطقة <Text style={styles.required}>*</Text></Text><TextInput value={name} onChangeText={setName} textAlign="right" placeholder="مثال: وسط الخرطوم والعمارات" placeholderTextColor="#94A39C" style={styles.input} />
      <Text style={styles.label}>الولاية <Text style={styles.required}>*</Text></Text><Selector value={state} onPress={() => setPicker("state")} /><Text style={styles.label}>المدينة <Text style={styles.required}>*</Text></Text><Selector value={city} onPress={() => setPicker("city")} />
      <View style={styles.centerHeader}><TouchableOpacity onPress={() => setCenter(cityCenters[city] ?? defaultPoint)} style={styles.cityCenter}><MaterialIcons name="location-city" size={15} color={palette.primary} /><Text style={styles.cityCenterText}>مركز المدينة</Text></TouchableOpacity><Text style={styles.labelNoMargin}>مركز المنطقة</Text></View><Text style={styles.centerCopy}>اضغط على الخريطة لتحديد رؤوس المضلع؛ يمكنك تعديل إحداثيات المركز عند الحاجة من الصفحة المتخصصة لاحقاً.</Text>
      <View style={styles.mapWrap}><GeographicMap boundaries={[draftBoundary]} height={320} onMapPress={addPoint} /></View>
      <View style={styles.pointSummary}><MaterialIcons name={polygonPoints.length >= 3 ? "polyline" : "radio-button-unchecked"} size={18} color={polygonPoints.length >= 3 ? palette.success : palette.info} /><View style={styles.alignEnd}><Text style={styles.pointTitle}>{polygonPoints.length >= 3 ? "حد مضلع مفعل" : "النطاق الدائري مفعل"}</Text><Text style={styles.pointCopy}>{polygonPoints.length ? `${polygonPoints.length} نقطة مرسومة` : "أضف ثلاث نقاط أو أكثر لزيادة دقة الحدود."}</Text></View></View>
      {polygonPoints.length ? <View style={styles.pointActions}><TouchableOpacity onPress={() => setPolygonPoints((items) => items.slice(0, -1))} style={styles.subtleButton}><Text style={styles.subtleText}>حذف آخر نقطة</Text></TouchableOpacity><TouchableOpacity onPress={() => setPolygonPoints([])} style={styles.subtleButton}><Text style={[styles.subtleText, { color: palette.error }]}>مسح النقاط</Text></TouchableOpacity></View> : null}
      <Text style={styles.label}>نطاق الحماية الاحتياطي</Text><View style={styles.radii}>{radiusChoices.map((value) => <TouchableOpacity key={value} onPress={() => setRadiusMeters(value)} style={[styles.radius, radiusMeters === value && styles.radiusActive]}><Text style={[styles.radiusText, radiusMeters === value && styles.radiusTextActive]}>{value >= 1000 ? `${value / 1000} كم` : `${value} م`}</Text></TouchableOpacity>)}</View>
      <PrimaryButton label={saving ? "جاري حفظ المنطقة…" : clientKey ? "حفظ التعديلات" : "حفظ منطقة العمل"} icon={saving ? "hourglass-top" : "save"} disabled={saving} onPress={() => void save()} style={{ marginTop: 19 }} />
    </View>
    <View style={styles.next}><MaterialIcons name="contacts" size={19} color="#7C3AED" /><View style={styles.alignEnd}><Text style={styles.nextTitle}>الخطوة التالية</Text><Text style={styles.nextText}>بعد حفظ المناطق، استورد الجهات واربطها بمناطق التغطية قبل بدء التخطيط والزيارات.</Text></View><TouchableOpacity onPress={() => router.push("/company-account-setup" as never)}><Text style={styles.nextLink}>الجهات</Text></TouchableOpacity></View>
    <TouchableOpacity onPress={() => router.replace("/company" as never)} style={styles.later}><Text style={styles.laterText}>العودة إلى لوحة الشركة</Text></TouchableOpacity>
  </ScrollView><Modal visible={picker !== null} transparent animationType="slide" onRequestClose={() => setPicker(null)}><View style={styles.modalBackdrop}><View style={styles.sheet}><View style={styles.sheetHead}><TouchableOpacity onPress={() => setPicker(null)}><Text style={styles.closeText}>إغلاق</Text></TouchableOpacity><Text style={styles.sheetTitle}>{picker === "state" ? "اختر الولاية" : "اختر المدينة"}</Text></View><ScrollView>{options.map((item) => <TouchableOpacity key={item} onPress={() => selectPicker(item)} style={styles.option}><MaterialIcons name={(picker === "state" ? state : city) === item ? "check-circle" : "chevron-left"} size={20} color={(picker === "state" ? state : city) === item ? palette.success : palette.muted} /><Text style={styles.optionText}>{item}</Text></TouchableOpacity>)}</ScrollView></View></View></Modal></ScreenContainer>;
}

function Metric({ value, label, tint }: { value: number; label: string; tint: string }) { return <View style={styles.metric}><Text style={[styles.metricValue, { color: tint }]}>{value}</Text><Text style={styles.metricLabel}>{label}</Text></View>; }
function Selector({ value, onPress }: { value: string; onPress: () => void }) { return <TouchableOpacity onPress={onPress} style={styles.selector}><MaterialIcons name="expand-more" size={21} color={palette.primary} /><Text style={styles.selectorValue}>{value}</Text></TouchableOpacity>; }

const styles = StyleSheet.create({
  content: { paddingTop: 10, paddingBottom: 34, maxWidth: 640, width: "100%", alignSelf: "center" }, loading: { color: palette.muted, fontSize: 13, marginTop: 12 }, back: { width: 39, height: 39, borderRadius: 13, backgroundColor: "#E9F8F2", alignItems: "center", justifyContent: "center" }, alignEnd: { flex: 1, alignItems: "flex-end" }, hero: { flexDirection: "row-reverse", gap: 12, alignItems: "center", backgroundColor: "#143D35", borderRadius: 21, padding: 17 }, heroIcon: { width: 48, height: 48, borderRadius: 16, backgroundColor: "#28715F", alignItems: "center", justifyContent: "center" }, heroTitle: { color: "#FFFFFF", fontSize: 16, fontWeight: "900", textAlign: "right" }, heroText: { color: "#C6E6DD", fontSize: 11, lineHeight: 17, marginTop: 4, textAlign: "right" },
  metrics: { flexDirection: "row-reverse", gap: 9, marginTop: 13 }, metric: { flex: 1, backgroundColor: "#FFFFFF", borderRadius: 15, borderWidth: 1, borderColor: palette.line, paddingVertical: 12, alignItems: "center" }, metricValue: { fontSize: 21, fontWeight: "900" }, metricLabel: { color: palette.muted, fontSize: 10, marginTop: 3 }, info: { flexDirection: "row-reverse", gap: 8, alignItems: "flex-start", backgroundColor: "#EFF6FF", borderRadius: 15, padding: 12, marginTop: 13 }, infoText: { color: "#285A8E", fontSize: 10, lineHeight: 16, flex: 1, textAlign: "right" }, feedback: { flexDirection: "row-reverse", gap: 7, alignItems: "center", padding: 11, borderRadius: 13, marginTop: 12, borderWidth: 1 }, feedbackSuccess: { backgroundColor: "#E9F8F2", borderColor: "#B9DED3" }, feedbackError: { backgroundColor: "#FFF0F0", borderColor: "#F2C1C1" }, feedbackText: { flex: 1, textAlign: "right", fontSize: 11, lineHeight: 16, fontWeight: "700" },
  sectionHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 21, marginBottom: 8 }, sectionTitle: { color: palette.ink, fontSize: 15, fontWeight: "900", textAlign: "right" }, addNew: { color: palette.primary, fontSize: 11, fontWeight: "900" }, territoryChoices: { gap: 8 }, choice: { backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: palette.line, borderRadius: 14, padding: 12 }, choiceActive: { backgroundColor: "#E9F8F2", borderColor: "#94CEBD" }, choiceTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }, choiceName: { color: palette.ink, fontSize: 12, fontWeight: "900" }, choiceNameActive: { color: palette.primary }, choiceCount: { color: palette.primary, fontSize: 10, fontWeight: "800", backgroundColor: "#E9F8F2", paddingHorizontal: 7, paddingVertical: 3, borderRadius: 7 }, choiceMeta: { color: palette.muted, textAlign: "right", fontSize: 10, marginTop: 4 },
  formCard: { backgroundColor: "#FFFFFF", borderRadius: 18, borderWidth: 1, borderColor: palette.line, padding: 14, marginTop: 17 }, formTitle: { color: palette.ink, fontSize: 15, fontWeight: "900", textAlign: "right", marginBottom: 15 }, label: { color: palette.ink, fontSize: 11, fontWeight: "900", textAlign: "right", marginTop: 13, marginBottom: 6 }, labelNoMargin: { color: palette.ink, fontSize: 11, fontWeight: "900" }, required: { color: palette.error }, input: { minHeight: 47, borderWidth: 1, borderColor: "#DCE8E3", borderRadius: 12, paddingHorizontal: 12, color: palette.ink, fontSize: 13 }, selector: { minHeight: 47, borderWidth: 1, borderColor: "#DCE8E3", borderRadius: 12, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, selectorValue: { color: palette.ink, fontSize: 12, fontWeight: "800", textAlign: "right" }, centerHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 16 }, cityCenter: { flexDirection: "row-reverse", gap: 4, backgroundColor: "#E9F8F2", borderRadius: 9, paddingHorizontal: 8, paddingVertical: 7 }, cityCenterText: { color: palette.primary, fontSize: 10, fontWeight: "900" }, centerCopy: { color: palette.muted, fontSize: 10, lineHeight: 15, textAlign: "right", marginTop: 6 }, mapWrap: { height: 320, overflow: "hidden", borderRadius: 15, borderWidth: 1, borderColor: "#CFE6DE", marginTop: 11 }, pointSummary: { flexDirection: "row-reverse", gap: 8, alignItems: "center", backgroundColor: "#F3FAF7", padding: 11, borderRadius: 12, marginTop: 10 }, pointTitle: { color: palette.ink, fontSize: 11, fontWeight: "900", textAlign: "right" }, pointCopy: { color: palette.muted, fontSize: 10, marginTop: 3, textAlign: "right" }, pointActions: { flexDirection: "row", gap: 8, marginTop: 10, justifyContent: "flex-start" }, subtleButton: { minHeight: 35, paddingHorizontal: 10, borderRadius: 10, backgroundColor: "#EFF6FF", alignItems: "center", justifyContent: "center" }, subtleText: { color: palette.info, fontSize: 10, fontWeight: "800" }, radii: { flexDirection: "row-reverse", gap: 7, flexWrap: "wrap" }, radius: { flex: 1, minWidth: "22%", minHeight: 39, borderRadius: 10, borderWidth: 1, borderColor: palette.line, alignItems: "center", justifyContent: "center" }, radiusActive: { backgroundColor: "#E9F8F2", borderColor: "#94CEBD" }, radiusText: { color: palette.muted, fontSize: 10, fontWeight: "800" }, radiusTextActive: { color: palette.primary },
  next: { flexDirection: "row-reverse", gap: 8, alignItems: "flex-start", backgroundColor: "#F5F0FF", borderRadius: 15, padding: 12, marginTop: 15 }, nextTitle: { color: "#6343A4", fontSize: 11, fontWeight: "900", textAlign: "right" }, nextText: { color: "#725E9B", fontSize: 10, lineHeight: 15, marginTop: 3, textAlign: "right" }, nextLink: { color: "#6343A4", fontSize: 11, fontWeight: "900" }, later: { minHeight: 45, alignItems: "center", justifyContent: "center", marginTop: 8 }, laterText: { color: palette.muted, fontSize: 12, fontWeight: "800" },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(11,34,28,0.4)", justifyContent: "flex-end" }, sheet: { maxHeight: "75%", borderTopLeftRadius: 26, borderTopRightRadius: 26, backgroundColor: "#FFFFFF", paddingTop: 16, paddingHorizontal: 20, paddingBottom: 26 }, sheetHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingBottom: 13, borderBottomWidth: 1, borderBottomColor: "#E8EEEB" }, sheetTitle: { color: palette.ink, fontSize: 17, fontWeight: "800" }, closeText: { color: palette.primary, fontWeight: "800", fontSize: 13 }, option: { paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: "#EEF2F0", flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, optionText: { color: palette.ink, fontWeight: "700", fontSize: 14, textAlign: "right" },
});
