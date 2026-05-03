import type { SupabaseClient } from "@supabase/supabase-js";
import type { ExpenseCategory, ExpenseTemplate } from "@/lib/types";
import { toAppError } from "./_common";

export async function loadExpenseCategories(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("expense_categories")
    .select("id, name, type, sort_order, is_active")
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (error) throw toAppError(error, "Không tải được danh mục.");
  return (data ?? []) as ExpenseCategory[];
}

export async function loadExpenseTemplates(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("expense_templates")
    .select("id, label, default_category_id, default_unit, last_unit_price, usage_count, is_active")
    .eq("is_active", true)
    .order("usage_count", { ascending: false })
    .order("label", { ascending: true });
  if (error) throw toAppError(error, "Không tải được template chi phí.");
  return (data ?? []) as ExpenseTemplate[];
}

/** Admin xem cả templates inactive. RLS cho phép owner/manager. */
export async function loadExpenseTemplatesAll(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("expense_templates")
    .select("id, label, default_category_id, default_unit, last_unit_price, usage_count, is_active")
    .order("is_active", { ascending: false })
    .order("usage_count", { ascending: false })
    .order("label", { ascending: true });
  if (error) throw toAppError(error, "Không tải được danh sách mẫu chi phí.");
  return (data ?? []) as ExpenseTemplate[];
}

export async function createExpense(supabase: SupabaseClient, payload: Record<string, unknown>) {
  const { data, error } = await supabase.rpc("create_expense", { p_payload: payload });
  if (error) throw toAppError(error, "Không tạo được khoản chi.");
  return data;
}

export async function createExpenseTemplate(supabase: SupabaseClient, payload: Record<string, unknown>) {
  const { data, error } = await supabase.rpc("create_expense_template", { p_payload: payload });
  if (error) throw toAppError(error, "Không tạo được template.");
  return data as ExpenseTemplate;
}

/**
 * Admin update template (RLS: owner/manager only via expense_templates_admin_write).
 * Patch fields: label, default_category_id, default_unit, last_unit_price, is_active.
 */
export async function updateExpenseTemplate(
  supabase: SupabaseClient,
  id: string,
  patch: Partial<Pick<ExpenseTemplate, "label" | "default_category_id" | "default_unit" | "last_unit_price" | "is_active">>
) {
  const { data, error } = await supabase
    .from("expense_templates")
    .update(patch)
    .eq("id", id)
    .select("id, label, default_category_id, default_unit, last_unit_price, usage_count, is_active")
    .single();
  if (error) throw toAppError(error, "Không cập nhật được mẫu chi phí.");
  return data as ExpenseTemplate;
}

/**
 * Soft delete: set is_active=false. Giữ row để usage_count + lịch sử expenses.template_id còn ý nghĩa.
 */
export async function deactivateExpenseTemplate(supabase: SupabaseClient, id: string) {
  return updateExpenseTemplate(supabase, id, { is_active: false });
}
