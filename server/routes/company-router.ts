import { Router } from "express";
import { getCompanyOperationalSetup, saveCompanyOperationalSetup } from "../company-setup";
import { getCompanyTeamSetup } from "../company-team-setup";
import { getCompanyTerritorySetup, saveCompanyTerritory } from "../company-territory-setup";
import { getCompanyAccountSetup, importCompanyAccounts } from "../company-account-import";
import { createTemporaryEmployeeAccount, listEmployeeAccounts, resetEmployeePassword } from "../employee-account";

export const companyRouter = Router();

companyRouter.get("/setup", async (req, res) => {
  try {
    res.setHeader("Cache-Control", "no-store");
    res.json({ setup: await getCompanyOperationalSetup(req.header("authorization")) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "تعذر تحميل إعدادات الشركة.";
    res.status(message.includes("مدير الشركة") || message.includes("جلسة") ? 403 : 400).json({ message });
  }
});

companyRouter.put("/setup", async (req, res) => {
  try {
    res.json({ setup: await saveCompanyOperationalSetup(req.body ?? {}, req.header("authorization")) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "تعذر حفظ إعدادات الشركة.";
    res.status(message.includes("مدير الشركة") || message.includes("جلسة") ? 403 : 400).json({ message });
  }
});

companyRouter.get("/team-setup", async (req, res) => {
  try {
    res.setHeader("Cache-Control", "no-store");
    res.json({ setup: await getCompanyTeamSetup(req.header("authorization")) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "تعذر تحميل إعدادات فريق الشركة.";
    res.status(message.includes("مدير الشركة") || message.includes("جلسة") ? 403 : 400).json({ message });
  }
});

companyRouter.get("/territory-setup", async (req, res) => {
  try {
    res.setHeader("Cache-Control", "no-store");
    res.json({ setup: await getCompanyTerritorySetup(req.header("authorization")) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "تعذر تحميل إعدادات مناطق الشركة.";
    res.status(message.includes("مدير الشركة") || message.includes("جلسة") ? 403 : 400).json({ message });
  }
});

companyRouter.post("/territory-setup", async (req, res) => {
  try {
    res.status(201).json({ territory: await saveCompanyTerritory(req.body ?? {}, req.header("authorization")) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "تعذر حفظ منطقة العمل.";
    res.status(message.includes("مدير الشركة") || message.includes("جلسة") ? 403 : 400).json({ message });
  }
});

companyRouter.get("/account-setup", async (req, res) => {
  try {
    res.setHeader("Cache-Control", "no-store");
    res.json({ setup: await getCompanyAccountSetup(req.header("authorization")) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "تعذر تحميل جهات الشركة.";
    res.status(message.includes("مدير الشركة") || message.includes("جلسة") ? 403 : 400).json({ message });
  }
});

companyRouter.post("/account-setup/import", async (req, res) => {
  try {
    res.json(await importCompanyAccounts(req.body ?? {}, req.header("authorization")));
  } catch (error) {
    const message = error instanceof Error ? error.message : "تعذر استيراد الجهات.";
    res.status(message.includes("مدير الشركة") || message.includes("جلسة") || message.includes("صلاحية") ? 403 : 400).json({ message });
  }
});

companyRouter.get("/employee-accounts", async (req, res) => {
  try {
    const accounts = await listEmployeeAccounts(req.header("authorization"));
    res.json({ accounts });
  } catch (error) {
    const message = error instanceof Error ? error.message : "تعذر تحميل حسابات الموظفين.";
    res.status(message.includes("صلاحية") || message.includes("جلسة") ? 403 : 400).json({ message });
  }
});

companyRouter.post("/employee-accounts", async (req, res) => {
  try {
    const account = await createTemporaryEmployeeAccount(req.body, req.header("authorization"));
    res.status(201).json({ account });
  } catch (error) {
    const message = error instanceof Error ? error.message : "تعذر إنشاء حساب الموظف.";
    res.status(message.includes("صلاحية") || message.includes("جلسة") ? 403 : 400).json({ message });
  }
});

companyRouter.post("/employee-accounts/:employeeId/reset-password", async (req, res) => {
  try {
    const account = await resetEmployeePassword(req.params.employeeId, req.body, req.header("authorization"));
    res.json({ account });
  } catch (error) {
    const message = error instanceof Error ? error.message : "تعذر إعادة تعيين كلمة مرور الموظف.";
    res.status(message.includes("صلاحية") || message.includes("جلسة") ? 403 : 400).json({ message });
  }
});
