import { describe, expect, it } from "vitest";
import { accountTypeFromImport, parseAccountImportRows } from "../lib/account-import";

describe("account import parser", () => {
  it("maps Arabic account labels and headers into import fields", () => {
    const rows = parseAccountImportRows([{ "اسم الجهة": "صيدلية الأمل", "نوع الجهة": "صيدلية", الولاية: "ولاية الخرطوم", المدينة: "الخرطوم", "منطقة العمل": "وسط الخرطوم" }], [{ clientKey: "center", name: "وسط الخرطوم" }], 100);
    expect(rows).toEqual([expect.objectContaining({ localRef: "account-import-100-1", name: "صيدلية الأمل", accountType: "pharmacy", territoryKey: "center", errors: [] })]);
  });

  it("keeps an invalid row in preview with actionable errors", () => {
    const rows = parseAccountImportRows([{ name: "", type: "unknown", state: "ولاية الخرطوم", city: "" }], [], 100);
    expect(rows[0].errors).toEqual(["الاسم مطلوب", "نوع الجهة غير معروف", "المدينة مطلوبة"]);
    expect(accountTypeFromImport("مستشفى")).toBe("hospital");
  });
});
