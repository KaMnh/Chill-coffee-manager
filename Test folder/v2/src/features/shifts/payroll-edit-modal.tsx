"use client";

import { useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { editPayrollRecord } from "@/lib/data";
import { fromDatetimeLocal, toDatetimeLocal } from "@/lib/datetime";
import { durationLabel, formatNumber, formatVND, moneyFromInput } from "@/lib/format";
import type { PayrollRecord } from "@/lib/types";
import { validatePayrollEdit } from "@/lib/validation";
import { MetricCard, ModalBackdrop, type Notice } from "@/shared";

export function PayrollEditModal({
  supabase,
  payroll,
  onClose,
  onSaved,
  onNotice
}: {
  supabase: SupabaseClient;
  payroll: PayrollRecord;
  onClose: () => void;
  onSaved: () => void;
  onNotice: (notice: Notice) => void;
}) {
  const [startTime, setStartTime] = useState(toDatetimeLocal(payroll.check_in_at));
  const [endTime, setEndTime] = useState(toDatetimeLocal(payroll.check_out_at));
  const [allowance, setAllowance] = useState(formatNumber(payroll.allowance_amount));
  const [note, setNote] = useState(payroll.note ?? "");
  const [isSaving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const minutes = useMemo(() => {
    if (!startTime || !endTime) return 0;
    return Math.max(0, Math.round((new Date(endTime).getTime() - new Date(startTime).getTime()) / 60_000));
  }, [startTime, endTime]);
  const basePay = Math.round(((minutes / 60) * payroll.hourly_rate) / 1000) * 1000;
  const totalPay = basePay + moneyFromInput(allowance);
  const invalidTime = Boolean(startTime && endTime && new Date(endTime).getTime() < new Date(startTime).getTime());

  async function submit() {
    const validation = validatePayrollEdit({
      check_in_at: fromDatetimeLocal(startTime),
      check_out_at: fromDatetimeLocal(endTime),
      allowance_amount: moneyFromInput(allowance),
      note
    });
    if (!validation.ok) {
      setErrorMessage(validation.message);
      onNotice({ type: "error", message: validation.message });
      return;
    }
    if (invalidTime) return;
    setSaving(true);
    setErrorMessage(null);
    try {
      await editPayrollRecord(supabase, {
        payroll_record_id: payroll.id,
        check_in_at: fromDatetimeLocal(startTime),
        check_out_at: fromDatetimeLocal(endTime),
        allowance_amount: moneyFromInput(allowance),
        note
      });
      onNotice({ type: "success", message: "Đã cập nhật lượt lương đã chốt." });
      onSaved();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Không sửa được lượt lương.";
      setErrorMessage(message);
      onNotice({ type: "error", message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalBackdrop>
      <section className="modalSheet" role="dialog" aria-modal="true">
        <div className="panelHeader">
          <div>
            <p className="eyebrow">Sửa lượt lương</p>
            <h2>{payroll.employee_name ?? "Nhân viên"}</h2>
          </div>
          <button className="ghostButton" type="button" onClick={onClose}>
            Đóng
          </button>
        </div>
        <div className="formGrid2">
          <label className="fieldStack">
            Giờ vào
            <input type="datetime-local" value={startTime} onChange={(event) => setStartTime(event.target.value)} />
          </label>
          <label className="fieldStack">
            Giờ ra
            <input type="datetime-local" value={endTime} onChange={(event) => setEndTime(event.target.value)} />
          </label>
        </div>
        {invalidTime && <p className="dangerText">Giờ ra không được nhỏ hơn giờ vào.</p>}
        <div className="calcGrid">
          <MetricCard label="Tổng giờ" value={durationLabel(minutes)} icon="H" />
          <MetricCard label="Lương giờ" value={formatVND(basePay)} icon="₫" />
          <MetricCard label="Thực nhận" value={formatVND(totalPay)} tone="good" icon="OK" />
        </div>
        <div className="payoutHero">
          <span>Tổng thực nhận sau chỉnh sửa</span>
          <strong>{formatVND(totalPay)}</strong>
        </div>
        <label className="fieldStack">
          Bồi dưỡng
          <input value={allowance} onChange={(event) => setAllowance(event.target.value)} inputMode="numeric" />
        </label>
        <label className="fieldStack">
          Ghi chú chỉnh sửa
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Lý do chỉnh giờ, bồi dưỡng hoặc ghi chú ca..."
          />
        </label>
        {errorMessage && <p className="formError">{errorMessage}</p>}
        <button className="primaryButton" type="button" disabled={invalidTime || isSaving} onClick={submit}>
          {isSaving ? "Đang lưu..." : "Lưu chỉnh sửa lượt lương"}
        </button>
      </section>
    </ModalBackdrop>
  );
}
