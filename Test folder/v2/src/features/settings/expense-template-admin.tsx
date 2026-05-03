"use client";

/**
 * Admin CRUD UI cho mẫu chi phí nhanh.
 * Owner/manager: tạo, sửa, ẩn/hiện template. Staff chỉ pick từ list active.
 * RLS đã cho owner/manager full CRUD trên expense_templates.
 */
import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createExpenseTemplate,
  deactivateExpenseTemplate,
  loadExpenseCategories,
  loadExpenseTemplatesAll,
  updateExpenseTemplate
} from "@/lib/data";
import { formatVND, moneyFromInput } from "@/lib/format";
import type { ExpenseCategory, ExpenseTemplate } from "@/lib/types";
import { EmptyState, type Notice } from "@/shared";
import { Check, Pencil, Plus, Trash2, X } from "@/shared/icons";

export function ExpenseTemplateAdmin({
  supabase,
  onNotice
}: {
  supabase: SupabaseClient;
  onNotice: (notice: Notice) => void;
}) {
  const [templates, setTemplates] = useState<ExpenseTemplate[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [isLoading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  // Create form state
  const [createLabel, setCreateLabel] = useState("");
  const [createCategoryId, setCreateCategoryId] = useState("");
  const [createUnit, setCreateUnit] = useState("");
  const [createPrice, setCreatePrice] = useState("");
  const [isSaving, setSaving] = useState(false);

  // Edit form state (per row)
  const [editLabel, setEditLabel] = useState("");
  const [editCategoryId, setEditCategoryId] = useState("");
  const [editUnit, setEditUnit] = useState("");
  const [editPrice, setEditPrice] = useState("");

  useEffect(() => {
    void reload();
  }, []);

  async function reload() {
    setLoading(true);
    try {
      const [tpls, cats] = await Promise.all([
        loadExpenseTemplatesAll(supabase),
        loadExpenseCategories(supabase)
      ]);
      setTemplates(tpls);
      setCategories(cats);
    } catch (error) {
      onNotice({ type: "error", message: error instanceof Error ? error.message : "Không tải được dữ liệu." });
    } finally {
      setLoading(false);
    }
  }

  function startEdit(t: ExpenseTemplate) {
    setEditingId(t.id);
    setEditLabel(t.label);
    setEditCategoryId(t.default_category_id ?? "");
    setEditUnit(t.default_unit ?? "");
    setEditPrice(String(t.last_unit_price ?? 0));
  }

  function cancelEdit() {
    setEditingId(null);
  }

  async function saveEdit(id: string) {
    if (!editLabel.trim()) {
      onNotice({ type: "error", message: "Tên mẫu không được trống." });
      return;
    }
    setSaving(true);
    try {
      await updateExpenseTemplate(supabase, id, {
        label: editLabel.trim(),
        default_category_id: editCategoryId || null,
        default_unit: editUnit.trim() || null,
        last_unit_price: moneyFromInput(editPrice)
      });
      onNotice({ type: "success", message: "Đã cập nhật mẫu." });
      setEditingId(null);
      await reload();
    } catch (error) {
      onNotice({ type: "error", message: error instanceof Error ? error.message : "Không cập nhật được." });
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(t: ExpenseTemplate) {
    setSaving(true);
    try {
      await updateExpenseTemplate(supabase, t.id, { is_active: !t.is_active });
      onNotice({
        type: "success",
        message: t.is_active ? "Đã ẩn mẫu khỏi danh sách." : "Đã hiển thị lại mẫu."
      });
      await reload();
    } catch (error) {
      onNotice({ type: "error", message: error instanceof Error ? error.message : "Lỗi khi đổi trạng thái." });
    } finally {
      setSaving(false);
    }
  }

  async function softDelete(t: ExpenseTemplate) {
    if (!confirm(`Ẩn mẫu "${t.label}"? (Có thể bật lại sau, lịch sử chi phí cũ vẫn giữ.)`)) return;
    setSaving(true);
    try {
      await deactivateExpenseTemplate(supabase, t.id);
      onNotice({ type: "success", message: "Đã ẩn mẫu." });
      await reload();
    } catch (error) {
      onNotice({ type: "error", message: error instanceof Error ? error.message : "Lỗi khi ẩn." });
    } finally {
      setSaving(false);
    }
  }

  async function submitCreate() {
    if (!createLabel.trim()) {
      onNotice({ type: "error", message: "Tên mẫu bắt buộc." });
      return;
    }
    setSaving(true);
    try {
      await createExpenseTemplate(supabase, {
        label: createLabel.trim(),
        default_category_id: createCategoryId || null,
        default_unit: createUnit.trim() || null,
        last_unit_price: moneyFromInput(createPrice)
      });
      onNotice({ type: "success", message: "Đã thêm mẫu mới." });
      setCreateLabel("");
      setCreateCategoryId("");
      setCreateUnit("");
      setCreatePrice("");
      setShowCreate(false);
      await reload();
    } catch (error) {
      onNotice({ type: "error", message: error instanceof Error ? error.message : "Không tạo được mẫu." });
    } finally {
      setSaving(false);
    }
  }

  function categoryName(id: string | null | undefined) {
    return id ? categories.find((c) => c.id === id)?.name ?? "—" : "—";
  }

  return (
    <section className="panel settingsCard">
      <div className="panelHeader">
        <div>
          <p className="eyebrow">Chi phí</p>
          <h2>Mẫu chi phí nhanh</h2>
          <p className="muted">Tạo + chỉnh sửa các mẫu hay dùng để nhân viên chọn nhanh khi nhập chi phí.</p>
        </div>
        <button
          type="button"
          className="primaryButton compactButton"
          onClick={() => setShowCreate((v) => !v)}
        >
          {showCreate ? <X size={16} /> : <Plus size={16} />}
          <span className="iconLabel">{showCreate ? " Hủy" : " Thêm mẫu"}</span>
        </button>
      </div>

      {showCreate && (
        <div className="templateCreateForm">
          <label className="fieldStack">
            Tên mẫu *
            <input
              value={createLabel}
              onChange={(event) => setCreateLabel(event.target.value)}
              placeholder="Bánh mì, Đá viên, ..."
              autoFocus
            />
          </label>
          <div className="formGrid3">
            <label className="fieldStack">
              Danh mục
              <select
                value={createCategoryId}
                onChange={(event) => setCreateCategoryId(event.target.value)}
              >
                <option value="">— Chọn —</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="fieldStack">
              Đơn vị
              <input
                value={createUnit}
                onChange={(event) => setCreateUnit(event.target.value)}
                placeholder="ổ, kg, chai..."
              />
            </label>
            <label className="fieldStack">
              Giá mặc định
              <input
                value={createPrice}
                onChange={(event) => setCreatePrice(event.target.value)}
                inputMode="numeric"
                placeholder="0"
              />
            </label>
          </div>
          <div className="buttonRow">
            <button className="primaryButton" type="button" disabled={isSaving} onClick={submitCreate}>
              <Check size={16} />
              <span className="iconLabel">{isSaving ? " Đang lưu..." : " Lưu mẫu"}</span>
            </button>
          </div>
        </div>
      )}

      {isLoading ? (
        <p className="muted">Đang tải...</p>
      ) : templates.length === 0 ? (
        <EmptyState title="Chưa có mẫu" description="Bấm Thêm mẫu để bắt đầu." />
      ) : (
        <div className="tableWrap templateAdminTable">
          <table>
            <thead>
              <tr>
                <th>Tên mẫu</th>
                <th>Danh mục</th>
                <th>Đơn vị</th>
                <th>Giá gần nhất</th>
                <th>Lượt dùng</th>
                <th>Active</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {templates.map((t) =>
                editingId === t.id ? (
                  <tr key={t.id} className="editingRow">
                    <td>
                      <input value={editLabel} onChange={(event) => setEditLabel(event.target.value)} />
                    </td>
                    <td>
                      <select value={editCategoryId} onChange={(event) => setEditCategoryId(event.target.value)}>
                        <option value="">—</option>
                        {categories.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input value={editUnit} onChange={(event) => setEditUnit(event.target.value)} />
                    </td>
                    <td>
                      <input
                        value={editPrice}
                        onChange={(event) => setEditPrice(event.target.value)}
                        inputMode="numeric"
                      />
                    </td>
                    <td>{t.usage_count}</td>
                    <td>
                      <span className={"badge " + (t.is_active ? "good" : "soft")}>
                        {t.is_active ? "Hiện" : "Ẩn"}
                      </span>
                    </td>
                    <td className="rowActions">
                      <button
                        type="button"
                        className="compactIconButton primary"
                        title="Lưu"
                        disabled={isSaving}
                        onClick={() => saveEdit(t.id)}
                      >
                        <Check size={16} />
                      </button>
                      <button
                        type="button"
                        className="compactIconButton ghost"
                        title="Hủy"
                        onClick={cancelEdit}
                      >
                        <X size={16} />
                      </button>
                    </td>
                  </tr>
                ) : (
                  <tr key={t.id} className={t.is_active ? "" : "inactiveRow"}>
                    <td>
                      <strong>{t.label}</strong>
                    </td>
                    <td>{categoryName(t.default_category_id)}</td>
                    <td>{t.default_unit ?? "—"}</td>
                    <td>{formatVND(t.last_unit_price)}</td>
                    <td>{t.usage_count}</td>
                    <td>
                      <button
                        type="button"
                        className="badgeButton"
                        title={t.is_active ? "Đang hiển thị — bấm để ẩn" : "Đang ẩn — bấm để hiện"}
                        disabled={isSaving}
                        onClick={() => toggleActive(t)}
                      >
                        <span className={"badge " + (t.is_active ? "good" : "soft")}>
                          {t.is_active ? "Hiện" : "Ẩn"}
                        </span>
                      </button>
                    </td>
                    <td className="rowActions">
                      <button
                        type="button"
                        className="compactIconButton ghost"
                        title="Sửa"
                        onClick={() => startEdit(t)}
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        type="button"
                        className="compactIconButton ghost"
                        title="Ẩn mẫu"
                        disabled={!t.is_active}
                        onClick={() => softDelete(t)}
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                )
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
