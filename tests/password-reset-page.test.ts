import { describe, expect, it } from "vitest";
import { createPasswordResetPage } from "../server/password-reset-page";

describe("published password reset page", () => {
  it("renders a password form and the Supabase update endpoint", () => {
    const page = createPasswordResetPage({
      supabaseUrl: "https://example.supabase.co",
      supabaseAnonKey: "public-key",
    });

    expect(page).toContain("تعيين كلمة مرور جديدة");
    expect(page).toContain("/auth/v1/user");
    expect(page).toContain("access_token");
    expect(page).toContain("exchangeCodeForSession(code)");
    expect(page).toContain("flowType: \"pkce\"");
  });

  it("does not allow submission when server configuration is missing", () => {
    const page = createPasswordResetPage({ supabaseUrl: "", supabaseAnonKey: "" });
    expect(page).toContain("const CONFIGURATION_MISSING = true");
  });
});
