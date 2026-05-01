"use client";

import { useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createExpenseTemplate } from "@/lib/data";
import { moneyFromInput } from "@/lib/format";
import type { ExpenseCategory, ExpenseTemplate } from "@/lib/types";
import { ModalBackdrop, type Notice } from "@/shared";

export function ExpenseTemplateModal({
  supabase,
  categories,
  onClose,
  onCreated,
  onNotice
}: {
  supabase: SupabaseClient;
  categories: ExpenseCategory[];
  onClose: () => void;
  onCreated: (template: ExpenseTemplate) => void;
  onNotice: (notice: Notice) => void;
}) {
  const [label, setLabel] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [unit, setUnit] = useState("cái");
  const [unitPrice, setUnitPrice] = useState("");
  const [isSaving, setSaving] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    try {
      const template = await createExpenseTemplate(supabase, {
        label,
        default_category_id: categoryId || null,
        default_unit: unit,
        last_unit_price: moneyFromInput(unitPrice)
      });
      onNotice({ type: "success", message: "Đã tạo mẫu chi mới." });
      onCreated(template);
    } catch (error) {
      onNotice({ type: "error", message: error instanceof Error ? error.message : "Không tạo được mẫu chi." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalBackdrop>
      <form className="modalSheet" role="dialog" aria-modal="true" onSubmit={submit}>
        <div className="panelHeader">
          <div>
            <p className="eyebrow">Mẫu chi</p>
            <h2>Thêm mẫu nhập nhanh</h2>
          </div>
          <button className="ghostButton" type="button" onClick={onClose}>
            Đóng
          </button>
        </div>
        <label className="fieldStack">
          Tên mẫu
          <input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Ví dụ: Bánh mì" required />
        </label>
        <label className="fieldStack">
          Danh mục
          <select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
            <option value="">Chọn danh mục...</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </label>
        <div className="formGrid2">
          <label className="fieldStack">
            Đơn vị mặc định
            <input value={unit} onChange={(event) => setUnit(event.target.value)} placeholder="ổ, bao, kg..." />
          </label>
          <label className="fieldStack">
            Đơn giá gần nhất
            <input value={unitPrice} onChange={(event) => setUnitPrice(event.target.value)} inputMode="numeric" placeholder="50.000" />
          </label>
        </div>
        <button className="primaryButton" type="submit" disabled={isSaving}>
          {isSaving ? "Đang lưu..." : "Lưu mẫu và áp dụng"}
        </button>
      </form>
    </ModalBackdrop>
  );
}
