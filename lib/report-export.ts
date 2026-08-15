import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import * as XLSX from "xlsx";
import { Platform } from "react-native";

export type ExportReportRow = { record_type: string; occurred_at: string; actor_name: string; title: string; status: string; details: string };

const labels: Record<string, string> = { plan: "خطة", visit: "زيارة", audit: "سجل تدقيق", territory_exit: "خروج من منطقة العمل" };

export type ExportReportKind = "report" | "visits" | "plans" | "territory_exits";
const exportMeta: Record<ExportReportKind, { file: string; sheet: string; dialog: string }> = { report: { file: "report", sheet: "تقرير Tips CRM", dialog: "تصدير تقرير Tips CRM" }, visits: { file: "visits", sheet: "زيارات Tips CRM", dialog: "تصدير زيارات Tips CRM" }, plans: { file: "plans", sheet: "خطط Tips CRM", dialog: "تصدير خطط Tips CRM" }, territory_exits: { file: "territory-exit-alerts", sheet: "تنبيهات الخروج", dialog: "تصدير تنبيهات الخروج" } };

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
