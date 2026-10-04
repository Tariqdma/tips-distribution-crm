import path from "node:path";
import { configDefaults, defineConfig } from "vitest/config";

// tests/integration/ calls real Supabase and Resend endpoints and needs their
// keys in the environment. They run only with `npm run test:integration`.
const runIntegration = process.env.RUN_INTEGRATION_TESTS === "1";

export default defineConfig({
  resolve: {
    alias: {
      "@shared": path.resolve(__dirname, "shared"),
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    include: runIntegration ? ["tests/integration/**/*.test.ts"] : ["tests/**/*.test.ts"],
    exclude: runIntegration ? configDefaults.exclude : [...configDefaults.exclude, "tests/integration/**"],
  },
});
