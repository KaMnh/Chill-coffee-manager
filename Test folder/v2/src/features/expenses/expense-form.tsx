"use client";

import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createExpense } from "@/lib/data";
import { formatNumber, formatVND, moneyFromInput } from "@/lib/format";
import type { ExpenseCategory, ExpenseTemplate } from "@/lib/types";
import { validateExpense } from "@/lib/validation";
import type { Notice } from "@/shared";
import { ExpenseTemplateModal } from "./expense-template-modal";

export function ExpenseForm({
  supabase,
  date,
  categories,
  templates,
  selectedTemplate,
  onTemplateConsumed,
  onSaved,
  onNotice
}: {
  supabase: SupabaseClient;
  date: string;
  categories: ExpenseCategory[];
  templates: ExpenseTemplate[];
  selectedTemplate?: ExpenseTemplate | null;
  onTemplateConsumed?: () => void;
  onSaved: () => void;
  onNotice: (notice: Notice) => void;
}) {
  const [categoryId, setCategoryId] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [description, setDescription] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unit, setUnit] = useState("cái");
  const [unitPrice, setUnitPrice] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [isTemplateModalOpen, setTemplateModalOpen] = useState(false);
  const [fieldError, setFieldError] = useState<{ field: string; message: string } | null>(null);
  const computed = (Number(quantity) || 0) * moneyFromInput(unitPrice);
  const finalAmount = moneyFromInput(amount) || computed;
  const topTemplates = templates.slice(0, 8);

  function applyTemplate(template: ExpenseTemplate) {
    setTemplateId(template.id);
    setDescription(template.label);
    setCategoryId(template.default_category_id ?? "");
    setUnit(template.default_unit ?? "cái");
    setUnitPrice(template.last_unit_price ? formatNumber(template.last_unit_price) : "");
    setAmount("");
    onNotice({ type: "info", message: "Đã áp dụng mẫu chi: " + template.label });
  }

  useEffect(() => {
    if (!selectedTemplate) return;
    applyTemplate(selectedTemplate);
    onTemplateConsumed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTemplate?.id]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validation = validateExpense({
      description,
      quantity: Number(quantity) || 0,
      unit_price: moneyFromInput(unitPrice),
      amount: finalAmount,
      note
    });
    if (!validation.ok) {
      setFieldError({ field: validation.field, message: validation.message });
      onNotice({ type: "error", message: validation.message });
      return;
    }
    setFieldError(null);
    try {
      await createExpense(supabase, {
        business_date: date,
        category_id: categoryId || null,
        template_id: templateId || null,
        description,
        quantity: Number(quantity) || 1,
        unit,
        unit_price: moneyFromInput(unitPrice),
        amount: finalAmount,
        note,
        payment_method: "cash"
      });
      setTemplateId("");
      setDescription("");
      setQuantity("1");
      setUnitPrice("");
      setAmount("");
      setNote("");
      onNotice({ type: "success", message: "Đã lưu khoản chi." });
      onSaved();
    } catch (error) {
      onNotice({ type: "error", message: error instanceof Error ? error.message : "Không lưu được khoản chi." });
    }
  }

  return (
    <form className="panel formPanel" onSubmit={submit}>
      <div className="panelHeader">
        <div>
          <p className="eyebrow">Nhập chi</p>
          <h2>Thêm khoản chi mới</h2>
        </div>
        <strong>{formatVND(finalAmount)}</strong>
      </div>
      <div className="templateRail">
        <div className="templateActions">
          <span>Mẫu nhanh</span>
          <button className="ghostButton slimButton" type="button" onClick={() => setTemplateModalOpen(true)}>
            + Thêm mẫu
          </button>
        </div>
        <div className="templateTags">
          {topTemplates.length === 0 && <span className="muted smallText">Chưa có mẫu chi.</span>}
          {topTemplates.map((template) => (
            <button className="templateTag" key={template.id} type="button" onClick={() => applyTemplate(template)}>
              <strong>{template.label}</strong>
              <small>{formatVND(template.last_unit_price)}</small>
            </button>
          ))}
        </div>
      </div>
      <label className="fieldStack">
        Loại chi phí
        <select value={categoryId} onChange={(event) => setCategoryId(event.target.value)} required>
          <option value="">Chọn loại chi phí...</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </label>
      <label className="fieldStack">
        Nội dung
        <input
          value={description}
          onChange={(event) => {
            setDescription(event.target.value);
            setTemplateId("");
          }}
          placeholder="VD: Bánh mì, trứng, đá viên..."
          required
        />
      </label>
      <div className="formGrid3">
        <label className="fieldStack">
          Số lượng
          <input value={quantity} onChange={(event) => setQuantity(event.target.value)} inputMode="decimal" />
        </label>
        <label className="fieldStack">
          Đơn vị
          <input value={unit} onChange={(event) => setUnit(event.target.value)} />
        </label>
        <label className="fieldStack">
          Đơn giá
          <input value={unitPrice} onChange={(event) => setUnitPrice(event.target.value)} inputMode="numeric" placeholder="50.000" />
        </label>
      </div>
      <label className="fieldStack">
        Thành tiền
        <input
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          inputMode="numeric"
          placeholder={computed ? formatNumber(computed) : "Tự tính từ SL × đơn giá"}
        />
      </label>
      <label className="fieldStack">
        Ghi chú
        <textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="VD: mua tại chợ, người giao..." />
      </label>
      {fieldError && <p className="formError">{fieldError.message}</p>}
      <button className="primaryButton" type="submit">
        Lưu khoản chi · {formatVND(finalAmount)}
      </button>
      {isTemplateModalOpen && (
        <ExpenseTemplateModal
          supabase={supabase}
          categories={categories}
          onClose={() => setTemplateModalOpen(false)}
          onCreated={(template) => {
            setTemplateModalOpen(false);
            applyTemplate(template);
            onSaved();
          }}
          onNotice={onNotice}
        />
      )}
    </form>
  );
}
