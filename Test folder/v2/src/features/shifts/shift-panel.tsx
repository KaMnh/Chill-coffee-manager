"use client";

import { useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { checkInEmployee, checkOutEmployee } from "@/lib/data";
import { fromDatetimeLocal, toDatetimeLocal } from "@/lib/datetime";
import { durationLabel, formatDateTime, formatVND, moneyFromInput } from "@/lib/format";
import type { Account, Employee, PayrollRecord, ShiftAssignment } from "@/lib/types";
import { EmptyState, MetricCard, type Notice } from "@/shared";
import { EmployeeFormModal } from "./employee-form-modal";
import { PayrollEditModal } from "./payroll-edit-modal";

function canManageEmployees(account: Account | null) {
  return account?.role === "owner" || account?.role === "manager";
}

export function ShiftPanel({
  supabase,
  account,
  date,
  employees,
  shifts,
  payroll,
  onRefresh,
  onNotice
}: {
  supabase: SupabaseClient;
  account: Account | null;
  date: string;
  employees: Employee[];
  shifts: ShiftAssignment[];
  payroll: PayrollRecord[];
  onRefresh: () => void;
  onNotice: (notice: Notice) => void;
}) {
  const [checkout, setCheckout] = useState<ShiftAssignment | null>(null);
  const [editingPayroll, setEditingPayroll] = useState<PayrollRecord | null>(null);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [showCreateEmployee, setShowCreateEmployee] = useState(false);
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [allowance, setAllowance] = useState("");
  const [note, setNote] = useState("");
  const shiftByEmployee = new Map(shifts.map((shift) => [shift.employee_id, shift]));
  const targetEmployee = employees.find((employee) => employee.id === checkout?.employee_id);
  const activeEmployees = employees.filter((employee) => shiftByEmployee.get(employee.id)?.status === "checked_in");
  const inactiveEmployees = employees.filter((employee) => shiftByEmployee.get(employee.id)?.status !== "checked_in");
  const minutes = useMemo(() => {
    if (!startTime || !endTime) return 0;
    return Math.max(0, Math.round((new Date(endTime).getTime() - new Date(startTime).getTime()) / 60_000));
  }, [startTime, endTime]);
  const basePay = targetEmployee ? Math.round(((minutes / 60) * targetEmployee.hourly_rate) / 1000) * 1000 : 0;
  const totalPay = basePay + moneyFromInput(allowance);
  const invalidTime = Boolean(startTime && endTime && new Date(endTime).getTime() < new Date(startTime).getTime());

  async function checkIn(employee: Employee) {
    await checkInEmployee(supabase, { employee_id: employee.id, business_date: date, check_in_at: new Date().toISOString() });
    onNotice({ type: "success", message: employee.name + " đã vào ca." });
    onRefresh();
  }

  function openCheckout(shift: ShiftAssignment) {
    setCheckout(shift);
    setStartTime(toDatetimeLocal(shift.check_in_at ?? new Date().toISOString()));
    setEndTime(toDatetimeLocal(new Date().toISOString()));
    setAllowance("0");
    setNote("");
  }

  async function submitCheckout() {
    if (!checkout || invalidTime) return;
    await checkOutEmployee(supabase, {
      shift_assignment_id: checkout.id,
      employee_id: checkout.employee_id,
      business_date: date,
      check_in_at: fromDatetimeLocal(startTime),
      check_out_at: fromDatetimeLocal(endTime),
      allowance_amount: moneyFromInput(allowance),
      note
    });
    onNotice({ type: "success", message: "Đã ra ca và lưu lương theo lượt." });
    setCheckout(null);
    onRefresh();
  }

  function renderEmployee(employee: Employee) {
    const shift = shiftByEmployee.get(employee.id);
    const isIn = shift?.status === "checked_in";
    return (
      <article className="employeeRow" key={employee.id}>
        <div className="employeeInfo">
          <strong>{employee.name}</strong>
          <span>
            {employee.position ?? "Nhân viên"} · {formatVND(employee.hourly_rate)}/giờ
          </span>
        </div>
        <span className={"badge " + (isIn ? "good" : "soft")}>
          {isIn ? "Đang trong ca" : shift?.status === "checked_out" ? "Đã ra ca" : "Chưa vào"}
        </span>
        <div className="buttonRow compact">
          {canManageEmployees(account) && (
            <button type="button" className="ghostButton" onClick={() => setEditingEmployee(employee)}>
              Sửa
            </button>
          )}
          <button type="button" className="ghostButton" disabled={isIn} onClick={() => checkIn(employee)}>
            Vào ca
          </button>
          <button type="button" className="ghostButton" disabled={!shift || !isIn} onClick={() => shift && openCheckout(shift)}>
            Ra ca
          </button>
        </div>
      </article>
    );
  }

  return (
    <div className="stack">
      <section className="panel">
        <div className="panelHeader">
          <div>
            <p className="eyebrow">Tác nghiệp ca</p>
            <h2>Nhân viên hôm nay</h2>
          </div>
          <div className="buttonRow wrap">
            <span className="muted">{date}</span>
            {canManageEmployees(account) && (
              <button
                className="iconOnlyButton primaryIconButton"
                type="button"
                aria-label="Thêm nhân viên"
                title="Thêm nhân viên"
                onClick={() => setShowCreateEmployee(true)}
              >
                +
              </button>
            )}
          </div>
        </div>
        <div className="employeeColumns">
          <div className="employeeColumn">
            <h3>Đang làm việc</h3>
            <div className="employeeList">
              {activeEmployees.length === 0 && (
                <EmptyState
                  title="Chưa có ai đang làm"
                  description="Nhấn vào ca ở cột bên cạnh khi nhân viên bắt đầu làm."
                />
              )}
              {activeEmployees.map(renderEmployee)}
            </div>
          </div>
          <div className="employeeColumn">
            <h3>Chưa vào ca</h3>
            <div className="employeeList">
              {inactiveEmployees.length === 0 && (
                <EmptyState title="Tất cả đã vào ca" description="Không còn nhân viên chờ xác nhận." />
              )}
              {inactiveEmployees.map(renderEmployee)}
            </div>
          </div>
        </div>
      </section>
      <section className="panel">
        <div className="panelHeader">
          <div>
            <p className="eyebrow">Lịch sử chi lương</p>
            <h2>Lương theo lượt ra ca</h2>
          </div>
          <strong>{formatVND(payroll.reduce((sum, row) => sum + row.total_pay, 0))}</strong>
        </div>
        <div className="listRows">
          {payroll.length === 0 && (
            <EmptyState
              title="Chưa có dòng lương"
              description="Khi xác nhận ra ca, dòng lương mới sẽ nằm trên cùng."
            />
          )}
          {payroll.map((row) => (
            <article className="listRow payrollRow" key={row.id}>
              <div>
                <strong>{row.employee_name ?? "Nhân viên"}</strong>
                <span>
                  {durationLabel(row.total_minutes)} · Bồi dưỡng {formatVND(row.allowance_amount)}
                  {row.edited_at ? ` · Đã sửa ${formatDateTime(row.edited_at)}` : ""}
                </span>
              </div>
              <strong>{formatVND(row.total_pay)}</strong>
              {canManageEmployees(account) && (
                <button className="ghostButton" type="button" onClick={() => setEditingPayroll(row)}>
                  Sửa
                </button>
              )}
            </article>
          ))}
        </div>
      </section>
      {(showCreateEmployee || editingEmployee) && (
        <EmployeeFormModal
          supabase={supabase}
          employee={editingEmployee}
          onClose={() => {
            setShowCreateEmployee(false);
            setEditingEmployee(null);
          }}
          onSaved={() => {
            setShowCreateEmployee(false);
            setEditingEmployee(null);
            onRefresh();
          }}
          onNotice={onNotice}
        />
      )}
      {editingPayroll && (
        <PayrollEditModal
          supabase={supabase}
          payroll={editingPayroll}
          onClose={() => setEditingPayroll(null)}
          onSaved={() => {
            setEditingPayroll(null);
            onRefresh();
          }}
          onNotice={onNotice}
        />
      )}
      {checkout && (
        <div className="modalBackdrop" role="presentation">
          <section className="modalSheet" role="dialog" aria-modal="true">
            <div className="panelHeader">
              <div>
                <p className="eyebrow">Xác nhận ra ca</p>
                <h2>{targetEmployee?.name ?? checkout.employee_name}</h2>
              </div>
              <button className="ghostButton" type="button" onClick={() => setCheckout(null)}>
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
              <span>Tổng thực nhận ca này</span>
              <strong>{formatVND(totalPay)}</strong>
            </div>
            <label className="fieldStack">
              Bồi dưỡng
              <input value={allowance} onChange={(event) => setAllowance(event.target.value)} inputMode="numeric" />
            </label>
            <label className="fieldStack">
              Ghi chú
              <textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Lý do chỉnh giờ hoặc bồi dưỡng..."
              />
            </label>
            <button className="primaryButton" type="button" disabled={invalidTime} onClick={submitCheckout}>
              Xác nhận ra ca và lưu lương
            </button>
          </section>
        </div>
      )}
    </div>
  );
}
