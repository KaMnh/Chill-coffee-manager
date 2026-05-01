-- Chill Manager v2 incremental update
-- Apply this to an existing database before re-applying 002_functions.sql.

create unique index if not exists expense_templates_label_active_uniq
  on public.expense_templates (lower(trim(label)))
  where is_active;

alter table public.cash_counts
  add column if not exists pos_total numeric(14,2) not null default 0,
  add column if not exists pos_cash_total numeric(14,2) not null default 0,
  add column if not exists pos_non_cash_total numeric(14,2) not null default 0,
  add column if not exists opening_cash numeric(14,2) not null default 0,
  add column if not exists bank_transfer_confirmed numeric(14,2) not null default 0,
  add column if not exists reconciliation_total numeric(14,2) not null default 0;

alter table public.cash_close_reports
  add column if not exists pos_total numeric(14,2) not null default 0,
  add column if not exists pos_non_cash_total numeric(14,2) not null default 0,
  add column if not exists bank_transfer_confirmed numeric(14,2) not null default 0,
  add column if not exists reconciliation_total numeric(14,2) not null default 0;
