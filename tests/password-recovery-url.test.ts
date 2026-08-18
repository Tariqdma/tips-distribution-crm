import { describe, expect, it } from "vitest";
import { hasRecoverySessionTokens, parseSupabaseRecoveryUrl } from "../lib/supabase-recovery-url";

describe("Supabase recovery URL", () => {
  it("parses fragment tokens used by the published web reset flow", () => {
    const tokens = parseSupabaseRecoveryUrl(
      "https://tipscrm-vevc4ncu.manus.space/reset-password#access_token=access-123&refresh_token=refresh-456&type=recovery",
    );
    expect(tokens.accessToken).toBe("access-123");
    expect(tokens.refreshToken).toBe("refresh-456");
    expect(tokens.type).toBe("recovery");
    expect(hasRecoverySessionTokens(tokens)).toBe(true);
  });

  it("parses PKCE codes and rejects incomplete fragments", () => {
    const codeTokens = parseSupabaseRecoveryUrl("https://tipscrm-vevc4ncu.manus.space/reset-password?code=one-time-code");
    expect(codeTokens.code).toBe("one-time-code");
    expect(hasRecoverySessionTokens({ accessToken: "only-access" })).toBe(false);
  });
});
