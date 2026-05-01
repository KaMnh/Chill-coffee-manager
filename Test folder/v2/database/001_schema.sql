-- Chill Manager v2 - Supabase backend schema
-- Apply first on a clean Supabase database.

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  phone text,
  avatar_url text,
  sidebar_config jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger profiles_set_updated_at before update on public.profiles for each row execute function public.set_updated_at();

create table if not exists public.employees (
  id uuid primary key default gen_random_uuid(),
  code text unique,
  name text not null,
  position text,
  hourly_rate numeric(14,2) not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger employees_set_updated_at before update on public.employees for each row execute function public.set_updated_at();

create table if not exists public.employee_accounts (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid references public.employees(id) on delete set null,
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','manager','staff_operator','employee_viewer')),
  status text not null default 'active' check (status in ('active','pending','disabled')),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique(auth_user_id)
);

create table if not exists public.signup_requests (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid references auth.users(id) on delete cascade,
  email text not null,
  name text,
  employee_code text,
  status text not null default 'pending_approval' check (status in ('pending_email_verification','pending_approval','approved','rejected')),
  requested_at timestamptz not null default now(),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  note text
);

create table if not exists public.expense_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null default 'expense',
  sort_order integer not null default 100,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists expense_categories_name_active_uniq on public.expense_categories (lower(trim(name))) where is_active;
create trigger expense_categories_set_updated_at before update on public.expense_categories for each row execute function public.set_updated_at();

create table if not exists public.expense_templates (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  default_category_id uuid references public.expense_categories(id),
  default_unit text,
  last_unit_price numeric(14,2) not null default 0,
  usage_count integer not null default 0,
  last_used_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists expense_templates_label_active_uniq on public.expense_templates (lower(trim(label))) where is_active;
create trigger expense_templates_set_updated_at before update on public.expense_templates for each row execute function public.set_updated_at();

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  business_date date not null,
  category_id uuid references public.expense_categories(id),
  template_id uuid references public.expense_templates(id),
  description text not null,
  quantity numeric(14,3) not null default 1,
  unit text,
  unit_price numeric(14,2) not null default 0,
  amount numeric(14,2) not null,
  payment_method text not null default 'cash',
  note text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists expenses_business_date_idx on public.expenses(business_date);
create trigger expenses_set_updated_at before update on public.expenses for each row execute function public.set_updated_at();

create table if not exists public.expense_history_permissions (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  date_from date not null,
  date_to date not null,
  granted_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.shift_assignments (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id),
  business_date date not null,
  check_in_at timestamptz,
  check_out_at timestamptz,
  confirmed_by_manager boolean not null default true,
  total_minutes integer,
  status text not null default 'checked_in' check (status in ('checked_in','checked_out','cancelled')),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists shift_assignments_employee_date_idx on public.shift_assignments(employee_id, business_date);
create trigger shift_assignments_set_updated_at before update on public.shift_assignments for each row execute function public.set_updated_at();

create table if not exists public.shift_payroll_records (
  id uuid primary key default gen_random_uuid(),
  shift_assignment_id uuid unique references public.shift_assignments(id) on delete set null,
  employee_id uuid not null references public.employees(id),
  business_date date not null,
  check_in_at timestamptz,
  check_out_at timestamptz,
  total_minutes integer not null default 0,
  hourly_rate numeric(14,2) not null default 0,
  base_pay numeric(14,2) not null default 0,
  allowance_amount numeric(14,2) not null default 0,
  total_pay numeric(14,2) not null default 0,
  payment_method text not null default 'cash',
  note text,
  edited_by uuid references auth.users(id),
  edited_at timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index if not exists shift_payroll_records_date_idx on public.shift_payroll_records(business_date);

create table if not exists public.sales_sync_runs (
  id uuid primary key default gen_random_uuid(),
  batch_id text not null unique,
  source text not null default 'kiotviet',
  status text not null default 'running' check (status in ('running','success','failed','partial')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  business_date_from date,
  business_date_to date,
  order_count integer not null default 0,
  item_count integer not null default 0,
  payment_count integer not null default 0,
  error_message text,
  raw_json jsonb
);

create table if not exists public.sales_orders (
  id uuid primary key default gen_random_uuid(),
  kiotviet_invoice_id text not null unique,
  invoice_uuid text unique,
  invoice_code text,
  kiotviet_order_id text,
  order_uuid text,
  table_or_order_code text,
  purchase_at timestamptz not null,
  business_date date not null,
  branch_id text,
  branch_name text,
  sold_by_id text,
  sold_by_name text,
  customer_code text,
  customer_name text,
  gross_amount numeric(14,2) not null default 0,
  discount_amount numeric(14,2) not null default 0,
  net_amount numeric(14,2) not null default 0,
  total_payment numeric(14,2) not null default 0,
  status_code text,
  status_value text,
  using_cod boolean,
  source_created_at timestamptz,
  sync_run_id uuid references public.sales_sync_runs(id),
  raw_json jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists sales_orders_business_date_idx on public.sales_orders(business_date);
create trigger sales_orders_set_updated_at before update on public.sales_orders for each row execute function public.set_updated_at();

create table if not exists public.sales_order_items (
  id uuid primary key default gen_random_uuid(),
  sales_order_id uuid not null references public.sales_orders(id) on delete cascade,
  line_index integer not null default 0,
  item_key text not null,
  product_id text,
  product_code text,
  product_name text not null,
  quantity numeric(14,3) not null default 0,
  unit_price numeric(14,2) not null default 0,
  discount_amount numeric(14,2) not null default 0,
  discount_ratio numeric(8,4) not null default 0,
  line_total numeric(14,2) not null default 0,
  note text,
  return_quantity numeric(14,3) not null default 0,
  category_name text,
  raw_json jsonb,
  unique(sales_order_id, item_key)
);
create index if not exists sales_order_items_product_idx on public.sales_order_items(product_name);

create table if not exists public.sales_payments (
  id uuid primary key default gen_random_uuid(),
  sales_order_id uuid not null references public.sales_orders(id) on delete cascade,
  payment_method text not null,
  amount numeric(14,2) not null default 0,
  cash_received numeric(14,2),
  change_given numeric(14,2),
  payment_time timestamptz,
  source text not null default 'kiotviet' check (source in ('kiotviet','derived','manual_adjustment')),
  confidence text not null default 'derived' check (confidence in ('exact','derived','manual')),
  raw_json jsonb
);
create index if not exists sales_payments_order_idx on public.sales_payments(sales_order_id);

create table if not exists public.cash_day_openings (
  id uuid primary key default gen_random_uuid(),
  business_date date not null unique,
  denominations_json jsonb not null default '{}'::jsonb,
  opening_total numeric(14,2) not null default 0,
  carried_from_previous_day boolean not null default false,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger cash_day_openings_set_updated_at before update on public.cash_day_openings for each row execute function public.set_updated_at();

create table if not exists public.cash_counts (
  id uuid primary key default gen_random_uuid(),
  business_date date not null,
  counted_at timestamptz not null default now(),
  count_type text not null default 'spot_audit' check (count_type in ('spot_audit','shift_close','day_close')),
  denominations_json jsonb not null default '{}'::jsonb,
  total_physical numeric(14,2) not null default 0,
  total_theory numeric(14,2) not null default 0,
  difference numeric(14,2) not null default 0,
  pos_total numeric(14,2) not null default 0,
  pos_cash_total numeric(14,2) not null default 0,
  pos_non_cash_total numeric(14,2) not null default 0,
  opening_cash numeric(14,2) not null default 0,
  bank_transfer_confirmed numeric(14,2) not null default 0,
  reconciliation_total numeric(14,2) not null default 0,
  note text,
  counted_by uuid references auth.users(id),
  sync_run_id uuid references public.sales_sync_runs(id),
  sales_snapshot_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists cash_counts_date_idx on public.cash_counts(business_date, counted_at desc);

create table if not exists public.cash_drawer_events (
  id uuid primary key default gen_random_uuid(),
  business_date date not null,
  occurred_at timestamptz not null default now(),
  event_type text not null check (event_type in ('opening_cash','pos_cash_in','customer_cash_received','change_given','expense_cash_out','payroll_cash_out','cash_count_snapshot','manual_adjustment')),
  direction text not null check (direction in ('in','out','snapshot')),
  amount numeric(14,2) not null default 0,
  balance_after numeric(14,2),
  sales_order_id uuid references public.sales_orders(id) on delete set null,
  sales_payment_id uuid references public.sales_payments(id) on delete set null,
  expense_id uuid references public.expenses(id) on delete set null,
  shift_payroll_record_id uuid references public.shift_payroll_records(id) on delete set null,
  cash_count_id uuid references public.cash_counts(id) on delete set null,
  created_by uuid references auth.users(id),
  source text not null default 'app_action' check (source in ('pos_sync','app_action','system')),
  note text,
  raw_json jsonb,
  created_at timestamptz not null default now()
);
create index if not exists cash_drawer_events_date_idx on public.cash_drawer_events(business_date, occurred_at);

create table if not exists public.cash_close_reports (
  id uuid primary key default gen_random_uuid(),
  business_date date not null,
  cash_count_id uuid not null unique references public.cash_counts(id) on delete restrict,
  closed_at timestamptz not null default now(),
  closed_by uuid references auth.users(id),
  pos_total numeric(14,2) not null default 0,
  opening_cash numeric(14,2) not null default 0,
  pos_cash_total numeric(14,2) not null default 0,
  pos_non_cash_total numeric(14,2) not null default 0,
  bank_transfer_confirmed numeric(14,2) not null default 0,
  expense_cash_total numeric(14,2) not null default 0,
  payroll_cash_total numeric(14,2) not null default 0,
  theory_cash numeric(14,2) not null default 0,
  reconciliation_total numeric(14,2) not null default 0,
  physical_cash numeric(14,2) not null default 0,
  difference numeric(14,2) not null default 0,
  denominations_json jsonb not null default '{}'::jsonb,
  sync_snapshot_at timestamptz,
  note text,
  report_status text not null default 'final' check (report_status in ('draft','final','voided')),
  void_reason text,
  voided_by uuid references auth.users(id),
  voided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists cash_close_reports_date_idx on public.cash_close_reports(business_date, closed_at desc);
create trigger cash_close_reports_set_updated_at before update on public.cash_close_reports for each row execute function public.set_updated_at();

create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null,
  is_public boolean not null default false,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);

create table if not exists public.integration_clients (
  id uuid primary key default gen_random_uuid(),
  client_id text not null unique,
  client_secret_hash text not null,
  name text not null default 'n8n',
  is_active boolean not null default true,
  last_used_at timestamptz,
  created_at timestamptz not null default now()
);

-- Rate-limit log for trigger-pos-sync edge function
create table if not exists public.pos_sync_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  requested_at timestamptz not null default now(),
  force boolean not null default false,
  reason text
);
create index if not exists pos_sync_attempts_user_time_idx
  on public.pos_sync_attempts(user_id, requested_at desc);

-- Audit log for sensitive operations (payroll, cash close, expenses, settings, ...)
create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  actor_user_id uuid,
  actor_role text,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  diff_json jsonb,
  request_meta jsonb
);
create index if not exists audit_log_entity_idx on public.audit_log(entity_type, entity_id);
create index if not exists audit_log_actor_idx on public.audit_log(actor_user_id, occurred_at desc);
create index if not exists audit_log_time_idx on public.audit_log(occurred_at desc);

-- Handover checklist for end-of-day workflow
create table if not exists public.handover_sessions (
  id uuid primary key default gen_random_uuid(),
  business_date date not null unique,
  status text not null default 'draft' check (status in ('draft','completed')),
  note text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);
create trigger handover_sessions_set_updated_at before update on public.handover_sessions for each row execute function public.set_updated_at();

create table if not exists public.handover_tasks (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.handover_sessions(id) on delete cascade,
  task_key text not null,
  label text not null,
  is_done boolean not null default false,
  checked_by uuid references auth.users(id),
  checked_at timestamptz,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  unique(session_id, task_key)
);
create index if not exists handover_tasks_session_idx on public.handover_tasks(session_id, sort_order);

-- Numeric integrity CHECK constraints (idempotent via DO blocks).
-- Áp dụng sau cùng để tránh đụng dữ liệu cũ. Nếu add fail vì có row vi phạm,
-- chạy `select * from <table> where <invariant_violated>` để dọn manual rồi rerun.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'employees_hourly_rate_check') then
    alter table public.employees add constraint employees_hourly_rate_check
      check (hourly_rate >= 0 and hourly_rate <= 10000000);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'expenses_amount_check') then
    alter table public.expenses add constraint expenses_amount_check
      check (amount >= 0 and amount <= 1000000000);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'expenses_quantity_check') then
    alter table public.expenses add constraint expenses_quantity_check
      check (quantity >= 0 and quantity <= 99999);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'expenses_unit_price_check') then
    alter table public.expenses add constraint expenses_unit_price_check
      check (unit_price >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'payroll_pay_check') then
    alter table public.shift_payroll_records add constraint payroll_pay_check
      check (base_pay >= 0 and total_pay >= 0 and allowance_amount >= 0 and hourly_rate >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'sales_orders_amount_check') then
    alter table public.sales_orders add constraint sales_orders_amount_check
      check (net_amount >= 0 and total_payment >= 0 and gross_amount >= 0 and discount_amount >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'sales_items_quantity_check') then
    alter table public.sales_order_items add constraint sales_items_quantity_check
      check (quantity >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'sales_items_price_check') then
    alter table public.sales_order_items add constraint sales_items_price_check
      check (unit_price >= 0 and line_total >= 0 and discount_amount >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'cash_counts_total_check') then
    alter table public.cash_counts add constraint cash_counts_total_check
      check (total_physical >= 0 and pos_total >= 0 and pos_cash_total >= 0 and pos_non_cash_total >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'cash_opening_total_check') then
    alter table public.cash_day_openings add constraint cash_opening_total_check
      check (opening_total >= 0);
  end if;
end $$;
