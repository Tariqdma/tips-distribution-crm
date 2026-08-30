import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { AppHeader, AccountAvatar, MetricCard, SectionTitle, StatusBadge, palette } from "@/components/crm-ui";
import { ScreenContainer } from "@/components/screen-container";
import { useCrm } from "@/lib/crm-store";
import { NotificationButton } from "@/components/notification-button";
import { DutyTrackerCard } from "@/components/duty-tracker-card";
import { getFieldDataScope } from "@/lib/field-data-scope";
import { isFollowUpDue } from "@/lib/operational-insights";
import { useSupabaseAuth } from "@/lib/supabase-auth";
import { enableMobileNotifications, getMobileNotificationPermission, isMobileNotificationsAvailable } from "@/lib/mobile-notifications";

const priorityWeight = { عالية: 0, متوسطة: 1, اعتيادية: 2 } as const;
const isoToday = () => new Date().toISOString().slice(0, 10);

export default function TodayScreen() {
  const [notificationPermission, setNotificationPermission] = useState<string>("unknown");
  const { data, accountById, unreadNotificationCount, recordDutyPoint, isOnline, offlineVisitDrafts } = useCrm();
  const { profile } = useSupabaseAuth();
  const scope = getFieldDataScope(data, profile);

  useEffect(() => {
    if (isMobileNotificationsAvailable()) void getMobileNotificationPermission().then(setNotificationPermission);
  }, []);

  const enableFollowUpNotifications = async () => {
    const granted = await enableMobileNotifications();
    setNotificationPermission(granted ? "granted" : "denied");
    Alert.alert(
      granted ? "تم تفعيل التنبيهات" : "لم يتم تفعيل التنبيهات",
      granted ? "ستظهر لك تذكيرات المتابعات على الهاتف في موعدها." : "يمكنك تفعيلها لاحقاً من إعدادات الهاتف."
    );
  };

  const todayVisits = scope.visits
    .filter((visit) => visit.date === "اليوم")
    .sort((first, second) => {
      if (first.status === "مكتملة" && second.status !== "مكتملة") return 1;
      if (first.status !== "مكتملة" && second.status === "مكتملة") return -1;
      return (
        priorityWeight[accountById(first.accountId)?.priority ?? "اعتيادية"] -
        priorityWeight[accountById(second.accountId)?.priority ?? "اعتيادية"]
      );
    });

  const completed = todayVisits.filter((visit) => visit.status === "مكتملة").length;
  const needsReview = todayVisits.filter((visit) => visit.status === "تحتاج مراجعة").length;
  const progress = todayVisits.length ? Math.round((completed / todayVisits.length) * 100) : 0;

  const nextVisit = todayVisits.find((visit) => visit.status !== "مكتملة");
  const dueFollowUps = scope.visits
    .filter((visit) => isFollowUpDue(visit, isoToday()))
    .sort((a, b) => (a.followUpDate ?? "").localeCompare(b.followUpDate ?? ""));

  const showDailySummary = () =>
    Alert.alert(
      "ملخص اليوم",
      `الزيارات: ${completed} مكتملة من ${todayVisits.length}.\nتحتاج مراجعة: ${needsReview}.\nمتابعات مستحقة: ${dueFollowUps.length}.\nنسبة الإنجاز: ${progress}%.`
    );

  return (
    <ScreenContainer className="px-5" containerClassName="bg-background">
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <AppHeader
          eyebrow="خطة اليوم والزيارات المخصصة لك"
          title={`صباح الخير، ${profile?.full_name ?? "بك"}`}
          right={
            <View style={styles.headerActions}>
              <NotificationButton count={unreadNotificationCount} />
              <View style={styles.profile}>
                <Text style={styles.profileText}>
                  {(profile?.full_name ?? "م")
                    .split(" ")
                    .slice(0, 2)
                    .map((part) => part[0])
                    .join("")}
                </Text>
              </View>
            </View>
          }
        />

        {/* Hero Card */}
        <View style={styles.hero}>
          <View style={styles.heroTop}>
            <View style={styles.todayIcon}>
              <MaterialIcons name="today" color="#FFFFFF" size={20} />
            </View>
            <View style={{ flex: 1, alignItems: "flex-end" }}>
              <Text style={styles.heroEyebrow}>خطة اليوم المعتمدة</Text>
              <Text style={styles.heroTitle}>{completed} من {todayVisits.length} زيارات مكتملة</Text>
            </View>
          </View>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${progress}%` }]} />
          </View>
          <View style={styles.heroBottom}>
            <Text style={styles.heroHint}>
              {nextVisit ? `الآن: الزيارة التالية عند ${nextVisit.time}` : "أكملت زيارات اليوم، راجع ملخصك قبل الإنهاء."}
            </Text>
            <Text style={styles.progressText}>{progress}%</Text>
          </View>
        </View>

        {/* Metrics Grid */}
        <View style={styles.metrics}>
          <MetricCard label="زيارات اليوم" value={String(todayVisits.length)} icon="event-available" />
          <MetricCard label="متابعات مستحقة" value={String(dueFollowUps.length)} icon="assignment-late" tone="amber" />
          <MetricCard label="تحتاج مراجعة" value={String(needsReview)} icon="forum" tone="blue" />
        </View>

        {/* Mobile Notification Prompt */}
        {isMobileNotificationsAvailable() && notificationPermission !== "granted" ? (
          <TouchableOpacity onPress={() => void enableFollowUpNotifications()} style={styles.notificationPrompt}>
            <View style={styles.promptIcon}>
              <MaterialIcons name="notifications-active" size={20} color={palette.primary} />
            </View>
            <View style={{ flex: 1, alignItems: "flex-end" }}>
              <Text style={styles.notificationPromptTitle}>فعّل تنبيهات المتابعة على الهاتف</Text>
              <Text style={styles.notificationPromptBody}>لتذكيرك بالزيارات والخطوات المستحقة في وقتها.</Text>
            </View>
            <MaterialIcons name="chevron-left" size={20} color={palette.primary} />
          </TouchableOpacity>
        ) : null}

        {!isOnline ? <View style={styles.offlineStatus}><MaterialIcons name="cloud-off" size={19} color="#9A5B00" /><View style={{ flex: 1, alignItems: "flex-end" }}><Text style={styles.offlineStatusTitle}>وضع دون إنترنت</Text><Text style={styles.offlineStatusCopy}>يمكنك إنهاء الزيارات؛ سيُحفظ التقرير على الهاتف ثم يُرسل تلقائياً.</Text></View></View> : null}
        {offlineVisitDrafts.length ? <TouchableOpacity onPress={() => router.push("/offline-drafts" as never)} style={styles.offlineDraftsCard}><View style={styles.offlineDraftsIcon}><MaterialIcons name="cloud-upload" size={20} color="#FFFFFF" /></View><View style={{ flex: 1, alignItems: "flex-end" }}><Text style={styles.offlineDraftsTitle}>تقارير محفوظة على هذا الهاتف</Text><Text style={styles.offlineDraftsCopy}>{offlineVisitDrafts.length} {offlineVisitDrafts.length === 1 ? "تقرير بانتظار الإرسال" : "تقارير بانتظار الإرسال"}{isOnline ? " · اضغط لمراجعتها أو إعادة المحاولة" : " · ستُرسل تلقائياً عند عودة الإنترنت"}</Text></View><View style={styles.offlineDraftsCount}><Text style={styles.offlineDraftsCountText}>{offlineVisitDrafts.length}</Text></View><MaterialIcons name="chevron-left" size={22} color="#246B91" /></TouchableOpacity> : null}

        {/* Next Best Visit Card */}
        {nextVisit ? (
          <TouchableOpacity activeOpacity={0.82} onPress={() => router.push(`/visit/${nextVisit.id}` as never)} style={styles.nextCard}>
            <View style={styles.nextIcon}>
              <MaterialIcons name="play-arrow" color="#FFFFFF" size={20} />
            </View>
            <View style={{ flex: 1, alignItems: "flex-end" }}>
              <Text style={styles.nextEyebrow}>أفضل خطوة تالية</Text>
              <Text style={styles.nextTitle}>{accountById(nextVisit.accountId)?.name ?? "الزيارة القادمة"}</Text>
              <Text style={styles.nextMeta}>{nextVisit.time} · أولوية {accountById(nextVisit.accountId)?.priority ?? "اعتيادية"}</Text>
            </View>
            <MaterialIcons name="chevron-left" color={palette.primary} size={24} />
          </TouchableOpacity>
        ) : null}

        {/* Duty Tracker */}
        <DutyTrackerCard onPoint={recordDutyPoint} />

        {/* Medical Tools Access */}
        {profile?.role_key === "medical_rep" ? (
          <TouchableOpacity onPress={() => router.push("/medical-tools" as never)} style={styles.medicalTools}>
            <View style={styles.medicalToolsIcon}>
              <MaterialIcons name="biotech" size={20} color="#FFFFFF" />
            </View>
            <View style={{ flex: 1, alignItems: "flex-end" }}>
              <Text style={styles.medicalToolsTitle}>أدوات المندوب الطبي</Text>
              <Text style={styles.medicalToolsCopy}>راجع رصيد العينات وسجل تسليمها للطبيب والفعاليات العلمية.</Text>
            </View>
            <MaterialIcons name="chevron-left" size={22} color="#246B91" />
          </TouchableOpacity>
        ) : null}

        <TouchableOpacity onPress={() => router.push("/product-catalog" as never)} style={styles.productCatalog}>
          <View style={styles.productCatalogIcon}>
            <MaterialIcons name="inventory-2" size={20} color="#FFFFFF" />
          </View>
          <View style={{ flex: 1, alignItems: "flex-end" }}>
            <Text style={styles.productCatalogTitle}>كتالوج منتجات الشركة</Text>
            <Text style={styles.productCatalogCopy}>راجع المنتجات قبل الزيارة، ثم وثّق الترويج أو المناقشة داخل التقرير.</Text>
          </View>
          <MaterialIcons name="chevron-left" size={22} color="#6F5B20" />
        </TouchableOpacity>

        {/* Follow Ups Needed */}
        {dueFollowUps.length ? (
          <>
            <SectionTitle title="متابعات تحتاج إجراء" />
            <View style={styles.followupCard}>
              {dueFollowUps.slice(0, 3).map((visit, index) => (
                <TouchableOpacity
                  onPress={() => router.push(`/account/${visit.accountId}` as never)}
                  key={visit.id}
                  style={[styles.followupRow, index < Math.min(dueFollowUps.length, 3) - 1 && styles.divider]}
                >
                  <MaterialIcons name="chevron-left" color="#8D7A45" size={20} />
                  <View style={{ flex: 1, alignItems: "flex-end" }}>
                    <Text style={styles.followupTitle}>{visit.followUpAction || "متابعة مطلوبة"}</Text>
                    <Text style={styles.followupMeta}>
                      {accountById(visit.accountId)?.name} · {visit.followUpDate}
                    </Text>
                  </View>
                  <MaterialIcons name="event-note" color={palette.warning} size={19} />
                </TouchableOpacity>
              ))}
            </View>
          </>
        ) : null}

        {/* Schedule List */}
        <SectionTitle title="جدول الزيارات" action="عرض الخطة" onPress={() => router.push("/(tabs)/plans" as never)} />
        <View style={styles.scheduleCard}>
          {todayVisits.map((visit, index) => {
            const account = accountById(visit.accountId);
            if (!account) return null;
            return (
              <TouchableOpacity
                key={visit.id}
                activeOpacity={0.78}
                onPress={() => router.push(`/visit/${visit.id}` as never)}
                style={[styles.visitRow, index < todayVisits.length - 1 && styles.divider]}
              >
                <MaterialIcons name="chevron-left" size={22} color="#A1ACA7" />
                <View style={styles.visitMiddle}>
                  <View style={styles.visitNameRow}>
                    <StatusBadge status={visit.status} />
                    <Text style={styles.priorityPill}>{account.priority}</Text>
                  </View>
                  <Text style={styles.visitType}>{account.name}</Text>
                  <Text style={styles.visitAddress} numberOfLines={1}>
                    {account.type}
                    {account.specialty ? ` · ${account.specialty}` : ""} · {account.area}
                  </Text>
                </View>
                <View style={styles.timeCol}>
                  <Text style={styles.time}>{visit.time}</Text>
                  <View
                    style={[
                      styles.dot,
                      {
                        backgroundColor:
                          visit.status === "مكتملة"
                            ? palette.success
                            : account.priority === "عالية"
                              ? palette.error
                              : palette.info,
                      },
                    ]}
                  />
                </View>
                <AccountAvatar account={account} size={46} />
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Daily Summary Button */}
        <TouchableOpacity onPress={showDailySummary} style={styles.summaryButton}>
          <MaterialIcons name="chevron-left" color={palette.primary} size={23} />
          <View style={{ flex: 1, alignItems: "flex-end" }}>
            <Text style={styles.summaryTitle}>ملخص نهاية اليوم</Text>
            <Text style={styles.summaryCopy}>راجع الإنجاز والمتابعات قبل إنهاء دوامك.</Text>
          </View>
          <View style={styles.summaryIcon}>
            <MaterialIcons name="summarize" size={20} color={palette.primary} />
          </View>
        </TouchableOpacity>

        {/* Operational Tip */}
        <View style={styles.tip}>
          <View style={{ flex: 1, alignItems: "flex-end" }}>
            <Text style={styles.tipTitle}>تلميحة العمل الميداني</Text>
            <Text style={styles.tipText}>
              تقرير الزيارة المكتمل يتضمن النتيجة، الملاحظات والمتابعة المستحقة. يتم حفظ المسودات تلقائياً.
            </Text>
          </View>
          <MaterialIcons name="lightbulb-outline" size={21} color={palette.warning} />
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: 10, paddingBottom: 28 },
  headerActions: { flexDirection: "row-reverse", gap: 8, alignItems: "center" },
  profile: { height: 38, width: 38, borderRadius: 19, backgroundColor: "#DFF2EC", alignItems: "center", justifyContent: "center" },
  profileText: { color: palette.primary, fontWeight: "800", fontSize: 12 },
  hero: { backgroundColor: palette.primary, borderRadius: 22, padding: 18, elevation: 3 },
  heroTop: { flexDirection: "row-reverse", alignItems: "center", gap: 12 },
  todayIcon: { height: 38, width: 38, borderRadius: 12, backgroundColor: "#0B7A6D", alignItems: "center", justifyContent: "center" },
  heroEyebrow: { color: "#CBEDE6", fontSize: 12, marginBottom: 3, textAlign: "right" },
  heroTitle: { color: "#FFFFFF", fontWeight: "800", fontSize: 18, textAlign: "right" },
  progressTrack: { height: 7, borderRadius: 5, backgroundColor: "#277C70", overflow: "hidden", marginTop: 19 },
  progressFill: { height: "100%", borderRadius: 5, backgroundColor: "#8BE3CA" },
  heroBottom: { flexDirection: "row-reverse", justifyContent: "space-between", marginTop: 9, alignItems: "center" },
  heroHint: { color: "#CBEDE6", fontSize: 11, flex: 1, textAlign: "right" },
  progressText: { color: "#FFFFFF", fontSize: 12, fontWeight: "800" },
  metrics: { flexDirection: "row-reverse", gap: 8, marginTop: 15 },
  notificationPrompt: { marginTop: 12, minHeight: 64, padding: 12, borderRadius: 16, borderWidth: 1, borderColor: "#BDE0D2", backgroundColor: "#F2FBF7", flexDirection: "row-reverse", alignItems: "center", gap: 10 },
  promptIcon: { width: 36, height: 36, borderRadius: 12, backgroundColor: "#E4F5EE", alignItems: "center", justifyContent: "center" },
  notificationPromptTitle: { color: palette.ink, fontWeight: "900", textAlign: "right", fontSize: 12 },
  notificationPromptBody: { color: palette.muted, textAlign: "right", marginTop: 3, fontSize: 10 },
  offlineStatus: { marginTop: 12, minHeight: 61, padding: 12, borderRadius: 16, borderWidth: 1, borderColor: "#F2D39D", backgroundColor: "#FFF7E8", flexDirection: "row-reverse", alignItems: "center", gap: 10 },
  offlineStatusTitle: { color: "#8A5100", fontWeight: "900", textAlign: "right", fontSize: 12 },
  offlineStatusCopy: { color: "#9A6B20", textAlign: "right", marginTop: 3, fontSize: 10, lineHeight: 15 },
  offlineDraftsCard: { marginTop: 12, minHeight: 70, padding: 12, borderRadius: 16, borderWidth: 1, borderColor: "#CDE3EF", backgroundColor: "#F1F8FC", flexDirection: "row-reverse", alignItems: "center", gap: 9 },
  offlineDraftsIcon: { width: 38, height: 38, borderRadius: 13, backgroundColor: "#246B91", alignItems: "center", justifyContent: "center" },
  offlineDraftsTitle: { color: "#174B65", fontSize: 12, fontWeight: "900", textAlign: "right" },
  offlineDraftsCopy: { color: "#4C7183", fontSize: 10, marginTop: 3, lineHeight: 15, textAlign: "right" },
  offlineDraftsCount: { minWidth: 23, height: 23, paddingHorizontal: 6, borderRadius: 12, backgroundColor: "#D9EDF7", alignItems: "center", justifyContent: "center" },
  offlineDraftsCountText: { color: "#246B91", fontWeight: "900", fontSize: 11 },
  nextCard: { marginTop: 15, minHeight: 76, padding: 13, backgroundColor: "#EAF8F2", borderWidth: 1, borderColor: "#B9DECF", borderRadius: 17, flexDirection: "row-reverse", alignItems: "center", gap: 10 },
  nextIcon: { width: 38, height: 38, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: palette.primary },
  nextEyebrow: { color: palette.success, fontSize: 10, fontWeight: "800", textAlign: "right" },
  nextTitle: { color: palette.ink, fontSize: 14, fontWeight: "900", marginTop: 2, textAlign: "right" },
  nextMeta: { color: palette.muted, fontSize: 10, marginTop: 3, textAlign: "right" },
  medicalTools: { marginTop: 14, minHeight: 70, padding: 12, borderRadius: 16, backgroundColor: "#F1F8FC", borderWidth: 1, borderColor: "#CDE3EF", flexDirection: "row-reverse", alignItems: "center", gap: 10 },
  medicalToolsIcon: { width: 39, height: 39, borderRadius: 13, backgroundColor: "#246B91", alignItems: "center", justifyContent: "center" },
  medicalToolsTitle: { color: "#174B65", fontSize: 12, fontWeight: "900", textAlign: "right" },
  medicalToolsCopy: { color: "#4C7183", fontSize: 10, marginTop: 3, textAlign: "right" },
  productCatalog: { marginTop: 14, minHeight: 70, padding: 12, borderRadius: 16, backgroundColor: "#FFF9EB", borderWidth: 1, borderColor: "#F3DC9D", flexDirection: "row-reverse", alignItems: "center", gap: 10 },
  productCatalogIcon: { width: 39, height: 39, borderRadius: 13, backgroundColor: "#9A7619", alignItems: "center", justifyContent: "center" },
  productCatalogTitle: { color: "#725922", fontSize: 12, fontWeight: "900", textAlign: "right" },
  productCatalogCopy: { color: "#8D7A45", fontSize: 10, marginTop: 3, textAlign: "right" },
  followupCard: { backgroundColor: "#FFF9EB", borderWidth: 1, borderColor: "#F3DC9D", borderRadius: 18, paddingHorizontal: 13 },
  followupRow: { minHeight: 57, flexDirection: "row-reverse", alignItems: "center", gap: 9 },
  followupTitle: { color: "#795D14", fontSize: 12, fontWeight: "800", textAlign: "right" },
  followupMeta: { color: "#8D7A45", fontSize: 10, marginTop: 3, textAlign: "right" },
  scheduleCard: { backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.line, borderRadius: 20, paddingHorizontal: 14 },
  visitRow: { flexDirection: "row-reverse", gap: 11, alignItems: "center", paddingVertical: 14 },
  divider: { borderBottomWidth: 1, borderBottomColor: "#EDF1EF" },
  timeCol: { width: 55, alignItems: "flex-end", gap: 4 },
  time: { color: palette.ink, fontSize: 12, fontWeight: "700" },
  dot: { width: 7, height: 7, borderRadius: 4 },
  visitMiddle: { flex: 1, alignItems: "flex-end" },
  visitNameRow: { flexDirection: "row-reverse", gap: 6, alignItems: "center", marginBottom: 3 },
  priorityPill: { color: palette.muted, backgroundColor: "#F2F5F4", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, fontSize: 9, fontWeight: "800" },
  visitType: { color: palette.ink, fontSize: 14, fontWeight: "800", textAlign: "right" },
  visitAddress: { color: palette.muted, fontSize: 11, marginTop: 3, textAlign: "right" },
  summaryButton: { marginTop: 17, borderRadius: 17, padding: 14, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#D9E8E2", flexDirection: "row-reverse", alignItems: "center", gap: 9 },
  summaryIcon: { width: 36, height: 36, borderRadius: 12, backgroundColor: "#EAF8F2", alignItems: "center", justifyContent: "center" },
  summaryTitle: { color: palette.ink, fontWeight: "900", fontSize: 13, textAlign: "right" },
  summaryCopy: { color: palette.muted, fontSize: 10, marginTop: 3, textAlign: "right" },
  tip: { marginTop: 17, padding: 14, backgroundColor: "#FFF9EB", borderRadius: 16, flexDirection: "row-reverse", alignItems: "flex-start", gap: 10 },
  tipTitle: { color: "#725922", fontSize: 12, fontWeight: "900", textAlign: "right", marginBottom: 2 },
  tipText: { color: "#725922", fontSize: 11, lineHeight: 17, textAlign: "right" },
});
