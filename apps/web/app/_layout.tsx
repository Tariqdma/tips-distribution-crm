import "@/global.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { router, Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import "react-native-reanimated";
import { Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import "@/lib/_core/nativewind-pressable";
import { ThemeProvider } from "@/lib/theme-provider";
import { CrmProvider, useCrm } from "@/lib/crm-store";
import { SupabaseAuthProvider } from "@/lib/supabase-auth";
import "@/lib/duty-tracker";
import {
  SafeAreaFrameContext,
  SafeAreaInsetsContext,
  SafeAreaProvider,
  initialWindowMetrics,
} from "react-native-safe-area-context";
import type { EdgeInsets, Metrics, Rect } from "react-native-safe-area-context";

import { trpc, createTRPCClient } from "@/lib/trpc";
import { initManusRuntime, subscribeSafeAreaInsets } from "@/lib/_core/manus-runtime";

const DEFAULT_WEB_INSETS: EdgeInsets = { top: 0, right: 0, bottom: 0, left: 0 };
const DEFAULT_WEB_FRAME: Rect = { x: 0, y: 0, width: 0, height: 0 };

export const unstable_settings = {
  anchor: "(tabs)",
};

function OfflineVisitSyncToast() {
  const { offlineVisitSyncNotice, clearOfflineVisitSyncNotice } = useCrm();

  useEffect(() => {
    if (!offlineVisitSyncNotice) return;
    const timer = setTimeout(clearOfflineVisitSyncNotice, 7000);
    return () => clearTimeout(timer);
  }, [clearOfflineVisitSyncNotice, offlineVisitSyncNotice]);

  if (!offlineVisitSyncNotice) return null;
  const message = offlineVisitSyncNotice.count === 1 ? "تم إرسال تقرير الزيارة المؤجل بنجاح." : `تم إرسال ${offlineVisitSyncNotice.count} تقارير زيارة مؤجلة بنجاح.`;
  return <View style={toastStyles.container} accessibilityLiveRegion="polite"><View style={toastStyles.icon}><Text style={toastStyles.iconText}>✓</Text></View><TouchableOpacity onPress={() => router.push("/visit-sync-history" as never)} style={toastStyles.copy} accessibilityLabel="فتح سجل المزامنات"><Text style={toastStyles.title}>اكتملت مزامنة التقارير</Text><Text style={toastStyles.body}>{message} · عرض السجل</Text></TouchableOpacity><TouchableOpacity onPress={clearOfflineVisitSyncNotice} style={toastStyles.close} accessibilityLabel="إغلاق التنبيه"><Text style={toastStyles.closeText}>×</Text></TouchableOpacity></View>;
}

export default function RootLayout() {
  const initialInsets = initialWindowMetrics?.insets ?? DEFAULT_WEB_INSETS;
  const initialFrame = initialWindowMetrics?.frame ?? DEFAULT_WEB_FRAME;

  const [insets, setInsets] = useState<EdgeInsets>(initialInsets);
  const [frame, setFrame] = useState<Rect>(initialFrame);

  // Initialize Manus runtime for cookie injection from parent container
  useEffect(() => {
    initManusRuntime();
  }, []);

  const handleSafeAreaUpdate = useCallback((metrics: Metrics) => {
    setInsets(metrics.insets);
    setFrame(metrics.frame);
  }, []);

  useEffect(() => {
    if (Platform.OS !== "web") return;
    const unsubscribe = subscribeSafeAreaInsets(handleSafeAreaUpdate);
    return () => unsubscribe();
  }, [handleSafeAreaUpdate]);

  // Create clients once and reuse them
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Disable automatic refetching on window focus for mobile
            refetchOnWindowFocus: false,
            // Retry failed requests once
            retry: 1,
          },
        },
      }),
  );
  const [trpcClient] = useState(() => createTRPCClient());

  // Ensure minimum 8px padding for top and bottom on mobile
  const providerInitialMetrics = useMemo(() => {
    const metrics = initialWindowMetrics ?? { insets: initialInsets, frame: initialFrame };
    return {
      ...metrics,
      insets: {
        ...metrics.insets,
        top: Math.max(metrics.insets.top, 16),
        bottom: Math.max(metrics.insets.bottom, 12),
      },
    };
  }, [initialInsets, initialFrame]);

  const content = (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <trpc.Provider client={trpcClient} queryClient={queryClient}>
        <QueryClientProvider client={queryClient}>
          <SupabaseAuthProvider>
          <CrmProvider>
          {/* Default to hiding native headers so raw route segments don't appear (e.g. "(tabs)", "products/[id]"). */}
          {/* If a screen needs the native header, explicitly enable it and set a human title via Stack.Screen options. */}
          {/* in order for ios apps tab switching to work properly, use presentation: "fullScreenModal" for login page, whenever you decide to use presentation: "modal*/}
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="oauth/callback" />
            <Stack.Screen name="login" />
            <Stack.Screen name="company-request" />
            <Stack.Screen name="request-status" />
            <Stack.Screen name="company" />
            <Stack.Screen name="company-setup" />
            <Stack.Screen name="company-team-setup" />
            <Stack.Screen name="company-territory-setup" />
            <Stack.Screen name="company-account-setup" />
            <Stack.Screen name="offline-drafts" />
            <Stack.Screen name="admin" />
            <Stack.Screen name="platform" />
            <Stack.Screen name="supervisor" />
            <Stack.Screen name="profile" />
            <Stack.Screen name="settings" />
            <Stack.Screen name="change-password" />
            <Stack.Screen name="reset-password" />
          </Stack>
          <OfflineVisitSyncToast />
          <StatusBar style="dark" />
          </CrmProvider>
          </SupabaseAuthProvider>
        </QueryClientProvider>
      </trpc.Provider>
    </GestureHandlerRootView>
  );

  const shouldOverrideSafeArea = Platform.OS === "web";

  if (shouldOverrideSafeArea) {
    return (
      <ThemeProvider>
        <SafeAreaProvider initialMetrics={providerInitialMetrics}>
          <SafeAreaFrameContext.Provider value={frame}>
            <SafeAreaInsetsContext.Provider value={insets}>
              {content}
            </SafeAreaInsetsContext.Provider>
          </SafeAreaFrameContext.Provider>
        </SafeAreaProvider>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider>
      <SafeAreaProvider initialMetrics={providerInitialMetrics}>{content}</SafeAreaProvider>
    </ThemeProvider>
  );
}

const toastStyles = StyleSheet.create({ container: { position: "absolute", top: Platform.OS === "web" ? 18 : 58, left: 18, right: 18, zIndex: 1000, minHeight: 66, borderRadius: 16, padding: 11, backgroundColor: "#0F766E", borderWidth: 1, borderColor: "#0A5F58", flexDirection: "row-reverse", alignItems: "center", gap: 9, shadowColor: "#063F3A", shadowOpacity: 0.25, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 8 }, icon: { width: 31, height: 31, borderRadius: 11, backgroundColor: "#DDF8EE", alignItems: "center", justifyContent: "center" }, iconText: { color: "#0F766E", fontSize: 18, fontWeight: "900", lineHeight: 21 }, copy: { flex: 1, alignItems: "flex-end" }, title: { color: "#FFFFFF", fontSize: 12, fontWeight: "900", textAlign: "right" }, body: { color: "#DDF8EE", fontSize: 10, lineHeight: 15, textAlign: "right", marginTop: 2 }, close: { width: 28, height: 28, alignItems: "center", justifyContent: "center" }, closeText: { color: "#DDF8EE", fontSize: 23, fontWeight: "400", lineHeight: 25 } });
