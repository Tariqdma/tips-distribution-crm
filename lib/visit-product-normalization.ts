export type ProductInteractionType = "promoted" | "discussed" | "requested_info" | "order_interest";

export type CatalogProduct = {
  id: string;
  sku?: string | null;
  name: string;
  category?: string | null;
  description?: string | null;
  unitLabel: string;
  scientificName?: string | null;
  packSize?: string | null;
  imageUrl?: string | null;
  isOrderable?: boolean;
  listPrice?: number | null;
  priceCurrency?: string | null;
  isActive?: boolean;
};
export type AssignedVisitSample = { materialId: string; name: string; unitLabel: string; availableQuantity: number };
export type VisitProductInteractionInput = { productId: string; interactionType: ProductInteractionType; note?: string };
export type VisitSampleDeliveryInput = { materialId: string; quantity: number };
export type VisitProductContextInput = { productInteractions?: VisitProductInteractionInput[]; sampleDeliveries?: VisitSampleDeliveryInput[]; marketFeedback?: string; competitorNotes?: string; followUpRecommendation?: string };

export const productInteractionLabels: Record<ProductInteractionType, string> = {
  promoted: "تم ترويجه", discussed: "تمت مناقشته", requested_info: "طُلبت معلومات عنه", order_interest: "يوجد اهتمام بالطلب",
};

const shortText = (value?: string, max = 1200) => value?.trim().slice(0, max) || undefined;

export function normalizeVisitProductContext(input: VisitProductContextInput): VisitProductContextInput {
  const productInteractions = (input.productInteractions ?? []).filter((line) => line.productId && ["promoted", "discussed", "requested_info", "order_interest"].includes(line.interactionType)).slice(0, 20).map((line) => ({ productId: line.productId, interactionType: line.interactionType, note: shortText(line.note, 800) }));
  const sampleDeliveries = (input.sampleDeliveries ?? []).filter((line) => line.materialId && Number.isFinite(line.quantity) && line.quantity > 0).slice(0, 10).map((line) => ({ materialId: line.materialId, quantity: Math.min(1000, Math.round(line.quantity * 100) / 100) }));
  return {
    productInteractions: productInteractions.filter((line, index, lines) => lines.findIndex((candidate) => candidate.productId === line.productId) === index),
    sampleDeliveries: sampleDeliveries.filter((line, index, lines) => lines.findIndex((candidate) => candidate.materialId === line.materialId) === index),
    marketFeedback: shortText(input.marketFeedback), competitorNotes: shortText(input.competitorNotes), followUpRecommendation: shortText(input.followUpRecommendation),
  };
}
