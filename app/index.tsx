import { router } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { palette } from "@/components/crm-ui";
import { useSupabaseAuth } from "@/lib/supabase-auth";

export default function IndexRedirect() {
  const { session, loading } = useSupabaseAuth();
  useEffect(() => {
    if (loading) return;
    const url = typeof window !== "undefined" ? window.location.href : "";
    const isRecovery = url.includes("type=recovery") || url.includes("access_token=") || url.includes("code=");
    if (isRecovery) {
      router.replace("/reset-password" as never);
      return;
    }
    if (session) {
      router.replace("/(tabs)" as never);
    } else {
      router.replace("/login" as never);
    }
  }, [session, loading]);
  return (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#F6F8F7" }}>
      <ActivityIndicator size="large" color={palette.primary} />
    </View>
  );
}
