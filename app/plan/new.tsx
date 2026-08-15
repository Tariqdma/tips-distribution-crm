import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { AccountAvatar, AppHeader, PrimaryButton, palette } from "@/components/crm-ui";
import { ScreenContainer } from "@/components/screen-container";
import { type Plan, useCrm } from "@/lib/crm-store";
import { buildFutureWeeks, buildPlanSchedule } from "@/lib/plan-scheduling";

export default function NewPlanScreen() {
  const { data, submitPlan } = useCrm();
  const weeks = useMemo(() => buildFutureWeeks(), []);
  const [kind, setKind] = useState<Plan["kind"]>("أسبوعية");
  const [isWeekMenuOpen, setWeekMenuOpen] = useState(false);
  const [weekId, setWeekId] = useState(weeks[0].id);
  const [assignments, setAssignments] = useState<Record<string, string>>({});
  const selectedWeek = weeks.find((week) => week.id === weekId) ?? weeks[0];
  const planned = useMemo(() => buildPlanSchedule(selectedWeek, assignments), [selectedWeek, assignments]);
  const scheduledCount = planned.plannedVisits.length;

  const chooseWeek = (id: string) => { setWeekId(id); setWeekMenuOpen(false); setAssignments({}); };
  const assignAccount = (accountId: string, dayId: string) => setAssignments((current) => current[accountId] === dayId ? Object.fromEntries(Object.entries(current).filter(([id]) => id !== accountId)) : { ...current, [accountId]: dayId });
  const submit = () => {
    if (scheduledCount === 0) {
      Alert.alert("الخطة غير مكتملة", "اختر جهة واحدة على الأقل ثم حدّد يوم زيارتها داخل الأسبوع.");
      return;
    }
    submitPlan({
      title: `${kind === "أسبوعية" ? "خطة أسبوع" : "خطة شهر"} ${selectedWeek.label}`,
      period: selectedWeek.label,
      kind,
      visitIds: planned.visitIds,
      schedule: planned.schedule,
      plannedVisits: planned.plannedVisits,
      startsOn: selectedWeek.startsOn,
      endsOn: kind === "أسبوعية" ? selectedWeek.endsOn : undefined,
    });
    Alert.alert("تم إرسال الخطة", "أُضيفت الجهات المختارة كزيارات مجدولة وأُرسلت الخطة لاعتماد الإدارة.", [{ text: "حسناً", onPress: () => router.replace("/(tabs)/plans" as never) }]);
  };

  return <ScreenContainer className="px-5" containerClassName="bg-background"><ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}><AppHeader eyebrow="اختر أسبوعاً قادماً، ثم أضف الجهات وحدد يوم زيارة كل جهة" title="خطة جديدة" right={<TouchableOpacity onPress={() => router.back()} style={styles.back}><MaterialIcons name="close" size={21} color={palette.primary} /></TouchableOpacity>} />
    <View style={styles.kindRow}>{(["أسبوعية", "شهرية"] as Plan["kind"][]).map((item) => <TouchableOpacity key={item} style={[styles.kind, kind === item && styles.kindActive]} onPress={() => setKind(item)}><Text style={[styles.kindText, kind === item && styles.kindTextActive]}>{item}</Text></TouchableOpacity>)}</View>
    <View style={styles.notice}><MaterialIcons name="lock-outline" size={18} color={palette.info} /><Text style={styles.noticeText}>تظهر الأسابيع القادمة فقط. اختر أسبوعاً ثم أضف الجهات من القائمة أسفل الأيام.</Text></View>
    <Text style={styles.sectionLabel}>{kind === "أسبوعية" ? "اختر أسبوع الخطة" : "اختر أسبوع البداية للخطة الشهرية"}</Text>
    <TouchableOpacity onPress={() => setWeekMenuOpen((current) => !current)} style={styles.weekSelect}><MaterialIcons name={isWeekMenuOpen ? "expand-less" : "expand-more"} size={23} color={palette.primary} /><View style={styles.weekTextWrap}><Text style={styles.weekSelectTitle}>{selectedWeek.label}</Text><Text style={styles.weekSelectHint}>اضغط لعرض الأسابيع القادمة</Text></View><View style={styles.calendar}><MaterialIcons name="calendar-month" size={21} color={palette.primary} /></View></TouchableOpacity>
    {isWeekMenuOpen ? <View style={styles.weekMenu}>{weeks.map((week) => <TouchableOpacity key={week.id} onPress={() => chooseWeek(week.id)} style={[styles.weekOption, week.id === selectedWeek.id && styles.weekOptionActive]}><MaterialIcons name={week.id === selectedWeek.id ? "check-circle" : "calendar-today"} size={18} color={week.id === selectedWeek.id ? palette.success : palette.muted} /><Text style={[styles.weekOptionText, week.id === selectedWeek.id && styles.weekOptionTextActive]}>{week.label}</Text></TouchableOpacity>)}</View> : null}
    <Text style={styles.sectionLabel}>الزيارات المختارة · {scheduledCount} من {data.accounts.length} جهات</Text>
    <View style={styles.daySummary}>{planned.schedule.map((day) => <View key={day.id} style={styles.dayPill}><Text style={styles.dayPillCount}>{day.visitIds.length}</Text><Text style={styles.dayPillLabel}>{day.label.slice(0, 3)}</Text></View>)}</View>
    <Text style={styles.helper}>اضغط على يوم واحد أمام كل جهة لإضافتها إلى الخطة. اضغط اليوم نفسه مرة ثانية لإزالة الجهة من الخطة.</Text>
    <View style={styles.visits}>{data.accounts.map((account) => <View key={account.id} style={styles.visit}><AccountAvatar account={account} size={38} /><View style={styles.visitText}><Text style={styles.visitName}>{account.name}</Text><Text style={styles.visitMeta}>{account.type} · {account.area || account.city}</Text><View style={styles.dayChoices}>{selectedWeek.days.map((day) => { const active = assignments[account.id] === day.id; return <TouchableOpacity key={day.id} onPress={() => assignAccount(account.id, day.id)} style={[styles.dayChoice, active && styles.dayChoiceActive]}><Text style={[styles.dayChoiceText, active && styles.dayChoiceTextActive]}>{day.label.slice(0, 3)}</Text></TouchableOpacity>; })}</View></View></View>)}</View>
    {!data.accounts.length ? <View style={styles.empty}><MaterialIcons name="business" size={28} color={palette.muted} /><Text style={styles.emptyText}>أضف جهة واحدة على الأقل قبل إنشاء الخطة.</Text></View> : null}
    <PrimaryButton label="إرسال للاعتماد" icon="send" onPress={submit} style={{ marginTop: 20 }} />
  </ScrollView></ScreenContainer>;
}

