"use client";

import { useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { adjustSafe, setupSafeInitial } from "@/lib/data";
import { formatVND, moneyFromInput } from "@/lib/format";
import { ModalBackdrop, type Notice } from "@/shared";
import { SlidersHorizontal, X } from "@/shared/icons";

/**
 * AdjustModal — owner điều chỉnh số dư hoặc khởi tạo lần đầu.
 * - Khi `hasTransactions = false`: gọi `safe_setup_initial`
 * - Khi `hasTransactions = true`: gọi `safe_adjust` (note bắt buộc >= 5 ký tự)
 */
export function AdjustModal({
  supabase,
  currentBalance,
  hasTransactions,
  onClose,
  onSaved,
  onNotice
}: {
  supabase: SupabaseClient;
  currentBalance: number;
  hasTransactions: boolean;
  onClose: () => void;
  onSaved: () => void;
  onNotice: (notice: Notice) => void;
}) {
  const [newBalance, setNewBalance] = useState(String(currentBalance || ""));
  const [note, setNote] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const newValue = moneyFromInput(newBalance);
  const difference = newValue - currentBalance;
  const tooBig = newValue > 1_000_000_000;
  const tooSmall = newValue < 0;
  const sameValue = hasTransactions && difference === 0;
  const noteShort = hasTransactions && note.trim().length < 5;
  const hasError = tooBig || tooSmall || sameValue || noteShort;

  async function submit() {
    if (hasError) return;
    setIsSaving(true);
    try {
      if (hasTransactions) {
        await adjustSafe(supabase, { newBalance: newValue, note: note.trim() });
        onNotice({
          type: "success",
          message: `Đã điều chỉnh số dư ${difference > 0 ? "+" : ""}${formatVND(difference)}.`
        });
      } else {
        await setupSafeInitial(supabase, newValue, note.trim() || undefined);
        onNotice({
          type: "success",
          message: `Đã khởi tạo sổ quỹ với số dư ${formatVND(newValue)}.`
        });
      }
      onSaved();
    } catch (error) {
      onNotice({
        type: "error",
        message: error instanceof Error ? error.message : "Không điều chỉnh được."
      });
    } finally {
      setIsSaving(false);
    }
  }

  const isInitial = !hasTransactions;

  return (
    <ModalBackdrop>
      <section className="modalSheet" role="dialog" aria-modal="true">
        <div className="panelHeader">
          <div>
            <p className="eyebrow">Sổ quỹ</p>
            <h2>{isInitial ? "Khởi tạo sổ quỹ" : "Điều chỉnh số dư"}</h2>
            <span className="muted">
              {isInitial ? "Lần đầu — nhập số dư hiện có trong két cá nhân của owner." : `Hiện tại: ${formatVND(currentBalance)}`}
            </span>
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
        <label className="fieldStack">
          {isInitial ? "Số dư khởi tạo" : "Số dư mới"}
          <input
            value={newBalance}
            onChange={(event) => setNewBalance(event.target.value)}
            inputMode="numeric"
            placeholder="0"
            autoFocus
          />
        </label>
        {tooSmall && <p className="dangerText">Số dư không được âm.</p>}
        {tooBig && <p className="dangerText">Số dư vượt 1.000.000.000 ₫.</p>}
        {!isInitial && difference !== 0 && (
          <p className={"muted " + (difference > 0 ? "goodText" : "dangerText")}>
            Chênh lệch: {difference > 0 ? "+" : ""}
            {formatVND(difference)}
          </p>
        )}
        {sameValue && <p className="dangerText">Số dư mới giống số dư hiện tại — không cần điều chỉnh.</p>}
        <label className="fieldStack">
          {isInitial ? "Ghi chú (tùy chọn)" : "Lý do điều chỉnh *"}
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            maxLength={500}
            placeholder={
              isInitial
                ? "VD: Khởi tạo từ tiền cá nhân"
                : "VD: Bù 50k tiền lẽ bị mất, đếm lại lần 2..."
            }
          />
          {!isInitial && (
            <small className="muted">Bắt buộc ≥ 5 ký tự (audit trail).</small>
          )}
        </label>
        {noteShort && note.length > 0 && <p className="dangerText">Lý do phải ≥ 5 ký tự.</p>}
        <div className="buttonRow">
          <button
            type="button"
            className="primaryButton"
            disabled={isSaving || hasError}
            onClick={submit}
          >
            <SlidersHorizontal size={16} />
            <span className="iconLabel"> {isSaving ? "Đang lưu..." : isInitial ? "Khởi tạo" : "Điều chỉnh"}</span>
          </button>
          <button type="button" className="ghostButton" disabled={isSaving} onClick={onClose}>
            Hủy
          </button>
        </div>
      </section>
    </ModalBackdrop>
  );
}
