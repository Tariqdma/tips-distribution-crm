import { Redirect, Tabs, usePathname } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { HapticTab } from "@/components/haptic-tab";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { Platform } from "react-native";
import { useColors } from "@/hooks/use-colors";
import { ActivityIndicator, View } from "react-native";
import { useSupabaseAuth } from "@/lib/supabase-auth";
import { permissionsFromMembership } from "@shared/auth/permission-set";
import { getPostLoginRoute, shouldRedirectManagerFromFieldHome } from "@shared/lib/post-login-route";

export default function TabLayout() {
  const { session, loading, profile } = useSupabaseAuth();
  const pathname = usePathname();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const bottomPadding = Platform.OS === "web" ? 12 : Math.max(insets.bottom, 8);
  const tabBarHeight = 56 + bottomPadding;

  if (loading) return <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}><ActivityIndicator color={colors.tint} /></View>;
  if (!session) return <Redirect href="/login" />;
  if (profile?.must_change_password) return <Redirect href={"/change-password" as never} />;
  const permissions = permissionsFromMembership({ membershipPermissions: profile?.membership_permissions, isPlatformAdmin: profile?.is_platform_admin });
  if (shouldRedirectManagerFromFieldHome(permissions, pathname)) {
    const destination = getPostLoginRoute({ permissions, isWeb: Platform.OS === "web" });
    return <Redirect href={destination as never} />;
  }
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: "#10B981",
        tabBarInactiveTintColor: "#5A6E68",
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarStyle: {
          paddingTop: 8,
          paddingBottom: bottomPadding,
          height: tabBarHeight,
          backgroundColor: "#0A1F1A",
          borderTopColor: "#1E3D33",
          borderTopWidth: 0.5,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "اليوم",
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="house.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="accounts"
        options={{
          title: "الجهات",
          tabBarIcon: ({ color }) => <IconSymbol size={26} name="building.2.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="plans"
        options={{
          title: "مخططي",
          tabBarIcon: ({ color }) => <IconSymbol size={26} name="calendar" color={color} />,
        }}
      />
      <Tabs.Screen
        name="admin"
        options={{
          href: null,
        }}
      />
    </Tabs>
  );
}
