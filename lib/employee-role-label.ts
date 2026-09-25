// Own module, not inline in components/employee-directory.tsx, so vitest can load it without
// pulling in react-native (see lib/app-role-discipline.ts for the same pattern).
//
// The database now holds both vocabularies at once: existing staff keep their legacy
// role_key (sales_supervisor, medical_rep, ...) until they are edited again, while every
// employee created after this change gets a bare System Role key (manager, supervisor, rep,
// accountant, owner). Both must resolve to an Arabic label — dropping the legacy entries would
// blank out every employee hired before this change.
const ROLE_LABELS: Record<string, string> = {
  system_admin: "مدير النظام",
  company_manager: "مدير الشركة",
  sales_manager: "مدير مبيعات",
  sales_supervisor: "مشرف مبيعات",
  medical_supervisor: "مشرف طبي",
  sales_rep: "مندوب مبيعات",
  medical_rep: "مندوب طبي",
  owner: "المالك",
  manager: "مدير",
  supervisor: "مشرف",
  rep: "مندوب",
  accountant: "محاسب",
};

export const employeeRoleLabel = (roleKey: string): string => ROLE_LABELS[roleKey] ?? roleKey;
