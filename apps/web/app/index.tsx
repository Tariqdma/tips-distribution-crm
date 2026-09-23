import { Redirect } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import { palette } from "../components/crm-ui";
import { useSupabaseAuth } from "../lib/supabase-auth";

export default function WebIndexPortal() {
  const { session, profile, loading } = useSupabaseAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#0D1E19" }}>
        <ActivityIndicator size="large" color={palette.primary} />
      </View>
    );
  }

  if (!session) {
    return <Redirect href={"/login" as never} />;
  }

  if (profile?.is_platform_admin) {
    return <Redirect href={"/platform" as never} />;
  }

  if (profile?.role_key === "company_manager" || profile?.role_key === "sales_manager" || profile?.role_key === "system_admin") {
    return <Redirect href={"/company" as never} />;
  }

  if (profile?.role_key === "sales_supervisor" || profile?.role_key === "medical_supervisor") {
    return <Redirect href={"/supervisor" as never} />;
  }

  return <Redirect href={"/company" as never} />;
}
