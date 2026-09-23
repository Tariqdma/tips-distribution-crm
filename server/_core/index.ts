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
import { getCompanyAccountSetup, importCompanyAccounts } from "../company-account-import";
import { platformRouter } from "../routes/platform-router";
import { companyRouter } from "../routes/company-router";
import { repRouter } from "../routes/rep-router";

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

  // Register 3 isolated API domain routers
  app.use("/api/platform", platformRouter);
  app.use("/api/company", companyRouter);
  app.use("/api", repRouter);

  // Backwards compatibility aliases for existing endpoints
  app.post("/api/employee-accounts", (req, res, next) => {
    companyRouter(req, res, next);
  });
  app.get("/api/employee-accounts", (req, res, next) => {
    companyRouter(req, res, next);
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
