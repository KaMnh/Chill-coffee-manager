import type { SupabaseClient } from "@supabase/supabase-js";
import type { Account, SettingsAccount } from "@/lib/types";
import { toAppError } from "./_common";

export async function loadCurrentAccount(supabase: SupabaseClient): Promise<Account | null> {
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data, error } = await supabase
    .from("employee_accounts")
    .select("id, auth_user_id, employee_id, role, status, employees(name, position)")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (error) throw toAppError(error, "Không tải được tài khoản.");
  if (!data) return null;

  const row = data as unknown as Account & { employees?: Account["employee"] };
  return {
    id: row.id,
    auth_user_id: row.auth_user_id,
    employee_id: row.employee_id,
    role: row.role,
    status: row.status,
    employee: row.employees ?? row.employee ?? null
  };
}

export async function loadSettingsAccounts(supabase: SupabaseClient): Promise<SettingsAccount[]> {
  const { data, error } = await supabase
    .from("employee_accounts")
    .select("id, auth_user_id, role, status, employees(name, position)")
    .order("role", { ascending: true });
  if (error) throw toAppError(error, "Không tải được danh sách tài khoản.");

  const rows = (data ?? []) as Array<Record<string, unknown>>;
  const profileIds = rows.map((row) => row.auth_user_id).filter(Boolean) as string[];
  const { data: profiles, error: profileError } = profileIds.length
    ? await supabase.from("profiles").select("id, sidebar_config").in("id", profileIds)
    : { data: [], error: null };
  if (profileError) throw toAppError(profileError, "Không tải được profile.");

  const profileMap = new Map(
    (profiles ?? []).map((profile: { id: string; sidebar_config: string[] | null }) => [profile.id, profile.sidebar_config])
  );
  return rows.map((row) => {
    const employee = row.employees as { name?: string | null; position?: string | null } | null;
    return {
      id: row.id as string,
      auth_user_id: row.auth_user_id as string,
      role: row.role as SettingsAccount["role"],
      status: row.status as string,
      employee_name: employee?.name ?? null,
      employee_position: employee?.position ?? null,
      sidebar_config: profileMap.get(row.auth_user_id as string) ?? null
    };
  });
}
