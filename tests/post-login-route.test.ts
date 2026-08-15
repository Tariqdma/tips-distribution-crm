import { describe, expect, it } from "vitest";
import { getPostLoginRoute } from "../lib/post-login-route";

describe("post-login routing", () => {
  it("sends web managers to the administration portal", () => {
    expect(getPostLoginRoute({ roleKey: "system_admin", isWeb: true })).toBe("/admin");
    expect(getPostLoginRoute({ roleKey: "sales_manager", isWeb: true })).toBe("/admin");
  });

  it("sends field representatives to their employee tabs on web and mobile", () => {
    expect(getPostLoginRoute({ roleKey: "sales_rep", isWeb: true })).toBe("/");
    expect(getPostLoginRoute({ roleKey: "medical_rep", isWeb: false })).toBe("/");
  });

  it("prioritizes the required password change route", () => {
    expect(getPostLoginRoute({ roleKey: "sales_rep", mustChangePassword: true, isWeb: true })).toBe("/change-password");
  });
});
