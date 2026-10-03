import { describe, expect, it } from "vitest";
import { buildPasswordRecoveryRedirect } from "../lib/auth-redirect";

describe("Password recovery redirect", () => {
  it("uses the published reset-password path", () => {
    expect(buildPasswordRecoveryRedirect("https://crm.tips-sd.com")).toBe("https://crm.tips-sd.com/reset-password");
  });

  it("removes a trailing slash before appending the path", () => {
    expect(buildPasswordRecoveryRedirect("https://example.com/")).toBe("https://example.com/reset-password");
  });
});
