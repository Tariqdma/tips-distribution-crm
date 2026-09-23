export const COMPANY_DESKTOP_BREAKPOINT = 800;

/** Returns true only when a company portal has enough width for the desktop shell. */
export function shouldUseCompanyDesktopShell(width: number) {
  return width >= COMPANY_DESKTOP_BREAKPOINT;
}
