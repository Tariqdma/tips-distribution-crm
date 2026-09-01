import { supabase } from "@/lib/supabase-client";
import { normalizeVisitProductContext } from "./visit-product-normalization";
import type { AssignedVisitSample, CatalogProduct, VisitProductContextInput } from "./visit-product-normalization";

export { normalizeVisitProductContext, productInteractionLabels } from "./visit-product-normalization";
export type { AssignedVisitSample, CatalogProduct, PharmacyAvailabilityStatus, PharmacyProductAvailability, ProductInteractionType, VisitProductContextInput, VisitProductInteractionInput, VisitSampleDeliveryInput } from "./visit-product-normalization";

export async function listCatalogProducts(includeInactive = false): Promise<CatalogProduct[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc("tips_crm_list_catalog_products_v2", { include_inactive: includeInactive });
  if (error) throw error;
  return (data ?? []).map((item: {
    id: string; sku?: string | null; name: string; category?: string | null; description?: string | null; unit_label?: string | null;
    scientific_name?: string | null; pack_size?: string | null; image_url?: string | null; is_orderable?: boolean | null;
    list_price?: number | string | null; price_currency?: string | null; is_active?: boolean | null;
  }) => ({
    id: item.id,
    sku: item.sku,
    name: item.name,
    category: item.category,
    description: item.description,
    unitLabel: item.unit_label || "وحدة",
    scientificName: item.scientific_name,
    packSize: item.pack_size,
    imageUrl: item.image_url,
    isOrderable: Boolean(item.is_orderable),
    listPrice: item.list_price === null || item.list_price === undefined ? null : Number(item.list_price),
    priceCurrency: item.price_currency || "SDG",
    isActive: item.is_active !== false,
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
