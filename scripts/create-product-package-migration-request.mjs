import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const projectRoot = process.cwd();
const query = readFileSync(resolve(projectRoot, "supabase/tips_crm_products_in_visits.sql"), "utf8");
writeFileSync(
  resolve(projectRoot, "tmp-products-in-visits-migration.json"),
  JSON.stringify({
    project_id: "luqrrjhvaremronfcvaf",
    name: "products_in_visits_package",
    query,
  }),
);
