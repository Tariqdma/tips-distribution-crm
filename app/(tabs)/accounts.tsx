import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { FlatList, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { AccountAvatar, AppHeader, SectionTitle, palette } from "@/components/crm-ui";
import { ScreenContainer } from "@/components/screen-container";
import { type AccountType, useCrm } from "@/lib/crm-store";

const filters: Array<"الكل" | AccountType> = ["الكل", "طبيب", "صيدلية", "مستشفى", "موزع"];

export default function AccountsScreen() {
  const { data } = useCrm();
  const [filter, setFilter] = useState<(typeof filters)[number]>("الكل");
  const [query, setQuery] = useState("");
  const accounts = useMemo(() => data.accounts.filter((account) => (filter === "الكل" || account.type === filter) && `${account.name} ${account.area} ${account.city}`.includes(query.trim())), [data.accounts, filter, query]);

  return <ScreenContainer className="px-5" containerClassName="bg-background">
    <FlatList
      data={accounts}
      keyExtractor={(item) => item.id}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.content}
      ListHeaderComponent={<>
        <AppHeader eyebrow="قاعدة جهاتك الميدانية" title="الجهات والعملاء" right={<TouchableOpacity onPress={() => router.push("/account/new" as never)} style={styles.addButton}><MaterialIcons name="add" size={22} color="#FFFFFF" /></TouchableOpacity>} />
        <View style={styles.search}><MaterialIcons name="search" size={20} color={palette.muted} /><TextInput value={query} onChangeText={setQuery} placeholder="ابحث بالاسم أو المنطقة" placeholderTextColor="#8A9690" textAlign="right" style={styles.searchInput} /></View>
        <FlatList horizontal inverted data={filters} showsHorizontalScrollIndicator={false} keyExtractor={(item) => item} contentContainerStyle={styles.filterList} renderItem={({ item }) => <TouchableOpacity onPress={() => setFilter(item)} style={[styles.filter, filter === item && styles.filterSelected]}><Text style={[styles.filterText, filter === item && styles.filterSelectedText]}>{item}</Text></TouchableOpacity>} />
        <SectionTitle title={`${accounts.length} جهة ضمن نطاقك`} />
      </>}
      renderItem={({ item }) => <TouchableOpacity style={styles.card} activeOpacity={0.78} onPress={() => router.push(`/account/${item.id}` as never)}><AccountAvatar account={item} size={50} /><View style={styles.cardBody}><View style={styles.cardTop}><View style={[styles.priority, item.priority === "عالية" && styles.priorityHigh]}><Text style={[styles.priorityText, item.priority === "عالية" && styles.priorityHighText]}>{item.priority}</Text></View><Text style={styles.accountName}>{item.name}</Text></View><Text style={styles.accountMeta}>{item.type}{item.specialty ? ` · ${item.specialty}` : ""} · {item.city}</Text><View style={styles.cardFoot}><View style={styles.lastVisit}><MaterialIcons name="schedule" size={14} color={palette.muted} /><Text style={styles.lastVisitText}>{item.lastVisit}</Text></View><Text style={styles.area}>{item.area}</Text></View></View><MaterialIcons name="chevron-left" size={22} color="#A1ACA7" /></TouchableOpacity>}
      ListEmptyComponent={<View style={styles.empty}><MaterialIcons name="search-off" size={34} color={palette.muted} /><Text style={styles.emptyText}>لا توجد جهات مطابقة للبحث.</Text></View>}
    />
  </ScreenContainer>;
}

const styles = StyleSheet.create({
  content: { paddingTop: 10, paddingBottom: 26 },
  addButton: { width: 40, height: 40, borderRadius: 14, backgroundColor: palette.primary, alignItems: "center", justifyContent: "center" },
  search: { height: 50, flexDirection: "row", gap: 9, alignItems: "center", paddingHorizontal: 14, borderRadius: 15, borderColor: palette.line, borderWidth: 1, backgroundColor: "#FFFFFF" },
  searchInput: { flex: 1, height: "100%", color: palette.ink, fontSize: 14 },
  filterList: { gap: 8, paddingVertical: 14 },
  filter: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 13, backgroundColor: "#FFFFFF", borderColor: palette.line, borderWidth: 1 },
  filterSelected: { backgroundColor: "#E8F5F1", borderColor: "#A9D8CC" },
  filterText: { color: palette.muted, fontWeight: "700", fontSize: 12 },
  filterSelectedText: { color: palette.primary },
  card: { minHeight: 92, flexDirection: "row", alignItems: "center", gap: 11, padding: 13, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: palette.line, borderRadius: 18, marginBottom: 10 },
  cardBody: { flex: 1, alignItems: "flex-end" },
  cardTop: { alignSelf: "stretch", flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  accountName: { color: palette.ink, fontSize: 15, fontWeight: "800", textAlign: "right", flexShrink: 1 },
  accountMeta: { color: palette.muted, fontSize: 12, marginTop: 3, textAlign: "right" },
  cardFoot: { alignSelf: "stretch", flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 10 },
  area: { color: palette.primary, fontSize: 11, fontWeight: "700" },
  lastVisit: { flexDirection: "row", gap: 4, alignItems: "center" },
  lastVisitText: { color: palette.muted, fontSize: 10 },
  priority: { backgroundColor: "#F1F4F2", paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8 },
  priorityHigh: { backgroundColor: "#FFF0E8" },
  priorityText: { color: palette.muted, fontSize: 10, fontWeight: "700" },
  priorityHighText: { color: "#B6501A" },
  empty: { alignItems: "center", paddingVertical: 44, gap: 10 },
  emptyText: { color: palette.muted, fontSize: 14 },
});
