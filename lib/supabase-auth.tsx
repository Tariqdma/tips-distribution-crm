import type { Session, User } from "@supabase/supabase-js";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { supabase } from "@/lib/supabase-client";

export type SupabaseProfile = { id: string; full_name: string; email: string | null; role_key: string; role_name: string; permissions: string[]; is_active: boolean; must_change_password: boolean; territory_key?: string | null; territory_label?: string | null; territory_keys?: string[] | null; territory_labels?: string[] | null };
type SupabaseAuthValue = { session: Session | null; user: User | null; profile: SupabaseProfile | null; loading: boolean; refreshProfile: () => Promise<SupabaseProfile | null>; claimFirstSystemAdmin: () => Promise<boolean>; signOut: () => Promise<void> };
const SupabaseAuthContext = createContext<SupabaseAuthValue | null>(null);

export function SupabaseAuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<SupabaseProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const refreshProfile = async (): Promise<SupabaseProfile | null> => {
    if (!supabase) return null;
    const { data } = await supabase.rpc("tips_crm_my_profile");
    const nextProfile = (data?.[0] as SupabaseProfile | undefined) ?? null;
    setProfile(nextProfile);
    return nextProfile;
  };
  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    void supabase.auth.getSession().then(async ({ data }) => { setSession(data.session); if (data.session) await refreshProfile(); setLoading(false); });
    const { data: subscription } = supabase.auth.onAuthStateChange(async (_event, nextSession) => { setSession(nextSession); if (nextSession) await refreshProfile(); else setProfile(null); setLoading(false); });
    return () => subscription.subscription.unsubscribe();
  }, []);
  const claimFirstSystemAdmin = async () => { if (!supabase) return false; const { data, error } = await supabase.rpc("tips_crm_claim_first_system_admin"); if (error || !data) return false; await refreshProfile(); return true; };
  const value = useMemo<SupabaseAuthValue>(() => ({ session, user: session?.user ?? null, profile, loading, refreshProfile, claimFirstSystemAdmin, signOut: async () => { await supabase?.auth.signOut(); setSession(null); setProfile(null); } }), [session, profile, loading]);
  return <SupabaseAuthContext.Provider value={value}>{children}</SupabaseAuthContext.Provider>;
}

export function useSupabaseAuth() { const context = useContext(SupabaseAuthContext); if (!context) throw new Error("useSupabaseAuth must be used within SupabaseAuthProvider"); return context; }
