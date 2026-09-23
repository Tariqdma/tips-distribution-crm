import { legacyPermissionsFor } from "../auth/legacy";
import type { Portal } from "../auth/portals";
import { landingPortal } from "../auth/resolve";

// Platform administration is web-only by design (design.md:72); the native /platform/login
// route shows the explanatory screen instead of the platform portal itself.
const PORTAL_HREF: Record<Exclude<Portal, "platform">, string> = {
  company: "/company",
  supervisor: "/supervisor",
  rep: "/",
};

const NO_PORTAL_FALLBACK = "/";

export function getPostLoginRoute(input: { roleKey?: string | null; mustChangePassword?: boolean; isPlatformAdmin?: boolean; isWeb: boolean }) {
  if (input.mustChangePassword) return "/change-password";
  const portal = landingPortal(legacyPermissionsFor({ roleKey: input.roleKey, isPlatformAdmin: input.isPlatformAdmin }));
  if (portal === "platform") return input.isWeb ? "/platform" : "/platform/login";
  if (!portal) return NO_PORTAL_FALLBACK;
  return PORTAL_HREF[portal];
}

/** The safe destination when a non-platform account opens the platform URL directly. */
export function getPlatformPortalFallbackRoute(roleKey?: string | null) {
  const portal = landingPortal(legacyPermissionsFor({ roleKey }));
  return portal && portal !== "platform" ? PORTAL_HREF[portal] : NO_PORTAL_FALLBACK;
}

export function shouldRedirectManagerFromFieldHome(roleKey: string | null | undefined, pathname: string, isPlatformAdmin = false) {
  const isFieldHome = pathname === "/" || pathname === "/index" || pathname === "/(tabs)" || pathname === "/(tabs)/index";
  if (!isFieldHome) return false;
  const portal = landingPortal(legacyPermissionsFor({ roleKey, isPlatformAdmin }));
  return portal !== null && portal !== "rep";
}
