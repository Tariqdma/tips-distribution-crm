import { describe, expect, it } from "vitest";
import { shouldUseCompanyDesktopShell } from "../lib/portal-layout";

describe("company portal layout", () => {
  it("keeps phone-sized viewports out of the desktop company shell", () => {
    expect(shouldUseCompanyDesktopShell(375)).toBe(false);
    expect(shouldUseCompanyDesktopShell(799)).toBe(false);
  });

  it("uses the complete desktop company shell from the approved breakpoint", () => {
    expect(shouldUseCompanyDesktopShell(800)).toBe(true);
    expect(shouldUseCompanyDesktopShell(1280)).toBe(true);
  });
});
