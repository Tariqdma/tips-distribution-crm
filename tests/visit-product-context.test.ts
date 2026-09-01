import { describe, expect, it } from "vitest";
import { normalizeVisitProductContext } from "../lib/visit-product-normalization";

describe("normalizeVisitProductContext", () => {
  it("keeps valid unique product interactions and limits their notes", () => {
    const normalized = normalizeVisitProductContext({
      productInteractions: [
        { productId: "product-a", interactionType: "promoted", note: "  تم الشرح  " },
        { productId: "product-a", interactionType: "order_interest", note: "يجب تجاهل هذا التكرار" },
        { productId: "product-b", interactionType: "requested_info", note: "مطلوب كتالوج" },
        { productId: "product-c", interactionType: "invalid" as never },
      ],
      marketFeedback: "  طلبت الصيدلية عبوة أصغر  ",
    });

    expect(normalized.productInteractions).toEqual([
      { productId: "product-a", interactionType: "promoted", note: "تم الشرح" },
      { productId: "product-b", interactionType: "requested_info", note: "مطلوب كتالوج" },
    ]);
    expect(normalized.marketFeedback).toBe("طلبت الصيدلية عبوة أصغر");
  });

  it("normalizes pharmacy availability as bounded market observations", () => {
    const normalized = normalizeVisitProductContext({
      pharmacyProductAvailability: [
        { productId: "product-a", status: "available" },
        { productId: "product-a", status: "low" },
        { productId: "product-b", status: "not_available", observedQuantity: 12.456 },
        { productId: "product-c", status: "invalid" as never, observedQuantity: -2 },
      ],
    });

    expect(normalized.pharmacyProductAvailability).toEqual([
      { productId: "product-a", status: "available", observedQuantity: undefined },
      { productId: "product-b", status: "not_available", observedQuantity: 12.46 },
    ]);
  });

  it("keeps valid unique sample deliveries with safe quantities", () => {
    const normalized = normalizeVisitProductContext({
      sampleDeliveries: [
        { materialId: "sample-a", quantity: 2.456 },
        { materialId: "sample-a", quantity: 3 },
        { materialId: "sample-b", quantity: 2000 },
        { materialId: "sample-c", quantity: 0 },
      ],
      competitorNotes: "  عرض منافس جديد  ",
    });

    expect(normalized.sampleDeliveries).toEqual([
      { materialId: "sample-a", quantity: 2.46 },
      { materialId: "sample-b", quantity: 1000 },
    ]);
    expect(normalized.competitorNotes).toBe("عرض منافس جديد");
  });
});
