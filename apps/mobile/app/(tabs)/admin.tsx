import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useEffect, useMemo, useState } from "react";
import { Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, useWindowDimensions } from "react-native";

import { AppHeader, MetricCard, PrimaryButton, SectionTitle, StatusBadge, palette } from "@/components/crm-ui";
import { LiveDutyMap, type LiveRepPosition } from "@/components/live-duty-map";
import { ScreenContainer } from "@/components/screen-container";
import { getApiBaseUrl } from "@/constants/oauth";
import { TerritoryMap } from "@/components/territory-map";
import { NotificationButton } from "@/components/notification-button";
import { useOperationalRole } from "@/hooks/use-operational-role";
import { useCrm } from "@/lib/crm-store";
import { useSupabaseAuth } from "@/lib/supabase-auth";
import { trpc } from "@/lib/trpc";
import { router } from "expo-router";

function ManagerShortcut({ icon, label, onPress }: { icon: keyof typeof MaterialIcons.glyphMap; label: string; onPress: () => void }) {
  return <TouchableOpacity onPress={onPress} style={styles.mobileControlAction} accessibilityRole="button" accessibilityLabel={label}><MaterialIcons name={icon} size={17} color={palette.primary} /><Text style={styles.mobileControlActionText}>{label}</Text></TouchableOpacity>;
}

