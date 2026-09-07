import React, { useState, type ReactNode } from "react";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { router } from "expo-router";
import {
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { palette } from "@/components/crm-ui";
import { UserMenu } from "@/components/user-menu";
import { useSupabaseAuth } from "@/lib/supabase-auth";

export type PlatformTabKey = "overview" | "companies" | "requests" | "create" | "invitations";

type PlatformNavCategory = {
  title: string;
  items: {
    key: PlatformTabKey;
    label: string;
    icon: keyof typeof MaterialIcons.glyphMap;
    badge?: string | number;
    badgeTone?: "amber" | "teal" | "blue" | "red";
  }[];
};

export function PlatformWebShell({
  children,
  title,
  activeTab = "overview",
  onSelectTab,
  pendingRequestsCount = 0,
  companiesCount = 0,
  pendingInvitationsCount = 0,
  onRefresh,
  isRefreshing = false,
}: {
  children: ReactNode;
  title: string;
  activeTab?: PlatformTabKey;
  onSelectTab?: (tab: PlatformTabKey) => void;
  pendingRequestsCount?: number;
  companiesCount?: number;
  pendingInvitationsCount?: number;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}) {
  const { profile, loading, session } = useSupabaseAuth();
  const { width } = useWindowDimensions();
  const [collapsed, setCollapsed] = useState(false);

  const isSmallScreen = width < 900 && width > 0;
  const isSidebarCollapsed = collapsed || isSmallScreen;

  const categories: PlatformNavCategory[] = [
    {
      title: "الرئيسية والتحكم",
      items: [
        {
          key: "overview",
          label: "لوحة التحكم والتحليلات",
          icon: "dashboard",
        },
      ],
    },
    {
      title: "إدارة المؤسسات والاشتراكات",
      items: [
        {
          key: "companies",
          label: "الشركات والاشتراكات",
          icon: "domain",
          badge: companiesCount > 0 ? String(companiesCount) : undefined,
          badgeTone: "teal",
        },
        {
          key: "requests",
          label: "طلبات الانضمام",
          icon: "pending-actions",
          badge: pendingRequestsCount > 0 ? String(pendingRequestsCount) : undefined,
          badgeTone: "amber",
        },
        {
          key: "create",
          label: "إضافة شركة مباشرة",
          icon: "add-business",
        },
        {
          key: "invitations",
          label: "دعوات مدراء الشركات",
          icon: "mark-email-unread",
          badge: pendingInvitationsCount > 0 ? String(pendingInvitationsCount) : undefined,
          badgeTone: "blue",
        },
      ],
    },
  ];

  if (loading) {
    return (
      <View style={styles.mobileNotice}>
        <Text style={styles.mobileCopy}>يجري التحقق من صلاحيات مدير المنصة…</Text>
      </View>
    );
  }

  if (!session) {
    return (
      <View style={styles.mobileNotice}>
        <MaterialIcons name="lock-outline" size={36} color={palette.primary} />
        <Text style={styles.mobileTitle}>تسجيل الدخول مطلوب</Text>
        <Text style={styles.mobileCopy}>تحتاج إلى تسجيل الدخول كمدير منصة للوصول إلى هذه اللوحة.</Text>
        <TouchableOpacity onPress={() => router.replace("/login" as never)} style={styles.loginButton}>
          <Text style={styles.loginButtonText}>تسجيل الدخول</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      {/* SIDEBAR */}
      <View style={[styles.sidebar, isSidebarCollapsed ? styles.sidebarCollapsed : styles.sidebarExpanded]}>
        {/* Brand Header */}
        <TouchableOpacity
          style={styles.brandHeader}
          onPress={() => onSelectTab?.("overview")}
          activeOpacity={0.8}
        >
          <View style={styles.brandMark}>
            <Text style={styles.brandMarkText}>T</Text>
          </View>
          {!isSidebarCollapsed && (
            <View style={styles.brandTextCol}>
              <Text style={styles.brandTitle}>Tips CRM</Text>
              <Text style={styles.brandSubtitle}>بوابة مدير المنصة الرئيسي</Text>
            </View>
          )}
        </TouchableOpacity>

        {/* Navigation Categories */}
        <View
          style={[
            styles.navScrollContainer,
            Platform.OS === "web" ? ({ overflowY: "auto" } as any) : null,
          ]}
        >
          <View style={styles.navCategoryList}>
            {categories.map((category, catIdx) => (
              <View key={catIdx} style={styles.categoryBlock}>
                {!isSidebarCollapsed && (
                  <Text style={styles.categoryHeader}>{category.title}</Text>
                )}
                {category.items.map((item) => {
                  const isActive = activeTab === item.key;
                  return (
                    <TouchableOpacity
                      key={item.key}
                      onPress={() => {
                        if (onSelectTab) {
                          onSelectTab(item.key);
                        }
                      }}
                      style={[
                        styles.navItem,
                        isSidebarCollapsed && styles.navItemCollapsed,
                        isActive && styles.navItemActive,
                      ]}
                      activeOpacity={0.7}
                    >
                      <MaterialIcons
                        name={item.icon}
                        size={20}
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
                      {!isSidebarCollapsed && item.badge ? (
                        <View
                          style={[
                            styles.navBadge,
                            item.badgeTone === "amber" && styles.badgeAmber,
                            item.badgeTone === "teal" && styles.badgeTeal,
                            item.badgeTone === "blue" && styles.badgeBlue,
                          ]}
                        >
                          <Text style={styles.navBadgeText}>{item.badge}</Text>
                        </View>
                      ) : null}
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}
          </View>
        </View>

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
        {/* TOPBAR */}
        <View style={styles.topbar}>
          {/* Header Right: Page Title */}
          <View style={styles.topbarRight}>
            <View style={styles.titleWrapper}>
              <Text style={styles.pageTitle}>{title}</Text>
            </View>
          </View>

          {/* Header Left: User Menu */}
          <View style={styles.topbarLeft}>
            <UserMenu />
          </View>
        </View>

        {/* BODY */}
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
    height: "100%",
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
    ...(Platform.OS === "web" ? ({ cursor: "pointer" } as any) : null),
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

  navScrollContainer: {
    flex: 1,
    paddingVertical: 12,
  },
  navCategoryList: {
    paddingHorizontal: 10,
    gap: 16,
  },
  categoryBlock: {
    gap: 3,
  },
  categoryHeader: {
    color: "#4E736B",
    fontSize: 10,
    fontWeight: "800",
    textAlign: "right",
    paddingHorizontal: 12,
    paddingVertical: 4,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },

  navItem: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    ...(Platform.OS === "web" ? ({ cursor: "pointer", userSelect: "none" } as any) : null),
  },
  navItemCollapsed: {
    justifyContent: "center",
    paddingHorizontal: 0,
  },
  navItemActive: {
    backgroundColor: "#14A687",
  },
  navItemLabel: {
    flex: 1,
    color: "#9BB3AC",
    fontSize: 13,
    fontWeight: "700",
    textAlign: "right",
  },
  navItemLabelActive: {
    color: "#FFFFFF",
    fontWeight: "900",
  },
  navBadge: {
    backgroundColor: "#1B3B33",
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10,
  },
  badgeAmber: {
    backgroundColor: "#D97706",
  },
  badgeTeal: {
    backgroundColor: "#059669",
  },
  badgeBlue: {
    backgroundColor: "#2563EB",
  },
  navBadgeText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "900",
  },

  sidebarFooter: {
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.08)",
    gap: 10,
  },
  collapseToggle: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    ...(Platform.OS === "web" ? ({ cursor: "pointer" } as any) : null),
  },
  collapseToggleText: {
    color: "#8EA8A1",
    fontSize: 12,
    fontWeight: "700",
  },
  statusIndicator: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 10,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "#10B981",
  },
  statusText: {
    color: "#6EE7B7",
    fontSize: 10,
    fontWeight: "700",
  },

  // MAIN CONTAINER
  mainContainer: {
    flex: 1,
    flexDirection: "column",
    height: "100%",
    overflow: "hidden",
  },
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
    padding: 6,
    borderRadius: 8,
    backgroundColor: "#F1F5F9",
    ...(Platform.OS === "web" ? ({ cursor: "pointer" } as any) : null),
  },
  titleWrapper: {
    alignItems: "flex-end",
  },
  pageTitle: {
    color: "#0F172A",
    fontSize: 16,
    fontWeight: "900",
    textAlign: "right",
  },
  breadcrumbText: {
    color: "#64748B",
    fontSize: 11,
    fontWeight: "600",
    marginTop: 1,
    textAlign: "right",
  },
  topbarLeft: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 12,
  },
  refreshBtn: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 6,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: "#F0FDF8",
    borderWidth: 1,
    borderColor: "#CCEBE2",
    ...(Platform.OS === "web" ? ({ cursor: "pointer" } as any) : null),
  },
  refreshBtnText: {
    color: palette.primary,
    fontSize: 12,
    fontWeight: "800",
  },

  pageBody: {
    flex: 1,
    backgroundColor: "#F4F7F6",
  },

  // Fallbacks
  mobileNotice: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    backgroundColor: "#F4F7F6",
  },
  mobileTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: "#0F172A",
    marginTop: 12,
  },
  mobileCopy: {
    fontSize: 13,
    color: "#64748B",
    marginTop: 6,
    textAlign: "center",
  },
  loginButton: {
    marginTop: 18,
    backgroundColor: palette.primary,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 12,
  },
  loginButtonText: {
    color: "#FFFFFF",
    fontWeight: "800",
    fontSize: 13,
  },
});
