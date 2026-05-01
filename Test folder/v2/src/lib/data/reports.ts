import type { SupabaseClient } from "@supabase/supabase-js";
import type { CashCloseReport } from "@/lib/types";
import { unwrapJson } from "./_common";

export async function finalizeCashCloseReport(supabase: SupabaseClient, cashCountId: string) {
  const { data, error } = await supabase.rpc("finalize_cash_close_report", {
    p_cash_count_id: cashCountId
  });
  if (error) throw error;
  return data as { report_id?: string };
}

export async function loadCashCloseReportsByDate(supabase: SupabaseClient, businessDate: string) {
  const { data, error } = await supabase.rpc("get_cash_close_reports_by_date", {
    p_business_date: businessDate
  });
  if (error) throw error;
  return unwrapJson<CashCloseReport[]>(data, []);
}

export async function loadCashCloseReport(supabase: SupabaseClient, reportId: string) {
  const { data, error } = await supabase.rpc("get_cash_close_report", { p_report_id: reportId });
  if (error) throw error;
  return unwrapJson<CashCloseReport | null>(data, null);
}
