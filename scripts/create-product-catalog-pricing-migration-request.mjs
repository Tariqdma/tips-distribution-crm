import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const projectRoot = process.cwd();
const query = readFileSync(resolve(projectRoot, "supabase/tips_crm_product_catalog_pricing.sql"), "utf8");
writeFileSync(
  resolve(projectRoot, "tmp-product-catalog-pricing-migration.json"),
  JSON.stringify({
    project_id: "luqrrjhvaremronfcvaf",
    name: "product_catalog_pricing_import",
    query,
  }),
);
