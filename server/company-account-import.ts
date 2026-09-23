import { createClient } from "@supabase/supabase-js";
import { ENV } from "./_core/env";

export type RemoteAccountType = "doctor" | "pharmacy" | "hospital" | "distributor";
export type CompanyAccountImportRow = { localRef: string; name: string; accountType: RemoteAccountType; specialty?: string; state: string; city: string; area?: string; address?: string; phone?: string; territoryKey?: string };
export type CompanyAccountImportResult = { itemKey: string; status: "created" | "updated" | "duplicate" | "rejected"; accountId?: string; accountName: string; message: string };
export type CompanyAccountSetup = { accountCount: number; doctorCount: number; pharmacyCount: number; hospitalCount: number; distributorCount: number; territoryChoices: Array<{ clientKey: string; name: string; state: string; city: string }>; isAccountSetupStarted: boolean };

type AccountRow = { id: string; local_ref: string | null; account_type: string; name: string; specialty: string | null; state: string; city: string; area: string | null; address: string | null; phone: string | null };
type TerritoryRow = { client_key: string | null; name: string; state: string; city: string };
type RawImportResult = { item_key: string; status: string; account_id: string | null; account_name: string; message: string };

const validAccountTypes = new Set<RemoteAccountType>(["doctor", "pharmacy", "hospital", "distributor"]);

function requireConfig() { if (!ENV.supabaseUrl || !ENV.supabaseAnonKey) throw new Error("إعدادات استيراد الجهات غير مكتملة."); }
function tokenFromHeader(authorization?: string) { const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1]; if (!token) throw new Error("جلسة مدير الشركة مطلوبة لتنفيذ هذا الإجراء."); return token; }
function createActorClient(authorization?: string) { requireConfig(); return createClient(ENV.supabaseUrl, ENV.supabaseAnonKey, { auth: { autoRefreshToken: false, persistSession: false }, global: { headers: { Authorization: `Bearer ${tokenFromHeader(authorization)}` } } }); }

async function requireCompanyManager(authorization?: string) {
  const actorClient = createActorClient(authorization);
  const { data, error } = await actorClient.rpc("tips_crm_my_profile");
  const profile = (data as Array<{ role_key: string; active_company_id: string | null; is_platform_admin?: boolean }> | null)?.[0];
  const validRole = ["company_manager", "sales_manager", "system_admin"].includes(profile?.role_key ?? "");
  if (error || !profile?.active_company_id || profile.is_platform_admin || !validRole) throw new Error("هذه العملية مخصصة لمدير الشركة فقط.");
  return actorClient;
}

const clean = (value: unknown) => typeof value === "string" ? value.trim() : "";

export function validateCompanyAccountImportRows(rows: unknown): { rows: CompanyAccountImportRow[]; errors: string[] } {
  if (!Array.isArray(rows)) return { rows: [], errors: ["ملف الجهات لا يحتوي على صفوف قابلة للاستيراد."] };
  if (!rows.length) return { rows: [], errors: ["ملف الجهات فارغ."] };
  if (rows.length > 500) return { rows: [], errors: ["يمكن استيراد 500 جهة كحد أقصى في العملية الواحدة."] };
  const errors: string[] = [];
  const normalized = rows.flatMap((value, index) => {
    if (!value || typeof value !== "object") { errors.push(`الصف ${index + 1}: تنسيق غير صالح.`); return []; }
    const item = value as Record<string, unknown>;
    const accountType = clean(item.accountType ?? item.account_type).toLowerCase() as RemoteAccountType;
    const name = clean(item.name);
    const state = clean(item.state);
    const city = clean(item.city);
    if (!name || !state || !city || !validAccountTypes.has(accountType)) { errors.push(`الصف ${index + 1}: أدخل الاسم والنوع والولاية والمدينة بصورة صحيحة.`); return []; }
    return [{ localRef: clean(item.localRef ?? item.local_ref) || `import-${Date.now()}-${index + 1}`, name, accountType, specialty: clean(item.specialty) || undefined, state, city, area: clean(item.area) || undefined, address: clean(item.address) || undefined, phone: clean(item.phone) || undefined, territoryKey: clean(item.territoryKey ?? item.territory_key) || undefined } satisfies CompanyAccountImportRow];
  });
  return { rows: normalized, errors };
}

export function summarizeCompanyAccountImport(results: CompanyAccountImportResult[]) {
  return { createdCount: results.filter((item) => item.status === "created").length, updatedCount: results.filter((item) => item.status === "updated").length, duplicateCount: results.filter((item) => item.status === "duplicate").length, rejectedCount: results.filter((item) => item.status === "rejected").length };
}

export async function getCompanyAccountSetup(authorization?: string): Promise<CompanyAccountSetup> {
  const actorClient = await requireCompanyManager(authorization);
  const [accountsResponse, territoriesResponse] = await Promise.all([actorClient.rpc("tips_crm_list_accounts"), actorClient.rpc("tips_crm_list_territories")]);
  if (accountsResponse.error || territoriesResponse.error) throw new Error("تعذر تحميل الجهات ومناطق العمل. حدّث الصفحة ثم أعد المحاولة.");
  const accounts = (accountsResponse.data ?? []) as AccountRow[];
  const territories = ((territoriesResponse.data ?? []) as TerritoryRow[]).flatMap((row) => row.client_key ? [{ clientKey: row.client_key, name: row.name, state: row.state, city: row.city }] : []);
  return { accountCount: accounts.length, doctorCount: accounts.filter((item) => item.account_type === "doctor").length, pharmacyCount: accounts.filter((item) => item.account_type === "pharmacy").length, hospitalCount: accounts.filter((item) => item.account_type === "hospital").length, distributorCount: accounts.filter((item) => item.account_type === "distributor").length, territoryChoices: territories, isAccountSetupStarted: accounts.length > 0 };
}

export async function importCompanyAccounts(input: { rows?: unknown }, authorization?: string) {
  const prepared = validateCompanyAccountImportRows(input.rows);
  if (!prepared.rows.length) throw new Error(prepared.errors[0] ?? "لا توجد جهات صالحة للاستيراد.");
  const actorClient = await requireCompanyManager(authorization);
  const payload = prepared.rows.map((item) => ({ local_ref: item.localRef, name: item.name, account_type: item.accountType, specialty: item.specialty ?? "", state: item.state, city: item.city, area: item.area ?? "", address: item.address ?? "", phone: item.phone ?? "", territory_key: item.territoryKey ?? "" }));
  const { data, error } = await actorClient.schema("tips_crm").rpc("import_company_accounts", { input_accounts: payload });
  if (error) throw new Error(error.message.includes("permission") ? "لا تملك صلاحية استيراد الجهات." : "تعذر استيراد الجهات. راجع الملف ثم أعد المحاولة.");
  const results: CompanyAccountImportResult[] = (data as RawImportResult[] ?? []).map((item) => ({ itemKey: item.item_key, status: item.status === "created" || item.status === "updated" || item.status === "duplicate" ? item.status : "rejected", accountId: item.account_id ?? undefined, accountName: item.account_name, message: item.message }));
  return { results: [...results, ...prepared.errors.map((message, index) => ({ itemKey: `invalid-${index + 1}`, status: "rejected" as const, accountName: "", message }))], summary: summarizeCompanyAccountImport(results) };
}
