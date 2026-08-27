import { Router } from "express";
import {
  addRequestNote,
  approveCompanyRequest,
  cancelManagerInvitation,
  createCompanyDirect,
  requestMoreInfo,
  resendManagerInvitation,
  reviewCompanyRequest,
  updateCompanySubscription,
} from "../platform-company";

export const platformRouter = Router();

platformRouter.post("/company-requests/:requestId/approve", async (req, res) => {
  try {
    const company = await approveCompanyRequest({ ...req.body, requestId: req.params.requestId }, req.header("authorization"));
    res.status(201).json({ company });
  } catch (error) {
    const message = error instanceof Error ? error.message : "تعذر اعتماد طلب الشركة.";
    res.status(message.includes("مدير المنصة") || message.includes("جلسة") ? 403 : 400).json({ message });
  }
});

platformRouter.post("/company-requests/:requestId/review", async (req, res) => {
  try {
    const review = await reviewCompanyRequest({ requestId: req.params.requestId, status: req.body?.status, reviewNote: req.body?.reviewNote }, req.header("authorization"));
    res.json({ ok: true, review });
  } catch (error) {
    const message = error instanceof Error ? error.message : "تعذر مراجعة طلب الشركة.";
    res.status(message.includes("مدير المنصة") || message.includes("جلسة") ? 403 : 400).json({ message });
  }
});

platformRouter.post("/company-requests/:requestId/notes", async (req, res) => {
  try {
    const note = await addRequestNote({ requestId: req.params.requestId, noteText: String(req.body?.noteText ?? "") }, req.header("authorization"));
    res.status(201).json({ note });
  } catch (error) {
    const message = error instanceof Error ? error.message : "تعذر حفظ ملاحظة الطلب.";
    res.status(message.includes("مدير المنصة") || message.includes("جلسة") ? 403 : 400).json({ message });
  }
});

platformRouter.post("/company-requests/:requestId/request-info", async (req, res) => {
  try {
    const result = await requestMoreInfo({ requestId: req.params.requestId, informationNeeded: String(req.body?.informationNeeded ?? "") }, req.header("authorization"));
    res.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "تعذر طلب المعلومات من الشركة.";
    res.status(message.includes("مدير المنصة") || message.includes("جلسة") ? 403 : 400).json({ message });
  }
});

platformRouter.post("/company-requests/:requestId/cancel-invitation", async (req, res) => {
  try {
    const result = await cancelManagerInvitation(req.params.requestId, req.header("authorization"));
    res.json({ ok: true, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "تعذر إلغاء دعوة مدير الشركة.";
    res.status(message.includes("مدير المنصة") || message.includes("جلسة") ? 403 : 400).json({ message });
  }
});

platformRouter.post("/companies", async (req, res) => {
  try {
    const company = await createCompanyDirect(req.body, req.header("authorization"));
    res.status(201).json({ company });
  } catch (error) {
    const message = error instanceof Error ? error.message : "تعذر إنشاء الشركة.";
    res.status(message.includes("مدير المنصة") || message.includes("جلسة") ? 403 : 400).json({ message });
  }
});

platformRouter.post("/companies/:companyId/resend-invitation", async (req, res) => {
  try {
    const result = await resendManagerInvitation(req.params.companyId, req.header("authorization"));
    res.json({ ok: true, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "تعذر إعادة إرسال دعوة مدير الشركة.";
    res.status(message.includes("مدير المنصة") || message.includes("جلسة") ? 403 : 400).json({ message });
  }
});

platformRouter.put("/companies/:companyId/subscription", async (req, res) => {
  try {
    const result = await updateCompanySubscription(
      {
        companyId: req.params.companyId,
        paymentTierKey: String(req.body?.paymentTierKey ?? "standard"),
        maxUserLimit: Number(req.body?.maxUserLimit) || 20,
      },
      req.header("authorization"),
    );
    res.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "تعذر تحديث اشتراك وسعة الشركة.";
    res.status(message.includes("مدير المنصة") || message.includes("جلسة") ? 403 : 400).json({ message });
  }
});
