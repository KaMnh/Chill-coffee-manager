import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const allowedOrigins = (Deno.env.get("APP_ALLOWED_ORIGINS") ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

function buildCors(origin: string | null) {
  const allow = origin && allowedOrigins.includes(origin) ? origin : "";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin"
  };
}

type SyncBody = {
  business_date?: string;
  force?: boolean;
  reason?: string;
};

async function hmacSha256(message: string, secret: string) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return Array.from(new Uint8Array(signature)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  const corsHeaders = buildCors(req.headers.get("origin"));
  const jsonResponse = (body: Record<string, unknown>, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "content-type": "application/json" }
    });

  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ status: "error", error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const webhookUrl = Deno.env.get("N8N_POS_SYNC_WEBHOOK_URL");
  const webhookSecret = Deno.env.get("N8N_POS_SYNC_SECRET");
  const cooldownSeconds = Number(Deno.env.get("POS_SYNC_COOLDOWN_SECONDS") ?? "300");
  const authorization = req.headers.get("Authorization") ?? "";

  if (!supabaseUrl || !anonKey || !webhookUrl || !webhookSecret) {
    return jsonResponse({
      status: "error",
      error: "Edge Function chưa có đủ cấu hình Supabase/n8n.",
      missing: {
        SUPABASE_URL: !supabaseUrl,
        SUPABASE_ANON_KEY: !anonKey,
        N8N_POS_SYNC_WEBHOOK_URL: !webhookUrl,
        N8N_POS_SYNC_SECRET: !webhookSecret
      }
    }, 500);
  }
  if (!authorization.startsWith("Bearer ")) {
    return jsonResponse({ status: "error", error: "Thiếu Authorization Bearer token." }, 401);
  }

  const supabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false }
  });

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return jsonResponse({ status: "error", error: "Token đăng nhập không hợp lệ." }, 401);

  const { data: account, error: accountError } = await supabase
    .from("employee_accounts")
    .select("role, status")
    .eq("auth_user_id", userData.user.id)
    .maybeSingle();

  if (accountError) return jsonResponse({ status: "error", error: accountError.message }, 403);
  if (!account || account.status !== "active" || !["owner", "manager", "staff_operator"].includes(account.role)) {
    return jsonResponse({ status: "error", error: "Bạn không có quyền cập nhật POS." }, 403);
  }

  let body: SyncBody;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ status: "error", error: "Body JSON không hợp lệ." }, 400);
  }

  const businessDate = body.business_date ?? new Date().toISOString().slice(0, 10);
  const force = Boolean(body.force);
  const reason = body.reason ?? "manual_refresh";

  const sixtySecondsAgo = new Date(Date.now() - 60_000).toISOString();
  const { count: recentAttempts, error: rateError } = await supabase
    .from("pos_sync_attempts")
    .select("id", { count: "exact", head: true })
    .gte("requested_at", sixtySecondsAgo)
    .eq("user_id", userData.user.id);
  if (rateError) {
    return jsonResponse({ status: "error", error: rateError.message }, 500);
  }
  const perUserLimit = account.role === "owner" ? 12 : 6;
  if ((recentAttempts ?? 0) >= perUserLimit) {
    return jsonResponse({
      status: "error",
      error: `Vượt quá tốc độ cho phép (${perUserLimit} lần/phút). Vui lòng thử lại sau.`
    }, 429);
  }
  await supabase.from("pos_sync_attempts").insert({
    user_id: userData.user.id,
    force,
    reason
  });

  const { data: latestSync } = await supabase
    .from("sales_sync_runs")
    .select("id, status, finished_at")
    .lte("business_date_from", businessDate)
    .gte("business_date_to", businessDate)
    .order("finished_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  const latestFinishedAt = latestSync?.finished_at ? new Date(latestSync.finished_at).getTime() : 0;
  const isFresh = latestSync?.status === "success" && latestFinishedAt > 0 && Date.now() - latestFinishedAt < cooldownSeconds * 1000;
  if (!force && isFresh) {
    return jsonResponse({
      status: "skipped",
      message: "Dữ liệu POS còn mới, Edge Function chưa gọi lại n8n.",
      latest_sync_at: latestSync.finished_at
    });
  }

  const requestedAt = new Date().toISOString();
  const payload = {
    source: "chill-manager-v2",
    business_date: businessDate,
    date_from: businessDate,
    date_to: businessDate,
    reason,
    requested_by: userData.user.id,
    requested_at: requestedAt
  };
  const payloadText = JSON.stringify(payload);
  const signature = await hmacSha256(`${requestedAt}.${payloadText}`, webhookSecret);

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-chill-signature": signature,
      "x-chill-timestamp": requestedAt
    },
    body: payloadText
  });

  if (!response.ok) {
    const text = await response.text();
    return jsonResponse({ status: "error", error: "n8n webhook trả lỗi.", n8n_status: response.status, detail: text.slice(0, 500) }, 502);
  }

  return jsonResponse({ status: "triggered", message: "Đã gọi n8n webhook cập nhật POS.", n8n_status: response.status });
});
