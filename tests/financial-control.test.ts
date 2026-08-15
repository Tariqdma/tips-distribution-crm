import { describe, expect, it } from "vitest";
import { buildFinancialSnapshot, rowsFromValues } from "../server/financial-control";

describe("financial control snapshot", () => {
  it("يطابق كود العميل الثابت ويحسب الرصيد والتحصيل المعتمد والمطابق", () => {
    const customers = rowsFromValues([["Customer_Code", "Customer_Name"], ["C-001", "صيدلية الوفاء"], ["C-002", "مستشفى الحياة"]]);
    const invoices = rowsFromValues([["Invoice_Number", "Customer_Code", "Original_Amount", "Open_Balance"], ["INV-1", "c-001", "1000", "400"], ["INV-2", "C-002", "2000", "2000"]]);
    const collections = rowsFromValues([["Receipt_Reference", "Invoice_Number", "Customer_Code", "Collection_Amount", "Approval_Status"], ["R-1", "INV-1", "C-001", "600", "Approved"]]);
    const reconciliations = rowsFromValues([["Receipt_Reference", "Reconciliation_Status", "Deposit_Reference"], ["R-1", "Matched", "DEP-77"]]);
    const snapshot = buildFinancialSnapshot({ spreadsheetId: "sheet", customers, invoices, collections, reconciliations, crmAccounts: [{ id: "account-1", name: "صيدلية الوفاء", finance_customer_code: "C-001" }] });
    expect(snapshot.summary).toMatchObject({ customerCount: 2, mappedCustomerCount: 1, invoiceCount: 2, collectionCount: 1, originalAmount: 3000, openBalance: 2400, approvedCollectionAmount: 600, matchedCollectionAmount: 600, unmatchedCustomerCodes: ["C-002"] });
    expect(snapshot.collections[0]).toMatchObject({ accountName: "صيدلية الوفاء", reconciliationStatus: "Matched", depositReference: "DEP-77" });
  });
});
