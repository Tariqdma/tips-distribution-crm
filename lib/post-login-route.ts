export function getPostLoginRoute(input: { roleKey?: string | null; mustChangePassword?: boolean; isWeb: boolean }) {
  if (input.mustChangePassword) return "/change-password";
  const isManager = input.roleKey === "system_admin" || input.roleKey === "sales_manager" || input.roleKey === "company_manager";
  if (!isManager) return "/";
  return input.isWeb ? "/admin" : "/(tabs)/admin";
}

export function shouldRedirectManagerFromFieldHome(roleKey: string | null | undefined, pathname: string) {
  const isManager = roleKey === "system_admin" || roleKey === "sales_manager" || roleKey === "company_manager";
  return isManager && (pathname === "/" || pathname === "/index" || pathname === "/(tabs)");
}
