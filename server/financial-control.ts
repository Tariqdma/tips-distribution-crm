import { createClient } from "@supabase/supabase-js";
import { ENV } from "./_core/env";
import { getGoogleSheetsAccessToken } from "./google-sheets";

type Cell = string | number | boolean | null | undefined;
type SheetRows = Record<string, string>[];
type FinancialActor = { id: string; permissions: string[] };

export type FinancialSnapshot = {
  source: { spreadsheetId: string; refreshedAt: string };
  summary: { customerCount: number; mappedCustomerCount: number; unmatchedCustomerCodes: string[]; invoiceCount: number; collectionCount: number; reconciliationCount: number; originalAmount: number; openBalance: number; approvedCollectionAmount: number; matchedCollectionAmount: number };
  customers: Array<{ customerCode: string; customerName: string; accountId?: string; accountName?: string }>;
  invoices: Array<{ invoiceNumber: string; customerCode: string; customerName?: string; accountName?: string; invoiceDate?: string; dueDate?: string; originalAmount: number; openBalance: number; currency?: string; status?: string }>;
  collections: Array<{ receiptReference: string; invoiceNumber?: string; customerCode: string; customerName?: string; accountName?: string; collectionDate?: string; collectionAmount: number; currency?: string; repEmail?: string; approvalStatus?: string; reconciliationStatus?: string; depositReference?: string }>;
  mappings: Array<{ id: string; localRef?: string; name: string; financeCustomerCode?: string }>;
};

const normalizeKey = (value: Cell) => String(value ?? "").trim().toLowerCase();
const normalizedCode = (value: Cell) => String(value ?? "").trim().toUpperCase();
const text = (value: Cell) => String(value ?? "").trim();
const amount = (value: Cell) => Number(String(value ?? "0").replace(/,/g, "")) || 0;

export function rowsFromValues(values: Cell[][] | undefined): SheetRows {
  const [headerRow, ...body] = values ?? [];
  if (!headerRow?.length) return [];
  const headers = headerRow.map(normalizeKey);
  return body.map((row) => Object.fromEntries(headers.map((header, index) => [header, text(row[index])]))).filter((row) => Object.values(row).some(Boolean));
}

