import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "..");
const query = readFileSync(resolve(projectRoot, "supabase/tips_crm_company_setup_repair.sql"), "utf8");

writeFileSync(
  resolve(projectRoot, "tmp-company-setup-repair-migration.json"),
  JSON.stringify(
    {
      project_id: "luqrrjhvaremronfcvaf",
      name: "restore_company_operational_setup_rpcs",
      query,
    },
    null,
    2,
  ),
);
