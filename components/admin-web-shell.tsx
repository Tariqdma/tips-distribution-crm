import React, { useState, type ReactNode } from "react";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { Redirect, router, usePathname } from "expo-router";
import {
  Platform,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { palette } from "@/components/crm-ui";
import { UserMenu } from "@/components/user-menu";
import { usePermissions } from "@/hooks/use-permissions";
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
  const { can } = usePermissions();
  const { width } = useWindowDimensions();
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const insets = useSafeAreaInsets();

  // Phones get a top bar with a drawer instead of the permanent sidebar,
  // which leaves no room for page content at phone widths.
  const isPhone = Platform.OS !== "web" || (width > 0 && width < 700);
  const isSmallScreen = width < 900 && width > 0;
  const isSidebarCollapsed = collapsed || isSmallScreen;

  const isPlatform = Boolean(profile?.is_platform_admin);
  const currentNavCategories = (isPlatform ? platformNavCategories : companyNavCategories).map((category) => ({
    ...category,
    items: category.items.filter((item) => item.href !== "/company/roles" || can("role.custom.manage")),
  })).filter((category) => category.items.length > 0);

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

  const renderNavList = (compact: boolean, onNavigate?: () => void) => (
    <View style={styles.navCategoryList}>
      {currentNavCategories.map((category, catIdx) => (
        <View key={catIdx} style={styles.categoryBlock}>
          {!compact && <Text style={styles.categoryHeader}>{category.title}</Text>}
          {category.items.map((item) => {
            const isExactActive = pathname === item.href;
            const isSubActive = item.href !== "/company" && item.href !== "/platform" && pathname.startsWith(item.href);
            const isActive = isExactActive || isSubActive;
            return (
              <TouchableOpacity
                key={item.href}
                onPress={() => {
                  onNavigate?.();
                  router.replace(item.href as never);
                }}
                style={[styles.navItem, compact && styles.navItemCollapsed, isActive && styles.navItemActive]}
                activeOpacity={0.7}
              >
                <MaterialIcons name={item.icon} size={19} color={isActive ? "#10B981" : "#9BB8AE"} />
                {!compact && (
                  <Text style={[styles.navItemLabel, isActive && styles.navItemLabelActive]} numberOfLines={1}>
                    {item.label}
                  </Text>
                )}
                {!compact && item.badge && (
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
  );

  const brandSubtitle = profile?.is_platform_admin ? "بوابة مدير المنصة" : (profile?.active_company_name || "بوابة الإدارة الشاملة");

  if (isPhone) {
    return (
      <View style={[styles.root, styles.phoneRoot]}>
        <View style={[styles.topbar, styles.phoneTopbar, { paddingTop: insets.top, height: 60 + insets.top }]}>
          <View style={styles.topbarRight}>
            <TouchableOpacity
              style={styles.sidebarToggleButton}
              onPress={() => setDrawerOpen(true)}
              accessibilityLabel="فتح القائمة"
              activeOpacity={0.7}
            >
              <MaterialIcons name="menu" size={22} color="#0D1F1A" />
            </TouchableOpacity>
            <View style={styles.titleWrapper}>
              <Text style={styles.pageTitle} numberOfLines={1}>{title}</Text>
            </View>
          </View>
          <View style={styles.topbarLeft}>
            <UserMenu />
          </View>
        </View>

        <View style={styles.pageBody}>{children}</View>

        <Modal visible={drawerOpen} transparent animationType="fade" onRequestClose={() => setDrawerOpen(false)}>
          <View style={styles.drawerOverlay}>
            <View style={[styles.drawer, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 12 }]}>
              <View style={styles.brandHeader}>
                <View style={styles.brandMark}>
                  <Image source={require("@/assets/images/icon.png")} style={styles.brandLogo} resizeMode="contain" />
                </View>
                <View style={styles.brandTextCol}>
                  <Text style={styles.brandTitle}>Tips CRM</Text>
                  <Text style={styles.brandSubtitle} numberOfLines={1}>{brandSubtitle}</Text>
                </View>
                <TouchableOpacity onPress={() => setDrawerOpen(false)} accessibilityLabel="إغلاق القائمة" style={styles.drawerClose}>
                  <MaterialIcons name="close" size={22} color="#9BB8AE" />
                </TouchableOpacity>
              </View>
              <ScrollView style={styles.navScroll} showsVerticalScrollIndicator={false}>
                {renderNavList(false, () => setDrawerOpen(false))}
              </ScrollView>
            </View>
            <Pressable style={styles.drawerBackdrop} onPress={() => setDrawerOpen(false)} accessibilityLabel="إغلاق القائمة" />
          </View>
        </Modal>
      </View>
    );
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
            <Image source={require("@/assets/images/icon.png")} style={styles.brandLogo} resizeMode="contain" />
          </View>
          {!isSidebarCollapsed && (
            <View style={styles.brandTextCol}>
              <Text style={styles.brandTitle}>Tips CRM</Text>
              <Text style={styles.brandSubtitle}>{brandSubtitle}</Text>
            </View>
          )}
        </TouchableOpacity>

        {/* Navigation Links List */}
        <ScrollView style={styles.navScroll} showsVerticalScrollIndicator={false}>
          {renderNavList(isSidebarCollapsed)}
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
              color="#9BB8AE"
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
    backgroundColor: "#F0F7F4",
    height: "100%",
    width: "100%",
  },

  // SIDEBAR
  sidebar: {
    backgroundColor: "#0A1F1A",
    borderLeftWidth: 1,
    borderLeftColor: "#1E3D33",
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
    backgroundColor: "#071510",
    borderBottomWidth: 1,
    borderBottomColor: "#1E3D33",
  },
  brandMark: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  brandLogo: {
    width: 30,
    height: 30,
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
    backgroundColor: "transparent",
    borderLeftWidth: 3,
    borderLeftColor: "transparent",
  },
  navItemCollapsed: {
    justifyContent: "center",
    paddingHorizontal: 0,
  },
  navItemActive: {
    backgroundColor: "#1E3D33",
    borderLeftColor: "#10B981",
  },
  navItemLabel: {
    color: "#9BB8AE",
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
    color: "#9BB8AE",
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
    borderBottomColor: "#D4E8E0",
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
    color: "#0D1F1A",
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

  // PHONE LAYOUT
  phoneRoot: {
    flexDirection: "column",
  },
  phoneTopbar: {
    paddingHorizontal: 14,
  },
  drawerOverlay: {
    flex: 1,
    flexDirection: "row-reverse",
  },
  drawer: {
    width: "82%",
    maxWidth: 320,
    backgroundColor: "#0A1F1A",
    paddingHorizontal: 10,
  },
  drawerBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.45)",
  },
  drawerClose: {
    padding: 6,
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
    backgroundColor: "#F0F7F4",
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
