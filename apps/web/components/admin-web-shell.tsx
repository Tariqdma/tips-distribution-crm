import React, { useState, type ReactNode } from "react";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { Redirect, router, usePathname } from "expo-router";
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { palette } from "@/components/crm-ui";
import { UserMenu } from "@/components/user-menu";
import { useSupabaseAuth } from "@/lib/supabase-auth";

type NavItem = {
  label: string;
  icon: keyof typeof MaterialIcons.glyphMap;
  href: string;
  badge?: string;
};

type NavCategory = {
  title: string;
  items: NavItem[];
};

const companyNavCategories: NavCategory[] = [
  {
    title: "الرئيسية",
    items: [
      { label: "لوحة التحكم", icon: "dashboard", href: "/company" },
    ],
  },
  {
    title: "العمليات والميدان",
    items: [
      { label: "مركز العمليات المباشر", icon: "monitor-heart", href: "/company/operations" },
      { label: "اعتماد الخطط الأسبوعية", icon: "fact-check", href: "/company/weekly-plans" },
      { label: "نتائج وتحديثات الزيارة", icon: "playlist-add-check", href: "/company/outcomes" },
    ],
  },
  {
    title: "المالية والتحصيل",
    items: [
      { label: "التحصيل اليومي", icon: "receipt-long", href: "/company/daily-collections" },
      { label: "بحث وتدقيق الإيصالات", icon: "travel-explore", href: "/company/receipt-search" },
      { label: "التحكم المالي والعهد", icon: "account-balance-wallet", href: "/company/financial-control" },
    ],
  },
  {
    title: "البرامج والتغطية الطبية",
    items: [
      { label: "تقارير التغطية الطبية", icon: "medical-services", href: "/company/medical-reports" },
      { label: "البرنامج والفعاليات الطبية", icon: "biotech", href: "/company/medical-program" },
    ],
  },
  {
    title: "إدارة المؤسسة والنظام",
    items: [
      { label: "فريق العمل والمندوبين", icon: "groups", href: "/company/team" },
      { label: "الأدوار والصلاحيات", icon: "admin-panel-settings", href: "/company/roles" },
      { label: "سجل التدقيق والحركات", icon: "history", href: "/company/audit" },
    ],
  },
];

const platformNavCategories: NavCategory[] = [
  {
    title: "الرئيسية والتحكم",
    items: [
      { label: "لوحة تحكم المنصة", icon: "dashboard", href: "/platform" },
    ],
  },
  {
    title: "إدارة المؤسسات والاشتراكات",
    items: [
      { label: "الشركات والاشتراكات", icon: "domain", href: "/platform" },
      { label: "طلبات الانضمام", icon: "pending-actions", href: "/platform" },
      { label: "إضافة شركة مباشرة", icon: "add-business", href: "/platform" },
      { label: "دعوات مدراء الشركات", icon: "mark-email-unread", href: "/platform" },
    ],
  },
];

