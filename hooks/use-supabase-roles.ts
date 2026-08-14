import { useCallback, useEffect, useState } from "react";
import type { RoleDefinition } from "@/lib/crm-store";
import { supabase } from "@/lib/supabase-client";
import { useSupabaseAuth } from "@/lib/supabase-auth";

type RoleRow = { key: string; display_name: string; description: string | null; permissions: string[] | null; is_system: boolean; is_active: boolean };
const toRoleDefinition = (row: RoleRow): RoleDefinition => ({ id: row.key, name: row.display_name, description: row.description ?? "", permissions: row.permissions ?? [], isSystem: row.is_system, isActive: row.is_active });
const makeRoleKey = (name: string) => `custom_${name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 45) || Date.now()}`;

export function useSupabaseRoles(fallback: RoleDefinition[]) {
  const { profile, session } = useSupabaseAuth();
  const [roles, setRoles] = useState<RoleDefinition[]>(fallback);
  const canManageRoles = Boolean(profile?.permissions.includes("all") || profile?.permissions.includes("manage_roles"));
  const refresh = useCallback(async () => {
    if (!supabase || !session || !canManageRoles) return;
    const { data, error } = await supabase.rpc("tips_crm_list_roles");
    if (!error && data) setRoles((data as RoleRow[]).map(toRoleDefinition));
  }, [session, canManageRoles]);
  useEffect(() => { void refresh(); }, [refresh]);
  const save = async (input: Omit<RoleDefinition, "id" | "isSystem" | "isActive">, existing?: RoleDefinition) => {
    if (!supabase || !canManageRoles) return false;
    const { error } = await supabase.rpc("tips_crm_save_role", { role_key: existing?.id ?? makeRoleKey(input.name), role_name: input.name, role_description: input.description, role_permissions: input.permissions, role_active: existing?.isActive ?? true });
    if (error) return false;
    await refresh();
    return true;
  };
  const deactivate = async (id: string) => {
    if (!supabase || !canManageRoles) return false;
    const { error } = await supabase.rpc("tips_crm_deactivate_role", { role_key: id });
    if (error) return false;
    await refresh();
    return true;
  };
  return { roles, canManageRoles, refresh, save, deactivate };
}
