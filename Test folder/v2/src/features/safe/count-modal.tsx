"use client";

import { useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { countSafe } from "@/lib/data";
import { DENOMINATIONS, handleDenominationKeyDown, normalizeCount } from "@/features/cash/denominations";
import { formatVND } from "@/lib/format";
import { ModalBackdrop, type Notice } from "@/shared";
import { Calculator, X } from "@/shared/icons";

/**
 * CountModal — đếm mệnh giá thực tế trong sổ quỹ. Snapshot vào safe_counts +
 * show difference vs expected_balance. KHÔNG auto adjust — owner phải gọi
 * Adjust riêng nếu muốn fix.
 */
export function CountModal({
  supabase,
  expectedBalance,
  onClose,
  onSaved,
  onNotice
}: {
  supabase: SupabaseClient;
  expectedBalance: number;
  onClose: () => void;
  onSaved: () => void;
  onNotice: (notice: Notice) => void;
}) {
  const [counts, setCounts] = useState<Record<number, number>>({});
  const [note, setNote] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const inputRefs = useRef<Record<number, HTMLInputElement | null>>({});

  const totalPhysical = DENOMINATIONS.reduce(
    (sum, denom) => sum + denom * (counts[denom] ?? 0),
    0
  );
  const difference = totalPhysical - expectedBalance;

  function updateCount(denom: number, delta: number) {
    setCounts((prev) => ({ ...prev, [denom]: normalizeCount((prev[denom] ?? 0) + delta) }));
  }

  async function submit() {
    setIsSaving(true);
    try {
      const result = await countSafe(supabase, {
        denominations: Object.fromEntries(
          Object.entries(counts).map(([k, v]) => [k, Math.max(0, Number(v) || 0)])
        ),
        note: note.trim() || undefined
      });
      onNotice({
        type: result.difference === 0 ? "success" : "info",
        message:
          result.difference === 0
            ? "Đã đếm sổ quỹ — khớp với số dư."
            : `Đã ghi nhận. Lệch ${result.difference > 0 ? "+" : ""}${formatVND(result.difference)} so với hệ thống.`
      });
      onSaved();
    } catch (error) {
      onNotice({
        type: "error",
        message: error instanceof Error ? error.message : "Không lưu được lần đếm."
      });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <ModalBackdrop>
      <section className="modalSheet wideModal" role="dialog" aria-modal="true">
        <div className="panelHeader">
          <div>
            <p className="eyebrow">Sổ quỹ</p>
            <h2>Đếm mệnh giá thực tế</h2>
            <span className="muted">Số dư hệ thống: {formatVND(expectedBalance)}</span>
          </div>
          <button
            type="button"
            className="iconOnlyButton"
            disabled={isSaving}
            onClick={onClose}
            aria-label="Đóng"
            title="Đóng"
          >
            <X size={16} />
          </button>
        </div>
        <div className="denominationList compactDenominations">
          {DENOMINATIONS.map((denom) => (
            <article className="denominationRow" key={denom}>
              <strong>{formatVND(denom)}</strong>
              <div className="stepper">
                <button type="button" onClick={() => updateCount(denom, -1)} disabled={isSaving}>
                  −
                </button>
                <input
                  ref={(node) => {
                    inputRefs.current[denom] = node;
                  }}
                  aria-label={`${formatVND(denom)} số tờ`}
                  value={counts[denom] ?? 0}
                  inputMode="numeric"
                  onChange={(event) =>
                    setCounts((prev) => ({ ...prev, [denom]: normalizeCount(event.target.value) }))
                  }
                  onKeyDown={(event) =>
                    handleDenominationKeyDown(event, denom, { inputRefs, updateCount })
                  }
                  disabled={isSaving}
                />
                <button type="button" onClick={() => updateCount(denom, 1)} disabled={isSaving}>
                  +
                </button>
              </div>
              <span className="denomTotal">{formatVND((counts[denom] ?? 0) * denom)}</span>
            </article>
          ))}
        </div>
        <div className="safeCountSummary">
          <div className="summaryRows compact">
            <span>Tổng đếm thực</span>
            <strong>{formatVND(totalPhysical)}</strong>
            <span>Số dư hệ thống</span>
            <strong>{formatVND(expectedBalance)}</strong>
            <span>Chênh lệch</span>
            <strong className={difference === 0 ? "goodText" : "dangerText"}>
              {difference > 0 ? "+" : ""}
              {formatVND(difference)}
            </strong>
          </div>
        </div>
        <label className="fieldStack">
          Ghi chú
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            maxLength={500}
            placeholder="VD: Đếm cuối tháng 5..."
          />
        </label>
        {difference !== 0 && (
          <p className="softNotice">
            ⓘ Hệ thống chỉ ghi nhận lần đếm này. Để fix số dư cho khớp, mở "Điều chỉnh" sau khi lưu.
          </p>
        )}
        <div className="buttonRow">
          <button
            type="button"
            className="primaryButton"
            disabled={isSaving}
            onClick={submit}
          >
            <Calculator size={16} />
            <span className="iconLabel"> {isSaving ? "Đang lưu..." : "Lưu lần đếm"}</span>
          </button>
          <button type="button" className="ghostButton" disabled={isSaving} onClick={onClose}>
            Hủy
          </button>
        </div>
      </section>
    </ModalBackdrop>
  );
}
