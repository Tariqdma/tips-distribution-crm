import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
writeFileSync(resolve(root, "tmp-proformas-migration.json"), JSON.stringify({
  project_id: "luqrrjhvaremronfcvaf",
  name: "proformas",
  query: readFileSync(resolve(root, "supabase/tips_crm_proformas.sql"), "utf8"),
}));
