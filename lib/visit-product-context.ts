import { supabase } from "@/lib/supabase-client";
import { normalizeVisitProductContext } from "./visit-product-normalization";
import type { AssignedVisitSample, CatalogProduct, VisitProductContextInput } from "./visit-product-normalization";

export { normalizeVisitProductContext, productInteractionLabels } from "./visit-product-normalization";
export type { AssignedVisitSample, CatalogProduct, ProductInteractionType, VisitProductContextInput, VisitProductInteractionInput, VisitSampleDeliveryInput } from "./visit-product-normalization";

export async function listCatalogProducts(): Promise<CatalogProduct[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc("tips_crm_list_products");
  if (error) throw error;
  return (data ?? []).map((item: { id: string; name: string; category?: string | null; description?: string | null; unit_label?: string | null }) => ({
    id: item.id,
    name: item.name,
    category: item.category,
    description: item.description,
    unitLabel: item.unit_label || "وحدة",
  }));
}

export async function listMyVisitSamples(): Promise<AssignedVisitSample[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc("tips_crm_list_my_visit_samples");
  if (error) throw error;
  return (data ?? []).map((item: { material_id: string; name: string; unit_label?: string | null; available_quantity: number | string }) => ({
    materialId: item.material_id,
    name: item.name,
    unitLabel: item.unit_label || "وحدة",
    availableQuantity: Number(item.available_quantity) || 0,
  }));
}

export async function saveVisitProductContext(visitId: string, input: VisitProductContextInput) {
  if (!supabase) throw new Error("خدمة البيانات غير متاحة.");
  const normalized = normalizeVisitProductContext(input);
  const hasInsights = Boolean(normalized.marketFeedback || normalized.competitorNotes || normalized.followUpRecommendation);
  if (normalized.productInteractions?.length || hasInsights) {
    const { error } = await supabase.rpc("tips_crm_save_visit_product_context", {
      target_visit_id: visitId,
      product_lines: (normalized.productInteractions ?? []).map((line) => ({ product_id: line.productId, interaction_type: line.interactionType, note: line.note ?? null })),
      market_feedback_input: normalized.marketFeedback ?? null,
      competitor_notes_input: normalized.competitorNotes ?? null,
      follow_up_recommendation_input: normalized.followUpRecommendation ?? null,
    });
    if (error) throw error;
  }
  if (normalized.sampleDeliveries?.length) {
    const { error } = await supabase.rpc("tips_crm_record_visit_sample_deliveries", {
      target_visit_id: visitId,
      delivery_lines: normalized.sampleDeliveries.map((line) => ({ material_id: line.materialId, quantity: line.quantity })),
    });
    if (error) throw error;
  }
}
