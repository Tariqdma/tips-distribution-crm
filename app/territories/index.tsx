import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as Location from "expo-location";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { Alert, Linking, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import Svg, { Circle, Line } from "react-native-svg";
import { AppHeader, PrimaryButton, palette } from "@/components/crm-ui";
import { ScreenContainer } from "@/components/screen-container";
import { type TerritoryBoundary, useCrm } from "@/lib/crm-store";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/hooks/use-auth";
import { useSupabaseAuth } from "@/lib/supabase-auth";

const cityCenters: Record<string, { latitude: string; longitude: string; label: string }> = {
  "الخرطوم": { latitude: "15.5581", longitude: "32.5372", label: "مركز الخرطوم" },
  "الخرطوم بحري": { latitude: "15.6236", longitude: "32.5327", label: "مركز بحري" },
  "أم درمان": { latitude: "15.6470", longitude: "32.4803", label: "مركز أم درمان" },
  "بورتسودان": { latitude: "19.6158", longitude: "37.2164", label: "مركز بورتسودان" },
  "مدني": { latitude: "14.4012", longitude: "33.5199", label: "مركز ود مدني" },
};
const radiusOptions = [1000, 2500, 5000, 10000];

export default function TerritoriesScreen() {
  const { data, updateBoundary } = useCrm();
  const { isAuthenticated } = useAuth();
  const { profile } = useSupabaseAuth();
  const canManageTerritories = Boolean(profile?.permissions.includes("all") || profile?.permissions.includes("manage_territories"));
  const saveMutation = trpc.territories.saveBoundary.useMutation();
  const [selectedId, setSelectedId] = useState(data.boundaries[0]?.territoryId ?? "t1");
  const boundary = data.boundaries.find((item) => item.territoryId === selectedId) ?? data.boundaries[0];
  const [lat, setLat] = useState(boundary?.centerLatitude ?? "15.5581");
  const [lng, setLng] = useState(boundary?.centerLongitude ?? "32.5372");
  const [radius, setRadius] = useState(String(boundary?.radiusMeters ?? 5000));
  const [notes, setNotes] = useState(boundary?.notes ?? "");
  const [showCoordinates, setShowCoordinates] = useState(false);
  const [locating, setLocating] = useState(false);
  const radiusMeters = Number(radius) || 0;
  const previewRadius = useMemo(() => Math.min(78, Math.max(22, 20 + radiusMeters / 180)), [radiusMeters]);

  const choose = (item: TerritoryBoundary) => { setSelectedId(item.territoryId); setLat(item.centerLatitude); setLng(item.centerLongitude); setRadius(String(item.radiusMeters)); setNotes(item.notes ?? ""); setShowCoordinates(false); };
  const applyCityCenter = () => {
    if (!boundary) return;
    const center = cityCenters[boundary.city];
    if (!center) { Alert.alert("لا يوجد مركز جاهز", "استخدم موقعك الحالي أو أدخل الإحداثيات المتقدمة لهذه المدينة."); return; }
    setLat(center.latitude); setLng(center.longitude);
    Alert.alert("تم اختيار المركز", `استخدمنا ${center.label} كنقطة بداية. يمكنك بعد ذلك ضبط النطاق.`);
  };
  const useMyLocation = async () => {
    setLocating(true);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== "granted") { Alert.alert("إذن الموقع مطلوب", "اسمح بالموقع لتعيين مركز المنطقة من موقعك الحالي، أو استخدم مركز المدينة."); return; }
      const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setLat(current.coords.latitude.toFixed(6)); setLng(current.coords.longitude.toFixed(6));
      Alert.alert("تم تحديد المركز", "حُفظ موقعك الحالي مؤقتاً كمركز للمنطقة. اختر الآن نطاق التغطية المناسب.");
    } catch { Alert.alert("تعذر تحديد الموقع", "تحقق من GPS أو استخدم مركز المدينة أو الإحداثيات المتقدمة."); }
    finally { setLocating(false); }
  };
  const openMap = () => { if (!lat || !lng) return; void Linking.openURL(`https://www.google.com/maps?q=${lat},${lng}`); };
  const save = () => {
    if (!canManageTerritories) { Alert.alert("صلاحية مطلوبة", "تعديل حدود المناطق متاح لمدير النظام أو مدير المبيعات فقط."); return; }
    if (!/^-?\d+(\.\d+)?$/.test(lat) || !/^-?\d+(\.\d+)?$/.test(lng) || !Number.isFinite(radiusMeters) || radiusMeters <= 0) { Alert.alert("بيانات غير صحيحة", "حدد مركزاً صحيحاً واختر نطاقاً موجباً."); return; }
    if (!boundary) return;
    const next: TerritoryBoundary = { ...boundary, centerLatitude: lat, centerLongitude: lng, radiusMeters, notes, updatedAt: "الآن" };
    updateBoundary(next);
    if (isAuthenticated) saveMutation.mutate({ territoryId: next.territoryId, name: next.name, state: next.state, city: next.city, centerLatitude: next.centerLatitude, centerLongitude: next.centerLongitude, radiusMeters: next.radiusMeters, boundaryNotes: next.notes });
    Alert.alert("تم حفظ الحد", `ستتم مراجعة الزيارات ضمن ${radiusMeters.toLocaleString("ar")} متر حول مركز المنطقة.`);
  };

  if (profile && !canManageTerritories) return <ScreenContainer className="items-center justify-center px-6"><MaterialIcons name="lock-outline" size={34} color={palette.primary} /><Text style={styles.lockedTitle}>حدود المناطق للإدارة</Text><Text style={styles.lockedCopy}>يمكنك متابعة زياراتك داخل المنطقة المعيّنة، بينما يحدد المدير مركز ونطاق التغطية للفريق.</Text></ScreenContainer>;
  return <ScreenContainer className="px-5" containerClassName="bg-background"><ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled"><AppHeader eyebrow="اختر مركزاً واضحاً ثم نطاق التغطية" title="حدود مناطق التغطية" right={<TouchableOpacity onPress={() => router.back()} style={styles.back}><MaterialIcons name="arrow-forward" size={20} color={palette.primary} /></TouchableOpacity>} /><View style={styles.info}><MaterialIcons name="my-location" size={19} color={palette.info} /><Text style={styles.infoText}>الحد الجغرافي هنا دائرة تشغيلية: مركز موثوق ونطاق تغطية بالمتر. هذه الطريقة أسهل من رسم الحدود يدوياً وتدعم التحقق من الزيارات.</Text></View><Text style={styles.sectionTitle}>اختر المنطقة</Text><View style={styles.territoryChoices}>{data.boundaries.map((item) => <TouchableOpacity key={item.territoryId} onPress={() => choose(item)} style={[styles.choice, selectedId === item.territoryId && styles.choiceActive]}><Text style={[styles.choiceText, selectedId === item.territoryId && styles.choiceTextActive]}>{item.name}</Text><Text style={styles.choiceMeta}>{item.city}</Text></TouchableOpacity>)}</View>{boundary ? <View style={styles.form}><Text style={styles.boundaryName}>{boundary.name}</Text><Text style={styles.boundaryMeta}>{boundary.state} · {boundary.city}</Text><Text style={styles.sectionTitle}>1. تحديد مركز المنطقة</Text><View style={styles.centerActions}><TouchableOpacity onPress={() => void useMyLocation()} style={styles.centerButton}><MaterialIcons name="my-location" size={18} color="#FFFFFF" /><Text style={styles.centerButtonText}>{locating ? "جارٍ تحديد الموقع…" : "استخدام موقعي الحالي"}</Text></TouchableOpacity><TouchableOpacity onPress={applyCityCenter} style={styles.centerSecondary}><MaterialIcons name="location-city" size={18} color={palette.primary} /><Text style={styles.centerSecondaryText}>مركز المدينة</Text></TouchableOpacity></View><TouchableOpacity onPress={openMap} style={styles.mapLink}><MaterialIcons name="open-in-new" size={16} color={palette.info} /><Text style={styles.mapLinkText}>راجع نقطة المركز على الخريطة</Text></TouchableOpacity><Text style={styles.sectionTitle}>2. نطاق التغطية</Text><View style={styles.radiusChoices}>{radiusOptions.map((value) => <TouchableOpacity key={value} onPress={() => setRadius(String(value))} style={[styles.radiusChoice, radiusMeters === value && styles.radiusChoiceActive]}><Text style={[styles.radiusChoiceText, radiusMeters === value && styles.radiusChoiceTextActive]}>{value >= 1000 ? `${value / 1000} كم` : `${value} م`}</Text></TouchableOpacity>)}</View><View style={styles.preview}><Svg width="150" height="150" viewBox="0 0 150 150"><Circle cx="75" cy="75" r={previewRadius} fill="#D9F2E9" stroke="#0B806A" strokeWidth="2" /><Line x1="75" y1="8" x2="75" y2="142" stroke="#A8D7C8" strokeDasharray="4 5" /><Line x1="8" y1="75" x2="142" y2="75" stroke="#A8D7C8" strokeDasharray="4 5" /><Circle cx="75" cy="75" r="8" fill="#075E54" stroke="#FFFFFF" strokeWidth="3" /></Svg><View style={styles.previewTextWrap}><Text style={styles.previewTitle}>معاينة نطاق التغطية</Text><Text style={styles.previewCopy}>{radiusMeters.toLocaleString("ar")} متر حول نقطة المركز المحددة</Text><Text style={styles.previewCoordinates}>{lat}, {lng}</Text></View></View><TouchableOpacity onPress={() => setShowCoordinates((value) => !value)} style={styles.advanced}><MaterialIcons name={showCoordinates ? "expand-less" : "tune"} size={18} color={palette.primary} /><Text style={styles.advancedText}>{showCoordinates ? "إخفاء الإحداثيات المتقدمة" : "تعديل الإحداثيات يدوياً عند الحاجة"}</Text></TouchableOpacity>{showCoordinates ? <View style={styles.advancedFields}><Field label="خط العرض Latitude" value={lat} onChangeText={setLat} keyboardType="decimal-pad" /><Field label="خط الطول Longitude" value={lng} onChangeText={setLng} keyboardType="decimal-pad" /><Field label="نطاق المنطقة بالمتر" value={radius} onChangeText={setRadius} keyboardType="number-pad" /></View> : null}<Text style={styles.label}>ملاحظة تشغيلية</Text><TextInput value={notes} onChangeText={setNotes} placeholder="مثال: يشمل المستشفى والعيادات المحيطة" placeholderTextColor="#93A099" textAlign="right" multiline style={styles.notes} /><PrimaryButton label="حفظ حدود المنطقة" icon="save" onPress={save} style={{ marginTop: 18 }} /></View> : null}</ScrollView></ScreenContainer>;
}

