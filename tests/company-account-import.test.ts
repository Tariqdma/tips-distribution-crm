import { describe, expect, it } from "vitest";
import { summarizeCompanyAccountImport, validateCompanyAccountImportRows } from "../server/company-account-import";

describe("company account import", () => {
  it("normalizes valid rows and reports invalid records without accepting them", () => {
    const result = validateCompanyAccountImportRows([{ name: " صيدلية الأمل ", account_type: "pharmacy", state: "ولاية الخرطوم", city: "الخرطوم" }, { name: "", account_type: "doctor", state: "ولاية الخرطوم", city: "الخرطوم" }]);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({ name: "صيدلية الأمل", accountType: "pharmacy", state: "ولاية الخرطوم" });
    expect(result.errors).toEqual(["الصف 2: أدخل الاسم والنوع والولاية والمدينة بصورة صحيحة."]);
  });

  it("summarizes created, updated, duplicate and rejected import results", () => {
    expect(summarizeCompanyAccountImport([{ itemKey: "1", status: "created", accountName: "أ", message: "" }, { itemKey: "2", status: "updated", accountName: "ب", message: "" }, { itemKey: "3", status: "duplicate", accountName: "ج", message: "" }, { itemKey: "4", status: "rejected", accountName: "د", message: "" }])).toEqual({ createdCount: 1, updatedCount: 1, duplicateCount: 1, rejectedCount: 1 });
  });
});
