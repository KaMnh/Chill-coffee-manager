"use client";

import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createEmployee, updateEmployee } from "@/lib/data";
import { formatNumber, moneyFromInput } from "@/lib/format";
import type { Employee } from "@/lib/types";
import { validateEmployee } from "@/lib/validation";
import { ModalBackdrop, type Notice } from "@/shared";

export function EmployeeFormModal({
  supabase,
  employee,
  onClose,
  onSaved,
  onNotice
}: {
  supabase: SupabaseClient;
  employee: Employee | null;
  onClose: () => void;
  onSaved: () => void;
  onNotice: (notice: Notice) => void;
}) {
  const [name, setName] = useState(employee?.name ?? "");
  const [position, setPosition] = useState(employee?.position ?? "");
  const [hourlyRate, setHourlyRate] = useState(employee?.hourly_rate ? formatNumber(employee.hourly_rate) : "");
  const [isActive, setActive] = useState(employee?.is_active ?? true);
  const [isSaving, setSaving] = useState(false);
  const [fieldError, setFieldError] = useState<{ field: string; message: string } | null>(null);

  useEffect(() => {
    setName(employee?.name ?? "");
    setPosition(employee?.position ?? "");
    setHourlyRate(employee?.hourly_rate ? formatNumber(employee.hourly_rate) : "");
    setActive(employee?.is_active ?? true);
  }, [employee]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validation = validateEmployee({ name, hourly_rate: moneyFromInput(hourlyRate) });
    if (!validation.ok) {
      setFieldError({ field: validation.field, message: validation.message });
      onNotice({ type: "error", message: validation.message });
      return;
    }
    setFieldError(null);
    setSaving(true);
    try {
      const payload = { name, position, hourly_rate: moneyFromInput(hourlyRate), is_active: isActive };
      if (employee) await updateEmployee(supabase, employee.id, payload);
      else await createEmployee(supabase, payload);
      onNotice({ type: "success", message: employee ? "Đã cập nhật nhân viên." : "Đã thêm nhân viên mới." });
      onSaved();
    } catch (error) {
      onNotice({ type: "error", message: error instanceof Error ? error.message : "Không lưu được nhân viên." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalBackdrop>
      <form className="modalSheet" role="dialog" aria-modal="true" onSubmit={submit}>
        <div className="panelHeader">
          <div>
            <p className="eyebrow">Nhân viên</p>
            <h2>{employee ? "Sửa thông tin" : "Thêm nhân viên mới"}</h2>
          </div>
          <button className="ghostButton" type="button" onClick={onClose}>
            Đóng
          </button>
        </div>
        <label className="fieldStack">
          Tên nhân viên
          <input value={name} onChange={(event) => setName(event.target.value)} required placeholder="Ví dụ: Lan" />
        </label>
        <label className="fieldStack">
          Vị trí
          <input value={position} onChange={(event) => setPosition(event.target.value)} placeholder="Ví dụ: Thu ngân" />
        </label>
        <label className="fieldStack">
          Lương theo giờ
          <input
            value={hourlyRate}
            onChange={(event) => setHourlyRate(event.target.value)}
            inputMode="numeric"
            placeholder="26000"
          />
        </label>
        <label className="inlineCheck">
          <input type="checkbox" checked={isActive} onChange={(event) => setActive(event.target.checked)} /> Đang hoạt động
        </label>
        {fieldError && <p className="formError">{fieldError.message}</p>}
        <button className="primaryButton" disabled={isSaving} type="submit">
          {employee ? "Lưu thay đổi" : "Thêm nhân viên"}
        </button>
      </form>
    </ModalBackdrop>
  );
}