function Field({ label, value, onChangeText, keyboardType }: { label: string; value: string; onChangeText: (value: string) => void; keyboardType: "decimal-pad" | "number-pad" }) { return <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput value={value} onChangeText={onChangeText} textAlign="right" keyboardType={keyboardType} style={styles.input} /></View>; }

const styles = StyleSheet.create({
  content: { paddingTop: 10, paddingBottom: 30 }, back: { width: 40, height: 40, borderRadius: 14, backgroundColor: "#E9F8F2", alignItems: "center", justifyContent: "center" }, info: { flexDirection: "row", gap: 8, padding: 12, borderRadius: 15, backgroundColor: "#EFF6FF", alignItems: "flex-start" }, infoText: { color: "#285A8E", fontSize: 11, lineHeight: 17, flex: 1, textAlign: "right" }, sectionTitle: { color: palette.ink, fontSize: 15, fontWeight: "800", textAlign: "right", marginTop: 20, marginBottom: 9 }, territoryChoices: { flexDirection: "row-reverse", gap: 8 }, choice: { flex: 1, borderWidth: 1, borderColor: palette.line, borderRadius: 14, padding: 11, backgroundColor: "#FFFFFF", alignItems: "flex-end" }, choiceActive: { backgroundColor: "#E9F8F2", borderColor: "#9DD3C4" }, choiceText: { color: palette.ink, fontSize: 12, fontWeight: "800", textAlign: "right" }, choiceTextActive: { color: palette.primary }, choiceMeta: { color: palette.muted, fontSize: 10, marginTop: 3 }, form: { marginTop: 15, padding: 15, borderRadius: 19, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: palette.line }, boundaryName: { color: palette.ink, fontSize: 17, fontWeight: "800", textAlign: "right" }, boundaryMeta: { color: palette.muted, fontSize: 11, marginTop: 4, textAlign: "right" }, centerActions: { flexDirection: "row", gap: 8 }, centerButton: { flex: 1, minHeight: 45, borderRadius: 12, backgroundColor: palette.primary, flexDirection: "row", gap: 6, justifyContent: "center", alignItems: "center" }, centerButtonText: { color: "#FFFFFF", fontSize: 11, fontWeight: "900" }, centerSecondary: { minWidth: 112, minHeight: 45, borderRadius: 12, borderWidth: 1, borderColor: "#9DD3C4", backgroundColor: "#E9F8F2", flexDirection: "row", gap: 6, justifyContent: "center", alignItems: "center", paddingHorizontal: 10 }, centerSecondaryText: { color: palette.primary, fontSize: 11, fontWeight: "900" }, mapLink: { alignSelf: "flex-end", flexDirection: "row", gap: 5, alignItems: "center", marginTop: 10 }, mapLinkText: { color: palette.info, fontSize: 10, fontWeight: "800" }, radiusChoices: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 7 }, radiusChoice: { flex: 1, minWidth: "22%", borderWidth: 1, borderColor: palette.line, borderRadius: 10, paddingVertical: 10, alignItems: "center" }, radiusChoiceActive: { borderColor: "#9DD3C4", backgroundColor: "#E9F8F2" }, radiusChoiceText: { color: palette.muted, fontSize: 11, fontWeight: "800" }, radiusChoiceTextActive: { color: palette.primary }, preview: { marginTop: 15, minHeight: 150, borderRadius: 16, backgroundColor: "#F3FAF7", flexDirection: "row", alignItems: "center", padding: 8, gap: 5 }, previewTextWrap: { flex: 1, alignItems: "flex-end", paddingHorizontal: 5 }, previewTitle: { color: palette.ink, fontSize: 13, fontWeight: "900", textAlign: "right" }, previewCopy: { color: palette.success, fontSize: 10, marginTop: 5, lineHeight: 15, textAlign: "right" }, previewCoordinates: { color: palette.muted, fontSize: 9, marginTop: 7, textAlign: "right" }, advanced: { flexDirection: "row", justifyContent: "flex-end", alignItems: "center", gap: 6, marginTop: 14 }, advancedText: { color: palette.primary, fontSize: 11, fontWeight: "800" }, advancedFields: { marginTop: 4, paddingTop: 4 }, field: { marginTop: 12 }, label: { color: palette.ink, fontWeight: "800", fontSize: 12, textAlign: "right", marginBottom: 7 }, input: { minHeight: 45, borderWidth: 1, borderColor: palette.line, borderRadius: 12, paddingHorizontal: 12, color: palette.ink, fontSize: 13 }, notes: { minHeight: 82, borderWidth: 1, borderColor: palette.line, borderRadius: 12, padding: 12, color: palette.ink, fontSize: 13, textAlignVertical: "top" }, lockedTitle: { color: palette.ink, fontWeight: "900", fontSize: 19, marginTop: 12 }, lockedCopy: { color: palette.muted, fontSize: 13, lineHeight: 20, textAlign: "center", marginTop: 7 },
});
