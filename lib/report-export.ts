import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import * as XLSX from "xlsx";
import { Platform } from "react-native";

export type ExportReportRow = { record_type: string; occurred_at: string; actor_name: string; title: string; status: string; details: string };
export type DailyCollectionExportRow = { checkedInAt?: string; repName: string; accountName: string; accountType: string; state: string; city: string; area: string; territoryName?: string; outcome?: string; collectionAmount: number; revenueAmount: number; notes?: string };
export type DailyCollectionExportSummary = { repName: string; visitCount: number; accountCount: number; collectionAmount: number; revenueAmount: number };

const labels: Record<string, string> = { plan: "خطة", visit: "زيارة", audit: "سجل تدقيق", territory_exit: "خروج من منطقة العمل", executive: "مؤشر تنفيذي" };

export type ExportReportKind = "report" | "visits" | "plans" | "territory_exits" | "executive";
const exportMeta: Record<ExportReportKind, { file: string; sheet: string; dialog: string }> = { report: { file: "report", sheet: "تقرير Tips CRM", dialog: "تصدير تقرير Tips CRM" }, visits: { file: "visits", sheet: "زيارات Tips CRM", dialog: "تصدير زيارات Tips CRM" }, plans: { file: "plans", sheet: "خطط Tips CRM", dialog: "تصدير خطط Tips CRM" }, territory_exits: { file: "territory-exit-alerts", sheet: "تنبيهات الخروج", dialog: "تصدير تنبيهات الخروج" }, executive: { file: "executive-summary", sheet: "ملخص تنفيذي", dialog: "تصدير الملخص التنفيذي" } };

export async function exportReportWorkbook(rows: ExportReportRow[], kind: ExportReportKind = "report") {
  const worksheet = XLSX.utils.json_to_sheet(rows.map((row) => ({
    "نوع السجل": labels[row.record_type] ?? row.record_type,
    "التاريخ والوقت": new Date(row.occurred_at).toLocaleString("ar"),
    "المستخدم": row.actor_name || "النظام",
    "العنوان": row.title,
    "الحالة": row.status,
    "التفاصيل": row.details,
  })));
  worksheet["!cols"] = [{ wch: 16 }, { wch: 22 }, { wch: 22 }, { wch: 30 }, { wch: 20 }, { wch: 44 }];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, exportMeta[kind].sheet);
  const fileName = `tips-crm-${exportMeta[kind].file}-${new Date().toISOString().slice(0, 10)}.xlsx`;

  if (Platform.OS === "web") {
    const bytes = XLSX.write(workbook, { type: "array", bookType: "xlsx" });
    const blob = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
    return fileName;
  }

  const uri = `${FileSystem.cacheDirectory}${fileName}`;
  const base64 = XLSX.write(workbook, { type: "base64", bookType: "xlsx" });
  await FileSystem.writeAsStringAsync(uri, base64, { encoding: FileSystem.EncodingType.Base64 });
  if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { dialogTitle: exportMeta[kind].dialog, mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  return fileName;
}

export async function exportDailyCollectionsWorkbook({ reportDate, rows, repSummaries, totals }: { reportDate: string; rows: DailyCollectionExportRow[]; repSummaries: DailyCollectionExportSummary[]; totals: { visitCount: number; accountCount: number; repCount: number; collectionAmount: number; revenueAmount: number } }) {
  const detailSheet = XLSX.utils.json_to_sheet(rows.map((row) => ({
    "تاريخ التحصيل": reportDate,
    "وقت التوثيق": row.checkedInAt ? new Date(row.checkedInAt).toLocaleString("ar") : "",
    "المندوب": row.repName,
    "الجهة": row.accountName,
    "نوع الجهة": row.accountType,
    "الولاية": row.state,
    "المدينة": row.city,
    "المنطقة": row.area,
    "منطقة التغطية": row.territoryName ?? "",
    "نتيجة الزيارة": row.outcome ?? "",
    "قيمة التحصيل (ج.س)": row.collectionAmount,
    "قيمة الفاتورة/البيع (ج.س)": row.revenueAmount,
    "ملاحظات": row.notes ?? "",
  })));
  detailSheet["!cols"] = [{ wch: 15 }, { wch: 22 }, { wch: 22 }, { wch: 28 }, { wch: 15 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 21 }, { wch: 20 }, { wch: 19 }, { wch: 23 }, { wch: 42 }];
  const summarySheet = XLSX.utils.json_to_sheet([
    ...repSummaries.map((summary) => ({ "المندوب": summary.repName, "عدد الزيارات المحصلة": summary.visitCount, "عدد الجهات": summary.accountCount, "إجمالي التحصيل (ج.س)": summary.collectionAmount, "إجمالي الفاتورة/البيع (ج.س)": summary.revenueAmount })),
    { "المندوب": "الإجمالي", "عدد الزيارات المحصلة": totals.visitCount, "عدد الجهات": totals.accountCount, "إجمالي التحصيل (ج.س)": totals.collectionAmount, "إجمالي الفاتورة/البيع (ج.س)": totals.revenueAmount },
  ]);
  summarySheet["!cols"] = [{ wch: 24 }, { wch: 22 }, { wch: 16 }, { wch: 23 }, { wch: 26 }];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, summarySheet, "ملخص المندوبين");
  XLSX.utils.book_append_sheet(workbook, detailSheet, "تفاصيل التحصيل");
  const fileName = `tips-crm-daily-collections-${reportDate}.xlsx`;
  if (Platform.OS === "web") {
    const bytes = XLSX.write(workbook, { type: "array", bookType: "xlsx" });
    const blob = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = fileName; link.click(); URL.revokeObjectURL(url);
    return fileName;
  }
  const uri = `${FileSystem.cacheDirectory}${fileName}`;
  const base64 = XLSX.write(workbook, { type: "base64", bookType: "xlsx" });
  await FileSystem.writeAsStringAsync(uri, base64, { encoding: FileSystem.EncodingType.Base64 });
  if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { dialogTitle: "تصدير تقرير التحصيل اليومي", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  return fileName;
}
