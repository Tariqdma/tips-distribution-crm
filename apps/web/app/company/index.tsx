import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { router } from "expo-router";
import { useMemo } from "react";
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { AdminWebShell } from "@/components/admin-web-shell";
import { palette } from "@/components/crm-ui";
import { useCrm } from "@/lib/crm-store";
import { useSupabaseAuth } from "@/lib/supabase-auth";

export default function AdminDashboardIndex() {
  const { profile } = useSupabaseAuth();
  const { data } = useCrm();

  const completedVisits = data.visits.filter((v) => v.status === "مكتملة").length;
  const totalVisits = data.visits.length;
  const completionRate = totalVisits > 0 ? Math.round((completedVisits / totalVisits) * 100) : 0;
  const pendingPlans = data.plans.filter((p) => p.status === "بانتظار الاعتماد").length;
  const activeDutyCount = data.dutyStatuses.filter((d) => d.isOnDuty).length || data.teamMembers.length;

  const quickModules = [
    {
      title: "مركز العمليات المباشر",
      description: "متابعة حركة المناديب الميدانية والتغطية الحية لحظة بلحظة",
      icon: "monitor-heart" as const,
      color: "#14A687",
      bgColor: "#E6F6F0",
      href: "/company/operations",
    },
    {
      title: "اعتماد الخطط الأسبوعية",
      description: "مراجعة واعتماد خطط المناديب الأسبوعية وجداول الزيارات",
      icon: "fact-check" as const,
      color: "#3B82F6",
      bgColor: "#EFF6FF",
      href: "/company/weekly-plans",
      badge: pendingPlans > 0 ? `${pendingPlans} معلقة` : undefined,
    },
    {
      title: "التحصيل اليومي والعهد",
      description: "مطابقة وتسوية دفعات وتحصيلات المناديب اليومية النقدية والبنكية",
      icon: "receipt-long" as const,
      color: "#10B981",
      bgColor: "#ECFDF5",
      href: "/company/daily-collections",
    },
    {
      title: "بحث وتدقيق الإيصالات",
      description: "البحث المتقدم في سندات القبض والتحصيلات وأرقام المعاملات",
      icon: "travel-explore" as const,
      color: "#F59E0B",
      bgColor: "#FFFBEB",
      href: "/company/receipt-search",
    },
    {
      title: "تقارير التغطية الطبية",
      description: "تحليل زيارات الأطباء والصيادلة ومؤشرات التغطية والتردد",
      icon: "medical-services" as const,
      color: "#06B6D4",
      bgColor: "#ECFEFF",
      href: "/company/medical-reports",
    },
    {
      title: "البرنامج والفعاليات الطبية",
      description: "إدارة المؤتمرات والندوات والأنشطة العلمية والترويجية",
      icon: "biotech" as const,
      color: "#8B5CF6",
      bgColor: "#F5F3FF",
      href: "/company/medical-program",
    },
    {
      title: "فريق العمل والمندوبين",
      description: "إدارة أعضاء الفريق، التعيينات، ومسؤوليات المناطق الميدانية",
      icon: "groups" as const,
      color: "#6366F1",
      bgColor: "#EEF2FF",
      href: "/company/team",
    },
    {
      title: "الأدوار والصلاحيات",
      description: "تخصيص مستويات الوصول الإداري والميداني والمالي",
      icon: "admin-panel-settings" as const,
      color: "#EC4899",
      bgColor: "#FDF2F8",
      href: "/company/roles",
    },
    {
      title: "سجل التدقيق والحركات",
      description: "تتبع كافة الإجراءات والتعديلات والعمليات الحساسة بالنظام",
      icon: "history" as const,
      color: "#64748B",
      bgColor: "#F1F5F9",
      href: "/company/audit",
    },
  ];

  return (
    <AdminWebShell title="لوحة التحكم">
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        {/* Welcome Hero Banner */}
        <View style={styles.heroBanner}>
          <View style={styles.heroContent}>
            <View style={styles.heroBadge}>
              <View style={styles.heroDot} />
              <Text style={styles.heroBadgeText}>بوابة الإدارة المركزية</Text>
            </View>
            <Text style={styles.heroTitle}>
              مرحباً بك، {profile?.full_name || "مدير النظام"}
            </Text>
            <Text style={styles.heroSubtitle}>
              {profile?.active_company_name
                ? `إدارة عمليات وتوزيع ${profile.active_company_name}`
                : "لوحة التحكم والإشراف على الزيارات الميدانية والتحصيل المالي وفريق العمل"}
            </Text>
          </View>

          <View style={styles.heroActions}>
            <TouchableOpacity
              style={styles.heroButton}
              onPress={() => router.push("/company/operations" as never)}
              activeOpacity={0.8}
            >
              <MaterialIcons name="monitor-heart" size={18} color="#FFFFFF" />
              <Text style={styles.heroButtonText}>مركز العمليات المباشر</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.heroSecondaryButton}
              onPress={() => router.push("/company-setup" as never)}
              activeOpacity={0.8}
            >
              <MaterialIcons name="settings" size={18} color="#FFFFFF" />
              <Text style={styles.heroSecondaryButtonText}>تهيئة الشركة</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* 4 Metric Summary Cards */}
        <View style={styles.metricsGrid}>
          <View style={styles.metricCard}>
            <View style={[styles.metricIconBox, { backgroundColor: "#E6F6F0" }]}>
              <MaterialIcons name="task-alt" size={24} color="#14A687" />
            </View>
            <View style={styles.metricInfo}>
              <Text style={styles.metricLabel}>نسبة إنجاز الزيارات</Text>
              <Text style={styles.metricValue}>{completionRate}%</Text>
              <Text style={styles.metricSub}>{completedVisits} مكتملة من أصل {totalVisits}</Text>
            </View>
          </View>

          <View style={styles.metricCard}>
            <View style={[styles.metricIconBox, { backgroundColor: "#EFF6FF" }]}>
              <MaterialIcons name="pending-actions" size={24} color="#3B82F6" />
            </View>
            <View style={styles.metricInfo}>
              <Text style={styles.metricLabel}>الخطط بانتظار الاعتماد</Text>
              <Text style={styles.metricValue}>{pendingPlans}</Text>
              <Text style={styles.metricSub}>خطط أسبوعية تحتاج قرارك</Text>
            </View>
          </View>

          <View style={styles.metricCard}>
            <View style={[styles.metricIconBox, { backgroundColor: "#ECFDF5" }]}>
              <MaterialIcons name="groups" size={24} color="#10B981" />
            </View>
            <View style={styles.metricInfo}>
              <Text style={styles.metricLabel}>المندوبين على رأس العمل</Text>
              <Text style={styles.metricValue}>{activeDutyCount}</Text>
              <Text style={styles.metricSub}>في الميدان وتغطية المناطق</Text>
            </View>
          </View>

          <View style={styles.metricCard}>
            <View style={[styles.metricIconBox, { backgroundColor: "#FFFBEB" }]}>
              <MaterialIcons name="map" size={24} color="#F59E0B" />
            </View>
            <View style={styles.metricInfo}>
              <Text style={styles.metricLabel}>المناطق النشطة</Text>
              <Text style={styles.metricValue}>{data.territories.length}</Text>
              <Text style={styles.metricSub}>تغطية جغرافية معتمدة</Text>
            </View>
          </View>
        </View>

        {/* Section: Quick Access Modules */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>أقسام ووحدات الإدارة</Text>
          <Text style={styles.sectionSubtitle}>
            الوصول السريع إلى جميع بوابات التحكم والتقارير والعمليات
          </Text>
        </View>

        <View style={styles.modulesGrid}>
          {quickModules.map((mod, idx) => (
            <TouchableOpacity
              key={idx}
              style={styles.moduleCard}
              onPress={() => router.push(mod.href as never)}
              activeOpacity={0.75}
            >
              <View style={styles.moduleCardTop}>
                <View style={[styles.moduleIcon, { backgroundColor: mod.bgColor }]}>
                  <MaterialIcons name={mod.icon} size={22} color={mod.color} />
                </View>
                {mod.badge && (
                  <View style={styles.moduleBadge}>
                    <Text style={styles.moduleBadgeText}>{mod.badge}</Text>
                  </View>
                )}
              </View>

              <Text style={styles.moduleTitle}>{mod.title}</Text>
              <Text style={styles.moduleDesc}>{mod.description}</Text>

              <View style={styles.moduleFooter}>
                <Text style={[styles.moduleActionText, { color: mod.color }]}>فتح القسم</Text>
                <MaterialIcons name="arrow-back" size={16} color={mod.color} />
              </View>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </AdminWebShell>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingBottom: 40,
    gap: 24,
  },
  heroBanner: {
    backgroundColor: "#0D2621",
    borderRadius: 24,
    padding: 32,
    flexDirection: Platform.OS === "web" ? ("row-reverse" as any) : "column",
    justifyContent: "space-between",
    alignItems: Platform.OS === "web" ? "center" : "flex-start",
    gap: 20,
    borderWidth: 1,
    borderColor: "#173E36",
    shadowColor: "#0D2621",
    shadowOpacity: 0.1,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
  },
  heroContent: {
    flex: 1,
    alignItems: "flex-end",
  },
  heroBadge: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 6,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 20,
    backgroundColor: "rgba(20, 166, 135, 0.2)",
    marginBottom: 12,
  },
  heroDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#14A687",
  },
  heroBadgeText: {
    color: "#4BE2A8",
    fontSize: 11,
    fontWeight: "800",
  },
  heroTitle: {
    color: "#FFFFFF",
    fontSize: 24,
    fontWeight: "900",
    textAlign: "right",
  },
  heroSubtitle: {
    color: "#9CB8B0",
    fontSize: 13,
    marginTop: 6,
    textAlign: "right",
    lineHeight: 20,
  },
  heroActions: {
    flexDirection: "row-reverse",
    gap: 12,
    alignItems: "center",
  },
  heroButton: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#14A687",
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 14,
  },
  heroButtonText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "800",
  },
  heroSecondaryButton: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.12)",
  },
  heroSecondaryButtonText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },
  metricsGrid: {
    flexDirection: Platform.OS === "web" ? ("row-reverse" as any) : "column",
    gap: 16,
  },
  metricCard: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 20,
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    shadowColor: "#0F2922",
    shadowOpacity: 0.03,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  metricIconBox: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  metricInfo: {
    flex: 1,
    alignItems: "flex-end",
  },
  metricLabel: {
    color: "#64748B",
    fontSize: 12,
    fontWeight: "700",
    textAlign: "right",
  },
  metricValue: {
    color: "#0F172A",
    fontSize: 22,
    fontWeight: "900",
    marginTop: 2,
    textAlign: "right",
  },
  metricSub: {
    color: "#94A3B8",
    fontSize: 10,
    marginTop: 2,
    textAlign: "right",
  },
  sectionHeader: {
    marginTop: 10,
  },
  sectionTitle: {
    fontSize: 19,
    fontWeight: "900",
    color: palette.ink,
    textAlign: "right",
  },
  sectionSubtitle: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 3,
    textAlign: "right",
  },
  modulesGrid: {
    flexDirection: Platform.OS === "web" ? ("row-reverse" as any) : "column",
    flexWrap: "wrap",
    gap: 16,
  },
  moduleCard: {
    width: Platform.OS === "web" ? "calc(33.333% - 11px)" as any : "100%",
    minWidth: 280,
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 22,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    shadowColor: "#0F2922",
    shadowOpacity: 0.04,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    justifyContent: "space-between",
  },
  moduleCardTop: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  moduleIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  moduleBadge: {
    backgroundColor: "#FEF2F2",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#FECACA",
  },
  moduleBadgeText: {
    color: "#EF4444",
    fontSize: 10,
    fontWeight: "800",
  },
  moduleTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: palette.ink,
    textAlign: "right",
    marginBottom: 6,
  },
  moduleDesc: {
    fontSize: 12,
    color: "#64748B",
    textAlign: "right",
    lineHeight: 18,
    marginBottom: 16,
  },
  moduleFooter: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 6,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
  },
  moduleActionText: {
    fontSize: 12,
    fontWeight: "800",
  },
});
