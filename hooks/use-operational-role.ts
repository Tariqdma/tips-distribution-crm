import { trpc } from "@/lib/trpc";
import { useAuth } from "@/hooks/use-auth";
import type { AppRole } from "@/lib/crm-store";

function toAppRole(role: "manager" | "sales_rep" | "medical_rep"): AppRole {
  if (role === "manager") return "مدير";
  if (role === "medical_rep") return "مندوب طبي";
  return "مندوب مبيعات";
}

export function useOperationalRole(fallbackRole: AppRole) {
  const { isAuthenticated, loading } = useAuth();
  const profile = trpc.team.me.useQuery(undefined, { enabled: isAuthenticated });
  const role = profile.data ? toAppRole(profile.data.crmRole) : fallbackRole;
  return {
    role,
    isAuthenticated,
    isLoading: loading || (isAuthenticated && profile.isLoading),
    territory: profile.data?.territory,
    usesServerProfile: Boolean(profile.data),
  };
}
