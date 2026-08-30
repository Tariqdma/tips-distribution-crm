import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const projectRoot = process.cwd();
writeFileSync(
  resolve(projectRoot, "tmp-product-catalog-lifecycle-migration.json"),
  JSON.stringify({
    project_id: "luqrrjhvaremronfcvaf",
    name: "product_catalog_lifecycle",
    query: readFileSync(resolve(projectRoot, "supabase/tips_crm_product_catalog_lifecycle.sql"), "utf8"),
  }),
);
