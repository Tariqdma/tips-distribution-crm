import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useState } from "react";
import { palette } from "@/components/crm-ui";

export type TerritoryOption = { id: string; name: string; state: string; city: string };

export function TerritorySelect({
  territories,
  value,
  onChange,
  optional = false,
}: {
  territories: TerritoryOption[];
  value: string;
  onChange: (name: string) => void;
  optional?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = territories.find((territory) => territory.name === value);
  const label = selected ? `${selected.name} · ${selected.city}` : optional && !value ? "بدون منطقة محددة" : "اختر منطقة التغطية";

  return <View>
    <TouchableOpacity onPress={() => setOpen(true)} style={styles.trigger} accessibilityRole="button">
      <MaterialIcons name="expand-more" size={20} color={palette.primary} />
      <View style={styles.triggerTextWrap}><Text style={[styles.triggerText, !selected && !value && styles.placeholder]}>{label}</Text><Text style={styles.triggerHint}>من المناطق المعتمدة</Text></View>
      <MaterialIcons name="map" size={18} color={palette.primary} />
    </TouchableOpacity>
    <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
      <View style={styles.shade}>
        <View style={styles.sheet}>
          <View style={styles.header}><TouchableOpacity onPress={() => setOpen(false)} style={styles.close}><MaterialIcons name="close" size={20} color={palette.muted} /></TouchableOpacity><View style={styles.titleWrap}><Text style={styles.title}>اختر منطقة التغطية</Text><Text style={styles.copy}>تُدار المناطق وحدودها من شاشة «حدود المناطق».</Text></View></View>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.options}>
            {optional ? <Option label="بدون منطقة محددة" meta="يمكن تعيين المنطقة لاحقاً" active={!value} onPress={() => { onChange(""); setOpen(false); }} icon="remove-circle-outline" /> : null}
            {territories.map((territory) => <Option key={territory.id} label={territory.name} meta={`${territory.state} · ${territory.city}`} active={territory.name === value} onPress={() => { onChange(territory.name); setOpen(false); }} icon="location-on" />)}
            {!territories.length ? <View style={styles.empty}><MaterialIcons name="map" size={24} color={palette.muted} /><Text style={styles.emptyText}>لا توجد مناطق معتمدة بعد. أنشئ منطقة وحدد حدودها أولاً.</Text></View> : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  </View>;
}

function Option({ label, meta, active, onPress, icon }: { label: string; meta: string; active: boolean; onPress: () => void; icon: keyof typeof MaterialIcons.glyphMap }) {
  return <TouchableOpacity onPress={onPress} style={[styles.option, active && styles.optionActive]}><MaterialIcons name={active ? "check-circle" : icon} size={19} color={active ? palette.success : palette.primary} /><View style={styles.optionTextWrap}><Text style={[styles.optionLabel, active && styles.optionLabelActive]}>{label}</Text><Text style={styles.optionMeta}>{meta}</Text></View></TouchableOpacity>;
}

const styles = StyleSheet.create({
  trigger: { minHeight: 52, borderWidth: 1, borderColor: "#DCE8E3", backgroundColor: "#FFFFFF", borderRadius: 12, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 9 },
  triggerTextWrap: { flex: 1, alignItems: "flex-end" }, triggerText: { color: palette.ink, fontSize: 12, fontWeight: "800", textAlign: "right" }, placeholder: { color: "#94A39C", fontWeight: "500" }, triggerHint: { color: palette.muted, fontSize: 9, marginTop: 2, textAlign: "right" },
  shade: { flex: 1, backgroundColor: "rgba(8,35,29,.52)", alignItems: "center", justifyContent: "center", padding: 18 }, sheet: { width: "100%", maxWidth: 500, maxHeight: "76%", padding: 18, backgroundColor: "#FFFFFF", borderRadius: 22 },
  header: { flexDirection: "row", gap: 12, marginBottom: 13 }, close: { width: 34, height: 34, borderRadius: 10, backgroundColor: "#F1F6F4", alignItems: "center", justifyContent: "center" }, titleWrap: { flex: 1, alignItems: "flex-end" }, title: { color: palette.ink, fontSize: 16, fontWeight: "900", textAlign: "right" }, copy: { color: palette.muted, fontSize: 10, marginTop: 4, textAlign: "right" },
  options: { gap: 8 }, option: { minHeight: 60, padding: 12, borderWidth: 1, borderColor: "#E2EBE7", borderRadius: 13, flexDirection: "row", gap: 10, alignItems: "center" }, optionActive: { borderColor: "#9DD3C4", backgroundColor: "#E9F8F2" }, optionTextWrap: { flex: 1, alignItems: "flex-end" }, optionLabel: { color: palette.ink, fontSize: 12, fontWeight: "900", textAlign: "right" }, optionLabelActive: { color: palette.primary }, optionMeta: { color: palette.muted, fontSize: 10, marginTop: 3, textAlign: "right" },
  empty: { minHeight: 120, alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 25 }, emptyText: { color: palette.muted, fontSize: 11, lineHeight: 17, textAlign: "center" },
});