const styles = StyleSheet.create({ content: { paddingTop: 10, paddingBottom: 30 }, back: { width: 40, height: 40, borderRadius: 14, backgroundColor: "#E9F8F2", alignItems: "center", justifyContent: "center" }, kindRow: { flexDirection: "row-reverse", gap: 8, marginBottom: 12 }, kind: { flex: 1, padding: 12, alignItems: "center", borderRadius: 13, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: palette.line }, kindActive: { backgroundColor: "#E9F8F2", borderColor: "#A9D8CC" }, kindText: { color: palette.muted, fontWeight: "700", fontSize: 13 }, kindTextActive: { color: palette.primary }, notice: { flexDirection: "row", alignItems: "center", gap: 8, padding: 11, borderRadius: 14, backgroundColor: "#EFF6FF" }, noticeText: { flex: 1, color: "#285A8E", fontSize: 11, lineHeight: 17, textAlign: "right" }, sectionLabel: { color: palette.ink, fontSize: 14, fontWeight: "800", textAlign: "right", marginTop: 21, marginBottom: 9 }, weekSelect: { minHeight: 68, backgroundColor: "#FFFFFF", borderRadius: 16, padding: 12, borderWidth: 1, borderColor: "#B8D7CF", flexDirection: "row", alignItems: "center", gap: 10 }, calendar: { height: 38, width: 38, borderRadius: 12, backgroundColor: "#E9F8F2", alignItems: "center", justifyContent: "center" }, weekTextWrap: { flex: 1, alignItems: "flex-end" }, weekSelectTitle: { color: palette.ink, fontSize: 14, fontWeight: "800", textAlign: "right", lineHeight: 22 }, weekSelectHint: { color: palette.muted, fontSize: 10, marginTop: 3, textAlign: "right" }, weekMenu: { backgroundColor: "#FFFFFF", borderColor: palette.line, borderWidth: 1, borderRadius: 16, overflow: "hidden", marginTop: 7 }, weekOption: { flexDirection: "row", gap: 8, alignItems: "center", padding: 13, borderBottomWidth: 1, borderBottomColor: "#EDF1EF" }, weekOptionActive: { backgroundColor: "#EFFAF6" }, weekOptionText: { flex: 1, color: palette.ink, fontSize: 12, fontWeight: "700", textAlign: "right" }, weekOptionTextActive: { color: palette.primary }, daySummary: { flexDirection: "row-reverse", gap: 5 }, dayPill: { flex: 1, paddingVertical: 8, borderRadius: 11, alignItems: "center", backgroundColor: "#FFFFFF", borderColor: palette.line, borderWidth: 1 }, dayPillCount: { color: palette.primary, fontSize: 15, fontWeight: "800" }, dayPillLabel: { color: palette.muted, fontSize: 9, marginTop: 2 }, helper: { color: palette.muted, lineHeight: 18, fontSize: 11, textAlign: "right", marginTop: 10 }, visits: { gap: 10, marginTop: 11 }, visit: { backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: palette.line, borderRadius: 17, padding: 11, flexDirection: "row", gap: 10, alignItems: "flex-start" }, visitText: { flex: 1, alignItems: "flex-end" }, visitName: { color: palette.ink, fontWeight: "800", fontSize: 14, textAlign: "right" }, visitMeta: { color: palette.muted, fontSize: 10, marginTop: 3, textAlign: "right" }, dayChoices: { flexDirection: "row-reverse", gap: 4, marginTop: 10, alignSelf: "stretch" }, dayChoice: { flex: 1, alignItems: "center", paddingVertical: 7, borderRadius: 8, borderWidth: 1, borderColor: palette.line, backgroundColor: "#FAFBFA" }, dayChoiceActive: { backgroundColor: palette.primary, borderColor: palette.primary }, dayChoiceText: { color: palette.muted, fontWeight: "700", fontSize: 9 }, dayChoiceTextActive: { color: "#FFFFFF" }, empty: { minHeight: 130, gap: 9, alignItems: "center", justifyContent: "center", backgroundColor: "#FFFFFF", borderRadius: 17, borderWidth: 1, borderColor: palette.line, marginTop: 11 }, emptyText: { color: palette.muted, fontSize: 12, textAlign: "center" } });
