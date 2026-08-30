import { describe, expect, it } from "vitest";
import { parseProductCatalogImportRows } from "../lib/product-catalog-import";

describe("parseProductCatalogImportRows", () => {
  it("parses valid English and Arabic catalog headers into import rows", () => {
    const rows = parseProductCatalogImportRows([
      { sku: "tips-001", name: "Vitamin C", unit_label: "Bottle", list_price: "25000", currency: "sdg", is_orderable: "yes", image_url: "https://cdn.example.com/vitamin.png" },
      { "رمز المنتج": "tips-002", "اسم المنتج": "شراب أطفال", "وحدة البيع": "عبوة", "السعر": 18000, "العملة": "SDG", "قابل للبيع": "نعم" },
    ]);

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ sku: "TIPS-001", name: "Vitamin C", unitLabel: "Bottle", listPrice: "25000", currency: "sdg", isOrderable: true, errors: [] });
    expect(rows[1]).toMatchObject({ sku: "TIPS-002", name: "شراب أطفال", unitLabel: "عبوة", listPrice: "18000", isOrderable: true, errors: [] });
  });

  it("rejects duplicated SKU values in the same uploaded file", () => {
    const rows = parseProductCatalogImportRows([
      { sku: "TIPS-001", name: "الأول", unit_label: "عبوة", list_price: 10, is_orderable: "نعم" },
      { sku: "tips-001", name: "الثاني", unit_label: "عبوة", list_price: 15, is_orderable: "نعم" },
    ]);

    expect(rows[0].errors).toEqual([]);
    expect(rows[1].errors).toContain("رمز المنتج مكرر داخل الملف.");
  });

  it("requires a positive price only for products marked as orderable", () => {
    const rows = parseProductCatalogImportRows([
      { sku: "REF-001", name: "مرجعي", unit_label: "وحدة", list_price: "", is_orderable: "لا" },
      { sku: "SALE-001", name: "قابل للبيع", unit_label: "وحدة", list_price: "0", is_orderable: "نعم" },
      { sku: "BAD-001", name: "قيمة خاطئة", unit_label: "وحدة", list_price: "100", is_orderable: "ربما" },
    ]);

    expect(rows[0].errors).toEqual([]);
    expect(rows[1].errors).toContain("المنتج القابل للبيع يحتاج سعراً موجباً.");
    expect(rows[2].errors).toContain("قيمة قابل للبيع يجب أن تكون نعم أو لا.");
  });
});
