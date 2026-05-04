"use client";

/**
 * Settings UI cho KiotViet integration.
 * - Owner/manager edit credentials (client_id, client_secret, retailer, etc.)
 * - Toggle is_active (bật/tắt sync)
 * - Manual sync button (call /api/kiotviet/sync)
 * - Hiển thị last sync info từ sales_sync_runs
 *
 * Frontend KHÔNG nhìn thấy real client_secret — server route trả về masked.
 * Khi user nhập client_secret mới, value sẽ override; bỏ trống = giữ nguyên.
 */
import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { formatDateTime } from "@/lib/format";
import type { Notice } from "@/shared";

type KvConfigResponse = {
  status: string;
  config?: {
    client_id: string;
    client_secret: string; // always "" from server
    client_secret_masked: string;
    retailer: string;
    token_url: string;
    api_base: string;
    scope: string;
    rate_limit_per_sec: number;
    is_active: boolean;
    webhook_secret: string;
  };
  error?: string;
};

/** Generate hex secret 32 chars (16 bytes) — client-side. */
function generateWebhookSecret(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

type SyncRun = {
  id: string;
  started_at: string;
  finished_at: string | null;
  status: string;
  order_count: number | null;
  business_date_from: string | null;
  business_date_to: string | null;
};

async function getAuthHeader(supabase: SupabaseClient): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function KiotvietSettings({
  supabase,
  onNotice
}: {
  supabase: SupabaseClient;
  onNotice: (notice: Notice) => void;
}) {
  const [config, setConfig] = useState<KvConfigResponse["config"] | null>(null);
  const [secretInput, setSecretInput] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [isLoading, setLoading] = useState(true);
  const [isSaving, setSaving] = useState(false);
  const [isSyncing, setSyncing] = useState(false);
  const [lastRun, setLastRun] = useState<SyncRun | null>(null);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  useEffect(() => {
    void reload();
    void reloadLastRun();
  }, []);

  async function reload() {
    setLoading(true);
    try {
      const headers = await getAuthHeader(supabase);
      const res = await fetch("/api/kiotviet/config", { headers });
      const json: KvConfigResponse = await res.json();
      if (!res.ok || json.status !== "ok") {
        throw new Error(json.error ?? "Không tải được cấu hình KiotViet.");
      }
      setConfig(json.config!);
    } catch (error) {
      onNotice({ type: "error", message: error instanceof Error ? error.message : "Lỗi không xác định." });
    } finally {
      setLoading(false);
    }
  }

  async function reloadLastRun() {
    const { data } = await supabase
      .from("sales_sync_runs")
      .select("id, started_at, finished_at, status, order_count, business_date_from, business_date_to")
      .eq("source", "kiotviet")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    setLastRun((data as SyncRun) ?? null);
  }

  async function save() {
    if (!config) return;
    setSaving(true);
    try {
      const headers = { ...(await getAuthHeader(supabase)), "Content-Type": "application/json" };
      const body: Record<string, unknown> = {
        client_id: config.client_id,
        retailer: config.retailer,
        token_url: config.token_url,
        api_base: config.api_base,
        scope: config.scope,
        rate_limit_per_sec: config.rate_limit_per_sec,
        is_active: config.is_active,
        webhook_secret: config.webhook_secret
      };
      if (secretInput) body.client_secret = secretInput;

      const res = await fetch("/api/kiotviet/config", {
        method: "POST",
        headers,
        body: JSON.stringify(body)
      });
      const json: KvConfigResponse = await res.json();
      if (!res.ok || json.status !== "ok") {
        throw new Error(json.error ?? "Không lưu được.");
      }
      setConfig(json.config!);
      setSecretInput("");
      onNotice({ type: "success", message: "Đã lưu cấu hình KiotViet." });
    } catch (error) {
      onNotice({ type: "error", message: error instanceof Error ? error.message : "Lỗi không xác định." });
    } finally {
      setSaving(false);
    }
  }

  async function runSync(force: boolean) {
    setSyncing(true);
    try {
      const headers = { ...(await getAuthHeader(supabase)), "Content-Type": "application/json" };
      const body: Record<string, unknown> = { force, reason: "manual_settings" };
      if (fromDate) body.fromDate = fromDate;
      if (toDate) body.toDate = toDate;

      const res = await fetch("/api/kiotviet/sync", {
        method: "POST",
        headers,
        body: JSON.stringify(body)
      });
      const json = (await res.json()) as {
        status: string;
        message?: string;
        error?: string;
        ingested?: { orders: number; items: number; payments: number };
      };
      if (!res.ok || json.status === "error") {
        throw new Error(json.error ?? json.message ?? "Sync thất bại.");
      }
      onNotice({
        type: json.status === "skipped" ? "info" : "success",
        message:
          json.message ??
          (json.ingested
            ? `Sync xong: ${json.ingested.orders} đơn, ${json.ingested.items} items, ${json.ingested.payments} payments.`
            : "Sync hoàn tất.")
      });
      void reloadLastRun();
    } catch (error) {
      onNotice({ type: "error", message: error instanceof Error ? error.message : "Lỗi không xác định." });
    } finally {
      setSyncing(false);
    }
  }

  if (isLoading) {
    return (
      <section className="panel settingsCard">
        <p className="eyebrow">KiotViet</p>
        <h2>Cấu hình tích hợp POS</h2>
        <p className="muted">Đang tải...</p>
      </section>
    );
  }

  if (!config) {
    return (
      <section className="panel settingsCard">
        <p className="eyebrow">KiotViet</p>
        <h2>Cấu hình tích hợp POS</h2>
        <p className="dangerText">Không tải được cấu hình.</p>
      </section>
    );
  }

  return (
    <section className="panel settingsCard">
      <div className="panelHeader">
        <div>
          <p className="eyebrow">KiotViet (FNB)</p>
          <h2>Cấu hình tích hợp POS</h2>
          <p className="muted">
            Trực tiếp gọi KiotViet FNB API qua Next.js API route. Credential lưu trong app_settings (RLS owner/manager).
          </p>
        </div>
        <span className={"badge " + (config.is_active ? "good" : "soft")}>
          {config.is_active ? "Đang hoạt động" : "Đã tắt"}
        </span>
      </div>

      <div className="kiotvietForm">
        <label className="fieldStack">
          <span>
            Bật tích hợp
            <em className="hint"> (tắt = không cho sync)</em>
          </span>
          <label className="inlineCheck">
            <input
              type="checkbox"
              checked={config.is_active}
              onChange={(event) => setConfig({ ...config, is_active: event.target.checked })}
            />
            <span>Bật KiotViet sync</span>
          </label>
        </label>

        <label className="fieldStack">
          Retailer (tên cửa hàng — có trên URL manager)
          <input
            value={config.retailer}
            onChange={(event) => setConfig({ ...config, retailer: event.target.value })}
            placeholder="chillcoffeegarden"
          />
        </label>

        <label className="fieldStack">
          Client ID
          <input
            value={config.client_id}
            onChange={(event) => setConfig({ ...config, client_id: event.target.value })}
            placeholder="từ KiotViet manager → Thiết lập → Kết nối API"
          />
        </label>

        <label className="fieldStack">
          Client Secret
          <div className="secretRow">
            <input
              type={showSecret ? "text" : "password"}
              value={secretInput}
              onChange={(event) => setSecretInput(event.target.value)}
              placeholder={config.client_secret_masked || "Nhập secret"}
            />
            <button
              type="button"
              className="ghostButton compactButton"
              onClick={() => setShowSecret((v) => !v)}
            >
              {showSecret ? "Ẩn" : "Hiện"}
            </button>
          </div>
          <small className="muted">
            {config.client_secret_masked
              ? `Đã có secret (${config.client_secret_masked}). Để trống = giữ nguyên.`
              : "Chưa có secret."}
          </small>
        </label>

        <details className="advancedConfig">
          <summary>Cấu hình nâng cao (Token URL, API Base, Scope, Rate limit)</summary>
          <label className="fieldStack">
            Token URL
            <input
              value={config.token_url}
              onChange={(event) => setConfig({ ...config, token_url: event.target.value })}
            />
          </label>
          <label className="fieldStack">
            API Base
            <input
              value={config.api_base}
              onChange={(event) => setConfig({ ...config, api_base: event.target.value })}
            />
          </label>
          <label className="fieldStack">
            Scope
            <input
              value={config.scope}
              onChange={(event) => setConfig({ ...config, scope: event.target.value })}
            />
          </label>
          <label className="fieldStack">
            Rate limit (req/s, 1-10)
            <input
              type="number"
              min={1}
              max={10}
              value={config.rate_limit_per_sec}
              onChange={(event) =>
                setConfig({ ...config, rate_limit_per_sec: Number(event.target.value) || 4 })
              }
            />
          </label>
        </details>

        <div className="webhookBlock">
          <p className="eyebrow">Webhook URL (KiotViet → ERP)</p>
          <p className="muted webhookHint">
            FNB hỗ trợ webhook cho <strong>product.update</strong>, <strong>customer.update</strong>, <strong>stock.update</strong>.
            Invoice phải sync qua polling (xem <code>docs/kiotviet-polling.md</code>). Generate secret rồi đăng ký URL bên dưới
            vào KiotViet manager → Thiết lập → Webhook.
          </p>
          {config.webhook_secret ? (
            <div className="webhookUrlRow">
              <input
                type="text"
                readOnly
                value={`${process.env.NEXT_PUBLIC_APP_URL || (typeof window !== "undefined" ? window.location.origin : "")}/api/kiotviet/webhook/${config.webhook_secret}`}
                onClick={(event) => (event.target as HTMLInputElement).select()}
              />
              <button
                type="button"
                className="ghostButton compactButton"
                onClick={() => {
                  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || window.location.origin;
                  void navigator.clipboard.writeText(
                    `${baseUrl}/api/kiotviet/webhook/${config.webhook_secret}`
                  );
                  onNotice({ type: "success", message: "Đã copy URL webhook." });
                }}
              >
                Copy
              </button>
              <button
                type="button"
                className="ghostButton compactButton"
                onClick={() => {
                  if (confirm("Tạo lại secret? URL cũ sẽ ngừng hoạt động — bạn phải cập nhật lại trên KiotViet.")) {
                    setConfig({ ...config, webhook_secret: generateWebhookSecret() });
                  }
                }}
              >
                Tạo lại
              </button>
            </div>
          ) : (
            <div className="buttonRow">
              <button
                type="button"
                className="ghostButton"
                onClick={() => setConfig({ ...config, webhook_secret: generateWebhookSecret() })}
              >
                Generate webhook secret
              </button>
            </div>
          )}
          <small className="muted">
            URL chứa secret — KiotViet không hỗ trợ custom auth header. Bấm "Lưu cấu hình" để áp dụng.
          </small>
        </div>

        <div className="buttonRow">
          <button
            className="primaryButton"
            type="button"
            disabled={isSaving}
            onClick={save}
          >
            {isSaving ? "Đang lưu..." : "Lưu cấu hình"}
          </button>
        </div>
      </div>

      <hr className="settingsDivider" />

      <div className="kiotvietSyncBlock">
        <div>
          <p className="eyebrow">Sync thủ công</p>
          <h3>Đồng bộ POS theo ngày</h3>
          <p className="muted">
            Kéo invoice từ KiotViet → ingest vào sales_orders. Bỏ trống = chỉ lấy hôm nay.
          </p>
        </div>

        <div className="kiotvietSyncFields">
          <label className="fieldStack">
            Từ ngày
            <input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} />
          </label>
          <label className="fieldStack">
            Đến ngày
            <input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} />
          </label>
        </div>

        <div className="buttonRow">
          <button
            className="ghostButton"
            type="button"
            disabled={isSyncing || !config.is_active}
            onClick={() => runSync(false)}
          >
            {isSyncing ? "Đang sync..." : "Sync (cooldown)"}
          </button>
          <button
            className="primaryButton"
            type="button"
            disabled={isSyncing || !config.is_active}
            onClick={() => runSync(true)}
          >
            {isSyncing ? "Đang sync..." : "Force sync"}
          </button>
        </div>

        {lastRun && (
          <div className="lastRunBox">
            <p className="eyebrow">Lần sync gần nhất</p>
            <div className="summaryRows compact">
              <span>Bắt đầu</span>
              <strong>{formatDateTime(lastRun.started_at)}</strong>
              <span>Kết thúc</span>
              <strong>{lastRun.finished_at ? formatDateTime(lastRun.finished_at) : "Chưa xong"}</strong>
              <span>Trạng thái</span>
              <strong className={lastRun.status === "success" ? "goodText" : "dangerText"}>
                {lastRun.status}
              </strong>
              <span>Số đơn</span>
              <strong>{lastRun.order_count ?? 0}</strong>
              {lastRun.business_date_from && (
                <>
                  <span>Khoảng ngày</span>
                  <strong>
                    {lastRun.business_date_from} → {lastRun.business_date_to ?? "—"}
                  </strong>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
