import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import Svg, { Circle, Path, Rect } from "react-native-svg";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import type { Territory } from "@/lib/crm-store";
import { palette } from "@/components/crm-ui";

const markers = [
  { id: "t1", x: 92, y: 81, label: "العمارات", color: "#0D9488", count: 18 },
  { id: "t1", x: 180, y: 116, label: "الرياض", color: "#0D9488", count: 16 },
  { id: "t2", x: 271, y: 63, label: "بحري", color: "#2563EB", count: 21 },
];

export function TerritoryMap({ territories, activeId, onSelect }: { territories: Territory[]; activeId: string; onSelect: (id: string) => void }) {
  const focused = activeId === "all" ? markers : markers.filter((marker) => marker.id === activeId);
  return <View style={styles.wrap}>
    <View style={styles.mapCanvas}>
      <Svg width="100%" height="218" viewBox="0 0 360 218" preserveAspectRatio="none">
        <Rect x="0" y="0" width="360" height="218" fill="#EAF6F2" />
        <Path d="M-6 48 C50 28 77 70 124 52 S200 30 242 56 S315 83 370 46" stroke="#B8DED3" strokeWidth="17" fill="none" opacity="0.78" />
        <Path d="M-5 171 C48 151 81 189 131 165 S225 146 275 172 S332 187 370 164" stroke="#C3E4DC" strokeWidth="13" fill="none" opacity="0.72" />
        <Path d="M44 0 L109 218 M145 0 L205 218 M244 0 L285 218" stroke="#D6EAE4" strokeWidth="1.4" strokeDasharray="4 5" />
        <Path d="M0 91 H360 M0 140 H360" stroke="#D6EAE4" strokeWidth="1.4" strokeDasharray="4 5" />
        <Path d="M28 117 C76 86 108 113 152 91 S233 91 319 133" stroke="#F0B426" strokeWidth="3" fill="none" strokeDasharray="8 6" />
        {focused.map((marker) => <Circle key={marker.label} cx={marker.x} cy={marker.y} r="11" fill={marker.color} stroke="#FFFFFF" strokeWidth="4" />)}
      </Svg>
      {focused.map((marker) => <View key={`label-${marker.label}`} style={[styles.markerLabel, { left: `${(marker.x / 360) * 100}%`, top: marker.y + 16 }]}><Text style={styles.markerText}>{marker.label} · {marker.count}</Text></View>)}
      <View style={styles.mapBadge}><MaterialIcons name="route" size={15} color={palette.primary} /><Text style={styles.mapBadgeText}>مسار التغطية</Text></View>
    </View>
    <View style={styles.filters}>
      <TouchableOpacity onPress={() => onSelect("all")} style={[styles.filter, activeId === "all" && styles.filterActive]}><Text style={[styles.filterText, activeId === "all" && styles.filterTextActive]}>كل المناطق</Text></TouchableOpacity>
      {territories.map((territory) => <TouchableOpacity key={territory.id} onPress={() => onSelect(territory.id)} style={[styles.filter, activeId === territory.id && styles.filterActive]}><Text style={[styles.filterText, activeId === territory.id && styles.filterTextActive]}>{territory.name}</Text></TouchableOpacity>)}
    </View>
    <View style={styles.legend}><View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: "#0D9488" }]} /><Text style={styles.legendText}>زيارة مؤكدة</Text></View><View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: "#2563EB" }]} /><Text style={styles.legendText}>زيارة مخططة</Text></View><View style={styles.legendItem}><View style={[styles.legendDash]} /><Text style={styles.legendText}>خط السير</Text></View></View>
  </View>;
}

const styles = StyleSheet.create({
  wrap: { backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: palette.line, borderRadius: 19, overflow: "hidden" },
  mapCanvas: { height: 218, backgroundColor: "#EAF6F2", position: "relative", overflow: "hidden" },
  markerLabel: { position: "absolute", transform: [{ translateX: -31 }], backgroundColor: "#FFFFFF", paddingHorizontal: 7, paddingVertical: 4, borderRadius: 8, shadowColor: "#173B32", shadowOpacity: 0.1, shadowRadius: 4, elevation: 2 },
  markerText: { color: palette.ink, fontSize: 9, fontWeight: "800", textAlign: "center" },
  mapBadge: { position: "absolute", top: 12, right: 12, backgroundColor: "#FFFFFF", paddingHorizontal: 9, paddingVertical: 6, borderRadius: 10, flexDirection: "row", alignItems: "center", gap: 5 },
  mapBadgeText: { color: palette.primary, fontSize: 10, fontWeight: "800" },
  filters: { flexDirection: "row-reverse", gap: 7, padding: 11, borderTopWidth: 1, borderTopColor: "#EDF1EF" },
  filter: { flex: 1, paddingVertical: 8, paddingHorizontal: 6, borderRadius: 10, borderWidth: 1, borderColor: palette.line, alignItems: "center" },
  filterActive: { backgroundColor: "#E9F8F2", borderColor: "#A6D6C9" },
  filterText: { color: palette.muted, fontSize: 10, fontWeight: "700" },
  filterTextActive: { color: palette.primary },
  legend: { flexDirection: "row-reverse", justifyContent: "center", gap: 12, paddingBottom: 12 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  legendDot: { width: 7, height: 7, borderRadius: 4 },
  legendDash: { width: 12, borderTopWidth: 2, borderColor: "#F0B426", borderStyle: "dashed" },
  legendText: { color: palette.muted, fontSize: 9 },
});
