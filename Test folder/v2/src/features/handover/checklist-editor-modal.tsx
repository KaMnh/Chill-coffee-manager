"use client";

import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { updateHandoverDefaultTasks, updateHandoverSessionTasks } from "@/lib/data";
import type { AppSettings, HandoverSession } from "@/lib/types";
import { ModalBackdrop, type Notice } from "@/shared";

type EditableTask = { id?: string; key: string; label: string; sort_order?: number };

function taskKeyFromLabel(label: string, index: number) {
  return (
    label
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "") || `task_${index + 1}`
  );
}

export function ChecklistEditorModal({
  supabase,
  handover,
  defaultTasks,
  onClose,
  onSaved,
  onSettingsChange,
  onNotice
}: {
  supabase: SupabaseClient;
  handover: HandoverSession | null;
  defaultTasks: Array<{ key: string; label: string }>;
  onClose: () => void;
  onSaved: () => void;
  onSettingsChange: React.Dispatch<React.SetStateAction<AppSettings>>;
  onNotice: (notice: Notice) => void;
}) {
  const [mode, setMode] = useState<"today" | "default">("today");
  const [tasks, setTasks] = useState<EditableTask[]>([]);
  const [isSaving, setSaving] = useState(false);

  useEffect(() => {
    if (mode === "today" && handover) {
      setTasks(handover.tasks.map((task) => ({ id: task.id, key: task.task_key, label: task.label, sort_order: task.sort_order })));
      return;
    }
    setTasks(
      (defaultTasks.length
        ? defaultTasks
        : [
            { key: "clean_counter", label: "Đã vệ sinh quầy và máy pha" },
            { key: "restock", label: "Đã kiểm tra nguyên liệu cần bổ sung" },
            { key: "cash_ready", label: "Đã chuẩn bị tiền lẻ/két cho ca sau" }
          ]
      ).map((task, index) => ({ key: task.key, label: task.label, sort_order: (index + 1) * 10 }))
    );
  }, [defaultTasks, handover, mode]);

  function updateTask(index: number, label: string) {
    setTasks((current) =>
      current.map((task, taskIndex) =>
        taskIndex === index ? { ...task, label, key: task.id ? task.key : taskKeyFromLabel(label, taskIndex) } : task
      )
    );
  }

  async function save() {
    setSaving(true);
    try {
      const cleanTasks = tasks
        .map((task, index) => ({ ...task, label: task.label.trim(), sort_order: (index + 1) * 10 }))
        .filter((task) => task.label);
      if (mode === "today") {
        if (!handover) throw new Error("Chưa có checklist hôm nay để chỉnh.");
        await updateHandoverSessionTasks(supabase, handover.id, cleanTasks);
        onNotice({ type: "success", message: "Đã cập nhật checklist hôm nay." });
      } else {
        const nextDefaults = cleanTasks.map((task, index) => ({
          key: task.key || taskKeyFromLabel(task.label, index),
          label: task.label
        }));
        await updateHandoverDefaultTasks(supabase, nextDefaults);
        onSettingsChange((current) => ({ ...current, handover_default_tasks: nextDefaults }));
        onNotice({ type: "success", message: "Đã lưu mẫu checklist mặc định." });
      }
      onSaved();
    } catch (error) {
      onNotice({ type: "error", message: error instanceof Error ? error.message : "Không lưu được checklist." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalBackdrop>
      <section className="modalSheet" role="dialog" aria-modal="true">
        <div className="panelHeader">
          <div>
            <p className="eyebrow">Checklist công việc</p>
            <h2>Chỉnh nội dung checklist</h2>
          </div>
          <button className="ghostButton" type="button" onClick={onClose}>
            Đóng
          </button>
        </div>
        <div className="segmentedControl">
          <button type="button" className={mode === "today" ? "active" : ""} onClick={() => setMode("today")}>
            Hôm nay
          </button>
          <button type="button" className={mode === "default" ? "active" : ""} onClick={() => setMode("default")}>
            Mẫu mặc định
          </button>
        </div>
        <div className="checklistEditorRows">
          {tasks.map((task, index) => (
            <div className="checklistEditRow" key={task.id ?? task.key ?? index}>
              <input value={task.label} onChange={(event) => updateTask(index, event.target.value)} />
              <button
                className="ghostButton slimButton"
                type="button"
                onClick={() => setTasks((current) => current.filter((_, taskIndex) => taskIndex !== index))}
              >
                Xóa
              </button>
            </div>
          ))}
        </div>
        <div className="buttonRow wrap">
          <button
            className="ghostButton"
            type="button"
            onClick={() =>
              setTasks((current) => [
                ...current,
                { key: `task_${current.length + 1}`, label: "", sort_order: (current.length + 1) * 10 }
              ])
            }
          >
            + Thêm việc
          </button>
          <button className="primaryButton" type="button" disabled={isSaving} onClick={save}>
            {isSaving ? "Đang lưu..." : "Lưu checklist"}
          </button>
        </div>
      </section>
    </ModalBackdrop>
  );
}
