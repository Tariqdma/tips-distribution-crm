import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import Svg, { Circle, Path, Rect } from "react-native-svg";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import type { Territory } from "@/lib/crm-store";
import { palette } from "@/components/crm-ui";

const points = [
  { id: "t1", x: 95, y: 80, label: "العمارات", count: 18, color: "#0D9488" },
  { id: "t1", x: 181, y: 119, label: "الرياض", count: 16, color: "#0D9488" },
  { id: "t2", x: 272, y: 64, label: "بحري", count: 21, color: "#2563EB" },
];

export function TerritoryMap({ territories, activeId, onSelect }: { territories: Territory[]; activeId: string; onSelect: (id: string) => void }) {
  const focused = activeId === "all" ? points : points.filter((point) => point.id === activeId);
  const isT1 = activeId === "all" || activeId === "t1";
  const isT2 = activeId === "all" || activeId === "t2";
  return <View style={styles.wrap}>
    <View style={styles.mapCanvas}>
      <Svg width="100%" height="228" viewBox="0 0 360 228" preserveAspectRatio="none">
        <Rect x="0" y="0" width="360" height="228" fill="#EAF6F2" />
        <Path d="M-6 48 C50 28 77 70 124 52 S200 30 242 56 S315 83 370 46" stroke="#B8DED3" strokeWidth="17" fill="none" opacity="0.78" />
        <Path d="M-5 176 C48 151 81 189 131 165 S225 146 275 172 S332 187 370 164" stroke="#C3E4DC" strokeWidth="13" fill="none" opacity="0.72" />
        <Path d="M31 113 C80 80 130 104 185 95 S268 109 332 137" stroke="#F0B426" strokeWidth="3" fill="none" strokeDasharray="8 6" />
        <Path d="M37 66 L157 38 L225 109 L146 167 L50 143 Z" fill={isT1 ? "#0D94881B" : "#E2EEEA"} stroke={isT1 ? "#0D9488" : "#A9C9C0"} strokeWidth="1.4" strokeDasharray="5 4" />
        <Path d="M228 37 L334 48 L346 133 L238 155 L211 103 Z" fill={isT2 ? "#2563EB18" : "#E2EEEA"} stroke={isT2 ? "#2563EB" : "#A9C9C0"} strokeWidth="1.4" strokeDasharray="5 4" />
        {focused.map((point) => <Circle key={point.label} cx={point.x} cy={point.y} r="11" fill={point.color} stroke="#FFFFFF" strokeWidth="4" />)}
      </Svg>
      {focused.map((point) => <TouchableOpacity key={`point-${point.label}`} onPress={() => onSelect(point.id)} style={[styles.pinLabel, { left: `${(point.x / 360) * 100}%`, top: point.y + 16 }]}><Text style={styles.pinText}>{point.label} · {point.count}</Text></TouchableOpacity>)}
      <View style={styles.mapBadge}><MaterialIcons name="gesture" size={15} color={palette.primary} /><Text style={styles.mapBadgeText}>اضغط على المنطقة</Text></View>
    </View>
    <View style={styles.filters}><TouchableOpacity onPress={() => onSelect("all")} style={[styles.filter, activeId === "all" && styles.filterActive]}><Text style={[styles.filterText, activeId === "all" && styles.filterTextActive]}>كل المناطق</Text></TouchableOpacity>{territories.map((territory) => <TouchableOpacity key={territory.id} onPress={() => onSelect(territory.id)} style={[styles.filter, activeId === territory.id && styles.filterActive]}><Text style={[styles.filterText, activeId === territory.id && styles.filterTextActive]}>{territory.name}</Text></TouchableOpacity>)}</View>
    <View style={styles.legend}><View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: "#0D9488" }]} /><Text style={styles.legendText}>تغطية مؤكدة</Text></View><View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: "#2563EB" }]} /><Text style={styles.legendText}>تغطية مخططة</Text></View><View style={styles.legendItem}><View style={styles.legendDash} /><Text style={styles.legendText}>مسار مقترح</Text></View></View>
  </View>;
}

const styles = StyleSheet.create({ wrap: { backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: palette.line, borderRadius: 19, overflow: "hidden" }, mapCanvas: { height: 228, backgroundColor: "#EAF6F2", position: "relative", overflow: "hidden" }, pinLabel: { position: "absolute", transform: [{ translateX: -31 }], backgroundColor: "#FFFFFF", paddingHorizontal: 7, paddingVertical: 4, borderRadius: 8, shadowColor: "#173B32", shadowOpacity: 0.1, shadowRadius: 4, elevation: 2 }, pinText: { color: palette.ink, fontSize: 9, fontWeight: "800", textAlign: "center" }, mapBadge: { position: "absolute", top: 12, right: 12, backgroundColor: "#FFFFFF", paddingHorizontal: 9, paddingVertical: 6, borderRadius: 10, flexDirection: "row", alignItems: "center", gap: 5 }, mapBadgeText: { color: palette.primary, fontSize: 10, fontWeight: "800" }, filters: { flexDirection: "row-reverse", gap: 7, padding: 11, borderTopWidth: 1, borderTopColor: "#EDF1EF" }, filter: { flex: 1, paddingVertical: 8, paddingHorizontal: 6, borderRadius: 10, borderWidth: 1, borderColor: palette.line, alignItems: "center" }, filterActive: { backgroundColor: "#E9F8F2", borderColor: "#A6D6C9" }, filterText: { color: palette.muted, fontSize: 10, fontWeight: "700" }, filterTextActive: { color: palette.primary }, legend: { flexDirection: "row-reverse", justifyContent: "center", gap: 12, paddingBottom: 12 }, legendItem: { flexDirection: "row", alignItems: "center", gap: 4 }, legendDot: { width: 7, height: 7, borderRadius: 4 }, legendDash: { width: 12, borderTopWidth: 2, borderColor: "#F0B426", borderStyle: "dashed" }, legendText: { color: palette.muted, fontSize: 9 } });
