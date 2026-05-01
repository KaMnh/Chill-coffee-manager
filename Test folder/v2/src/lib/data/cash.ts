import type { SupabaseClient } from "@supabase/supabase-js";
import type { CashDayOpening } from "@/lib/types";
import { unwrapJson } from "./_common";

export async function saveCashCount(supabase: SupabaseClient, payload: Record<string, unknown>) {
  const { data, error } = await supabase.rpc("save_cash_count", { p_payload: payload });
  if (error) throw error;
  return data as { cash_count_id?: string; difference?: number };
}

export async function loadCashDayOpening(supabase: SupabaseClient, businessDate: string) {
  const { data, error } = await supabase
    .from("cash_day_openings")
    .select("id, business_date, denominations_json, opening_total, carried_from_previous_day, created_by, created_at, updated_at")
    .eq("business_date", businessDate)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as CashDayOpening | null;
}

export async function saveCashDayOpening(
  supabase: SupabaseClient,
  payload: {
    business_date: string;
    denominations_json: Record<string, number>;
    carried_from_previous_day?: boolean;
  }
) {
  const denominations = Object.fromEntries(
    Object.entries(payload.denominations_json).map(([denomination, count]) => [
      String(denomination),
      Math.max(0, Number(count) || 0)
    ])
  );
  const rpcPayload = {
    ...payload,
    denominations_json: denominations
  };
  const { data, error } = await supabase.rpc("save_cash_day_opening", { p_payload: rpcPayload });
  if (error) {
    const message = error.message ?? "";
    if (message.includes("save_cash_day_opening") || message.includes("Could not find the function")) {
      throw new Error(
        "Supabase chưa có RPC save_cash_day_opening. Hãy apply lại file database/002_functions.sql và database/003_rls.sql rồi thử lưu lại."
      );
    }
    throw error;
  }
  return unwrapJson<CashDayOpening>(data, {
    id: "",
    business_date: payload.business_date,
    denominations_json: denominations,
    opening_total: 0,
    carried_from_previous_day: Boolean(payload.carried_from_previous_day),
    created_by: null,
    created_at: "",
    updated_at: ""
  });
}
