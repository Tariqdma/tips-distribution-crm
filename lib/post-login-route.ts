export function getPostLoginRoute(input: { roleKey?: string | null; mustChangePassword?: boolean; isWeb: boolean }) {
  if (input.mustChangePassword) return "/change-password";
  const isManager = input.roleKey === "system_admin" || input.roleKey === "sales_manager";
  if (!isManager) return "/";
  return input.isWeb ? "/admin" : "/(tabs)/admin";
}
