import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = path.join(projectRoot, "supabase");
const outputDir = path.join(projectRoot, ".restore-inputs");
const projectId = "luqrrjhvaremronfcvaf";

const migrations = [
  ["restore_01_tips_crm_schema", "tips_crm_schema.sql"],
  ["restore_02_tips_crm_auth", "tips_crm_auth.sql"],
  ["restore_03_tips_crm_roles_rpc", "tips_crm_roles_rpc.sql"],
  ["restore_04_tips_crm_operations", "tips_crm_operations.sql"],
  ["restore_05_tips_crm_plan_review", "tips_crm_plan_review.sql"],
  ["restore_06_tips_crm_catalog_invites", "tips_crm_catalog_and_invites.sql"],
  ["restore_07_tips_crm_sync_refinement", "tips_crm_sync_refinement.sql"],
  ["restore_08_tips_crm_outcomes_exports", "tips_crm_outcomes_and_export_filters.sql"],
  ["restore_09_tips_crm_invite_delivery", "tips_crm_invite_delivery_and_report_reps.sql"],
  ["restore_10_tips_crm_mail_settings", "tips_crm_mail_settings_and_exports.sql"],
  ["restore_11_tips_crm_employee_accounts", "tips_crm_temporary_employee_accounts.sql"],
  ["restore_12_tips_crm_first_admin", "tips_crm_first_admin_bootstrap.sql"],
  ["restore_13_tips_crm_plans_visits", "tips_crm_list_plans_and_visits.sql"],
  ["restore_14_tips_crm_plan_approval", "tips_crm_plan_approval_enhancements.sql"],
  ["restore_15_tips_crm_review_reminders", "tips_crm_plan_review_reminders.sql"],
  ["restore_16_tips_crm_review_reminders_rls", "tips_crm_plan_review_reminders_rls.sql"],
  ["restore_17_tips_crm_finalize_employee", "tips_crm_finalize_employee_account.sql"],
  ["restore_18_tips_crm_advanced_features", "tips_crm_restore_advanced_features.sql"],
];

await mkdir(outputDir, { recursive: true });

for (let index = 0; index < migrations.length; index += 1) {
  const [name, sourceFile] = migrations[index];
  const query = await readFile(path.join(sourceDir, sourceFile), "utf8");
  const payload = { project_id: projectId, name, query };
  const filename = `${String(index + 1).padStart(2, "0")}-${name}.json`;
  await writeFile(path.join(outputDir, filename), `${JSON.stringify(payload)}\n`, "utf8");
}

console.log(`Prepared ${migrations.length} restore migration inputs in ${outputDir}`);
