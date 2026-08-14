import { describe, expect, it } from "vitest";
import { buildInvitationEmail } from "../server/invite-email";

describe("Invitation email template", () => {
  it("includes an encoded acceptance link and the invitation details", () => {
    const message = buildInvitationEmail({
      invite_id: "b0af47a4-28cc-4d1c-8027-2c3ef2b8545c",
      recipient_email: "rep@example.com",
      role_label: "مندوب طبي",
      territory_label: "بحري",
      invite_token: "safe token/+",
      expires_at: "2026-08-21T12:00:00.000Z",
    });

    expect(message.subject).toContain("دعوة");
    expect(message.text).toContain("مندوب طبي");
    expect(message.html).toContain("بحري");
    expect(message.html).toContain("token=safe%20token%2F%2B");
  });
});
