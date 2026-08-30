export type ProductCatalogImportRow = {
  localRef: string;
  sku: string;
  name: string;
  category: string;
  unitLabel: string;
  listPrice: string;
  currency: string;
  isOrderable: boolean | null;
  description: string;
  scientificName: string;
  packSize: string;
  imageUrl: string;
  errors: string[];
};

export const productCatalogImportTemplateColumns = [
  "sku", "name", "category", "unit_label", "list_price", "currency", "is_orderable", "description", "scientific_name", "pack_size", "image_url",
] as const;

const asText = (value: unknown) => `${value ?? ""}`.trim();
const read = (row: Record<string, unknown>, ...keys: string[]) => asText(keys.map((key) => row[key]).find((value) => value !== undefined && value !== null && `${value}`.trim() !== ""));
const boolValue = (value: string): boolean | null => {
  const normalized = value.trim().toLowerCase();
  if (["true", "1", "نعم", "yes"].includes(normalized)) return true;
  if (["false", "0", "لا", "no"].includes(normalized)) return false;
  return null;
};

export function parseProductCatalogImportRows(rows: Array<Record<string, unknown>>): ProductCatalogImportRow[] {
  const knownSkus = new Set<string>();
  return rows.slice(0, 500).map((source, index) => {
    const sku = read(source, "sku", "SKU", "رمز المنتج").toUpperCase();
    const name = read(source, "name", "product_name", "اسم المنتج");
    const listPrice = read(source, "list_price", "price", "السعر");
    const rawOrderable = read(source, "is_orderable", "قابل للبيع");
    const isOrderable = rawOrderable ? boolValue(rawOrderable) : true;
    const errors: string[] = [];
    if (sku.length < 2 || sku.length > 80) errors.push("رمز المنتج مطلوب من 2 إلى 80 حرفاً.");
    if (name.length < 2 || name.length > 160) errors.push("اسم المنتج مطلوب من حرفين إلى 160 حرفاً.");
    if (sku && knownSkus.has(sku)) errors.push("رمز المنتج مكرر داخل الملف.");
    if (sku) knownSkus.add(sku);
    const numericPrice = Number(listPrice.replace(/,/g, ""));
    if (isOrderable === null) errors.push("قيمة قابل للبيع يجب أن تكون نعم أو لا.");
    if (isOrderable && (!listPrice || !Number.isFinite(numericPrice) || numericPrice <= 0)) errors.push("المنتج القابل للبيع يحتاج سعراً موجباً.");
    const imageUrl = read(source, "image_url", "image", "رابط الصورة");
    if (imageUrl && !/^https?:\/\//i.test(imageUrl)) errors.push("رابط الصورة يجب أن يبدأ بـ http أو https.");
    return {
      localRef: `product-row-${index + 1}`,
      sku,
      name,
      category: read(source, "category", "الفئة"),
      unitLabel: read(source, "unit_label", "unit", "وحدة البيع") || "وحدة",
      listPrice,
      currency: read(source, "currency", "العملة") || "SDG",
      isOrderable,
      description: read(source, "description", "الوصف"),
      scientificName: read(source, "scientific_name", "الاسم العلمي"),
      packSize: read(source, "pack_size", "حجم العبوة"),
      imageUrl,
      errors,
    };
  });
}
