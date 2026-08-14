import { describe, expect, it } from "vitest";
import { createCrmLandingPage } from "../server/crm-landing-page";

describe("published CRM landing page", () => {
  it("redirects recovery links while preserving the query string and fragment", () => {
    const page = createCrmLandingPage();
    expect(page).toContain("isRecoveryLink");
    expect(page).toContain('"/reset-password" + window.location.search + window.location.hash');
    expect(page).toContain("fragment.has(\"access_token\")");
  });
});
