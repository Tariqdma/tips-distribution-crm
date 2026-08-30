import { describe, expect, it } from "vitest";
import { buildProformaHtml, normalizeProformaLineInputs, proformaStatusLabel, type Proforma } from "../lib/proforma-utils";

describe("proforma service", () => {
  it("keeps only valid and unique product quantities for the secure RPC", () => {
    expect(normalizeProformaLineInputs([
      { productId: "product-a", quantity: "2" },
      { productId: "product-a", quantity: "1" },
      { productId: "product-b", quantity: "1.25" },
      { productId: "product-c", quantity: "0" },
    ])).toEqual([{ product_id: "product-a", quantity: "2" }, { product_id: "product-b", quantity: "1.25" }]);
  });

  it("renders a non-accounting PDF with frozen line values and escaped client text", () => {
    const proforma: Proforma = { id: "pf-1", proformaNumber: 42, status: "issued", accountId: "account-1", accountName: "صيدلية <السلام>", accountType: "pharmacy", subtotal: 1250, currency: "SDG", issuedAt: "2026-08-30T10:00:00Z", updatedAt: "2026-08-30T10:00:00Z", createdAt: "2026-08-30T10:00:00Z", notes: "طلب & مراجعة", lines: [{ id: "line-1", productId: "product-1", sku: "TIPS-001", name: "منتج <أ>", unitLabel: "علبة", quantity: 2, unitPrice: 625, lineTotal: 1250 }] };
    const html = buildProformaHtml(proforma);
    expect(html).toContain("فاتورة مبدئية — غير محاسبية");
    expect(html).toContain("PF-42");
    expect(html).toContain("صيدلية &lt;السلام&gt;");
    expect(html).toContain("طلب &amp; مراجعة");
    expect(html).toContain("1,250");
  });

  it("labels the lifecycle states in Arabic", () => {
    expect(proformaStatusLabel("issued")).toBe("صادرة للعميل");
    expect(proformaStatusLabel("pending_approval")).toBe("بانتظار اعتماد الإدارة");
  });
});
