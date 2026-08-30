export type ProformaStatus = "draft" | "issued" | "pending_approval" | "approved" | "returned" | "cancelled";
export type ProformaLineInput = { productId: string; quantity: string };
export type ProformaLine = { id?: string; productId: string; sku: string; name: string; unitLabel: string; quantity: number; unitPrice: number; lineTotal: number };
export type Proforma = { id: string; proformaNumber: number; status: ProformaStatus; accountId: string; accountName: string; accountType: string; sourceVisitRef?: string; notes?: string; subtotal: number; currency: string; issuedAt?: string; updatedAt: string; createdAt: string; lines: ProformaLine[] };

export function normalizeProformaLineInputs(lines: ProformaLineInput[]) {
  const seen = new Set<string>();
  return lines.flatMap((line) => {
    const productId = line.productId.trim(); const quantity = line.quantity.trim();
    if (!productId || seen.has(productId) || !/^\d+(\.\d{1,3})?$/.test(quantity) || Number(quantity) <= 0 || Number(quantity) > 100000) return [];
    seen.add(productId); return [{ product_id: productId, quantity }];
  });
}

export function proformaStatusLabel(status: ProformaStatus) {
  return ({ draft: "مسودة", issued: "صادرة للعميل", pending_approval: "بانتظار اعتماد الإدارة", approved: "معتمدة", returned: "معادة للتعديل", cancelled: "ملغاة" } as Record<ProformaStatus, string>)[status];
}

function escapeHtml(value: string) { return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character] ?? character); }
export function buildProformaHtml(proforma: Proforma) {
  const rows = proforma.lines.map((line, index) => `<tr><td>${index + 1}</td><td><strong>${escapeHtml(line.name)}</strong><br><small>${escapeHtml(line.sku)}</small></td><td>${line.quantity.toLocaleString("en-US")}</td><td>${line.unitPrice.toLocaleString("en-US")}</td><td>${line.lineTotal.toLocaleString("en-US")}</td></tr>`).join("");
  return `<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"/><style>@page{margin:22px}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#143D35;font-size:12px}.watermark{position:fixed;top:44%;left:5%;right:5%;font-size:35px;color:rgba(15,118,110,.09);font-weight:700;transform:rotate(-18deg);text-align:center}.head{border-bottom:3px solid #0F766E;padding-bottom:13px}.brand{font-size:22px;font-weight:700}.label{display:inline-block;background:#E9F8F2;color:#0F766E;border:1px solid #B9DED3;border-radius:12px;padding:6px 10px;font-weight:700}.grid{display:flex;justify-content:space-between;gap:20px;margin:18px 0}.muted{color:#64748B}.client{background:#F7FBF9;padding:12px;border-radius:10px;border:1px solid #DCE8E3}table{width:100%;border-collapse:collapse;margin-top:14px}th{background:#143D35;color:#fff}th,td{padding:10px;border:1px solid #DCE8E3;text-align:right}td:first-child,th:first-child{text-align:center}.total{margin-top:16px;margin-right:auto;width:270px;background:#E9F8F2;padding:14px;border-radius:10px;font-size:16px;font-weight:700}.footer{border-top:1px solid #DCE8E3;margin-top:28px;padding-top:12px;color:#64748B;line-height:1.7}</style></head><body><div class="watermark">فاتورة مبدئية — غير محاسبية</div><header class="head"><div class="brand">TIPS CRM</div><div class="muted">فاتورة مبدئية للطلب — غير محاسبية</div></header><section class="grid"><div><div class="label">رقم مبدئي: PF-${proforma.proformaNumber}</div><p class="muted">تاريخ الإصدار: ${proforma.issuedAt ? new Date(proforma.issuedAt).toLocaleDateString("ar-SD") : "لم تصدر بعد"}</p></div><div class="client"><strong>الجهة: ${escapeHtml(proforma.accountName)}</strong><br><span class="muted">${escapeHtml(proforma.accountType)}</span></div></section><table><thead><tr><th>#</th><th>المنتج</th><th>الكمية</th><th>سعر الوحدة (${escapeHtml(proforma.currency)})</th><th>الإجمالي (${escapeHtml(proforma.currency)})</th></tr></thead><tbody>${rows}</tbody></table><div class="total">الإجمالي المبدئي: ${proforma.subtotal.toLocaleString("en-US")} ${escapeHtml(proforma.currency)}</div>${proforma.notes ? `<p><strong>ملاحظات:</strong> ${escapeHtml(proforma.notes)}</p>` : ""}<footer class="footer"><strong>تنبيه:</strong> هذه فاتورة مبدئية لغرض الطلب والمراجعة فقط. لا تعد فاتورة ضريبية أو محاسبية، ولا تؤثر في المخزون أو التحصيل أو المديونية.</footer></body></html>`;
}
