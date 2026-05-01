"use client";

import { useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { saveCashDayOpening } from "@/lib/data";
import { formatVND } from "@/lib/format";
import type { CashDayOpening } from "@/lib/types";
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
  date,
  opening,
  readOnly,
  onClose,
  onSaved,
  onNotice
}: {
  supabase: SupabaseClient;
  date: string;
  opening: CashDayOpening | null;
  readOnly: boolean;
  onClose: () => void;
  onSaved: () => void;
  onNotice: (notice: Notice) => void;
}) {
  const [counts, setCounts] = useState<Record<number, number>>(() => countsFromOpening(opening));
  const [carried, setCarried] = useState(Boolean(opening?.carried_from_previous_day));
  const [isSaving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const openingInputRefs = useRef<Record<number, HTMLInputElement | null>>({});
  const total = DENOMINATIONS.reduce((sum, denomination) => sum + denomination * (counts[denomination] ?? 0), 0);

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
        carried_from_previous_day: carried
      });
      onNotice({ type: "success", message: opening ? "Đã cập nhật tiền đầu ngày." : "Đã lưu tiền đầu ngày." });
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
        <div className="openingTotalFooter">
          <span>Tổng tiền đầu ngày</span>
          <strong>{formatVND(total)}</strong>
        </div>
        {errorMessage && <p className="formError">{errorMessage}</p>}
        {!readOnly && (
          <button className="primaryButton" type="button" disabled={isSaving} onClick={submit}>
            {isSaving ? "Đang lưu..." : "Lưu tiền đầu ngày"}
          </button>
        )}
      </section>
    </ModalBackdrop>
  );
}
