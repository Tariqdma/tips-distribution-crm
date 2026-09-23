import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { Linking, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { palette } from "@/components/crm-ui";
import type { TerritoryBoundary } from "@/lib/crm-store";

export type GeographicRep = { id: string; name: string; territory: string; latitude: number; longitude: number; outsideTerritory?: boolean; path?: Array<{ latitude: number; longitude: number }> };
export type GeographicMapProps = { boundaries: TerritoryBoundary[]; reps?: GeographicRep[]; height?: number; onMapPress?: (point: { latitude: number; longitude: number }) => void };

export function GeographicMap({ boundaries, reps = [] }: GeographicMapProps) {
  return <View style={styles.wrap}><MaterialIcons name="map" size={30} color={palette.primary} /><Text style={styles.title}>الخريطة الجغرافية متاحة من لوحة الويب</Text><Text style={styles.copy}>تضم {boundaries.length} منطقة و{reps.length} موقعاً مباشراً. يمكن فتح خريطة العالم من الجهاز للتنقل.</Text><TouchableOpacity onPress={() => void Linking.openURL("https://www.openstreetmap.org/")} style={styles.button}><MaterialIcons name="open-in-new" size={16} color="#FFFFFF" /><Text style={styles.buttonText}>فتح الخريطة</Text></TouchableOpacity></View>;
}

const styles = StyleSheet.create({ wrap: { minHeight: 185, borderRadius: 18, backgroundColor: "#EAF6F2", alignItems: "center", justifyContent: "center", padding: 20, gap: 8 }, title: { color: palette.ink, fontSize: 13, fontWeight: "900", textAlign: "center" }, copy: { color: palette.muted, fontSize: 10, lineHeight: 16, textAlign: "center" }, button: { marginTop: 5, flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: palette.primary, paddingHorizontal: 13, paddingVertical: 9, borderRadius: 10 }, buttonText: { color: "#FFFFFF", fontSize: 11, fontWeight: "900" } });
