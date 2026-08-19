import "dotenv/config";
import express from "express";
import { createServer } from "http";
import fs from "fs";
import net from "net";
import path from "path";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { ENV } from "./env";
import { createTemporaryEmployeeAccount, listEmployeeAccounts, resetEmployeePassword } from "../employee-account";
import { assignFinanceCustomerCode, readFinancialSnapshot } from "../financial-control";
import { sendPlanSubmissionEmail } from "../plan-submission-email";
import { sendManagedPasswordRecoveryEmail } from "../password-recovery-email";
import { addRequestNote, approveCompanyRequest, cancelManagerInvitation, createCompanyDirect, createPublicCompanyRequest, getPublicCompanyRequestStatus, requestMoreInfo, resendManagerInvitation, reviewCompanyRequest } from "../platform-company";
import { getCompanyOperationalSetup, saveCompanyOperationalSetup } from "../company-setup";
import { getCompanyTeamSetup } from "../company-team-setup";
import { getCompanyTerritorySetup, saveCompanyTerritory } from "../company-territory-setup";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  const webDistDirectory = path.resolve(process.cwd(), "public-web");
  const indexHtmlPath = path.join(webDistDirectory, "index.html");
  const sendWebApplication = (_req: express.Request, res: express.Response) => {
    if (fs.existsSync(indexHtmlPath)) {
      res.setHeader("Cache-Control", "no-store, max-age=0");
      res.sendFile(indexHtmlPath);
      return;
    }
    res.status(503).type("text/plain").send("واجهة Tips CRM قيد التجهيز. أعد المحاولة بعد لحظات.");
  };

  // Enable CORS for all routes - reflect the request origin to support credentials
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin) {
      res.header("Access-Control-Allow-Origin", origin);
    }
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.header(
      "Access-Control-Allow-Headers",
      "Origin, X-Requested-With, Content-Type, Accept, Authorization",
    );
    res.header("Access-Control-Allow-Credentials", "true");

    // Handle preflight requests
    if (req.method === "OPTIONS") {
      res.sendStatus(200);
      return;
    }
    next();
  });

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  registerStorageProxy(app);
  registerOAuthRoutes(app);

  // The public domain must serve the real Expo Web application. The old
  // server-side landing page is intentionally not used as a fallback.
  app.use(express.static(webDistDirectory, { index: false, maxAge: 0 }));

  app.get("/", sendWebApplication);

  app.get("/vendor/supabase.js", (_req, res) => {
    const localVendor = path.join(process.cwd(), "node_modules", "@supabase", "supabase-js", "dist", "umd", "supabase.js");
    if (fs.existsSync(localVendor)) {
      res.setHeader("Cache-Control", "no-store, max-age=0");
      res.type("application/javascript").sendFile(localVendor);
    } else {
      res.redirect("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js");
    }
  });

  app.get("/reset-password", sendWebApplication);

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, timestamp: Date.now() });
  });

  app.post("/api/employee-accounts", async (req, res) => {
    try {
      const account = await createTemporaryEmployeeAccount(req.body, req.header("authorization"));
      res.status(201).json({ account });
    } catch (error) {
      const message = error instanceof Error ? error.message : "تعذر إنشاء حساب الموظف.";
      res.status(message.includes("صلاحية") || message.includes("جلسة") ? 403 : 400).json({ message });
    }
  });

  app.post("/api/plan-submission-email", async (req, res) => {
    try {
      res.json(await sendPlanSubmissionEmail(req.body));
    } catch (error) {
      res.status(400).json({ message: error instanceof Error ? error.message : "تعذر إرسال تنبيه الخطة." });
    }
  });

  app.post("/api/auth/password-recovery", async (req, res) => {
    try {
      const email = typeof req.body?.email === "string" ? req.body.email : "";
      await sendManagedPasswordRecoveryEmail(email);
      res.status(202).json({ sent: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : "تعذر إرسال رسالة الاستعادة.";
      res.status(400).json({ message });
    }
  });

  app.get("/api/company/setup", async (req, res) => {
    try {
      res.setHeader("Cache-Control", "no-store");
      res.json({ setup: await getCompanyOperationalSetup(req.header("authorization")) });
    } catch (error) {
      const message = error instanceof Error ? error.message : "تعذر تحميل إعدادات الشركة.";
      res.status(message.includes("مدير الشركة") || message.includes("جلسة") ? 403 : 400).json({ message });
    }
  });

  app.put("/api/company/setup", async (req, res) => {
    try {
      res.json({ setup: await saveCompanyOperationalSetup(req.body ?? {}, req.header("authorization")) });
    } catch (error) {
      const message = error instanceof Error ? error.message : "تعذر حفظ إعدادات الشركة.";
      res.status(message.includes("مدير الشركة") || message.includes("جلسة") ? 403 : 400).json({ message });
    }
  });

  app.get("/api/company/team-setup", async (req, res) => {
    try {
      res.setHeader("Cache-Control", "no-store");
      res.json({ setup: await getCompanyTeamSetup(req.header("authorization")) });
    } catch (error) {
      const message = error instanceof Error ? error.message : "تعذر تحميل إعدادات فريق الشركة.";
      res.status(message.includes("مدير الشركة") || message.includes("جلسة") ? 403 : 400).json({ message });
    }
  });

  app.get("/api/company/territory-setup", async (req, res) => {
    try {
      res.setHeader("Cache-Control", "no-store");
      res.json({ setup: await getCompanyTerritorySetup(req.header("authorization")) });
    } catch (error) {
      const message = error instanceof Error ? error.message : "تعذر تحميل إعدادات مناطق الشركة.";
      res.status(message.includes("مدير الشركة") || message.includes("جلسة") ? 403 : 400).json({ message });
    }
  });

  app.post("/api/company/territory-setup", async (req, res) => {
    try {
      res.status(201).json({ territory: await saveCompanyTerritory(req.body ?? {}, req.header("authorization")) });
    } catch (error) {
      const message = error instanceof Error ? error.message : "تعذر حفظ منطقة العمل.";
      res.status(message.includes("مدير الشركة") || message.includes("جلسة") ? 403 : 400).json({ message });
    }
  });

  app.post("/api/company-requests", async (req, res) => {
    try {
      const request = await createPublicCompanyRequest(req.body ?? {});
      res.status(201).json({ request });
    } catch (error) {
      const message = error instanceof Error ? error.message : "تعذر إرسال طلب الشركة.";
      res.status(400).json({ message });
    }
  });

  app.post("/api/platform/company-requests/:requestId/approve", async (req, res) => {
    try {
      const company = await approveCompanyRequest({ ...req.body, requestId: req.params.requestId }, req.header("authorization"));
      res.status(201).json({ company });
    } catch (error) {
      const message = error instanceof Error ? error.message : "تعذر اعتماد طلب الشركة.";
      res.status(message.includes("مدير المنصة") || message.includes("جلسة") ? 403 : 400).json({ message });
    }
  });

  app.post("/api/platform/company-requests/:requestId/review", async (req, res) => {
    try {
      const review = await reviewCompanyRequest({ requestId: req.params.requestId, status: req.body?.status, reviewNote: req.body?.reviewNote }, req.header("authorization"));
      res.json({ ok: true, review });
    } catch (error) {
      const message = error instanceof Error ? error.message : "تعذر مراجعة طلب الشركة.";
      res.status(message.includes("مدير المنصة") || message.includes("جلسة") ? 403 : 400).json({ message });
    }
  });

  app.post("/api/platform/company-requests/:requestId/notes", async (req, res) => {
    try {
      const note = await addRequestNote({ requestId: req.params.requestId, noteText: String(req.body?.noteText ?? "") }, req.header("authorization"));
      res.status(201).json({ note });
    } catch (error) {
      const message = error instanceof Error ? error.message : "تعذر حفظ ملاحظة الطلب.";
      res.status(message.includes("مدير المنصة") || message.includes("جلسة") ? 403 : 400).json({ message });
    }
  });

  app.post("/api/platform/company-requests/:requestId/request-info", async (req, res) => {
    try {
      const result = await requestMoreInfo({ requestId: req.params.requestId, informationNeeded: String(req.body?.informationNeeded ?? "") }, req.header("authorization"));
      res.json({ ok: true, ...result });
    } catch (error) {
      const message = error instanceof Error ? error.message : "تعذر طلب المعلومات من الشركة.";
      res.status(message.includes("مدير المنصة") || message.includes("جلسة") ? 403 : 400).json({ message });
    }
  });

  app.post("/api/platform/company-requests/:requestId/cancel-invitation", async (req, res) => {
    try {
      const result = await cancelManagerInvitation(req.params.requestId, req.header("authorization"));
      res.json({ ok: true, result });
    } catch (error) {
      const message = error instanceof Error ? error.message : "تعذر إلغاء دعوة مدير الشركة.";
      res.status(message.includes("مدير المنصة") || message.includes("جلسة") ? 403 : 400).json({ message });
    }
  });

  app.post("/api/platform/companies", async (req, res) => {
    try {
      const company = await createCompanyDirect(req.body, req.header("authorization"));
      res.status(201).json({ company });
    } catch (error) {
      const message = error instanceof Error ? error.message : "تعذر إنشاء الشركة.";
      res.status(message.includes("مدير المنصة") || message.includes("جلسة") ? 403 : 400).json({ message });
    }
  });

  app.post("/api/platform/companies/:companyId/resend-invitation", async (req, res) => {
    try {
      const result = await resendManagerInvitation(req.params.companyId, req.header("authorization"));
      res.json({ ok: true, result });
    } catch (error) {
      const message = error instanceof Error ? error.message : "تعذر إعادة إرسال دعوة مدير الشركة.";
      res.status(message.includes("مدير المنصة") || message.includes("جلسة") ? 403 : 400).json({ message });
    }
  });

  app.get("/api/company-requests/:referenceId/status", async (req, res) => {
    try {
      const request = await getPublicCompanyRequestStatus(req.params.referenceId);
      res.setHeader("Cache-Control", "no-store");
      res.json({ request });
    } catch (error) {
      const message = error instanceof Error ? error.message : "تعذر التحقق من حالة الطلب.";
      res.status(400).json({ message });
    }
  });

  app.get("/api/employee-accounts", async (req, res) => {
    try {
      const accounts = await listEmployeeAccounts(req.header("authorization"));
      res.json({ accounts });
    } catch (error) {
      const message = error instanceof Error ? error.message : "تعذر تحميل حسابات الموظفين.";
      res.status(message.includes("صلاحية") || message.includes("جلسة") ? 403 : 400).json({ message });
    }
  });

  app.post("/api/employee-accounts/:employeeId/reset-password", async (req, res) => {
    try {
      const account = await resetEmployeePassword(req.params.employeeId, req.body, req.header("authorization"));
      res.json({ account });
    } catch (error) {
      const message = error instanceof Error ? error.message : "تعذر إعادة تعيين كلمة مرور الموظف.";
      res.status(message.includes("صلاحية") || message.includes("جلسة") ? 403 : 400).json({ message });
    }
  });

  app.get("/api/financial-control", async (req, res) => {
    try {
      res.setHeader("Cache-Control", "no-store");
      res.json({ snapshot: await readFinancialSnapshot(req.header("authorization")) });
    } catch (error) {
      const message = error instanceof Error ? error.message : "تعذر قراءة بيانات التحكم المالي.";
      res.status(message.includes("صلاحية") || message.includes("جلسة") ? 403 : 400).json({ message });
    }
  });

  app.post("/api/financial-control/customer-mappings", async (req, res) => {
    try {
      const accountId = typeof req.body?.accountId === "string" ? req.body.accountId : "";
      const customerCode = typeof req.body?.customerCode === "string" ? req.body.customerCode : "";
      res.json({ mapping: await assignFinanceCustomerCode({ accountId, customerCode }, req.header("authorization")) });
    } catch (error) {
      const message = error instanceof Error ? error.message : "تعذر حفظ مطابقة العميل.";
      res.status(message.includes("صلاحية") || message.includes("جلسة") ? 403 : 400).json({ message });
    }
  });

  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    }),
  );

  // Expo Router handles all non-API application routes after the web shell loads.
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api/") || req.path === "/api" || req.path.startsWith("/vendor/")) {
      next();
      return;
    }
    sendWebApplication(req, res);
  });

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`[api] server listening on port ${port}`);
  });
}

startServer().catch(console.error);
