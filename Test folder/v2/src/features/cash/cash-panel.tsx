"use client";

import { useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { finalizeCashCloseReport, saveCashCount } from "@/lib/data";
import { formatDateTime, formatNumber, formatVND, moneyFromInput } from "@/lib/format";
import type { Account, CashDayOpening, DashboardData } from "@/lib/types";
import { validateCashCount } from "@/lib/validation";
import type { Notice } from "@/shared";
import { DENOMINATIONS, handleDenominationKeyDown, normalizeCount } from "./denominations";
import { OpeningCashModal } from "./opening-cash-modal";

export function CashPanel({
  supabase,
  account,
  date,
  dashboard,
  cashOpening,
  onRefresh,
  onNotice
}: {
  supabase: SupabaseClient;
  account: Account;
  date: string;
  dashboard: DashboardData;
  cashOpening: CashDayOpening | null;
  onRefresh: () => void;
  onNotice: (notice: Notice) => void;
}) {
  const [counts, setCounts] = useState<Record<number, number>>({});
  const [bankTransfer, setBankTransfer] = useState("");
  const [note, setNote] = useState("");
  const [isClosing, setClosing] = useState(false);
  const [isOpeningModalOpen, setOpeningModalOpen] = useState(false);
  const countInputRefs = useRef<Record<number, HTMLInputElement | null>>({});
  const physical = DENOMINATIONS.reduce((sum, denomination) => sum + denomination * (counts[denomination] ?? 0), 0);
  const posTotal = dashboard.total_sales;
  const posCash = dashboard.cash_sales;
  const posNonCash = dashboard.non_cash_sales ?? Math.max(0, posTotal - posCash);
  const openingCash = cashOpening?.opening_total ?? dashboard.opening_cash ?? dashboard.latest_cash_count?.opening_cash ?? 0;
  const bankTransferConfirmed = moneyFromInput(bankTransfer);
  const reconciliationPreview = physical - openingCash + bankTransferConfirmed + dashboard.total_expenses + dashboard.payroll_paid;
  const differencePreview = posTotal - reconciliationPreview;
  const canCreateOpening = account.role === "owner" || account.role === "manager";
  const canEditOpening = account.role === "owner";
  const canOpenOpeningModal = Boolean(cashOpening) || canCreateOpening;

  function updateCount(denomination: number, delta: number) {
    setCounts((current) => ({ ...current, [denomination]: normalizeCount((current[denomination] ?? 0) + delta) }));
  }

  async function submit(mode: "spot_audit" | "shift_close") {
    const validation = validateCashCount({
      total_physical: physical,
      bank_transfer_confirmed: bankTransferConfirmed,
      note,
      denominations_json: counts
    });
    if (!validation.ok) {
      onNotice({ type: "error", message: validation.message });
      return;
    }
    setClosing(true);
    try {
      const saved = await saveCashCount(supabase, {
        business_date: date,
        count_type: mode,
        counted_at: new Date().toISOString(),
        denominations_json: counts,
        total_physical: physical,
        bank_transfer_confirmed: bankTransferConfirmed,
        note
      });
      if (mode === "shift_close" && saved.cash_count_id) await finalizeCashCloseReport(supabase, saved.cash_count_id);
      onNotice({
        type: "success",
        message: mode === "shift_close" ? "Đã chốt két và tạo báo cáo snapshot." : "Đã lưu kiểm két nhanh."
      });
      onRefresh();
    } catch (error) {
      onNotice({ type: "error", message: error instanceof Error ? error.message : "Không lưu được kiểm két." });
    } finally {
      setClosing(false);
    }
  }

  return (
    <div className="cashGrid">
      <section className="panel">
        <div className="panelHeader">
          <div>
            <p className="eyebrow">Đếm tiền mặt</p>
            <h2>Kiểm két theo mệnh giá</h2>
          </div>
          <strong className="cashTotalHeader">{formatVND(physical)}</strong>
        </div>
        <div className="openingCashCard">
          <div>
            <p className="eyebrow">Tiền đầu ngày</p>
            <strong>{cashOpening ? formatVND(cashOpening.opening_total) : "Chưa nhập"}</strong>
            <span>
              {cashOpening
                ? `Đã lưu lúc ${formatDateTime(cashOpening.updated_at || cashOpening.created_at)}`
                : "Nhập một lần khi mở két đầu ngày."}
            </span>
          </div>
          {canOpenOpeningModal && (
            <button
              className={cashOpening ? "ghostButton" : "primaryButton"}
              type="button"
              onClick={() => setOpeningModalOpen(true)}
            >
              {cashOpening ? (canEditOpening ? "Xem / Sửa" : "Xem") : "Nhập tiền đầu ngày"}
            </button>
          )}
        </div>
        <div className="denominationList">
          {DENOMINATIONS.map((denomination) => (
            <article className="denominationRow" key={denomination}>
              <strong>{formatVND(denomination)}</strong>
              <div className="stepper">
                <button type="button" onClick={() => updateCount(denomination, -1)}>
                  -
                </button>
                <input
                  ref={(node) => {
                    countInputRefs.current[denomination] = node;
                  }}
                  aria-label={`${formatVND(denomination)} số tờ kiểm két`}
                  value={counts[denomination] ?? 0}
                  onChange={(event) =>
                    setCounts((current) => ({ ...current, [denomination]: normalizeCount(event.target.value) }))
                  }
                  onKeyDown={(event) =>
                    handleDenominationKeyDown(event, denomination, { inputRefs: countInputRefs, updateCount })
                  }
                  inputMode="numeric"
                />
                <button type="button" onClick={() => updateCount(denomination, 1)}>
                  +
                </button>
              </div>
              <span className="denomTotal">{formatVND((counts[denomination] ?? 0) * denomination)}</span>
            </article>
          ))}
        </div>
      </section>
      <aside className="panel cashSummary">
        <p className="eyebrow">Kết quả đối soát</p>
        <h2>Chênh lệch két</h2>
        <div className="summaryRows">
          <span>Tổng POS</span>
          <strong>{formatVND(posTotal)}</strong>
          <span>POS tiền mặt</span>
          <strong>{formatVND(posCash)}</strong>
          <span>POS chuyển khoản</span>
          <strong>{formatVND(posNonCash)}</strong>
          <span>Tiền vào ca</span>
          <strong>{formatVND(openingCash)}</strong>
          <span>Tiền thực đếm</span>
          <strong>{formatVND(physical)}</strong>
          <span>Chuyển khoản đã nhận</span>
          <strong>{formatVND(bankTransferConfirmed)}</strong>
          <span>Chi phí cash</span>
          <strong>{formatVND(dashboard.total_expenses)}</strong>
          <span>Lương đã phát</span>
          <strong>{formatVND(dashboard.payroll_paid)}</strong>
          <span>Tổng đối soát</span>
          <strong>{formatVND(reconciliationPreview)}</strong>
          <span>Chênh lệch</span>
          <strong className={differencePreview === 0 ? "goodText" : "dangerText"}>
            {formatVND(differencePreview)}
          </strong>
        </div>
        <div className="formulaCard" aria-label="Công thức đối soát">
          <p className="eyebrow">Công thức đối soát</p>
          <div className="formulaExpression">
            <strong>{formatVND(posTotal)}</strong>
            <span>-</span>
            <span>
              (( {formatVND(physical)} - {formatVND(openingCash)} ) + {formatVND(bankTransferConfirmed)} +{" "}
              {formatVND(dashboard.total_expenses)} + {formatVND(dashboard.payroll_paid)})
            </span>
            <span>=</span>
            <strong className={differencePreview === 0 ? "goodText" : "dangerText"}>{formatVND(differencePreview)}</strong>
          </div>
          <small>
            Tổng POS - ((Tiền thực đếm - Tiền vào ca) + Chuyển khoản đã nhận + Chi phí cash + Lương đã phát)
          </small>
        </div>
        <div className="cashSummaryFields">
          <label className="fieldStack">
            Tiền chuyển khoản đã nhận
            <input
              value={bankTransfer}
              onChange={(event) => setBankTransfer(event.target.value)}
              inputMode="numeric"
              placeholder={formatNumber(posNonCash)}
            />
          </label>
          <label className="fieldStack">
            Ghi chú
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Lý do lệch két, tình trạng POS sync..."
            />
          </label>
        </div>
        <div className="buttonRow wrap">
          <button className="ghostButton" disabled={isClosing} type="button" onClick={() => submit("spot_audit")}>
            Kiểm két nhanh
          </button>
          <button className="primaryButton" disabled={isClosing} type="button" onClick={() => submit("shift_close")}>
            Chốt két & tạo báo cáo
          </button>
        </div>
      </aside>
      {isOpeningModalOpen && (
        <OpeningCashModal
          supabase={supabase}
          date={date}
          opening={cashOpening}
          readOnly={Boolean(cashOpening) && !canEditOpening}
          onClose={() => setOpeningModalOpen(false)}
          onSaved={() => {
            setOpeningModalOpen(false);
            onRefresh();
          }}
          onNotice={onNotice}
        />
      )}
    </div>
  );
}
