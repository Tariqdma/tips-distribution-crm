import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useCallback, useEffect, useRef, useState } from "react";
import { Animated, Platform, Pressable, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { palette } from "@/components/crm-ui";
import { UserAvatar } from "@/components/user-avatar";
import { useSupabaseAuth } from "@/lib/supabase-auth";
import { router } from "expo-router";

type MenuItem = {
  icon: keyof typeof MaterialIcons.glyphMap;
  label: string;
  onPress: () => void;
  tone?: "danger";
};

export function UserMenu() {
  const { profile, session, signOut } = useSupabaseAuth();
  const [open, setOpen] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.92)).current;

  const loadAvatar = useCallback(() => {
    const metaAvatar = (session?.user?.user_metadata as any)?.avatar_url;
    if (metaAvatar) {
      setAvatarUrl(metaAvatar);
    } else if (profile?.id && typeof window !== "undefined") {
      const saved = localStorage.getItem(`tips-crm-avatar-${profile.id}`);
      setAvatarUrl(saved || null);
    }
  }, [session, profile?.id]);

  useEffect(() => {
    loadAvatar();
    if (typeof window !== "undefined") {
      const handleUserUpdated = () => loadAvatar();
      window.addEventListener("tips-user-updated", handleUserUpdated);
      window.addEventListener("storage", handleUserUpdated);
      return () => {
        window.removeEventListener("tips-user-updated", handleUserUpdated);
        window.removeEventListener("storage", handleUserUpdated);
      };
    }
  }, [loadAvatar]);

  const showMenu = useCallback(() => {
    setOpen(true);
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 180, useNativeDriver: true }),
      Animated.spring(scaleAnim, { toValue: 1, friction: 8, tension: 140, useNativeDriver: true }),
    ]).start();
  }, [fadeAnim, scaleAnim]);

  const hideMenu = useCallback(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 0, duration: 120, useNativeDriver: true }),
      Animated.timing(scaleAnim, { toValue: 0.92, duration: 120, useNativeDriver: true }),
    ]).start(() => setOpen(false));
  }, [fadeAnim, scaleAnim]);

  const handleLogout = useCallback(async () => {
    hideMenu();
    try {
      await signOut();
    } catch (e) {
      console.error("Sign out error:", e);
    }
    router.replace("/login" as never);
  }, [hideMenu, signOut]);

  // Determine role-based links
  const isPlatformAdmin = Boolean(profile?.is_platform_admin);
  const isCompanyManager =
    !isPlatformAdmin &&
    (profile?.role_key === "company_manager" ||
      profile?.role_key === "sales_manager" ||
      profile?.role_key === "system_admin");
  const isSupervisor =
    profile?.role_key === "sales_supervisor" || profile?.role_key === "medical_supervisor";

  const menuItems: MenuItem[] = [
    {
      icon: "person-outline",
      label: "الملف الشخصي",
      onPress: () => {
        hideMenu();
        router.push("/profile" as never);
      },
    },
    {
      icon: "settings",
      label: "الإعدادات",
      onPress: () => {
        hideMenu();
        router.push("/settings" as never);
      },
    },
  ];

  // Only Company Managers get Company Setup
  if (isCompanyManager) {
    menuItems.push({
      icon: "settings-suggest",
      label: "إعدادات وهوية الشركة",
      onPress: () => {
        hideMenu();
        router.push("/company-setup" as never);
      },
    });
  }

  // Supervisors get quick link to supervisor portal
  if (isSupervisor) {
    menuItems.push({
      icon: "supervisor-account",
      label: "بوابة المشرف",
      onPress: () => {
        hideMenu();
        router.push("/supervisor" as never);
      },
    });
  }

  // Common logout
  menuItems.push({
    icon: "logout",
    label: "تسجيل الخروج",
    onPress: () => void handleLogout(),
    tone: "danger",
  });

  const displayName = profile?.full_name || "مستخدم النظام";
  const displayRole = profile?.role_name || profile?.role_key || "مسؤول النظام";

  return (
    <View style={styles.container}>
      <TouchableOpacity
        onPress={open ? hideMenu : showMenu}
        style={styles.triggerButton}
        accessibilityLabel="قائمة المستخدم"
        activeOpacity={0.8}
      >
        <UserAvatar
          src={avatarUrl}
          name={displayName}
          size={38}
          borderRadius={19}
          backgroundColor="#14A687"
          color="#FFFFFF"
          fontSize={13}
        />
        <View style={styles.triggerTextWrapper}>
          <Text style={styles.triggerName} numberOfLines={1}>{displayName}</Text>
          <Text style={styles.triggerRole} numberOfLines={1}>{displayRole}</Text>
        </View>
        <MaterialIcons
          name={open ? "keyboard-arrow-up" : "keyboard-arrow-down"}
          size={18}
          color={palette.muted}
        />
      </TouchableOpacity>

      {open && (
        <>
          <Pressable
            onPress={hideMenu}
            style={[
              styles.backdrop,
              Platform.OS === "web" ? ({ position: "fixed" as const } as any) : { position: "absolute" as const },
            ]}
          />
          <Animated.View
            style={[
              styles.dropdown,
              { opacity: fadeAnim, transform: [{ scale: scaleAnim }] },
            ]}
          >
            {/* Header info */}
            <View style={styles.menuHeader}>
              <UserAvatar
                src={avatarUrl}
                name={displayName}
                size={44}
                borderRadius={22}
                backgroundColor="#14A687"
                color="#FFFFFF"
                fontSize={15}
              />
              <View style={styles.menuInfo}>
                <Text style={styles.menuName} numberOfLines={1}>{displayName}</Text>
                <Text style={styles.menuRole} numberOfLines={1}>{displayRole}</Text>
                {profile?.email && (
                  <Text style={styles.menuEmail} numberOfLines={1}>{profile.email}</Text>
                )}
              </View>
            </View>

            <View style={styles.divider} />

            {/* Menu Items */}
            {menuItems.map((item, index) => {
              const isDanger = item.tone === "danger";
              return (
                <TouchableOpacity
                  key={index}
                  onPress={item.onPress}
                  style={[styles.menuItem, isDanger && styles.menuItemDangerHover]}
                  accessibilityLabel={item.label}
                  activeOpacity={0.7}
                >
                  <MaterialIcons
                    name={item.icon}
                    size={18}
                    color={isDanger ? "#EF4444" : "#4A5568"}
                  />
                  <Text style={[styles.menuItemText, isDanger && styles.menuItemDangerText]}>
                    {item.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </Animated.View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "relative",
    zIndex: 9999,
  },
  triggerButton: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 10,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 24,
    backgroundColor: "#F0FDF8",
    borderWidth: 1,
    borderColor: "#CCEBE2",
  },
  triggerTextWrapper: {
    alignItems: "flex-end",
  },
  triggerName: {
    color: palette.ink,
    fontSize: 13,
    fontWeight: "800",
    textAlign: "right",
  },
  triggerRole: {
    color: "#64748B",
    fontSize: 10,
    fontWeight: "600",
    textAlign: "right",
    marginTop: 1,
  },
  backdrop: {
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 9998,
  },
  dropdown: {
    position: "absolute",
    top: 54,
    left: 0,
    minWidth: 240,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    paddingVertical: 8,
    shadowColor: "#0F2922",
    shadowOpacity: 0.15,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 16,
    zIndex: 9999,
  },
  menuHeader: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  menuInfo: {
    flex: 1,
    alignItems: "flex-end",
  },
  menuName: {
    color: palette.ink,
    fontSize: 14,
    fontWeight: "800",
    textAlign: "right",
  },
  menuRole: {
    color: "#14A687",
    fontSize: 11,
    fontWeight: "700",
    marginTop: 2,
    textAlign: "right",
  },
  menuEmail: {
    color: "#94A3B8",
    fontSize: 10,
    marginTop: 2,
    textAlign: "right",
  },
  divider: {
    height: 1,
    backgroundColor: "#F1F5F9",
    marginHorizontal: 12,
    marginVertical: 6,
  },
  menuItem: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 10,
    marginHorizontal: 6,
  },
  menuItemText: {
    color: "#1E293B",
    fontSize: 13,
    fontWeight: "700",
    textAlign: "right",
    flex: 1,
  },
  menuItemDangerText: {
    color: "#EF4444",
  },
  menuItemDangerHover: {
    backgroundColor: "#FEF2F2",
  },
});
