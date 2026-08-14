import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { router } from "expo-router";
import { useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { AppHeader, PrimaryButton, palette } from "@/components/crm-ui";
import { ScreenContainer } from "@/components/screen-container";
import { type AccountType, useCrm } from "@/lib/crm-store";

const types: AccountType[] = ["طبيب", "صيدلية", "مستشفى", "موزع"];

export default function NewAccountScreen() {
  const { addAccount } = useCrm();
  const [name, setName] = useState("");
  const [type, setType] = useState<AccountType>("طبيب");
  const [specialty, setSpecialty] = useState("");
  const [city, setCity] = useState("الخرطوم");
  const [area, setArea] = useState("");
  const [address, setAddress] = useState("");
  const [contact, setContact] = useState("");
  const save = () => {
    if (!name.trim() || !area.trim() || !address.trim()) { Alert.alert("بيانات ناقصة", "أدخل اسم الجهة والمنطقة والعنوان قبل الحفظ."); return; }
    addAccount({ name: name.trim(), type, specialty: specialty.trim() || undefined, city: city.trim(), area: area.trim(), address: address.trim(), contact: contact.trim() || "غير مسجل", priority: "اعتيادية" });
    router.back();
  };
  return <ScreenContainer className="px-5" containerClassName="bg-background"><ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled"><AppHeader eyebrow="أضفها مرة لتظهر في الخطط والزيارات" title="جهة جديدة" right={<TouchableOpacity onPress={() => router.back()} style={styles.back}><MaterialIcons name="close" size={21} color={palette.primary} /></TouchableOpacity>} />
    <Text style={styles.label}>نوع الجهة</Text><View style={styles.types}>{types.map((item) => <TouchableOpacity key={item} onPress={() => setType(item)} style={[styles.type, item === type && styles.typeActive]}><Text style={[styles.typeText, item === type && styles.typeTextActive]}>{item}</Text></TouchableOpacity>)}</View>
    <Input label="اسم الجهة أو الطبيب" value={name} onChangeText={setName} placeholder="مثال: د. هناء علي" />
    {type === "طبيب" ? <Input label="التخصص" value={specialty} onChangeText={setSpecialty} placeholder="مثال: أطفال" /> : null}
    <Input label="المدينة" value={city} onChangeText={setCity} placeholder="الخرطوم" />
    <Input label="المنطقة" value={area} onChangeText={setArea} placeholder="مثال: العمارات" />
    <Input label="العنوان التفصيلي" value={address} onChangeText={setAddress} placeholder="الشارع أو اسم المبنى" />
    <Input label="رقم الهاتف" value={contact} onChangeText={setContact} placeholder="0912 000 000" keyboardType="phone-pad" />
    <PrimaryButton label="حفظ الجهة" icon="check" onPress={save} style={{ marginTop: 14 }} />
  </ScrollView></ScreenContainer>;
}

function Input({ label, value, onChangeText, placeholder, keyboardType }: { label: string; value: string; onChangeText: (value: string) => void; placeholder: string; keyboardType?: "default" | "phone-pad" }) { return <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor="#93A099" textAlign="right" keyboardType={keyboardType} style={styles.input} returnKeyType="done" /></View>; }
const styles = StyleSheet.create({ content: { paddingTop: 10, paddingBottom: 28 }, back: { width: 40, height: 40, borderRadius: 14, backgroundColor: "#E9F8F2", alignItems: "center", justifyContent: "center" }, label: { color: palette.ink, fontWeight: "800", fontSize: 13, textAlign: "right", marginBottom: 8 }, types: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 8, marginBottom: 19 }, type: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, borderColor: palette.line, backgroundColor: "#FFFFFF" }, typeActive: { backgroundColor: "#E9F8F2", borderColor: "#A9D8CC" }, typeText: { color: palette.muted, fontWeight: "700", fontSize: 12 }, typeTextActive: { color: palette.primary }, field: { marginBottom: 16 }, input: { minHeight: 49, borderRadius: 14, borderWidth: 1, borderColor: palette.line, backgroundColor: "#FFFFFF", color: palette.ink, fontSize: 14, paddingHorizontal: 13 } });
