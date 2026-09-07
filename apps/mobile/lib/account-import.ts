export type ImportedAccountType = "doctor" | "pharmacy" | "hospital" | "distributor";
export type AccountImportTerritory = { clientKey: string; name: string };
export type AccountImportPreviewRow = { localRef: string; name: string; accountType?: ImportedAccountType; specialty?: string; state: string; city: string; area?: string; address?: string; phone?: string; territoryKey?: string; errors: string[] };

const normalizeHeader = (value: unknown) => String(value ?? "").trim().toLowerCase().replace(/[\s_\-./()]/g, "");
const clean = (value: unknown) => String(value ?? "").trim();
const keys = (row: Record<string, unknown>) => Object.fromEntries(Object.entries(row).map(([key, value]) => [normalizeHeader(key), value]));
const find = (row: Record<string, unknown>, aliases: string[]) => aliases.map(normalizeHeader).map((key) => row[key]).find((value) => clean(value));

export function accountTypeFromImport(value: unknown): ImportedAccountType | undefined {
  const normalized = clean(value).toLowerCase().replace(/[\s_\-]/g, "");
  if (["doctor", "طبيب", "دكتور"].includes(normalized)) return "doctor";
  if (["pharmacy", "صيدلية"].includes(normalized)) return "pharmacy";
  if (["hospital", "مستشفى"].includes(normalized)) return "hospital";
  if (["distributor", "موزع", "شركةتوزيع"].includes(normalized)) return "distributor";
  return undefined;
}

export function parseAccountImportRows(rows: Array<Record<string, unknown>>, territories: AccountImportTerritory[], seed = Date.now()) {
  const territoryByName = new Map(territories.map((territory) => [territory.name.trim().toLowerCase(), territory.clientKey]));
  return rows.flatMap((raw, index) => {
    const row = keys(raw);
    const name = clean(find(row, ["name", "account name", "اسم", "اسم الجهة", "الجهة", "اسم الطبيب"]));
    const rawType = find(row, ["account type", "account_type", "type", "نوع", "نوع الجهة"]);
    const accountType = accountTypeFromImport(rawType);
    const state = clean(find(row, ["state", "الولاية"]));
    const city = clean(find(row, ["city", "المدينة"]));
    const area = clean(find(row, ["area", "المنطقة", "الحي"]));
    const address = clean(find(row, ["address", "العنوان", "العنوان التفصيلي"]));
    const phone = clean(find(row, ["phone", "contact", "رقم الهاتف", "الهاتف", "التواصل"]));
    const specialty = clean(find(row, ["specialty", "التخصص"]));
    const territoryName = clean(find(row, ["territory", "territory name", "منطقة العمل", "مفتاح المنطقة"]));
    if (!name && !rawType && !state && !city) return [];
    const errors: string[] = [];
    if (!name) errors.push("الاسم مطلوب");
    if (!accountType) errors.push("نوع الجهة غير معروف");
    if (!state) errors.push("الولاية مطلوبة");
    if (!city) errors.push("المدينة مطلوبة");
    const directTerritory = territories.find((territory) => territory.clientKey === territoryName)?.clientKey;
    const territoryKey = directTerritory ?? territoryByName.get(territoryName.toLowerCase());
    if (territoryName && !territoryKey) errors.push("منطقة العمل غير مسجلة");
    return [{ localRef: `account-import-${seed}-${index + 1}`, name, accountType, specialty: specialty || undefined, state, city, area: area || undefined, address: address || undefined, phone: phone || undefined, territoryKey, errors } satisfies AccountImportPreviewRow];
  });
}

export const accountImportTemplateColumns = ["الاسم", "نوع الجهة", "التخصص", "الولاية", "المدينة", "المنطقة", "العنوان", "رقم الهاتف", "منطقة العمل"];
