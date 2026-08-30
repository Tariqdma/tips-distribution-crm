import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
writeFileSync(resolve(root, "tmp-proforma-review-migration.json"), JSON.stringify({
  project_id: "luqrrjhvaremronfcvaf",
  name: "proforma_review",
  query: readFileSync(resolve(root, "supabase/tips_crm_proforma_review.sql"), "utf8"),
}));
