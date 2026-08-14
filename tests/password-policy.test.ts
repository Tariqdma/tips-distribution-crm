import { describe, expect, it } from "vitest";
import { validateNewPassword } from "../lib/password-policy";

describe("Password reset policy", () => {
  it("requires at least eight characters", () => expect(validateNewPassword("1234567", "1234567")).toContain("ثمانية"));
  it("requires matching password confirmation", () => expect(validateNewPassword("password1", "password2")).toContain("غير متطابقتين"));
  it("accepts a matching valid password", () => expect(validateNewPassword("password1", "password1")).toBeNull());
});
