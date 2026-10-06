import { Router } from "express";
import { AppError } from "../_core/app-error";
import {
  addRequestNote,
  approveCompanyRequest,
  resendInvitationForRequest,
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
    const statusCode = error instanceof AppError ? error.statusCode : 400;
    res.status(statusCode).json({ message });
  }
});

platformRouter.post("/company-requests/:requestId/review", async (req, res) => {
  try {
    const review = await reviewCompanyRequest({ requestId: req.params.requestId, status: req.body?.status ?? req.body?.decision, reviewNote: req.body?.reviewNote }, req.header("authorization"));
    res.json({ ok: true, review });
  } catch (error) {
    const message = error instanceof Error ? error.message : "تعذر مراجعة طلب الشركة.";
    const statusCode = error instanceof AppError ? error.statusCode : 400;
    res.status(statusCode).json({ message });
  }
});

platformRouter.post("/company-requests/:requestId/notes", async (req, res) => {
  try {
    const note = await addRequestNote({ requestId: req.params.requestId, noteText: String(req.body?.noteText ?? "") }, req.header("authorization"));
    res.status(201).json({ note });
  } catch (error) {
    const message = error instanceof Error ? error.message : "تعذر حفظ ملاحظة الطلب.";
    const statusCode = error instanceof AppError ? error.statusCode : 400;
    res.status(statusCode).json({ message });
  }
});

platformRouter.post("/company-requests/:requestId/request-info", async (req, res) => {
  try {
    const result = await requestMoreInfo({ requestId: req.params.requestId, informationNeeded: String(req.body?.informationNeeded ?? req.body?.requestedInfo ?? "") }, req.header("authorization"));
    res.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "تعذر طلب المعلومات من الشركة.";
    const statusCode = error instanceof AppError ? error.statusCode : 400;
    res.status(statusCode).json({ message });
  }
});

// The platform page works with request ids; resolve the approved company here.
platformRouter.post("/company-requests/:requestId/resend-invitation", async (req, res) => {
  try {
    const result = await resendInvitationForRequest(req.params.requestId, req.header("authorization"));
    res.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "تعذر إعادة إرسال دعوة مدير الشركة.";
    const statusCode = error instanceof AppError ? error.statusCode : 400;
    res.status(statusCode).json({ message });
  }
});

platformRouter.post("/company-requests/:requestId/cancel-invitation", async (req, res) => {
  try {
    const result = await cancelManagerInvitation(req.params.requestId, req.header("authorization"));
    res.json({ ok: true, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "تعذر إلغاء دعوة مدير الشركة.";
    const statusCode = error instanceof AppError ? error.statusCode : 400;
    res.status(statusCode).json({ message });
  }
});

platformRouter.post("/companies", async (req, res) => {
  try {
    const company = await createCompanyDirect(req.body, req.header("authorization"));
    res.status(201).json({ company });
  } catch (error) {
    const message = error instanceof Error ? error.message : "تعذر إنشاء الشركة.";
    const statusCode = error instanceof AppError ? error.statusCode : 400;
    res.status(statusCode).json({ message });
  }
});

platformRouter.post("/companies/:companyId/resend-invitation", async (req, res) => {
  try {
    const result = await resendManagerInvitation(req.params.companyId, req.header("authorization"));
    res.json({ ok: true, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "تعذر إعادة إرسال دعوة مدير الشركة.";
    const statusCode = error instanceof AppError ? error.statusCode : 400;
    res.status(statusCode).json({ message });
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
    const statusCode = error instanceof AppError ? error.statusCode : 400;
    res.status(statusCode).json({ message });
  }
});