export function buildFinancialSnapshot({ spreadsheetId, customers, invoices, collections, reconciliations, crmAccounts, refreshedAt = new Date().toISOString() }: { spreadsheetId: string; customers: SheetRows; invoices: SheetRows; collections: SheetRows; reconciliations: SheetRows; crmAccounts: Array<{ id: string; local_ref?: string | null; name: string; finance_customer_code?: string | null }>; refreshedAt?: string }): FinancialSnapshot {
  const accountsByCode = new Map(crmAccounts.filter((account) => normalizedCode(account.finance_customer_code)).map((account) => [normalizedCode(account.finance_customer_code), account]));
  const customersByCode = new Map<string, Record<string, string>>();
  customers.forEach((row) => { const code = normalizedCode(row.customer_code); if (code) customersByCode.set(code, row); });
  const reconciliationByReceipt = new Map<string, Record<string, string>>();
  reconciliations.forEach((row) => { const receipt = normalizedCode(row.receipt_reference); if (receipt) reconciliationByReceipt.set(receipt, row); });
  const customerCodes: Set<string> = new Set<string>([...customersByCode.keys(), ...invoices.map((row) => normalizedCode(row.customer_code)), ...collections.map((row) => normalizedCode(row.customer_code))].filter((code): code is string => Boolean(code)));
  const unmatchedCustomerCodes = [...customerCodes].filter((code) => !accountsByCode.has(code)).sort();
  const customerRows = [...customerCodes].sort().map((customerCode) => {
    const customer = customersByCode.get(customerCode);
    const account = accountsByCode.get(customerCode);
    return { customerCode, customerName: text(customer?.customer_name), accountId: account?.id, accountName: account?.name };
  });
  const invoiceRows = invoices.flatMap((row) => {
    const invoiceNumber = text(row.invoice_number); const customerCode = normalizedCode(row.customer_code);
    if (!invoiceNumber || !customerCode) return [];
    const account = accountsByCode.get(customerCode); const customer = customersByCode.get(customerCode);
    return [{ invoiceNumber, customerCode, customerName: text(customer?.customer_name), accountName: account?.name, invoiceDate: text(row.invoice_date) || undefined, dueDate: text(row.due_date) || undefined, originalAmount: amount(row.original_amount), openBalance: amount(row.open_balance), currency: text(row.currency) || undefined, status: text(row.invoice_status) || undefined }];
  });
  const collectionRows = collections.flatMap((row) => {
    const receiptReference = text(row.receipt_reference); const customerCode = normalizedCode(row.customer_code);
    if (!receiptReference || !customerCode) return [];
    const account = accountsByCode.get(customerCode); const customer = customersByCode.get(customerCode); const reconciliation = reconciliationByReceipt.get(normalizedCode(receiptReference));
    return [{ receiptReference, invoiceNumber: text(row.invoice_number) || undefined, customerCode, customerName: text(customer?.customer_name), accountName: account?.name, collectionDate: text(row.collection_date) || undefined, collectionAmount: amount(row.collection_amount), currency: text(row.currency) || undefined, repEmail: text(row.rep_email) || undefined, approvalStatus: text(row.approval_status) || undefined, reconciliationStatus: text(reconciliation?.reconciliation_status) || undefined, depositReference: text(reconciliation?.deposit_reference) || undefined }];
  });
  return {
    source: { spreadsheetId, refreshedAt },
    summary: { customerCount: customerRows.length, mappedCustomerCount: customerRows.filter((customer) => customer.accountId).length, unmatchedCustomerCodes, invoiceCount: invoiceRows.length, collectionCount: collectionRows.length, reconciliationCount: reconciliations.filter((row) => text(row.receipt_reference)).length, originalAmount: invoiceRows.reduce((sum, row) => sum + row.originalAmount, 0), openBalance: invoiceRows.reduce((sum, row) => sum + row.openBalance, 0), approvedCollectionAmount: collectionRows.filter((row) => normalizedCode(row.approvalStatus) === "APPROVED").reduce((sum, row) => sum + row.collectionAmount, 0), matchedCollectionAmount: collectionRows.filter((row) => normalizedCode(row.reconciliationStatus) === "MATCHED").reduce((sum, row) => sum + row.collectionAmount, 0) },
    customers: customerRows,
    invoices: invoiceRows,
    collections: collectionRows,
    mappings: crmAccounts.map((account) => ({ id: account.id, localRef: account.local_ref ?? undefined, name: account.name, financeCustomerCode: account.finance_customer_code ?? undefined })),
  };
}

function accessTokenFromHeader(authorization?: string) {
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) throw new Error("جلسة الإدارة مطلوبة لعرض البيانات المالية.");
  return token;
}

async function requireFinancialAccess(authorization?: string) {
  if (!ENV.supabaseUrl || !ENV.supabaseAnonKey || !ENV.supabaseServiceRoleKey) throw new Error("إعدادات الخادم المالي غير مكتملة.");
  const token = accessTokenFromHeader(authorization);
  const actorClient = createClient(ENV.supabaseUrl, ENV.supabaseAnonKey, { auth: { autoRefreshToken: false, persistSession: false }, global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data, error } = await actorClient.rpc("tips_crm_my_profile_v2");
  if (error) throw new Error("تعذر التحقق من صلاحية الإدارة المالية.");
  const profile = (data as FinancialActor[] | null)?.[0];
  if (!profile || !profile.permissions.some((permission) => permission === "all" || permission === "export_reports")) throw new Error("لا تملك صلاحية عرض البيانات المالية.");
  return { actor: profile, adminClient: createClient(ENV.supabaseUrl, ENV.supabaseServiceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } }) };
}

