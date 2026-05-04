import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  SafeCount,
  SafeTransaction,
  SafeTransactionType,
  SafeWithdrawCategory
} from "@/lib/types";
import { toAppError, unwrapJson } from "./_common";

/**
 * Số dư sổ quỹ hiện tại. Owner + manager xem được (manager để hiển thị status,
 * KHÔNG có quyền thao tác).
 */
export async function loadSafeBalance(supabase: SupabaseClient): Promise<number> {
  const { data, error } = await supabase.rpc("safe_balance_now");
  if (error) throw toAppError(error, "Không tải được số dư sổ quỹ.");
  return Number(data ?? 0);
}

/**
 * List transactions với optional filter date range + type.
 * Server-side đã sort desc theo occurred_at.
 */
export async function loadSafeTransactions(
  supabase: SupabaseClient,
  options: {
    fromDate?: string;
    toDate?: string;
    type?: SafeTransactionType;
  } = {}
): Promise<SafeTransaction[]> {
  const { data, error } = await supabase.rpc("safe_list_transactions", {
    p_from: options.fromDate ?? null,
    p_to: options.toDate ?? null,
    p_type: options.type ?? null
  });
  if (error) throw toAppError(error, "Không tải được lịch sử sổ quỹ.");
  return unwrapJson<SafeTransaction[]>(data, []) ?? [];
}

/** Tạo row initial_setup. Chỉ chạy được 1 lần khi safe chưa có transaction. */
export async function setupSafeInitial(
  supabase: SupabaseClient,
  amount: number,
  note?: string
) {
  const { data, error } = await supabase.rpc("safe_setup_initial", {
    p_amount: amount,
    p_note: note ?? null
  });
  if (error) throw toAppError(error, "Không thiết lập được sổ quỹ.");
  return data as { id: string; balance: number };
}

/** Rút sổ quỹ cho mục đích khác. */
export async function withdrawSafeOther(
  supabase: SupabaseClient,
  payload: {
    amount: number;
    category: SafeWithdrawCategory;
    description?: string;
  }
) {
  const { data, error } = await supabase.rpc("safe_withdraw_other", {
    p_amount: payload.amount,
    p_category: payload.category,
    p_description: payload.description ?? null
  });
  if (error) throw toAppError(error, "Không rút được sổ quỹ.");
  return data as { id: string; balance_after: number };
}

/** Adjust balance khi count lệch. Note bắt buộc >= 5 ký tự. */
export async function adjustSafe(
  supabase: SupabaseClient,
  payload: { newBalance: number; note: string }
) {
  const { data, error } = await supabase.rpc("safe_adjust", {
    p_new_balance: payload.newBalance,
    p_note: payload.note
  });
  if (error) throw toAppError(error, "Không điều chỉnh được sổ quỹ.");
  return data as { id: string; balance_after: number; difference: number };
}

/** Snapshot mệnh giá (KHÔNG auto adjust balance). */
export async function countSafe(
  supabase: SupabaseClient,
  payload: { denominations: Record<string, number>; note?: string }
) {
  const denoms = Object.fromEntries(
    Object.entries(payload.denominations).map(([k, v]) => [String(k), Math.max(0, Number(v) || 0)])
  );
  const { data, error } = await supabase.rpc("safe_count", {
    p_denominations_json: denoms,
    p_note: payload.note ?? null
  });
  if (error) throw toAppError(error, "Không lưu được lần đếm sổ quỹ.");
  return data as {
    id: string;
    total_physical: number;
    expected_balance: number;
    difference: number;
  };
}

/** List safe_counts trực tiếp (qua RLS — owner only). */
export async function loadSafeCounts(supabase: SupabaseClient, limit = 20): Promise<SafeCount[]> {
  const { data, error } = await supabase
    .from("safe_counts")
    .select("id, counted_at, denominations_json, total_physical, expected_balance, difference, note, counted_by, created_at")
    .order("counted_at", { ascending: false })
    .limit(limit);
  if (error) throw toAppError(error, "Không tải được lịch sử đếm sổ quỹ.");
  return (data ?? []) as SafeCount[];
}