export function AdminDashboard() {
  const { data, approvePlan, returnPlan, accountById, addVisitResult, role: localRole, unreadNotificationCount } = useCrm();
  const operational = useOperationalRole(localRole);
  const { profile, session, signOut } = useSupabaseAuth();
  const isCompanyManager = profile?.role_key === "company_manager" || profile?.role_key === "sales_manager" || (profile?.role_key === "system_admin" && !profile.is_platform_admin);
  const role = isCompanyManager ? "مدير" : operational.role;
  const { width } = useWindowDimensions();
  const isWide = Platform.OS === "web" && width >= 800;
  const isPhone = width < 800;
  const isCompact = width < 390;
  const [activeTerritory, setActiveTerritory] = useState("all");
  const [selectedRepId, setSelectedRepId] = useState("");
  const [newResult, setNewResult] = useState("");
  const [companySetupReady, setCompanySetupReady] = useState<boolean | null>(null);
  const [companyTeamReady, setCompanyTeamReady] = useState<boolean | null>(null);
  const [companyTerritoryReady, setCompanyTerritoryReady] = useState<boolean | null>(null);
  const [companyAccountReady, setCompanyAccountReady] = useState<boolean | null>(null);

  useEffect(() => {
    if (!isCompanyManager || !session?.access_token) return;
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(`${getApiBaseUrl()}/api/company/setup`, { headers: { Authorization: `Bearer ${session.access_token}` } });
        const payload = await response.json().catch(() => ({})) as { setup?: { isSetupComplete?: boolean } };
        if (!cancelled) setCompanySetupReady(Boolean(payload.setup?.isSetupComplete));
      } catch {
        if (!cancelled) setCompanySetupReady(null);
      }
    })();
    return () => { cancelled = true; };
  }, [isCompanyManager, session?.access_token]);

  useEffect(() => {
    if (!isCompanyManager || !session?.access_token) return;
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(`${getApiBaseUrl()}/api/company/team-setup`, { headers: { Authorization: `Bearer ${session.access_token}` } });
        const payload = await response.json().catch(() => ({})) as { setup?: { isTeamSetupStarted?: boolean } };
        if (!cancelled) setCompanyTeamReady(Boolean(payload.setup?.isTeamSetupStarted));
      } catch {
        if (!cancelled) setCompanyTeamReady(null);
      }
    })();
    return () => { cancelled = true; };
  }, [isCompanyManager, session?.access_token]);

  useEffect(() => {
    if (!isCompanyManager || !session?.access_token) return;
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(`${getApiBaseUrl()}/api/company/territory-setup`, { headers: { Authorization: `Bearer ${session.access_token}` } });
        const payload = await response.json().catch(() => ({})) as { setup?: { isTerritorySetupStarted?: boolean } };
        if (!cancelled) setCompanyTerritoryReady(Boolean(payload.setup?.isTerritorySetupStarted));
      } catch {
        if (!cancelled) setCompanyTerritoryReady(null);
      }
    })();
    return () => { cancelled = true; };
  }, [isCompanyManager, session?.access_token]);

  useEffect(() => {
    if (!isCompanyManager || !session?.access_token) return;
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(`${getApiBaseUrl()}/api/company/account-setup`, { headers: { Authorization: `Bearer ${session.access_token}` } });
        const payload = await response.json().catch(() => ({})) as { setup?: { isAccountSetupStarted?: boolean } };
        if (!cancelled) setCompanyAccountReady(Boolean(payload.setup?.isAccountSetupStarted));
      } catch {
        if (!cancelled) setCompanyAccountReady(null);
      }
    })();
    return () => { cancelled = true; };
  }, [isCompanyManager, session?.access_token]);

  const liveQuery = trpc.tracking.live.useQuery(undefined, { enabled: operational.isAuthenticated && role === "مدير", refetchInterval: 30000 });
  const pendingPlans = data.plans.filter((plan) => plan.status === "بانتظار الاعتماد");
  const completed = data.visits.filter((visit) => visit.status === "مكتملة").length;
  const attentionVisits = data.visits.filter((visit) => visit.status === "تحتاج مراجعة");
  const latestVisits = useMemo(() => data.visits.filter((visit) => visit.status !== "مجدولة").slice(0, 4), [data.visits]);

  const localLive = data.dutyStatuses.map((status) => {
    const member = data.teamMembers.find((item) => item.id === status.memberId);
    const last = status.lastPoint ?? status.path.at(-1);
    return last && member ? { id: member.id, name: member.name, initials: member.initials, role: member.role, territory: member.territory, latitude: last.latitude, longitude: last.longitude, updatedAt: new Date(last.capturedAt).toLocaleTimeString("ar", { hour: "2-digit", minute: "2-digit" }), active: status.isOnDuty, path: status.path } : null;
  }).filter((item): item is Exclude<typeof item, null> => Boolean(item)) as LiveRepPosition[];
  const serverLive: LiveRepPosition[] = (liveQuery.data ?? []).map((point) => ({ id: String(point.userId), name: point.name ?? "مندوب", initials: (point.name ?? "مندوب").split(" ").slice(0, 2).map((part) => part[0]).join(" "), role: point.crmRole ?? "مندوب", territory: point.territory ?? "غير معين", latitude: Number(point.latitude), longitude: Number(point.longitude), updatedAt: new Date(point.capturedAt).toLocaleTimeString("ar", { hour: "2-digit", minute: "2-digit" }), active: true, path: [{ latitude: Number(point.latitude), longitude: Number(point.longitude) }] }));
  const liveReps = serverLive.length ? serverLive : localLive;
  const selectedLiveRep = selectedRepId || liveReps[0]?.id || "";

  if (role !== "مدير") {
    return <ScreenContainer className="px-5" containerClassName="bg-background"><View style={styles.locked}><View style={styles.lockIcon}><MaterialIcons name="lock-outline" size={32} color={palette.primary} /></View><Text style={styles.lockedTitle}>وصول مقيّد</Text><Text style={styles.lockedText}>لوحة الإدارة مخصصة للمدير. يمكنك العودة إلى خطتك وزياراتك الميدانية.</Text><PrimaryButton label="إدارة الفريق" icon="groups" onPress={() => router.push("/team" as never)} style={{ alignSelf: "stretch", marginTop: 20 }} /></View></ScreenContainer>;
  }

  return <ScreenContainer className={isPhone ? "px-4" : "px-5"} containerClassName="bg-background"><ScrollView contentContainerStyle={[styles.content, isWide && styles.wideContent]} showsVerticalScrollIndicator={false}>
    <AppHeader eyebrow={operational.usesServerProfile ? `صلاحية موثقة · ${operational.territory}` : "مسؤولية اليوم · ولاية الخرطوم"} title="لوحة الإدارة" right={<View style={styles.headerActions}><NotificationButton count={unreadNotificationCount} /><TouchableOpacity onPress={() => router.push("/team" as never)} style={styles.roleButton}><MaterialIcons name="groups" size={19} color={palette.primary} /></TouchableOpacity><TouchableOpacity onPress={() => { void signOut(); router.replace("/login" as never); }} style={styles.signOutButton} accessibilityLabel="تسجيل الخروج"><MaterialIcons name="logout" size={18} color={palette.error} /></TouchableOpacity></View>} />

    <View style={styles.managerBanner}><View style={styles.managerIcon}><MaterialIcons name="verified-user" size={21} color="#FFFFFF" /></View><View style={styles.bannerCopy}><Text style={styles.managerTitle}>فريقك يتحرك وفق خطة معتمدة</Text><Text style={styles.managerHint}>تابع الخطة والموقع والتغطية من مكان واحد</Text></View></View>
    {isCompanyManager && companySetupReady !== true ? <TouchableOpacity onPress={() => router.push("/company-setup" as never)} style={styles.setupNotice}><View style={styles.setupNoticeIcon}><MaterialIcons name="settings-suggest" size={19} color={palette.warning} /></View><View style={styles.bannerCopy}><Text style={styles.setupNoticeTitle}>{companySetupReady === false ? "أكمل تهيئة شركتك" : "راجع إعدادات تشغيل الشركة"}</Text><Text style={styles.setupNoticeText}>{companySetupReady === false ? "أدخل طبيعة النشاط والدوام وسياسة الموقع قبل بدء التشغيل." : "افتح إعدادات الشركة لمراجعة الهوية وسياسات الدوام والموقع."}</Text></View><MaterialIcons name="chevron-left" size={20} color={palette.warning} /></TouchableOpacity> : null}
    {isCompanyManager && companySetupReady === true && companyTeamReady !== true ? <TouchableOpacity onPress={() => router.push("/company-team-setup" as never)} style={styles.teamSetupNotice}><View style={styles.teamSetupNoticeIcon}><MaterialIcons name="account-tree" size={19} color="#7C3AED" /></View><View style={styles.bannerCopy}><Text style={styles.teamSetupNoticeTitle}>{companyTeamReady === false ? "جهّز هيكل فريق الشركة" : "راجع إعداد فريق الشركة"}</Text><Text style={styles.teamSetupNoticeText}>{companyTeamReady === false ? "أضف مشرف المبيعات أو المشرف الطبي والمحاسب قبل توزيع المندوبين." : "افتح إعداد الفريق لمراجعة المشرفين والمسؤوليات المباشرة."}</Text></View><MaterialIcons name="chevron-left" size={20} color="#7C3AED" /></TouchableOpacity> : null}
    {isCompanyManager && companySetupReady === true && companyTeamReady === true && companyTerritoryReady !== true ? <TouchableOpacity onPress={() => router.push("/company-territory-setup" as never)} style={styles.territorySetupNotice}><View style={styles.territorySetupNoticeIcon}><MaterialIcons name="map" size={19} color="#0E7490" /></View><View style={styles.bannerCopy}><Text style={styles.territorySetupNoticeTitle}>{companyTerritoryReady === false ? "أضف مناطق تغطية الشركة" : "راجع مناطق تغطية الشركة"}</Text><Text style={styles.territorySetupNoticeText}>{companyTerritoryReady === false ? "حدّد المنطقة والمدينة ثم ارسم الحدود قبل توزيعها على المندوبين." : "افتح إعداد المناطق لمراجعة الحدود الجغرافية والتعيينات."}</Text></View><MaterialIcons name="chevron-left" size={20} color="#0E7490" /></TouchableOpacity> : null}
    {isCompanyManager && companySetupReady === true && companyTeamReady === true && companyTerritoryReady === true && companyAccountReady !== true ? <TouchableOpacity onPress={() => router.push("/company-account-setup" as never)} style={styles.accountSetupNotice}><View style={styles.accountSetupNoticeIcon}><MaterialIcons name="contacts" size={19} color="#B45309" /></View><View style={styles.bannerCopy}><Text style={styles.accountSetupNoticeTitle}>{companyAccountReady === false ? "استورد جهات الشركة" : "راجع دليل جهات الشركة"}</Text><Text style={styles.accountSetupNoticeText}>{companyAccountReady === false ? "أضف الأطباء والصيدليات والمستشفيات والموزعين قبل إعداد الخطة الأسبوعية." : "افتح دليل الجهات لاستيراد بيانات إضافية أو مراجعة العناصر الموجودة."}</Text></View><MaterialIcons name="chevron-left" size={20} color="#B45309" /></TouchableOpacity> : null}
    <View style={styles.metrics}><MetricCard compact={isCompact} label="إنجاز اليوم" value={`${completed}/4`} icon="task-alt" /><MetricCard compact={isCompact} label="خطط معلقة" value={String(pendingPlans.length)} icon="pending-actions" tone="amber" /><MetricCard compact={isCompact} label="مناطق نشطة" value={String(data.territories.length)} icon="map" tone="blue" /></View>

    <View style={styles.quickActions}><TouchableOpacity onPress={() => router.push("/company-team-setup" as never)} style={styles.quickAction}><MaterialIcons name="account-tree" size={19} color={palette.primary} /><Text style={styles.quickActionText}>إعداد الفريق</Text></TouchableOpacity><TouchableOpacity onPress={() => router.push("/company-territory-setup" as never)} style={styles.quickAction}><MaterialIcons name="map" size={19} color={palette.primary} /><Text style={styles.quickActionText}>إعداد المناطق</Text></TouchableOpacity><TouchableOpacity onPress={() => router.push("/company-account-setup" as never)} style={styles.quickAction}><MaterialIcons name="contacts" size={19} color={palette.primary} /><Text style={styles.quickActionText}>استيراد الجهات</Text></TouchableOpacity></View>

    {isPhone ? <View style={styles.mobileControlCard}><View style={styles.mobileControlHead}><View style={styles.mobileControlIcon}><MaterialIcons name="radar" size={19} color={palette.primary} /></View><View style={styles.bannerCopy}><Text style={styles.mobileControlTitle}>متابعة الفريق من الهاتف</Text><Text style={styles.mobileControlText}>{liveReps.length ? `${liveReps.length} مندوبين لديهم موقع حديث` : "تظهر المواقع المباشرة بعد بدء الدوام"}</Text></View></View><View style={styles.mobileControlActions}><ManagerShortcut icon="groups" label="الفريق" onPress={() => router.push("/team" as never)} /><ManagerShortcut icon="map" label="المناطق" onPress={() => router.push("/territories" as never)} /><ManagerShortcut icon="notifications" label="التنبيهات" onPress={() => router.push("/notifications" as never)} /></View></View> : <><SectionTitle title="مواقع المناديب الآن" action={liveQuery.isFetching ? "يتم التحديث…" : "تحديث كل 30 ثانية"} /><LiveDutyMap reps={liveReps} boundaries={data.boundaries} selectedId={selectedLiveRep} onSelect={setSelectedRepId} /><SectionTitle title="خريطة التغطية الميدانية" action="تعديل الحدود" onPress={() => router.push("/territories" as never)} /><TerritoryMap territories={data.territories} activeId={activeTerritory} onSelect={setActiveTerritory} /></>}

    <View style={isWide ? styles.wideGrid : undefined}><View style={isWide ? styles.wideColumn : undefined}><SectionTitle title="خطط تحتاج قرارك" /><View style={styles.pendingList}>{pendingPlans.length ? pendingPlans.map((plan) => <View key={plan.id} style={styles.pendingCard}><View style={styles.pendingHead}><StatusBadge status={plan.status} /><View style={styles.bannerCopy}><Text style={styles.pendingTitle}>{plan.title}</Text><Text style={styles.pendingMeta}>{plan.repName} · {plan.visitIds.length} زيارات · {plan.period}</Text>{plan.schedule ? <Text style={styles.scheduleMeta}>تم توزيع الزيارات على {plan.schedule.filter((day) => day.visitIds.length).length} أيام</Text> : null}</View></View><View style={styles.pendingActions}><TouchableOpacity onPress={() => returnPlan(plan.id, "يرجى إضافة مبرر ترتيب الأولويات وتوزيع الزيارات على أيام الأسبوع.")} style={styles.returnButton}><Text style={styles.returnText}>إعادة للمراجعة</Text></TouchableOpacity><TouchableOpacity onPress={() => approvePlan(plan.id)} style={styles.approveButton}><MaterialIcons name="check" size={17} color="#FFFFFF" /><Text style={styles.approveText}>اعتماد الخطة</Text></TouchableOpacity></View></View>) : <View style={styles.noPending}><MaterialIcons name="check-circle" size={22} color={palette.success} /><Text style={styles.noPendingText}>لا توجد خطط معلقة الآن.</Text></View>}</View></View>
      <View style={isWide ? styles.wideColumn : undefined}><SectionTitle title="آخر الزيارات المؤكدة" /><View style={styles.activityCard}>{latestVisits.map((visit, index) => { const account = accountById(visit.accountId); return <View key={visit.id} style={[styles.activityRow, index < latestVisits.length - 1 && styles.activityLine]}><View style={[styles.activityMark, { backgroundColor: visit.status === "تحتاج مراجعة" ? palette.errorBg : palette.successBg }]}><MaterialIcons name={visit.status === "تحتاج مراجعة" ? "warning-amber" : "location-on"} size={18} color={visit.status === "تحتاج مراجعة" ? palette.error : palette.success} /></View><View style={styles.bannerCopy}><View style={styles.activityTitleRow}><StatusBadge status={visit.status} /><Text style={styles.activityTitle}>{account?.name ?? "جهة"}</Text></View><Text style={styles.activityMeta}>{visit.checkedInAt ?? "—"} · {visit.result ?? "لم تسجل نتيجة"}</Text></View></View>; })}</View></View></View>

    <SectionTitle title="نتائج الزيارة المتاحة للفريق" /><View style={styles.resultsCard}><Text style={styles.resultsHint}>أضف نتيجة جديدة؛ ستظهر مباشرة كمربع اختيار للمندوب عند تأكيد الزيارة.</Text><View style={styles.resultList}>{data.visitResults.map((item) => <View key={item} style={styles.resultTag}><MaterialIcons name="check-circle" size={14} color={palette.success} /><Text style={styles.resultTagText}>{item}</Text></View>)}</View><View style={styles.resultInputRow}><TouchableOpacity onPress={() => { addVisitResult(newResult); setNewResult(""); }} style={styles.addResult}><MaterialIcons name="add" size={19} color="#FFFFFF" /></TouchableOpacity><TextInput value={newResult} onChangeText={setNewResult} placeholder="مثال: تم استلام طلبية" placeholderTextColor="#93A099" textAlign="right" style={styles.resultInput} returnKeyType="done" /></View></View>

    <SectionTitle title="المناطق والتغطية" />{data.territories.filter((territory) => activeTerritory === "all" || territory.id === activeTerritory).map((territory) => <View key={territory.id} style={styles.territoryCard}><View style={styles.territoryHead}><View style={styles.coverage}><Text style={styles.coverageText}>{territory.coverage}%</Text></View><View style={styles.bannerCopy}><Text style={styles.territoryName}>{territory.name}</Text><Text style={styles.territoryMeta}>{territory.state} · {territory.city} · {territory.accounts} جهة</Text><Text style={styles.territoryAssignees}>{territory.assignees.join("، ")}</Text></View></View><View style={styles.coverageTrack}><View style={[styles.coverageFill, { width: `${territory.coverage}%` }]} /></View></View>)}
    {attentionVisits.length ? <View style={styles.alert}><MaterialIcons name="warning-amber" size={21} color={palette.error} /><Text style={styles.alertText}>{attentionVisits.length} زيارة تحتاج مراجعة بسبب موقع خارج المنطقة أو ضعف دقة القراءة.</Text></View> : null}
  </ScrollView></ScreenContainer>;
}

