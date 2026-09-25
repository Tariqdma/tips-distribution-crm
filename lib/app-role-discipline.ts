import type { Discipline } from "@shared/auth/legacy-role-key";
import type { AppRole } from "@/lib/crm-store";

// Deliberately its own module rather than living beside AppRole in crm-store: that module pulls in
// react-native transitively, which vitest cannot load, and an untested mapping used by two screens
// is exactly where a future edit breaks quietly. Both imports here are type-only, so nothing of
// crm-store reaches the runtime.
const appRoleDiscipline: Partial<Record<AppRole, Discipline>> = {
  "مشرف مبيعات": "sales",
  "مشرف طبي": "medical",
  "مندوب مبيعات": "sales",
  "مندوب طبي": "medical",
};

export const disciplineForAppRole = (role: AppRole): Discipline | undefined => appRoleDiscipline[role];