export function AdminWebShell({ children, title }: { children: ReactNode; title: string }) {
  const pathname = usePathname();
  const { session, loading, profile } = useSupabaseAuth();
  const { width } = useWindowDimensions();
  const [collapsed, setCollapsed] = useState(false);

  const isSmallScreen = width < 900 && width > 0;
  const isSidebarCollapsed = collapsed || isSmallScreen;

  const isPlatform = Boolean(profile?.is_platform_admin);
  const currentNavCategories = isPlatform ? platformNavCategories : companyNavCategories;

  if (loading) {
    return (
      <View style={styles.mobileNotice}>
        <Text style={styles.mobileCopy}>يجري التحقق من الجلسة والصلاحيات…</Text>
      </View>
    );
  }

  if (!session) {
    return (
      <View style={styles.mobileNotice}>
        <MaterialIcons name="lock-outline" size={36} color={palette.primary} />
        <Text style={styles.mobileTitle}>تسجيل الدخول مطلوب</Text>
        <Text style={styles.mobileCopy}>تحتاج إلى حساب معتمد للوصول إلى لوحة الإدارة.</Text>
        <TouchableOpacity
          onPress={() => router.replace("/login" as never)}
          style={styles.loginButton}
        >
          <Text style={styles.loginButtonText}>تسجيل الدخول</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (profile?.is_platform_admin && pathname !== "/profile" && pathname !== "/settings") {
    return <Redirect href={"/platform" as never} />;
  }

  return (
    <View style={styles.root}>
      {/* SIDEBAR */}
      <View style={[styles.sidebar, isSidebarCollapsed ? styles.sidebarCollapsed : styles.sidebarExpanded]}>
        {/* Logo Brand Header */}
        <TouchableOpacity
          style={styles.brandHeader}
          onPress={() => router.replace(profile?.is_platform_admin ? ("/platform" as never) : ("/company" as never))}
          activeOpacity={0.85}
        >
          <View style={styles.brandMark}>
            <Text style={styles.brandMarkText}>T</Text>
          </View>
          {!isSidebarCollapsed && (
            <View style={styles.brandTextCol}>
              <Text style={styles.brandTitle}>Tips CRM</Text>
              <Text style={styles.brandSubtitle}>
                {profile?.is_platform_admin ? "بوابة مدير المنصة" : (profile?.active_company_name || "بوابة الإدارة الشاملة")}
              </Text>
            </View>
          )}
        </TouchableOpacity>

        {/* Navigation Links List */}
        <ScrollView style={styles.navScroll} showsVerticalScrollIndicator={false}>
          <View style={styles.navCategoryList}>
            {currentNavCategories.map((category, catIdx) => (
              <View key={catIdx} style={styles.categoryBlock}>
                {!isSidebarCollapsed && (
                  <Text style={styles.categoryHeader}>{category.title}</Text>
                )}
                {category.items.map((item) => {
                  const isExactActive = pathname === item.href;
                  const isSubActive =
                    item.href !== "/company" && item.href !== "/platform" && pathname.startsWith(item.href);
                  const isActive = isExactActive || isSubActive;

                  return (
                    <TouchableOpacity
                      key={item.href}
                      onPress={() => router.replace(item.href as never)}
                      style={[
                        styles.navItem,
                        isSidebarCollapsed && styles.navItemCollapsed,
                        isActive && styles.navItemActive,
                      ]}
                      activeOpacity={0.7}
                    >
                      <MaterialIcons
                        name={item.icon}
                        size={19}
                        color={isActive ? "#FFFFFF" : "#8EA8A1"}
                      />
                      {!isSidebarCollapsed && (
                        <Text
                          style={[
                            styles.navItemLabel,
                            isActive && styles.navItemLabelActive,
                          ]}
                          numberOfLines={1}
                        >
                          {item.label}
                        </Text>
                      )}
                      {!isSidebarCollapsed && item.badge && (
                        <View style={styles.navBadge}>
                          <Text style={styles.navBadgeText}>{item.badge}</Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}
          </View>
        </ScrollView>

        {/* Sidebar Footer */}
        <View style={styles.sidebarFooter}>
          <TouchableOpacity
            style={styles.collapseToggle}
            onPress={() => setCollapsed(!collapsed)}
            activeOpacity={0.7}
          >
            <MaterialIcons
              name={isSidebarCollapsed ? "chevron-left" : "chevron-right"}
              size={20}
              color="#8EA8A1"
            />
            {!isSidebarCollapsed && (
              <Text style={styles.collapseToggleText}>طي القائمة الجانبية</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* MAIN CONTAINER */}
      <View style={styles.mainContainer}>
        {/* HEADER / TOPBAR */}
        <View style={styles.topbar}>
          {/* Header Right: Page Title */}
          <View style={styles.topbarRight}>
            <View style={styles.titleWrapper}>
              <Text style={styles.pageTitle}>{title}</Text>
            </View>
          </View>

          {/* Header Left: User Menu Dropdown (Avatar + Profile + Logout) */}
          <View style={styles.topbarLeft}>
            <UserMenu />
          </View>
        </View>

        {/* PAGE CONTENT */}
        <View style={styles.pageBody}>{children}</View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    flexDirection: "row-reverse",
    backgroundColor: "#F4F7F6",
    height: "100%",
    width: "100%",
  },

  // SIDEBAR
  sidebar: {
    backgroundColor: "#0B1D19",
    borderLeftWidth: 1,
    borderLeftColor: "rgba(255, 255, 255, 0.07)",
    flexDirection: "column",
    zIndex: 100,
  },
  sidebarExpanded: {
    width: 260,
  },
  sidebarCollapsed: {
    width: 72,
  },

  brandHeader: {
    height: 68,
    flexDirection: "row-reverse",
    alignItems: "center",
    paddingHorizontal: 16,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.08)",
  },
  brandMark: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: "#14A687",
    alignItems: "center",
    justifyContent: "center",
  },
  brandMarkText: {
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "900",
  },
  brandTextCol: {
    flex: 1,
    alignItems: "flex-end",
  },
  brandTitle: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  brandSubtitle: {
    color: "#6EE7B7",
    fontSize: 10,
    fontWeight: "700",
    marginTop: 2,
  },

  navScroll: {
    flex: 1,
  },
  navCategoryList: {
    paddingVertical: 14,
    paddingHorizontal: 10,
    gap: 16,
  },
  categoryBlock: {
    gap: 4,
  },
  categoryHeader: {
    color: "rgba(255, 255, 255, 0.35)",
    fontSize: 11,
    fontWeight: "800",
    textAlign: "right",
    paddingHorizontal: 10,
    marginBottom: 6,
    letterSpacing: 0.3,
  },

  navItem: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 10,
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  navItemCollapsed: {
    justifyContent: "center",
    paddingHorizontal: 0,
  },
  navItemActive: {
    backgroundColor: "#14A687",
  },
  navItemLabel: {
    color: "#C2D4CF",
    fontSize: 12,
    fontWeight: "700",
    textAlign: "right",
    flex: 1,
  },
  navItemLabelActive: {
    color: "#FFFFFF",
    fontWeight: "900",
  },
  navBadge: {
    backgroundColor: "rgba(239, 68, 68, 0.2)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#EF4444",
  },
  navBadgeText: {
    color: "#FCA5A5",
    fontSize: 9,
    fontWeight: "800",
  },

  sidebarFooter: {
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.08)",
    padding: 12,
    gap: 10,
  },
  collapseToggle: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 8,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  collapseToggleText: {
    color: "#8EA8A1",
    fontSize: 11,
    fontWeight: "700",
  },
  statusIndicator: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 8,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "#10B981",
  },
  statusText: {
    color: "rgba(255, 255, 255, 0.4)",
    fontSize: 10,
    fontWeight: "600",
  },

  // MAIN CONTAINER
  mainContainer: {
    flex: 1,
    flexDirection: "column",
    height: "100%",
    overflow: "hidden",
  },

  // TOPBAR
  topbar: {
    height: 68,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    zIndex: 50,
  },
  topbarRight: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 12,
  },
  sidebarToggleButton: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
  },
  titleWrapper: {
    alignItems: "flex-end",
  },
  pageTitle: {
    color: "#0F172A",
    fontSize: 16,
    fontWeight: "900",
  },
  breadcrumbText: {
    color: "#94A3B8",
    fontSize: 10,
    fontWeight: "600",
    marginTop: 2,
  },
  topbarLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },

  // PAGE BODY
  pageBody: {
    flex: 1,
    overflow: "hidden",
  },

  // Mobile Notice
  mobileNotice: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    backgroundColor: "#F8FAFC",
  },
  mobileTitle: {
    color: palette.ink,
    fontSize: 18,
    fontWeight: "900",
    marginTop: 12,
    textAlign: "center",
  },
  mobileCopy: {
    color: palette.muted,
    fontSize: 13,
    lineHeight: 20,
    marginTop: 6,
    textAlign: "center",
  },
  loginButton: {
    backgroundColor: palette.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 20,
  },
  loginButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "900",
  },
});
