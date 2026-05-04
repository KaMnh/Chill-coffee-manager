"use client";

import { useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { saveCashDayOpening } from "@/lib/data";
import { useSafeBalanceQuery } from "@/hooks/queries";
import { formatVND, moneyFromInput } from "@/lib/format";
import type { Account, CashDayOpening } from "@/lib/types";
import { ModalBackdrop, type Notice } from "@/shared";
import { DENOMINATIONS, handleDenominationKeyDown, normalizeCount } from "./denominations";

function countsFromOpening(opening: CashDayOpening | null) {
  return DENOMINATIONS.reduce<Record<number, number>>((result, denomination) => {
    const value = opening?.denominations_json?.[String(denomination)] ?? opening?.denominations_json?.[denomination] ?? 0;
    result[denomination] = Math.max(0, Number(value) || 0);
    return result;
  }, {});
}

export function OpeningCashModal({
  supabase,
  account,
  date,
  opening,
  readOnly,
  onClose,
  onSaved,
  onNotice
}: {
  supabase: SupabaseClient;
  account: Account;
  date: string;
  opening: CashDayOpening | null;
  readOnly: boolean;
  onClose: () => void;
  onSaved: () => void;
  onNotice: (notice: Notice) => void;
}) {
  const [counts, setCounts] = useState<Record<number, number>>(() => countsFromOpening(opening));
  const [carried, setCarried] = useState(Boolean(opening?.carried_from_previous_day));
  const [safeWithdrawal, setSafeWithdrawal] = useState(
    String(opening?.safe_withdrawal_amount ?? "")
  );
  const [isSaving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const openingInputRefs = useRef<Record<number, HTMLInputElement | null>>({});
  const total = DENOMINATIONS.reduce((sum, denomination) => sum + denomination * (counts[denomination] ?? 0), 0);
  const isOwner = account.role === "owner";
  const safeBalanceQuery = useSafeBalanceQuery(supabase, isOwner && !readOnly);
  const safeBalance = safeBalanceQuery.data ?? 0;
  const safeWithdrawalAmount = moneyFromInput(safeWithdrawal);
  const carriedAmount = Math.max(0, total - safeWithdrawalAmount);
  const safeOverflow = safeWithdrawalAmount > safeBalance;
  const safeOverTotal = safeWithdrawalAmount > total;

  function updateCount(denomination: number, delta: number) {
    if (readOnly) return;
    setCounts((current) => ({ ...current, [denomination]: normalizeCount((current[denomination] ?? 0) + delta) }));
  }

  async function submit() {
    setSaving(true);
    setErrorMessage(null);
    try {
      await saveCashDayOpening(supabase, {
        business_date: date,
        denominations_json: counts,
        carried_from_previous_day: carried,
        ...(isOwner && safeWithdrawalAmount > 0 ? { safe_withdrawal_amount: safeWithdrawalAmount } : {})
      });
      onNotice({
        type: "success",
        message:
          safeWithdrawalAmount > 0
            ? `Đã lưu tiền đầu ngày — rút ${formatVND(safeWithdrawalAmount)} từ sổ quỹ.`
            : opening
              ? "Đã cập nhật tiền đầu ngày."
              : "Đã lưu tiền đầu ngày."
      });
      onSaved();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Không lưu được tiền đầu ngày.";
      setErrorMessage(message);
      onNotice({ type: "error", message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalBackdrop>
      <section className="modalSheet openingCashModal" role="dialog" aria-modal="true">
        <div className="panelHeader">
          <div>
            <p className="eyebrow">Tiền đầu ngày</p>
            <h2>{readOnly ? "Xem tiền mở két" : opening ? "Sửa tiền mở két" : "Nhập tiền mở két"}</h2>
            <span className="muted">{date}</span>
          </div>
          <button className="ghostButton" type="button" onClick={onClose}>
            Đóng
          </button>
        </div>
        {readOnly && (
          <p className="softNotice">
            Tiền đầu ngày đã lưu. Manager chỉ được xem; chủ quán mới được chỉnh sửa.
          </p>
        )}
        <div className="denominationList compactDenominations">
          {DENOMINATIONS.map((denomination) => (
            <article className="denominationRow" key={denomination}>
              <strong>{formatVND(denomination)}</strong>
              <div className="stepper">
                <button type="button" disabled={readOnly} onClick={() => updateCount(denomination, -1)}>
                  -
                </button>
                <input
                  ref={(node) => {
                    openingInputRefs.current[denomination] = node;
                  }}
                  readOnly={readOnly}
                  aria-label={`${formatVND(denomination)} số tờ tiền đầu ngày`}
                  value={counts[denomination] ?? 0}
                  onChange={(event) =>
                    setCounts((current) => ({ ...current, [denomination]: normalizeCount(event.target.value) }))
                  }
                  onKeyDown={(event) =>
                    handleDenominationKeyDown(event, denomination, { inputRefs: openingInputRefs, updateCount, readOnly })
                  }
                  inputMode="numeric"
                />
                <button type="button" disabled={readOnly} onClick={() => updateCount(denomination, 1)}>
                  +
                </button>
              </div>
              <span className="denomTotal">{formatVND((counts[denomination] ?? 0) * denomination)}</span>
            </article>
          ))}
        </div>
        <label className="inlineCheck">
          <input type="checkbox" checked={carried} disabled={readOnly} onChange={(event) => setCarried(event.target.checked)} />{" "}
          Chuyển từ tiền cuối ngày trước
        </label>
        {isOwner && !readOnly && (
          <div className="safeWithdrawBlock">
            <p className="eyebrow">Rút từ sổ quỹ (tùy chọn)</p>
            <p className="muted safeWithdrawHint">
              Số dư sổ quỹ: <strong>{formatVND(safeBalance)}</strong>. Rút bao nhiêu sẽ trừ trực tiếp
              khỏi sổ quỹ và tính vào tiền đầu ngày.
            </p>
            <input
              type="text"
              value={safeWithdrawal}
              onChange={(event) => setSafeWithdrawal(event.target.value)}
              inputMode="numeric"
              placeholder="0 = chỉ carry-over"
            />
            {safeOverflow && (
              <p className="dangerText">Sổ quỹ không đủ ({formatVND(safeBalance)}).</p>
            )}
            {safeOverTotal && (
              <p className="dangerText">Số rút không được vượt tổng tiền đầu ngày ({formatVND(total)}).</p>
            )}
            {safeWithdrawalAmount > 0 && !safeOverflow && !safeOverTotal && (
              <p className="muted safeWithdrawSplit">
                Phân bổ: <strong>{formatVND(carriedAmount)}</strong> carry-over từ ngày cũ +{" "}
                <strong>{formatVND(safeWithdrawalAmount)}</strong> rút từ sổ quỹ.
              </p>
            )}
          </div>
        )}
        <div className="openingTotalFooter">
          <span>Tổng tiền đầu ngày</span>
          <strong>{formatVND(total)}</strong>
        </div>
        {errorMessage && <p className="formError">{errorMessage}</p>}
        {!readOnly && (
          <button
            className="primaryButton"
            type="button"
            disabled={isSaving || safeOverflow || safeOverTotal}
            onClick={submit}
          >
            {isSaving ? "Đang lưu..." : "Lưu tiền đầu ngày"}
          </button>
        )}
      </section>
    </ModalBackdrop>
  );
}
