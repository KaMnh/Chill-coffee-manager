import type { SupabaseClient } from "@supabase/supabase-js";
import type { CashCloseReport } from "@/lib/types";
import { toAppError, unwrapJson } from "./_common";

export async function finalizeCashCloseReport(
  supabase: SupabaseClient,
  cashCountId: string,
  options: { leaveForNextDay?: number } = {}
) {
  const { data, error } = await supabase.rpc("finalize_cash_close_report", {
    p_cash_count_id: cashCountId,
    p_leave_for_next_day: Math.max(0, Number(options.leaveForNextDay ?? 0))
  });
  if (error) throw toAppError(error, "Không chốt được báo cáo két.");
  return data as { report_id?: string; safe_deposit?: number };
}

export async function loadCashCloseReportsByDate(supabase: SupabaseClient, businessDate: string) {
  const { data, error } = await supabase.rpc("get_cash_close_reports_by_date", {
    p_business_date: businessDate
  });
  if (error) throw toAppError(error, "Không tải được danh sách báo cáo.");
  return unwrapJson<CashCloseReport[]>(data, []);
}

export async function loadCashCloseReport(supabase: SupabaseClient, reportId: string) {
  const { data, error } = await supabase.rpc("get_cash_close_report", { p_report_id: reportId });
  if (error) throw toAppError(error, "Không tải được báo cáo.");
  return unwrapJson<CashCloseReport | null>(data, null);
}
