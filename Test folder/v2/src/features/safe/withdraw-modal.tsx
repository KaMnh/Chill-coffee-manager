"use client";

import { useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { withdrawSafeOther } from "@/lib/data";
import { formatVND, moneyFromInput } from "@/lib/format";
import { SAFE_WITHDRAW_CATEGORY_LABELS, type SafeWithdrawCategory } from "@/lib/types";
import { ModalBackdrop, type Notice } from "@/shared";
import { ArrowUpFromLine, X } from "@/shared/icons";

const CATEGORIES: SafeWithdrawCategory[] = [
  "utilities",
  "rent",
  "inventory",
  "maintenance",
  "other"
];

export function WithdrawModal({
  supabase,
  currentBalance,
  onClose,
  onSaved,
  onNotice
}: {
  supabase: SupabaseClient;
  currentBalance: number;
  onClose: () => void;
  onSaved: () => void;
  onNotice: (notice: Notice) => void;
}) {
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState<SafeWithdrawCategory>("utilities");
  const [description, setDescription] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const amountValue = moneyFromInput(amount);
  const overflow = amountValue > currentBalance;
  const tooBig = amountValue > 1_000_000_000;
  const tooSmall = amountValue <= 0;
  const hasError = tooSmall || overflow || tooBig;

  async function submit() {
    if (hasError) return;
    setIsSaving(true);
    try {
      await withdrawSafeOther(supabase, {
        amount: amountValue,
        category,
        description: description.trim() || undefined
      });
      onNotice({
        type: "success",
        message: `Đã rút ${formatVND(amountValue)} cho ${SAFE_WITHDRAW_CATEGORY_LABELS[category]}.`
      });
      onSaved();
    } catch (error) {
      onNotice({
        type: "error",
        message: error instanceof Error ? error.message : "Không rút được sổ quỹ."
      });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <ModalBackdrop>
      <section className="modalSheet" role="dialog" aria-modal="true">
        <div className="panelHeader">
          <div>
            <p className="eyebrow">Sổ quỹ</p>
            <h2>Rút cho mục đích khác</h2>
            <span className="muted">Số dư hiện tại: {formatVND(currentBalance)}</span>
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
          Loại chi
          <select
            value={category}
            onChange={(event) => setCategory(event.target.value as SafeWithdrawCategory)}
            disabled={isSaving}
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {SAFE_WITHDRAW_CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
        </label>
        <label className="fieldStack">
          Số tiền rút
          <input
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            inputMode="numeric"
            placeholder="0"
            autoFocus
          />
        </label>
        {tooSmall && amount && <p className="dangerText">Số tiền phải lớn hơn 0.</p>}
        {overflow && <p className="dangerText">Số dư sổ quỹ không đủ ({formatVND(currentBalance)}).</p>}
        {tooBig && <p className="dangerText">Số tiền vượt 1.000.000.000 ₫.</p>}
        <label className="fieldStack">
          Ghi chú (tùy chọn)
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            maxLength={500}
            placeholder="VD: Thanh toán hóa đơn điện tháng 5..."
          />
        </label>
        <div className="buttonRow">
          <button
            type="button"
            className="primaryButton"
            disabled={isSaving || hasError}
            onClick={submit}
          >
            <ArrowUpFromLine size={16} />
            <span className="iconLabel"> {isSaving ? "Đang rút..." : "Xác nhận rút"}</span>
          </button>
          <button type="button" className="ghostButton" disabled={isSaving} onClick={onClose}>
            Hủy
          </button>
        </div>
      </section>
    </ModalBackdrop>
  );
}
