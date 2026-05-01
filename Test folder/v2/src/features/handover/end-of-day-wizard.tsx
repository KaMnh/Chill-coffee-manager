"use client";

import { useState } from "react";
import { formatDateTime } from "@/lib/format";
import type { HandoverSession, ShiftAssignment } from "@/lib/types";
import { EmptyState, ModalBackdrop } from "@/shared";

export function EndOfDayWizard({
  date,
  shifts,
  handover,
  onClose,
  onTaskChange,
  onCompleteHandover,
  onGoCash
}: {
  date: string;
  shifts: ShiftAssignment[];
  handover: HandoverSession | null;
  onClose: () => void;
  onTaskChange: (taskId: string, isDone: boolean) => void;
  onCompleteHandover: () => void;
  onGoCash: () => void;
}) {
  const [step, setStep] = useState(0);
  const activeStaff = shifts.filter((shift) => shift.status === "checked_in");
  const doneTasks = handover?.tasks.filter((task) => task.is_done).length ?? 0;
  const totalTasks = handover?.tasks.length ?? 0;
  const progress = Math.round(((step + 1) / 3) * 100);

  return (
    <ModalBackdrop>
      <section className="modalSheet wizardSheet" role="dialog" aria-modal="true">
        <div className="panelHeader">
          <div>
            <p className="eyebrow">Đóng quầy</p>
            <h2>Wizard cuối ngày</h2>
            <span className="muted">{date}</span>
          </div>
          <button className="ghostButton" type="button" onClick={onClose}>
            Đóng
          </button>
        </div>
        <div className="wizardProgress">
          <span style={{ width: progress + "%" }} />
        </div>
        <div className="wizardSteps">
          <button className={step === 0 ? "active" : ""} type="button" onClick={() => setStep(0)}>
            1. Nhân sự
          </button>
          <button className={step === 1 ? "active" : ""} type="button" onClick={() => setStep(1)}>
            2. Công việc
          </button>
          <button className={step === 2 ? "active" : ""} type="button" onClick={() => setStep(2)}>
            3. Chốt két
          </button>
        </div>
        {step === 0 && (
          <div className="wizardBody">
            <h3>Chốt nhân sự</h3>
            {activeStaff.length === 0 ? (
              <EmptyState title="Không còn nhân viên đang làm" description="Có thể chuyển sang checklist bàn giao." />
            ) : (
              <div className="listRows">
                {activeStaff.map((shift) => (
                  <article className="listRow" key={shift.id}>
                    <div>
                      <strong>{shift.employee_name ?? "Nhân viên"}</strong>
                      <span>Đang trong ca từ {formatDateTime(shift.check_in_at)}</span>
                    </div>
                    <strong>Chờ ra ca</strong>
                  </article>
                ))}
              </div>
            )}
            <button className="primaryButton" type="button" onClick={() => setStep(1)}>
              Tiếp tục checklist
            </button>
          </div>
        )}
        {step === 1 && (
          <div className="wizardBody">
            <h3>Checklist công việc</h3>
            <p className="muted">
              Đã hoàn tất {doneTasks}/{totalTasks} việc.
            </p>
            {handover ? (
              <div className="handoverTasks">
                {handover.tasks.map((task) => (
                  <label className="checkRow" key={task.id}>
                    <input
                      type="checkbox"
                      checked={task.is_done}
                      onChange={(event) => onTaskChange(task.id, event.target.checked)}
                    />
                    <span>{task.label}</span>
                  </label>
                ))}
              </div>
            ) : (
              <EmptyState title="Chưa bật sổ bàn giao" />
            )}
            <div className="buttonRow wrap">
              <button className="ghostButton" type="button" onClick={onCompleteHandover} disabled={!handover}>
                Hoàn tất checklist
              </button>
              <button className="primaryButton" type="button" onClick={() => setStep(2)}>
                Tiếp tục chốt két
              </button>
            </div>
          </div>
        )}
        {step === 2 && (
          <div className="wizardBody">
            <h3>Chốt két</h3>
            <p className="muted">Bước cuối là đếm tiền theo mệnh giá và tạo báo cáo snapshot.</p>
            <button className="primaryButton" type="button" onClick={onGoCash}>
              Mở màn Chốt két
            </button>
          </div>
        )}
      </section>
    </ModalBackdrop>
  );
}