const styles = StyleSheet.create({
  content: { paddingTop: 10, paddingBottom: 28 }, wideContent: { maxWidth: 1160, width: "100%", alignSelf: "center" }, headerActions: { flexDirection: "row", gap: 8, alignItems: "center" }, roleButton: { width: 40, height: 40, borderRadius: 14, backgroundColor: "#E9F8F2", alignItems: "center", justifyContent: "center" }, signOutButton: { width: 40, height: 40, borderRadius: 14, backgroundColor: "#FFF0F0", borderWidth: 1, borderColor: "#F8C4C4", alignItems: "center", justifyContent: "center" }, bannerCopy: { flex: 1, flexShrink: 1, alignItems: "flex-end" },
  quickActions: { flexDirection: "row-reverse", gap: 8, marginTop: 14 }, quickAction: { flex: 1, minHeight: 46, borderRadius: 14, backgroundColor: "#E9F8F2", borderWidth: 1, borderColor: "#B9DED3", flexDirection: "row", gap: 7, alignItems: "center", justifyContent: "center" }, quickActionText: { color: palette.primary, fontSize: 12, fontWeight: "800" },
  mobileControlCard: { backgroundColor: "#FFFFFF", borderRadius: 19, borderWidth: 1, borderColor: palette.line, padding: 14, marginTop: 20 }, mobileControlHead: { flexDirection: "row", gap: 10, alignItems: "center" }, mobileControlIcon: { width: 40, height: 40, borderRadius: 13, backgroundColor: "#E9F8F2", alignItems: "center", justifyContent: "center" }, mobileControlTitle: { color: palette.ink, fontSize: 14, fontWeight: "900", textAlign: "right" }, mobileControlText: { color: palette.muted, fontSize: 10, marginTop: 3, textAlign: "right" }, mobileControlActions: { flexDirection: "row-reverse", gap: 7, marginTop: 13 }, mobileControlAction: { flex: 1, minHeight: 40, borderRadius: 11, backgroundColor: "#F2F8F5", alignItems: "center", justifyContent: "center", gap: 3 }, mobileControlActionText: { color: palette.primary, fontSize: 10, fontWeight: "800" },
  locked: { flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: 25 }, lockIcon: { width: 68, height: 68, borderRadius: 24, backgroundColor: "#E9F8F2", alignItems: "center", justifyContent: "center", marginBottom: 15 }, lockedTitle: { color: palette.ink, fontWeight: "800", fontSize: 23 }, lockedText: { color: palette.muted, textAlign: "center", lineHeight: 21, marginTop: 8, fontSize: 14 },
  managerBanner: { backgroundColor: "#143D35", borderRadius: 20, padding: 16, flexDirection: "row", gap: 12, alignItems: "center" }, managerIcon: { width: 40, height: 40, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: "#28715F" }, managerTitle: { color: "#FFFFFF", fontWeight: "800", fontSize: 15, textAlign: "right" }, managerHint: { color: "#C6E6DD", fontSize: 11, marginTop: 4, textAlign: "right" },
  setupNotice: { backgroundColor: "#FFF8E7", borderColor: "#F0D49A", borderWidth: 1, borderRadius: 16, padding: 12, marginTop: 12, flexDirection: "row-reverse", gap: 9, alignItems: "center" }, setupNoticeIcon: { width: 34, height: 34, borderRadius: 11, backgroundColor: "#FFF0C9", alignItems: "center", justifyContent: "center" }, setupNoticeTitle: { color: "#8B6500", fontSize: 12, fontWeight: "900", textAlign: "right" }, setupNoticeText: { color: "#927A40", fontSize: 10, lineHeight: 15, marginTop: 3, textAlign: "right" },
  teamSetupNotice: { backgroundColor: "#F5F0FF", borderColor: "#D9C7FF", borderWidth: 1, borderRadius: 16, padding: 12, marginTop: 10, flexDirection: "row-reverse", gap: 9, alignItems: "center" }, teamSetupNoticeIcon: { width: 34, height: 34, borderRadius: 11, backgroundColor: "#E9DDFF", alignItems: "center", justifyContent: "center" }, teamSetupNoticeTitle: { color: "#6343A4", fontSize: 12, fontWeight: "900", textAlign: "right" }, teamSetupNoticeText: { color: "#725E9B", fontSize: 10, lineHeight: 15, marginTop: 3, textAlign: "right" },
  territorySetupNotice: { backgroundColor: "#EAF7FA", borderColor: "#B9E2EB", borderWidth: 1, borderRadius: 16, padding: 12, marginTop: 10, flexDirection: "row-reverse", gap: 9, alignItems: "center" }, territorySetupNoticeIcon: { width: 34, height: 34, borderRadius: 11, backgroundColor: "#D7EFF5", alignItems: "center", justifyContent: "center" }, territorySetupNoticeTitle: { color: "#0E7490", fontSize: 12, fontWeight: "900", textAlign: "right" }, territorySetupNoticeText: { color: "#397C90", fontSize: 10, lineHeight: 15, marginTop: 3, textAlign: "right" },
  accountSetupNotice: { backgroundColor: "#FFF6E7", borderColor: "#F0D7A2", borderWidth: 1, borderRadius: 16, padding: 12, marginTop: 10, flexDirection: "row-reverse", gap: 9, alignItems: "center" }, accountSetupNoticeIcon: { width: 34, height: 34, borderRadius: 11, backgroundColor: "#FFECC4", alignItems: "center", justifyContent: "center" }, accountSetupNoticeTitle: { color: "#9A5A00", fontSize: 12, fontWeight: "900", textAlign: "right" }, accountSetupNoticeText: { color: "#926C35", fontSize: 10, lineHeight: 15, marginTop: 3, textAlign: "right" },
  metrics: { flexDirection: "row", gap: 8, marginTop: 14 }, wideGrid: { flexDirection: "row", gap: 18 }, wideColumn: { flex: 1 }, pendingList: { gap: 10 }, pendingCard: { backgroundColor: "#FFFFFF", borderColor: palette.line, borderWidth: 1, borderRadius: 19, padding: 15 }, pendingHead: { flexDirection: "row", gap: 10, alignItems: "flex-start" }, pendingTitle: { color: palette.ink, fontWeight: "800", fontSize: 15, textAlign: "right" }, pendingMeta: { color: palette.muted, fontSize: 11, marginTop: 4, textAlign: "right" }, scheduleMeta: { color: palette.primary, fontSize: 10, marginTop: 5, fontWeight: "700", textAlign: "right" }, pendingActions: { flexDirection: "row", justifyContent: "flex-end", gap: 8, marginTop: 14 }, returnButton: { minHeight: 35, paddingHorizontal: 11, borderRadius: 10, justifyContent: "center", borderWidth: 1, borderColor: "#E4B5B5" }, returnText: { color: palette.error, fontSize: 11, fontWeight: "800" }, approveButton: { minHeight: 35, paddingHorizontal: 11, borderRadius: 10, justifyContent: "center", alignItems: "center", backgroundColor: palette.primary, flexDirection: "row", gap: 4 }, approveText: { color: "#FFFFFF", fontSize: 11, fontWeight: "800" }, noPending: { padding: 18, borderRadius: 16, backgroundColor: "#E9F8F2", flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center" }, noPendingText: { color: palette.success, fontWeight: "700", fontSize: 12 },
  activityCard: { backgroundColor: "#FFFFFF", borderRadius: 19, paddingHorizontal: 14, borderColor: palette.line, borderWidth: 1 }, activityRow: { paddingVertical: 13, flexDirection: "row", gap: 10, alignItems: "center" }, activityLine: { borderBottomWidth: 1, borderBottomColor: "#EDF1EF" }, activityMark: { width: 34, height: 34, borderRadius: 12, alignItems: "center", justifyContent: "center" }, activityTitleRow: { flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "flex-end" }, activityTitle: { color: palette.ink, fontWeight: "800", fontSize: 14, textAlign: "right" }, activityMeta: { color: palette.muted, fontSize: 11, marginTop: 3, textAlign: "right" },
  resultsCard: { backgroundColor: "#FFFFFF", borderRadius: 19, padding: 14, borderWidth: 1, borderColor: palette.line }, resultsHint: { color: palette.muted, fontSize: 11, lineHeight: 17, textAlign: "right" }, resultList: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 7, marginTop: 12 }, resultTag: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#E9F8F2", paddingVertical: 7, paddingHorizontal: 9, borderRadius: 10 }, resultTagText: { color: palette.success, fontSize: 11, fontWeight: "700" }, resultInputRow: { flexDirection: "row", gap: 8, marginTop: 14 }, resultInput: { flex: 1, minHeight: 43, borderRadius: 12, borderWidth: 1, borderColor: palette.line, paddingHorizontal: 11, color: palette.ink, fontSize: 12 }, addResult: { width: 44, borderRadius: 12, backgroundColor: palette.primary, alignItems: "center", justifyContent: "center" },
  territoryCard: { backgroundColor: "#FFFFFF", borderRadius: 18, borderWidth: 1, borderColor: palette.line, padding: 14, marginBottom: 10 }, territoryHead: { flexDirection: "row", alignItems: "center", gap: 11 }, coverage: { height: 41, minWidth: 49, paddingHorizontal: 8, backgroundColor: "#E9F8F2", borderRadius: 13, alignItems: "center", justifyContent: "center" }, coverageText: { color: palette.success, fontSize: 13, fontWeight: "800" }, territoryName: { color: palette.ink, fontWeight: "800", fontSize: 15, textAlign: "right" }, territoryMeta: { color: palette.muted, fontSize: 10, marginTop: 4, textAlign: "right" }, territoryAssignees: { color: palette.primary, fontSize: 10, marginTop: 4, fontWeight: "700", textAlign: "right" }, coverageTrack: { height: 6, borderRadius: 4, backgroundColor: "#EBF0EE", marginTop: 13, overflow: "hidden" }, coverageFill: { height: "100%", borderRadius: 4, backgroundColor: palette.teal }, alert: { backgroundColor: "#FFF0F0", borderRadius: 16, padding: 13, flexDirection: "row", alignItems: "center", gap: 9, marginTop: 5 }, alertText: { color: palette.error, fontSize: 11, lineHeight: 17, flex: 1, textAlign: "right" },
});

export default AdminDashboard;
