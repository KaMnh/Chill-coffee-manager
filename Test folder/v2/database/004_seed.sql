-- Chill Manager v2 - minimal seed data

insert into public.expense_categories (name, type, sort_order, is_active) values
  ('Nguyên liệu', 'expense', 10, true),
  ('Vận hành', 'expense', 20, true),
  ('Lương', 'expense', 30, true),
  ('Khác', 'expense', 100, true)
on conflict do nothing;

insert into public.expense_templates (label, default_category_id, default_unit, last_unit_price, usage_count, is_active)
select 'Bánh mì', id, 'ổ', 6000, 0, true from public.expense_categories where name = 'Nguyên liệu'
on conflict do nothing;

insert into public.expense_templates (label, default_category_id, default_unit, last_unit_price, usage_count, is_active)
select 'Đá viên', id, 'bao', 30000, 0, true from public.expense_categories where name = 'Vận hành'
on conflict do nothing;

insert into public.expense_templates (label, default_category_id, default_unit, last_unit_price, usage_count, is_active)
select 'Trứng', id, 'quả', 2500, 0, true from public.expense_categories where name = 'Nguyên liệu'
on conflict do nothing;

insert into public.app_settings (key, value, is_public) values
  ('denominations', '[10000,20000,50000,100000,200000,500000]'::jsonb, true),
  ('cash_diff_threshold', '{"warn": 200000, "critical": 500000}'::jsonb, true),
  ('sidebar_defaults', '{"owner":["dashboard","expenses","shifts","cash","reports","pivot","settings"],"manager":["dashboard","expenses","shifts","cash","reports","pivot","settings"],"staff_operator":["dashboard","expenses","shifts","cash","reports"],"employee_viewer":["dashboard"]}'::jsonb, true)
on conflict (key) do update set value = excluded.value, is_public = excluded.is_public, updated_at = now();

-- Integration clients KHÔNG được seed default. Owner phải INSERT thủ công sau khi tự
-- generate secret an toàn (>=32 byte ngẫu nhiên). Xem `docs/n8n-ingest.md` mục 1 để biết cú pháp.
-- Hash mẫu: select crypt('<your-random-secret>', gen_salt('bf'));

insert into public.app_settings (key, value, is_public) values
  ('denominations', '[1000,2000,5000,10000,20000,50000,100000,200000,500000]'::jsonb, true),
  ('handover_default_tasks', '[{"key":"clean_counter","label":"Đã vệ sinh quầy và máy pha"},{"key":"restock","label":"Đã kiểm tra nguyên liệu cần bổ sung"},{"key":"cash_ready","label":"Đã chuẩn bị tiền lẻ/két cho ca sau"},{"key":"handover_note","label":"Đã ghi chú bàn giao cho ca sau"}]'::jsonb, true)
on conflict (key) do update set value = excluded.value, is_public = excluded.is_public, updated_at = now();
