import { createClient } from "@supabase/supabase-js";
import { ENV } from "./_core/env";

export type TerritoryPoint = { latitude: number; longitude: number };
export type CompanyTerritory = { clientKey: string; name: string; state: string; city: string; centerLatitude: number; centerLongitude: number; radiusMeters: number; polygonPoints: TerritoryPoint[]; assignedMemberCount: number; isBoundaryComplete: boolean };
export type CompanyTerritorySetup = { territories: CompanyTerritory[]; territoryCount: number; assignedTerritoryCount: number; isTerritorySetupStarted: boolean };
export type SaveCompanyTerritoryInput = { clientKey?: string; name: string; state: string; city: string; centerLatitude: number; centerLongitude: number; radiusMeters: number; polygonPoints?: TerritoryPoint[] };

type TerritoryRow = { client_key: string; name: string; state: string; city: string; center_latitude: number | string; center_longitude: number | string; radius_meters: number | string; polygon_points: unknown; assigned_member_count: number | string; is_boundary_complete: boolean };

function requireConfig() { if (!ENV.supabaseUrl || !ENV.supabaseAnonKey) throw new Error("إعدادات مناطق الشركة غير مكتملة."); }
function tokenFromHeader(authorization?: string) { const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1]; if (!token) throw new Error("جلسة مدير الشركة مطلوبة لتنفيذ هذا الإجراء."); return token; }
function createActorClient(authorization?: string) { requireConfig(); return createClient(ENV.supabaseUrl, ENV.supabaseAnonKey, { auth: { autoRefreshToken: false, persistSession: false }, global: { headers: { Authorization: `Bearer ${tokenFromHeader(authorization)}` } } }); }

async function requireCompanyManager(authorization?: string) {
  const actorClient = createActorClient(authorization);
  const { data, error } = await actorClient.rpc("tips_crm_my_profile_v2");
  const profile = (data as Array<{ role_key: string; active_company_id: string | null; is_platform_admin?: boolean }> | null)?.[0];
  const validRole = ["company_manager", "sales_manager", "system_admin"].includes(profile?.role_key ?? "");
  if (error || !profile?.active_company_id || profile.is_platform_admin || !validRole) throw new Error("هذه العملية مخصصة لمدير الشركة فقط.");
  return actorClient;
}

function pointsFromUnknown(value: unknown): TerritoryPoint[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((point) => {
    if (!point || typeof point !== "object") return [];
    const candidate = point as { latitude?: unknown; longitude?: unknown };
    const latitude = Number(candidate.latitude); const longitude = Number(candidate.longitude);
    return Number.isFinite(latitude) && Number.isFinite(longitude) ? [{ latitude, longitude }] : [];
  });
}

function mapTerritory(row: TerritoryRow): CompanyTerritory {
  return { clientKey: row.client_key, name: row.name, state: row.state, city: row.city, centerLatitude: Number(row.center_latitude), centerLongitude: Number(row.center_longitude), radiusMeters: Number(row.radius_meters), polygonPoints: pointsFromUnknown(row.polygon_points), assignedMemberCount: Number(row.assigned_member_count), isBoundaryComplete: Boolean(row.is_boundary_complete) };
}

export function validateCompanyTerritory(input: Partial<SaveCompanyTerritoryInput>) {
  if (!input.name?.trim() || input.name.trim().length < 2) return "اكتب اسم منطقة العمل بصورة واضحة.";
  if (!input.state?.trim() || !input.city?.trim()) return "اختر الولاية والمدينة قبل الحفظ.";
  if (!Number.isFinite(input.centerLatitude) || !Number.isFinite(input.centerLongitude) || Math.abs(Number(input.centerLatitude)) > 90 || Math.abs(Number(input.centerLongitude)) > 180) return "حدد مركزاً جغرافياً صحيحاً للمنطقة.";
  if (!Number.isInteger(input.radiusMeters) || Number(input.radiusMeters) < 100 || Number(input.radiusMeters) > 100000) return "اختر نطاقاً جغرافياً بين 100 متر و100 كيلومتر.";
  const polygonPoints = input.polygonPoints ?? [];
  if (polygonPoints.length > 0 && polygonPoints.length < 3) return "أضف ثلاث نقاط على الأقل للحد المضلع أو امسح النقاط لاستخدام النطاق الدائري.";
  if (polygonPoints.some((point) => !Number.isFinite(point.latitude) || !Number.isFinite(point.longitude) || Math.abs(point.latitude) > 90 || Math.abs(point.longitude) > 180)) return "توجد نقطة غير صالحة ضمن حدود المنطقة.";
  return null;
}

export function buildCompanyTerritorySetup(rows: TerritoryRow[]): CompanyTerritorySetup {
  const territories = rows.map(mapTerritory);
  return { territories, territoryCount: territories.length, assignedTerritoryCount: territories.filter((territory) => territory.assignedMemberCount > 0).length, isTerritorySetupStarted: territories.length > 0 };
}

export async function getCompanyTerritorySetup(authorization?: string) {
  const actorClient = await requireCompanyManager(authorization);
  const { data, error } = await actorClient.schema("tips_crm").rpc("get_company_territory_setup");
  if (error) throw new Error("تعذر تحميل مناطق العمل. حدّث الصفحة ثم أعد المحاولة.");
  return buildCompanyTerritorySetup((data ?? []) as TerritoryRow[]);
}

export async function saveCompanyTerritory(input: SaveCompanyTerritoryInput, authorization?: string) {
  const validationError = validateCompanyTerritory(input);
  if (validationError) throw new Error(validationError);
  const actorClient = await requireCompanyManager(authorization);
  const { data, error } = await actorClient.schema("tips_crm").rpc("save_company_territory", { input_client_key: input.clientKey?.trim() || null, input_name: input.name.trim(), input_state: input.state.trim(), input_city: input.city.trim(), input_center_latitude: input.centerLatitude, input_center_longitude: input.centerLongitude, input_radius_meters: input.radiusMeters, input_polygon_points: input.polygonPoints ?? [] });
  const row = (data as TerritoryRow[] | null)?.[0];
  if (error || !row) throw new Error(error?.message.includes("already exists") ? "هذه المنطقة مسجلة بالفعل في المدينة المختارة." : "تعذر حفظ منطقة العمل. تحقق من البيانات ثم أعد المحاولة.");
  return mapTerritory(row);
}
