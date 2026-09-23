import { describe, expect, it } from "vitest";
import { buildCompanyOnboardingEmail } from "../server/company-onboarding-email";

describe("Company onboarding email templates", () => {
  it("includes the public request-status link and reference in a received-request email", () => {
    const message = buildCompanyOnboardingEmail({
      requestId: "7e3cf01c-0df1-4f1c-a278-1a26f2b10d03",
      event: "request_received",
      recipientEmail: "contact@example.com",
      recipientName: "أحمد",
      companyName: "شركة النيل",
      referenceNumber: "7E3CF01C",
    });

    expect(message.subject).toContain("استلمنا طلب");
    expect(message.text).toContain("7E3CF01C");
    expect(message.text).toContain("/request-status?ref=7E3CF01C");
    expect(message.html).toContain("شركة النيل");
  });

  it("uses a secure password-setup link for the manager invitation", () => {
    const message = buildCompanyOnboardingEmail({
      requestId: "7e3cf01c-0df1-4f1c-a278-1a26f2b10d03",
      event: "manager_invitation",
      recipientEmail: "manager@example.com",
      recipientName: "سارة",
      companyName: "شركة النيل",
      referenceNumber: "7E3CF01C",
      activationUrl: "https://crm.example/reset-password?token_hash=safe-token&type=recovery",
    });

    expect(message.subject).toContain("مدير الشركة");
    expect(message.text).toContain("safe-token");
    expect(message.html).toContain("إعداد كلمة المرور والدخول");
  });
});
