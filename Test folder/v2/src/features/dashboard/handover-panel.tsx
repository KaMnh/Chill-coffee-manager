"use client";

import { useEffect, useState } from "react";
import type { HandoverSession } from "@/lib/types";
import { EmptyState } from "@/shared";

export function HandoverPanel({
  handover,
  onTaskChange,
  onNoteSave,
  canEdit,
  onEdit
}: {
  handover: HandoverSession | null;
  onTaskChange: (taskId: string, isDone: boolean) => void;
  onNoteSave: (note: string) => void;
  canEdit: boolean;
  onEdit: () => void;
}) {
  const [draftNote, setDraftNote] = useState(handover?.note ?? "");

  useEffect(() => {
    setDraftNote(handover?.note ?? "");
  }, [handover?.id, handover?.note]);

  if (!handover) {
    return (
      <section className="panel">
        <div className="panelHeader">
          <div>
            <p className="eyebrow">Sổ bàn giao</p>
            <h2>Checklist công việc</h2>
          </div>
          {canEdit && (
            <button className="iconOnlyButton" type="button" aria-label="Chỉnh checklist" title="Chỉnh checklist" onClick={onEdit}>
              ✎
            </button>
          )}
        </div>
        <EmptyState
          title="Chưa bật sổ bàn giao"
          description="Apply SQL handover trong database để lưu checklist lên Supabase."
        />
      </section>
    );
  }

  const done = handover.tasks.filter((task) => task.is_done).length;
  return (
    <section className="panel handoverPanel">
      <div className="panelHeader">
        <div>
          <p className="eyebrow">Sổ bàn giao</p>
          <h2>Checklist công việc</h2>
        </div>
        <div className="panelHeaderActions">
          <span>
            {done}/{handover.tasks.length} việc
          </span>
          {canEdit && (
            <button className="iconOnlyButton" type="button" aria-label="Chỉnh checklist" title="Chỉnh checklist" onClick={onEdit}>
              ✎
            </button>
          )}
        </div>
      </div>
      <div className="handoverTasks">
        {handover.tasks.length === 0 && (
          <EmptyState title="Chưa có checklist" description="Owner/manager có thể cấu hình mặc định trong app_settings." />
        )}
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
      <label className="fieldStack">
        Ghi chú bàn giao
        <textarea
          value={draftNote}
          onChange={(event) => setDraftNote(event.target.value)}
          onBlur={() => onNoteSave(draftNote)}
          placeholder="VD: đã vệ sinh máy, cần nhập thêm sữa..."
        />
      </label>
    </section>
  );
}