async function fetchSheetRows(spreadsheetId: string) {
  const token = await getGoogleSheetsAccessToken();
  const url = new URL(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values:batchGet`);
  ["Customers!A:Z", "Invoices!A:Z", "Collections!A:Z", "Reconciliation!A:Z"].forEach((range) => url.searchParams.append("ranges", range));
  url.searchParams.set("valueRenderOption", "UNFORMATTED_VALUE");
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error("تعذر قراءة بيانات Google Sheets. تحقق من مشاركة الملف مع حساب الخدمة.");
  const payload = await response.json() as { valueRanges?: Array<{ range?: string; values?: Cell[][] }> };
  const result = new Map<string, SheetRows>();
  payload.valueRanges?.forEach((item) => { const name = item.range?.split("!")[0]; if (name) result.set(name, rowsFromValues(item.values)); });
  return result;
}

async function writeSyncAudit(adminClient: { schema: (schema: string) => { from: (table: string) => { insert: (value: Record<string, unknown>) => PromiseLike<unknown> } } }, record: { initiatedBy: string; status: "success" | "failed"; summary: Record<string, unknown>; errorMessage?: string }) {
  await adminClient.schema("tips_crm").from("financial_sync_audit").insert({ initiated_by: record.initiatedBy, source_type: "google_sheets", status: record.status, summary: record.summary, error_message: record.errorMessage ?? null });
}

export async function readFinancialSnapshot(authorization?: string) {
  const { actor, adminClient } = await requireFinancialAccess(authorization);
  const spreadsheetId = process.env.GOOGLE_FINANCIAL_SHEET_ID;
  if (!spreadsheetId) throw new Error("معرّف ملف التحكم المالي غير مضبوط.");
  try {
    const [sheetRows, accountResponse] = await Promise.all([fetchSheetRows(spreadsheetId), adminClient.schema("tips_crm").from("accounts").select("id,local_ref,name,finance_customer_code").limit(1000)]);
    if (accountResponse.error) throw new Error("تعذر قراءة الجهات لمطابقة أكواد العملاء.");
    const snapshot = buildFinancialSnapshot({ spreadsheetId, customers: sheetRows.get("Customers") ?? [], invoices: sheetRows.get("Invoices") ?? [], collections: sheetRows.get("Collections") ?? [], reconciliations: sheetRows.get("Reconciliation") ?? [], crmAccounts: accountResponse.data ?? [] });
    await writeSyncAudit(adminClient, { initiatedBy: actor.id, status: "success", summary: { customers: snapshot.summary.customerCount, invoices: snapshot.summary.invoiceCount, collections: snapshot.summary.collectionCount, unmatched_customer_codes: snapshot.summary.unmatchedCustomerCodes.length } });
    return snapshot;
  } catch (error) {
    const message = error instanceof Error ? error.message : "تعذر تحديث البيانات المالية.";
    await writeSyncAudit(adminClient, { initiatedBy: actor.id, status: "failed", summary: {}, errorMessage: message }).catch(() => undefined);
    throw new Error(message);
  }
}

export async function assignFinanceCustomerCode(input: { accountId: string; customerCode: string }, authorization?: string) {
  const { actor, adminClient } = await requireFinancialAccess(authorization);
  const customerCode = normalizedCode(input.customerCode);
  if (!input.accountId || !customerCode || customerCode.length > 96) throw new Error("أدخل كود عميل صحيحاً لا يتجاوز 96 حرفاً.");
  const { error } = await adminClient.schema("tips_crm").from("accounts").update({ finance_customer_code: customerCode, updated_at: new Date().toISOString() }).eq("id", input.accountId);
  if (error) throw new Error("تعذر حفظ كود العميل. تأكد من عدم استخدامه لجهة أخرى.");
  await writeSyncAudit(adminClient, { initiatedBy: actor.id, status: "success", summary: { mapping_updated: true, customer_code: customerCode } });
  return { accountId: input.accountId, customerCode };
}
