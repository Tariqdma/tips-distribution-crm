import { describe, expect, it } from "vitest";
import { mapReceiptSearchRecord, summarizeReceiptSearch } from "../lib/receipt-search";

describe("receipt search", () => {
  it("يحوّل سجل الإيصال القادم من المصدر المشترك ويجمع القيم المالية بدقة", () => {
    const first = mapReceiptSearchRecord({ visit_id: "v-1", report_date: "2026-08-12", checked_in_at: "2026-08-12T08:30:00.000Z", rep_id: "r-1", rep_name: "سلمى أحمد", rep_email: "salma@tips.sd", account_id: "a-1", account_name: "صيدلية الوفاء", account_type: "pharmacy", account_phone: "0912000", state: "الخرطوم", city: "الخرطوم", area: "العمارات", address: "شارع 1", territory_name: "وسط الخرطوم", outcome: "تم تحصيل", notes: "تمت المراجعة", follow_up_action: null, follow_up_on: null, visit_priority: "high", collection_amount: "1250.5", revenue_amount: "3000", receipt_reference: "RCP-2026-00125" });
    const second = { ...first, visitId: "v-2", accountId: "a-2", collectionAmount: 750, revenueAmount: 1200, receiptReference: "INV-77" };
    expect(first).toMatchObject({ accountType: "صيدلية", collectionAmount: 1250.5, receiptReference: "RCP-2026-00125" });
    expect(summarizeReceiptSearch([first, second])).toEqual({ recordCount: 2, repCount: 1, accountCount: 2, collectionAmount: 2000.5, revenueAmount: 4200 });
  });
});
