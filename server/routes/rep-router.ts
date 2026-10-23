import { Router } from "express";
import { resolveActor } from "../_core/authorize";
import { AppError } from "../_core/app-error";
import { assignFinanceCustomerCode, readFinancialSnapshot } from "../financial-control";
import { sendManagedPasswordRecoveryEmail } from "../password-recovery-email";
import { sendPlanSubmissionEmail } from "../plan-submission-email";

export const repRouter = Router();

repRouter.post("/plan-submission-email", async (req, res) => {
  try {
    await resolveActor(req.header("authorization"));
    res.json(await sendPlanSubmissionEmail(req.body));
  } catch (error) {
    const statusCode = error instanceof AppError ? error.statusCode : 400;
    res.status(statusCode).json({ message: error instanceof Error ? error.message : "تعذر إرسال تنبيه الخطة." });
  }
});

repRouter.post("/auth/password-recovery", async (req, res) => {
  try {
    const email = typeof req.body?.email === "string" ? req.body.email : "";
    await sendManagedPasswordRecoveryEmail(email);
    res.status(202).json({ sent: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "تعذر إرسال رسالة الاستعادة.";
    res.status(400).json({ message });
  }
});

repRouter.get("/financial-control", async (req, res) => {
  try {
    res.setHeader("Cache-Control", "no-store");
    res.json({ snapshot: await readFinancialSnapshot(req.header("authorization")) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "تعذر قراءة بيانات التحكم المالي.";
    res.status(message.includes("صلاحية") || message.includes("جلسة") ? 403 : 400).json({ message });
  }
});

repRouter.post("/financial-control/customer-mappings", async (req, res) => {
  try {
    const accountId = typeof req.body?.accountId === "string" ? req.body.accountId : "";
    const customerCode = typeof req.body?.customerCode === "string" ? req.body.customerCode : "";
    res.json({ mapping: await assignFinanceCustomerCode({ accountId, customerCode }, req.header("authorization")) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "تعذر حفظ مطابقة العميل.";
    res.status(message.includes("صلاحية") || message.includes("جلسة") ? 403 : 400).json({ message });
  }
});
