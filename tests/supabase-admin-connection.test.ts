import { describe, expect, it } from "vitest";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

describe("Supabase admin service credential", () => {
  it("can access the lightweight admin users endpoint", async () => {
    expect(supabaseUrl).toBeTruthy();
    expect(serviceRoleKey).toBeTruthy();

    const response = await fetch(`${supabaseUrl}/auth/v1/admin/users?page=1&per_page=1`, {
      headers: {
        apikey: serviceRoleKey as string,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
    });

    expect(response.ok).toBe(true);
  }, 15_000);
});
