import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useState } from "react";
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { palette } from "@/components/crm-ui";
import type { TerritoryOption } from "@/components/territory-select";

export function MultiTerritorySelect({ territories, values, onChange, optional = false }: { territories: TerritoryOption[]; values: string[]; onChange: (territoryIds: string[]) => void; optional?: boolean }) {
  const [open, setOpen] = useState(false);
  const selected = territories.filter((territory) => values.includes(territory.id));
  const label = selected.length ? selected.map((territory) => territory.name).join("، ") : optional ? "بدون منطقة محددة" : "اختر مناطق العمل";
  const toggle = (territoryId: string) => onChange(values.includes(territoryId) ? values.filter((item) => item !== territoryId) : [...values, territoryId]);

  return <View>
    <TouchableOpacity onPress={() => setOpen(true)} style={styles.trigger} accessibilityRole="button">
      <MaterialIcons name="expand-more" size={20} color={palette.primary} />
      <View style={styles.triggerTextWrap}><Text numberOfLines={2} style={[styles.triggerText, !selected.length && styles.placeholder]}>{label}</Text><Text style={styles.triggerHint}>{selected.length ? `${selected.length} منطقة/مناطق عمل` : "من المناطق المعتمدة"}</Text></View>
      <MaterialIcons name="map" size={18} color={palette.primary} />
    </TouchableOpacity>
    <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
      <View style={styles.shade}>
        <View style={styles.sheet}>
          <View style={styles.header}><TouchableOpacity onPress={() => setOpen(false)} style={styles.close}><MaterialIcons name="close" size={20} color={palette.muted} /></TouchableOpacity><View style={styles.titleWrap}><Text style={styles.title}>مناطق عمل الموظف</Text><Text style={styles.copy}>يمكن للمندوب تنفيذ الزيارات والدوام داخل أي منطقة تختارها هنا.</Text></View></View>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.options}>
            {optional ? <TouchableOpacity onPress={() => onChange([])} style={[styles.option, !values.length && styles.optionActive]}><MaterialIcons name={!values.length ? "check-circle" : "remove-circle-outline"} size={20} color={!values.length ? palette.success : palette.primary} /><View style={styles.optionTextWrap}><Text style={styles.optionLabel}>بدون منطقة محددة</Text><Text style={styles.optionMeta}>متاح للمدير فقط</Text></View></TouchableOpacity> : null}
            {territories.map((territory) => { const active = values.includes(territory.id); return <TouchableOpacity key={territory.id} onPress={() => toggle(territory.id)} style={[styles.option, active && styles.optionActive]}><MaterialIcons name={active ? "check-circle" : "add-circle-outline"} size={20} color={active ? palette.success : palette.primary} /><View style={styles.optionTextWrap}><Text style={[styles.optionLabel, active && styles.optionLabelActive]}>{territory.name}</Text><Text style={styles.optionMeta}>{territory.state} · {territory.city}</Text></View></TouchableOpacity>; })}
            {!territories.length ? <View style={styles.empty}><MaterialIcons name="map" size={24} color={palette.muted} /><Text style={styles.emptyText}>لا توجد مناطق معتمدة بعد. أضف حدود منطقة أولاً.</Text></View> : null}
          </ScrollView>
          <TouchableOpacity onPress={() => setOpen(false)} style={styles.done}><MaterialIcons name="check" size={18} color="#FFFFFF" /><Text style={styles.doneText}>حفظ الاختيار</Text></TouchableOpacity>
        </View>
      </View>
    </Modal>
  </View>;
}

const styles = StyleSheet.create({
  trigger: { minHeight: 56, borderWidth: 1, borderColor: "#DCE8E3", backgroundColor: "#FFFFFF", borderRadius: 12, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 9 },
  triggerTextWrap: { flex: 1, alignItems: "flex-end" }, triggerText: { color: palette.ink, fontSize: 12, fontWeight: "800", textAlign: "right", lineHeight: 18 }, placeholder: { color: "#94A39C", fontWeight: "500" }, triggerHint: { color: palette.muted, fontSize: 9, marginTop: 2, textAlign: "right" },
  shade: { flex: 1, backgroundColor: "rgba(8,35,29,.52)", alignItems: "center", justifyContent: "center", padding: 18 }, sheet: { width: "100%", maxWidth: 500, maxHeight: "80%", padding: 18, backgroundColor: "#FFFFFF", borderRadius: 22 },
  header: { flexDirection: "row", gap: 12, marginBottom: 13 }, close: { width: 34, height: 34, borderRadius: 10, backgroundColor: "#F1F6F4", alignItems: "center", justifyContent: "center" }, titleWrap: { flex: 1, alignItems: "flex-end" }, title: { color: palette.ink, fontSize: 16, fontWeight: "900", textAlign: "right" }, copy: { color: palette.muted, fontSize: 10, marginTop: 4, textAlign: "right", lineHeight: 15 },
  options: { gap: 8, paddingBottom: 12 }, option: { minHeight: 60, padding: 12, borderWidth: 1, borderColor: "#E2EBE7", borderRadius: 13, flexDirection: "row", gap: 10, alignItems: "center" }, optionActive: { borderColor: "#9DD3C4", backgroundColor: "#E9F8F2" }, optionTextWrap: { flex: 1, alignItems: "flex-end" }, optionLabel: { color: palette.ink, fontSize: 12, fontWeight: "900", textAlign: "right" }, optionLabelActive: { color: palette.primary }, optionMeta: { color: palette.muted, fontSize: 10, marginTop: 3, textAlign: "right" },
  done: { height: 44, borderRadius: 12, backgroundColor: palette.primary, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 4 }, doneText: { color: "#FFFFFF", fontWeight: "900", fontSize: 12 },
  empty: { minHeight: 120, alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 25 }, emptyText: { color: palette.muted, fontSize: 11, lineHeight: 17, textAlign: "center" },
});
