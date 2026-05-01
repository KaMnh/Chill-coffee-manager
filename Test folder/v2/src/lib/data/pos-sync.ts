import type { SupabaseClient } from "@supabase/supabase-js";
import { getFunctionErrorMessage } from "./_common";

export async function triggerPosSync(
  supabase: SupabaseClient,
  payload: { businessDate: string; force?: boolean; reason?: string }
) {
  const { data, error } = await supabase.functions.invoke("trigger-pos-sync", {
    body: {
      business_date: payload.businessDate,
      force: Boolean(payload.force),
      reason: payload.reason ?? "manual_refresh"
    }
  });
  if (error) throw new Error(await getFunctionErrorMessage(error, "Không gọi được Edge Function cập nhật POS."));
  return data as { status: "triggered" | "skipped"; message?: string; latest_sync_at?: string | null };
}
