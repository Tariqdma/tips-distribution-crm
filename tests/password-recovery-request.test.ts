import { describe, expect, it } from "vitest";
import { buildPasswordRecoveryRequest } from "../lib/password-recovery-request";

describe("password recovery request", () => {
  it("uses the recovery endpoint without a PKCE code challenge", () => {
    const request = buildPasswordRecoveryRequest({ supabaseUrl: "https://example.supabase.co", supabaseAnonKey: "public-key", email: " Employee@Tips-SD.com ", redirectTo: "https://tipscrm-vevc4ncu.manus.space/reset-password" });
    expect(request.url).toContain("/auth/v1/recover");
    expect(request.options.method).toBe("POST");
    expect(request.options.body).toContain("employee@tips-sd.com");
    expect(request.options.body).not.toContain("code_challenge");
  });
});
