import { describe, expect, it } from "vitest";
import { buildPasswordRecoveryEmail } from "../server/password-recovery-email";

describe("managed password recovery email", () => {
  it("contains a direct Tips CRM reset link with a token hash", () => {
    const link = "https://tipscrm-vevc4ncu.manus.space/reset-password?token_hash=example-token&type=recovery";
    const message = buildPasswordRecoveryEmail("rep@example.com", link);

    expect(message.recipient).toBe("rep@example.com");
    expect(message.subject).toContain("إعادة تعيين");
    expect(message.text).toContain(link);
    expect(message.html).toContain("token_hash=example-token");
  });
});
