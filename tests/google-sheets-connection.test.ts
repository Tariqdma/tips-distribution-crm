import { describe, expect, it } from "vitest";
import { validateGoogleFinancialSheetConnection } from "../server/google-sheets";

const configured = Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_JSON && process.env.GOOGLE_FINANCIAL_SHEET_ID);

describe("Google Sheets financial connection", () => {
  it.skipIf(!configured)("يتحقق من صلاحية حساب الخدمة لقراءة ملف التحكم المالي", async () => {
    const result = await validateGoogleFinancialSheetConnection();
    expect(result.spreadsheetId).toBe(process.env.GOOGLE_FINANCIAL_SHEET_ID);
    expect(result.title).toBe("Tips CRM — Financial Control");
  }, 20_000);
});
