export function getPostLoginRoute(input: { roleKey?: string | null; mustChangePassword?: boolean; isPlatformAdmin?: boolean; isWeb: boolean }) {
  if (input.mustChangePassword) return "/change-password";
  if (input.isPlatformAdmin) return "/platform";
  const isCompanyManager = input.roleKey === "system_admin" || input.roleKey === "sales_manager" || input.roleKey === "company_manager";
  const isSupervisor = input.roleKey === "sales_supervisor" || input.roleKey === "medical_supervisor";
  if (isSupervisor) return "/supervisor";
  if (!isCompanyManager) return "/";
  return "/company";
}

/** The safe destination when a non-platform account opens the platform URL directly. */
export function getPlatformPortalFallbackRoute(roleKey?: string | null) {
  const isCompanyManager = roleKey === "system_admin" || roleKey === "sales_manager" || roleKey === "company_manager";
  if (isCompanyManager) return "/company";
  if (roleKey === "sales_supervisor" || roleKey === "medical_supervisor") return "/supervisor";
  return "/";
}

export function shouldRedirectManagerFromFieldHome(roleKey: string | null | undefined, pathname: string, isPlatformAdmin = false) {
  const isManager = isPlatformAdmin || roleKey === "system_admin" || roleKey === "sales_manager" || roleKey === "company_manager" || roleKey === "sales_supervisor" || roleKey === "medical_supervisor";
  return isManager && (pathname === "/" || pathname === "/index" || pathname === "/(tabs)" || pathname === "/(tabs)/index");
}
