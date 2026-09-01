import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
writeFileSync(resolve(root, "tmp-visit-reference-enhancements-migration.json"), JSON.stringify({
  project_id: "luqrrjhvaremronfcvaf",
  name: "visit_reference_enhancements",
  query: readFileSync(resolve(root, "supabase/tips_crm_visit_reference_enhancements.sql"), "utf8"),
}));
