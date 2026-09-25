import type { Discipline } from "@shared/auth/legacy-role-key";

// Own module, not inline in hooks/use-permissions.ts, for the same reason as
// lib/app-role-discipline.ts: that hook pulls in lib/supabase-auth (react + supabase-js)
// transitively, which vitest's Rollup-based SSR parser currently fails to load, so an untested
// mapping there is exactly where a future edit breaks quietly.
const DISCIPLINES: readonly Discipline[] = ["sales", "medical"];
function isDiscipline(value: string): value is Discipline {
  return (DISCIPLINES as readonly string[]).includes(value);
}

// Discipline lives on company_memberships.disciplines, returned by tips_crm_my_profile. The
// database is authoritative for both legacy and new-model rows, so no fallback to the legacy
// role_key mapping is needed here — unlike role_key, disciplines never fuses the two concepts.
export function disciplinesFromProfile(disciplines: readonly string[] | null | undefined): ReadonlySet<Discipline> {
  return new Set((disciplines ?? []).filter(isDiscipline));
}
