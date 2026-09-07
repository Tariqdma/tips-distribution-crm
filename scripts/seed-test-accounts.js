const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = "https://luqrrjhvaremronfcvaf.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx1cXJyamh2YXJlbXJvbmZjdmFmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA3MzM2MzgsImV4cCI6MjA3NjMwOTYzOH0.8g_QSxyxra1uVVJFboe45Dilq3X1CCdgHoZTY3UPESk";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const TEST_ACCOUNTS = [
  { email: "platform.admin@tips-sd.com", fullName: "مدير النظام", role: "system_admin" },
  { email: "company.manager@tips-sd.com", fullName: "مدير الشركة", role: "sales_manager" },
  { email: "sales.supervisor@tips-sd.com", fullName: "مشرف المبيعات", role: "sales_supervisor" },
  { email: "medical.supervisor@tips-sd.com", fullName: "مشرف طبي", role: "medical_supervisor" },
  { email: "sales.rep@tips-sd.com", fullName: "مندوب مبيعات", role: "sales_rep" },
  { email: "medical.rep@tips-sd.com", fullName: "مندوب طبي", role: "medical_rep" },
  { email: "accountant@tips-sd.com", fullName: "محاسب", role: "accountant" },
];

const PASSWORD = "Password123!";

async function main() {
  console.log("Creating test accounts...\n");

  const created = [];

  for (const account of TEST_ACCOUNTS) {
    const { data, error } = await supabase.auth.signUp({
      email: account.email,
      password: PASSWORD,
      options: {
        data: { full_name: account.fullName },
      },
    });

    if (error) {
      console.log(`FAIL  ${account.email}: ${error.message}`);
    } else {
      console.log(`OK    ${account.email} -> id: ${data.user.id}`);
      created.push({ ...account, id: data.user.id });
    }
  }

  console.log("\n--- ACCOUNTS CREATED ---");
  console.log(`${created.length} / ${TEST_ACCOUNTS.length} accounts created.\n`);

  if (created.length > 0) {
    console.log("NOW run this SQL in Supabase SQL Editor to confirm emails and assign roles:\n");

    const emailList = created.map((a) => `'${a.email}'`).join(", ");
    console.log(`UPDATE auth.users SET email_confirmed_at = now() WHERE email IN (${emailList});\n`);

    for (const a of created) {
      console.log(
        `UPDATE tips_crm.profiles SET role_key = '${a.role}', full_name = '${a.fullName}' WHERE id = '${a.id}';`
      );
    }
  }
}

main().catch(console.error);
