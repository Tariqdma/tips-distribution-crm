import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  rpc: vi.fn(),
  sendRequestReceivedEmail: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: mocks.createClient,
}));

vi.mock("../server/_core/env", () => ({
  ENV: {
    supabaseUrl: "https://example.supabase.co",
    supabaseAnonKey: "anon-key",
    supabaseServiceRoleKey: "service-role-key",
  },
}));

vi.mock("../server/company-onboarding-email", () => ({
  sendApprovalEmail: vi.fn(),
  sendInfoRequestedEmail: vi.fn(),
  sendManagerInvitationEmail: vi.fn(),
  sendRejectionEmail: vi.fn(),
  sendRequestReceivedEmail: mocks.sendRequestReceivedEmail,
}));

import { createPublicCompanyRequest } from "../server/platform-company";

describe("Public company request submission", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createClient.mockReturnValue({ rpc: mocks.rpc });
    mocks.rpc.mockResolvedValue({ data: "7e3cf01c-0df1-4f1c-a278-1a26f2b10d03", error: null });
    mocks.sendRequestReceivedEmail.mockResolvedValue({ delivered: true });
  });

  it("returns the new request identifier directly after the insert RPC succeeds", async () => {
    await expect(createPublicCompanyRequest({
      companyName: "  شركة النيل  ",
      contactName: "  أحمد محمد  ",
      contactEmail: " AHMED@EXAMPLE.COM ",
      expectedUserCount: 5,
    })).resolves.toEqual({
      requestId: "7e3cf01c-0df1-4f1c-a278-1a26f2b10d03",
      referenceNumber: "7E3CF01C",
    });

    expect(mocks.createClient).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledWith("tips_crm_create_company_request", expect.objectContaining({
      request_company_name: "شركة النيل",
      request_contact_name: "أحمد محمد",
      request_contact_email: "ahmed@example.com",
      request_expected_user_count: 5,
    }));
    expect(mocks.sendRequestReceivedEmail).toHaveBeenCalledWith(expect.objectContaining({
      companyName: "شركة النيل",
      recipientEmail: "ahmed@example.com",
      referenceNumber: "7E3CF01C",
    }));
  });

  it("keeps the request successful when the optional receipt email cannot be delivered", async () => {
    mocks.sendRequestReceivedEmail.mockRejectedValueOnce(new Error("mail unavailable"));

    await expect(createPublicCompanyRequest({
      companyName: "شركة النيل",
      contactName: "أحمد محمد",
      contactEmail: "ahmed@example.com",
    })).resolves.toEqual({
      requestId: "7e3cf01c-0df1-4f1c-a278-1a26f2b10d03",
      referenceNumber: "7E3CF01C",
    });
  });
});
