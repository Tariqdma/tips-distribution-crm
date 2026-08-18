import "dotenv/config";
import express from "express";
import { createServer } from "http";
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
  const webDistDirectory = path.join(process.cwd(), "web-dist");
  const sendWebApplication = (_req: express.Request, res: express.Response) => {
    res.setHeader("Cache-Control", "no-store, max-age=0");
    res.sendFile(path.join(webDistDirectory, "index.html"));
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

  // The public domain must serve the real Expo Web application—not the old
  // server-side recovery landing page. Static assets are cached by filename;
  // the HTML shell is deliberately not cached so published fixes take effect.
  app.use(express.static(webDistDirectory, { index: false, maxAge: "1h", immutable: true }));

  app.get("/", sendWebApplication);

  app.get("/vendor/supabase.js", (_req, res) => {
    res.setHeader("Cache-Control", "no-store, max-age=0");
    res.type("application/javascript").sendFile(
      path.join(process.cwd(), "node_modules", "@supabase", "supabase-js", "dist", "umd", "supabase.js"),
    );
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
