# Spec: Sổ quỹ (Cash Safe) — track + workflow chốt két ↔ ngày mới

## Context

Hiện tại Chill Manager v2 chỉ track **két ca** (cash drawer trong ngày). Chốt két cuối ca → tiền vật lý còn lại không có chỗ nào "chứa" trong app — owner phải tự ghi chú ngoài. Sáng hôm sau, mở két lại từ đầu (nhập mệnh giá) hoặc tick "carry from previous" (boolean) — nhưng không có audit trail chính xác.

User muốn thêm **sổ quỹ** = container riêng (giống tài khoản tiền mặt), tracking tách biệt với cash drawer:
- Cuối ca chốt két → dư vào sổ quỹ
- Sáng mai mở két → 3 kịch bản: carry-over từ ngày trước, rút từ sổ quỹ, hoặc kết hợp
- Có thể rút sổ quỹ cho mục đích khác (tiền điện, thuê, mua nguyên liệu lớn)
- Owner adjust khi count thực tế lệch (mất, lẫn lộn)

---

## User decisions (đã chốt)

| # | Decision | Lựa chọn |
|---|----------|----------|
| Q1 | Phạm vi tính năng | A (deposit cuối ngày) + C (rút mục đích khác) + E (manual adjustment) + F (lịch sử bảng — KHÔNG export/print phase này). Skip: B/D/G |
| Q2 | Mô hình tracking | C — Hybrid: total tự động + periodic denomination snapshot khi count |
| Q3 | Workflow chốt két ↔ ngày mới | D — Hybrid: chốt két có field "Để lại cho ngày mai" (default=0), sáng mai có thể rút thêm từ sổ quỹ |
| Q4 | Permission | Owner only (manager nạp được tự động qua chốt két, KHÔNG xem/rút/count được) |
| Q5 | Setup ban đầu | Bắt đầu = 0, owner adjust thủ công với reason "Initial setup" |
| Q6 | Tab placement | Sidebar tab mới "Sổ quỹ" (icon PiggyBank), owner only |
| Q7 | Reason categories cho rút khác | Hardcode list 5 loại cố định |

---

## Verified state (codebase)

- `database/001_schema.sql` — đã có `cash_drawer_events` (event_type enum), `cash_close_reports`, `cash_day_openings`
- `database/002_functions.sql:642-731` — `finalize_cash_close_report(p_cash_count_id)` hiện chốt báo cáo, snapshot từ cash_count → cash_close_reports
- `database/002_functions.sql:175-275` — `save_cash_day_opening(p_payload jsonb)` hiện accept denominations + carried_from_previous_day boolean
- `src/features/cash/cash-panel.tsx` — `submit("shift_close")` gọi `finalizeCashCloseReport` sau `saveCashCount`
- `src/features/cash/opening-cash-modal.tsx` — modal nhập tiền đầu ngày với denomination grid + carried checkbox
- `src/features/navigation.ts` — pattern thêm ViewKey + icon + roles[]
- `src/shared/icons.tsx` — re-export lucide-react icons; cần thêm `PiggyBank` (hoặc `Vault`)
- `src/app/api/users/route.ts` — pattern API route dùng service role + requireAuth

Không có code "safe" / "vault" hiện tại — feature mới hoàn toàn.

---

## Data model

### New tables

**`safe_transactions`** — single source of truth cho mọi giao dịch sổ quỹ:

```sql
create table public.safe_transactions (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  transaction_type text not null check (transaction_type in (
    'initial_setup',     -- Owner setup ban đầu (chỉ 1 row đầu tiên)
    'deposit_close',     -- Auto từ chốt két cuối ngày
    'withdraw_open',     -- Rút để mở két ngày mới
    'withdraw_other',    -- Rút cho mục đích khác (tiền điện, thuê, ...)
    'adjustment'         -- Owner manual adjust khi count lệch
  )),
  amount numeric(14,2) not null,        -- Dương cho deposit/initial/positive adjust, âm cho withdraw/negative adjust
  balance_after numeric(14,2) not null, -- Số dư sau giao dịch (denormalized để query nhanh)
  reason_category text,                  -- Cho withdraw_other: 'utilities'|'rent'|'inventory'|'maintenance'|'other'
  description text,                      -- Free text note (max 500 chars)
  -- Liên kết với entity gốc (nếu có):
  cash_close_report_id uuid references public.cash_close_reports(id) on delete set null,
  cash_day_opening_id uuid references public.cash_day_openings(id) on delete set null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index safe_transactions_time_idx on public.safe_transactions(occurred_at desc);
create index safe_transactions_type_idx on public.safe_transactions(transaction_type, occurred_at desc);

-- CHECK: amount sign tương thích với transaction_type
alter table public.safe_transactions add constraint safe_transactions_amount_sign check (
  case transaction_type
    when 'initial_setup'   then amount >= 0
    when 'deposit_close'   then amount >= 0
    when 'withdraw_open'   then amount <= 0
    when 'withdraw_other'  then amount <= 0
    when 'adjustment'      then true  -- adjust có thể + hoặc -
    else false
  end
);
```

**`safe_counts`** — snapshot mệnh giá khi owner đếm thực tế:

```sql
create table public.safe_counts (
  id uuid primary key default gen_random_uuid(),
  counted_at timestamptz not null default now(),
  denominations_json jsonb not null default '{}'::jsonb,
  total_physical numeric(14,2) not null,         -- Tổng đếm được từ denominations
  expected_balance numeric(14,2) not null,       -- Snapshot balance_after từ safe_transactions tại thời điểm count
  difference numeric(14,2) not null,             -- = total_physical - expected_balance
  note text,
  counted_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index safe_counts_time_idx on public.safe_counts(counted_at desc);
```

### Modified tables

**`cash_close_reports`** — thêm liên kết:
```sql
alter table public.cash_close_reports
  add column if not exists safe_deposit_amount numeric(14,2) not null default 0,
  add column if not exists leave_for_next_day numeric(14,2) not null default 0;
-- safe_deposit_amount + leave_for_next_day = physical_cash (constraint optional)
```

**`cash_day_openings`** — thêm liên kết safe withdrawal:
```sql
alter table public.cash_day_openings
  add column if not exists safe_withdrawal_amount numeric(14,2) not null default 0,
  add column if not exists carried_amount numeric(14,2) not null default 0;
-- carried_amount = phần từ ngày cũ (carry-over)
-- safe_withdrawal_amount = phần rút từ sổ quỹ
-- opening_total = carried_amount + safe_withdrawal_amount (constraint optional)
```

### Seed data

**`app_settings`** thêm row `safe_withdraw_categories`:
```json
[
  { "key": "utilities",   "label": "Tiền điện / nước / mạng" },
  { "key": "rent",        "label": "Tiền thuê / dịch vụ" },
  { "key": "inventory",   "label": "Mua nguyên liệu lớn" },
  { "key": "maintenance", "label": "Sửa chữa / bảo trì" },
  { "key": "other",       "label": "Khác" }
]
```

### RLS

Owner only cho `safe_transactions` + `safe_counts`:
- Read: `app_role() = 'owner'`
- Write: chỉ qua security definer RPCs (giống pattern hiện tại — direct insert blocked)

Manager có insert được transaction `deposit_close` qua `finalize_cash_close_report` (function uses service definer + bypass RLS).

---

## RPCs

**6 functions mới**:

| RPC | Auth | Mục đích |
|-----|------|---------|
| `safe_balance_now()` returns numeric | owner+manager (xem) | Trả balance_after của transaction gần nhất |
| `safe_setup_initial(p_amount, p_note)` | owner | Tạo row `initial_setup` (chỉ chạy 1 lần) |
| `safe_withdraw_other(p_amount, p_category, p_description)` | owner | Insert row `withdraw_other`, validate balance ≥ amount |
| `safe_adjust(p_new_balance, p_note)` | owner | Insert `adjustment` với amount = new_balance - current; require non-empty note |
| `safe_count(p_denominations_json, p_note)` | owner | Validate denominations whitelist (giống cash_counts), insert safe_counts row, **KHÔNG tự adjust balance** — owner phải explicit `safe_adjust` nếu muốn fix |
| `safe_list_transactions(p_from date, p_to date, p_type text default null)` returns jsonb | owner | List transactions trong khoảng ngày, optional filter type |

**2 functions cập nhật**:

`finalize_cash_close_report(p_cash_count_id, p_leave_for_next_day default 0)`:
- Validate: 0 ≤ leave_for_next_day ≤ physical_cash
- Compute safe_deposit = physical_cash - leave_for_next_day
- Như cũ: insert/update cash_close_reports, snapshot từ cash_count
- **Mới**: nếu safe_deposit > 0, insert safe_transaction (`deposit_close`, amount = safe_deposit, link cash_close_report_id)
- Update `cash_close_reports.safe_deposit_amount` + `leave_for_next_day`

`save_cash_day_opening(p_payload jsonb)` — payload thêm `safe_withdrawal_amount`:
- Validate: 0 ≤ safe_withdrawal ≤ current safe balance
- Compute carried_amount = opening_total - safe_withdrawal
- Insert/update cash_day_openings như cũ, populate 2 fields mới
- **Mới**: nếu safe_withdrawal > 0, insert safe_transaction (`withdraw_open`, amount = -safe_withdrawal, link cash_day_opening_id)

### Audit triggers

Áp dụng `_audit_row_change()` cho `safe_transactions` + `safe_counts` (đã có pattern). Ghi vào `audit_log` table sẵn có.

---

## Frontend

### Navigation

`src/features/navigation.ts`:
```ts
{ key: "safe", label: "Sổ quỹ", icon: PiggyBank, roles: ["owner"] }
```
DEFAULT_SIDEBAR_BY_ROLE owner thêm "safe" vào array.
`src/shared/icons.tsx` — thêm `PiggyBank` re-export.

### Components mới (`src/features/safe/`)

```
safe-panel.tsx           — Main view, render khi activeView='safe'
safe-balance-card.tsx    — Card hiển thị balance hiện tại + meta (last update, transaction count)
safe-history-table.tsx   — Bảng list transactions với filter
withdraw-modal.tsx       — Form rút khác (amount + category dropdown + description)
adjust-modal.tsx         — Form adjust (new_balance + note bắt buộc)
count-modal.tsx          — Form count denomination + show discrepancy
```

### SafePanel layout (text)

```
┌──────────────────────────────────────────────┐
│  [PiggyBank] SỔ QUỸ                          │
│                                              │
│  ┌──────────────────────┬──────────────────┐ │
│  │ SỐ DƯ HIỆN TẠI       │ HÀNH ĐỘNG        │ │
│  │ 12.345.000 ₫         │ [Rút khác]        │ │
│  │ Cập nhật: 5 phút     │ [Đếm sổ quỹ]      │ │
│  │ Total: 47 giao dịch  │ [Điều chỉnh]      │ │
│  └──────────────────────┴──────────────────┘ │
│                                              │
│  LỊCH SỬ GIAO DỊCH                           │
│  Filter: [All ▼] [Từ ngày] [Đến ngày]        │
│  ┌─────────┬──────┬────────┬──────────────┐  │
│  │ Thời gian│ Loại │ Số tiền│ Số dư sau    │  │
│  ├─────────┼──────┼────────┼──────────────┤  │
│  │ Hôm qua │ Nạp  │ +1.5M  │ 12.345.000   │  │
│  │ 22:30   │chốt két ngày 2026-05-04       │  │
│  ├─────────┼──────┼────────┼──────────────┤  │
│  │ Hôm qua │Rút   │ -300k  │ 10.845.000   │  │
│  │ 18:00   │mở két ngày 2026-05-04         │  │
│  ├─────────┼──────┼────────┼──────────────┤  │
│  │ ...                                     │  │
│  └─────────────────────────────────────────┘  │
└──────────────────────────────────────────────┘
```

Empty state khi balance = 0 + chưa có transaction:
> "Sổ quỹ chưa có dư. Bấm 'Điều chỉnh' để nhập số dư hiện tại."

### Cash close modal (sửa `cash-panel.tsx`)

Thêm field "Để lại cho ngày mai" trong section đối soát/chốt két:
```
[Tổng tiền vật lý: 3.000.000 ₫]
[Để lại cho ngày mai: ____ ₫]   ← input default 0
[Nạp sổ quỹ: 3.000.000 ₫]      ← computed = physical - leave (read-only)
[Chốt két & nạp sổ quỹ]
```

### Opening cash modal (sửa `opening-cash-modal.tsx`)

Thêm checkbox + amount field "Rút từ sổ quỹ":
```
[Đếm mệnh giá tiền đầu ngày: ...]
[Tổng: 500.000 ₫]
☑ Bao gồm tiền rút từ sổ quỹ: ____ ₫    ← input
   Phần tiền lẻ từ ngày hôm qua: 200.000 ₫ (tính = total - safe_withdraw)
[Lưu]
```

3 scenarios mapping:
- **1. Carry-over only**: `safe_withdrawal = 0`, opening_total = carried_amount
- **2. Withdraw from safe**: `safe_withdrawal = opening_total`, carried_amount = 0
- **3. Combine**: 0 < safe_withdrawal < opening_total, carried_amount = opening_total - safe_withdrawal

### Data layer (`src/lib/data/safe.ts`)

```ts
export async function loadSafeBalance(supabase): Promise<number>
export async function loadSafeTransactions(supabase, fromDate?, toDate?, type?): Promise<SafeTransaction[]>
export async function setupSafeInitial(supabase, amount, note): Promise<void>
export async function withdrawSafeOther(supabase, amount, category, description): Promise<SafeTransaction>
export async function adjustSafe(supabase, newBalance, note): Promise<SafeTransaction>
export async function countSafe(supabase, denominations, note): Promise<SafeCount>
```

### React Query hooks (`src/hooks/queries/use-safe-queries.ts`)

```ts
useSafeBalanceQuery(supabase, enabled)         // staleTime 30s
useSafeTransactionsQuery(supabase, range, enabled)  // staleTime 1min
```

`queryKeys.safe.balance()`, `queryKeys.safe.transactions(range)`. Realtime invalidate trên `safe_transactions` table.

### Types (`src/lib/types.ts`)

```ts
export type SafeTransaction = {
  id: string;
  occurred_at: string;
  transaction_type: 'initial_setup' | 'deposit_close' | 'withdraw_open' | 'withdraw_other' | 'adjustment';
  amount: number;
  balance_after: number;
  reason_category?: string | null;
  description?: string | null;
  cash_close_report_id?: string | null;
  cash_day_opening_id?: string | null;
  created_by?: string | null;
  created_at: string;
};

export type SafeCount = {
  id: string;
  counted_at: string;
  denominations_json: Record<string, number>;
  total_physical: number;
  expected_balance: number;
  difference: number;
  note?: string | null;
  counted_by?: string | null;
};

export const SAFE_WITHDRAW_CATEGORIES = [
  { key: "utilities",   label: "Tiền điện / nước / mạng" },
  { key: "rent",        label: "Tiền thuê / dịch vụ" },
  { key: "inventory",   label: "Mua nguyên liệu lớn" },
  { key: "maintenance", label: "Sửa chữa / bảo trì" },
  { key: "other",       label: "Khác" }
] as const;
```

---

## Critical files

**New:**
- `database/004_seed.sql` — append safe_withdraw_categories app_settings row
- `src/features/safe/safe-panel.tsx`
- `src/features/safe/safe-balance-card.tsx`
- `src/features/safe/safe-history-table.tsx`
- `src/features/safe/withdraw-modal.tsx`
- `src/features/safe/adjust-modal.tsx`
- `src/features/safe/count-modal.tsx`
- `src/lib/data/safe.ts`
- `src/hooks/queries/use-safe-queries.ts`

**Modified:**
- `database/001_schema.sql` — 2 tables mới + 4 columns thêm + CHECK constraints
- `database/002_functions.sql` — 6 RPCs mới + sửa 2 existing (finalize_cash_close_report, save_cash_day_opening) + 2 audit triggers mới
- `database/003_rls.sql` — RLS policies cho safe_transactions + safe_counts (owner only)
- `database/004_seed.sql` — safe_withdraw_categories
- `src/lib/types.ts` — SafeTransaction, SafeCount types + extend CashCloseReport, CashDayOpening
- `src/lib/data/index.ts` — export safe.ts
- `src/lib/data/cash.ts` — extend saveCashDayOpening payload với safe_withdrawal_amount
- `src/lib/data/reports.ts` — extend finalizeCashCloseReport payload với leave_for_next_day
- `src/hooks/queries/index.ts` — export safe queries
- `src/hooks/queries/keys.ts` — thêm safe keys
- `src/hooks/use-realtime-invalidate.ts` — subscribe safe_transactions table
- `src/features/navigation.ts` — thêm ViewKey 'safe'
- `src/shared/icons.tsx` — re-export PiggyBank, BanknoteArrowDown, BanknoteArrowUp
- `src/features/cash/cash-panel.tsx` — UI field "Để lại cho ngày mai" + truyền vào finalize
- `src/features/cash/opening-cash-modal.tsx` — UI "Rút từ sổ quỹ" + truyền vào save_cash_day_opening
- `src/app/page.tsx` — render `<SafePanel>` khi activeView='safe'
- `src/app/styles.css` — styling SafePanel
- `CHANGELOG.md` — entry v2.2.0

---

## Implementation order (5 commits)

1. **`feat(db): sổ quỹ schema + RPCs + RLS`**
   - 001/002/003/004 SQL changes
   - Test bằng SQL Editor: setup initial → withdraw_other → adjust → count

2. **`feat(safe): data layer + React Query hooks`**
   - types.ts, data/safe.ts, hooks/queries/use-safe-queries.ts
   - Pure code, không UI

3. **`feat(safe): SafePanel + balance card + history table + nav tab`**
   - 4 components mới + navigation.ts + page.tsx routing
   - Render SafePanel với balance + history bảng. Chưa modal.

4. **`feat(safe): modals (withdraw + adjust + count)`**
   - 3 modal files
   - SafePanel actions buttons gọi modals

5. **`feat(cash): tích hợp safe vào chốt két + mở két ngày mới`**
   - cash-panel.tsx field "Để lại cho ngày mai"
   - opening-cash-modal.tsx field "Rút từ sổ quỹ"
   - 3 scenarios opening cash work

6. **`chore(release): bump v2.1.0 → v2.2.0 + CHANGELOG`** (nếu user muốn release tag)

---

## Verification

### After commit 1 (SQL)
```sql
-- Setup initial
select public.safe_setup_initial(5000000, 'Chuyển từ két két cá nhân');
select public.safe_balance_now();  -- phải = 5000000

-- Withdraw other
select public.safe_withdraw_other(200000, 'utilities', 'Tiền điện tháng 5');
select public.safe_balance_now();  -- phải = 4800000

-- Adjust
select public.safe_adjust(4750000, 'Bù tiền lẫn lộn');
select public.safe_balance_now();  -- phải = 4750000

-- Count (just snapshot, không adjust)
select public.safe_count('{"100000": 47, "50000": 1}'::jsonb, 'Đếm cuối tháng');
select * from public.safe_counts order by counted_at desc limit 1;
-- difference phải = (47*100000 + 1*50000) - 4750000 = 4750000 - 4750000 = 0

-- List
select public.safe_list_transactions('2026-05-01', '2026-05-31');
```

### After commit 5 (full integration)
- [ ] Owner login → sidebar có tab "Sổ quỹ"
- [ ] Tab Sổ quỹ → balance card + bảng lịch sử (rỗng)
- [ ] Bấm "Điều chỉnh" → nhập 5M + note "Initial" → save → balance = 5M
- [ ] Tab Cash → chốt két với physical = 3M, để lại = 500k → save → toast → tab Sổ quỹ thấy +2.5M (deposit_close)
- [ ] Tab Cash → đổi ngày sang hôm sau → mở két → tick "Rút từ sổ quỹ 1M" → save → tab Sổ quỹ thấy -1M (withdraw_open)
- [ ] Tab Sổ quỹ → "Rút khác" → 200k + category "utilities" + note → save → balance giảm
- [ ] Tab Sổ quỹ → "Đếm sổ quỹ" → nhập mệnh giá thực → show difference (vd: lệch -50k) → owner choose to adjust
- [ ] Manager login → sidebar KHÔNG có tab Sổ quỹ (vì owner-only)
- [ ] Manager chốt két → trigger insert deposit_close transaction (qua security definer RPC) → owner thấy update
- [ ] Realtime: 2 tab → tab 1 withdraw → tab 2 update <2s

### Audit
- [ ] `select * from audit_log where entity_type = 'safe_transactions' order by occurred_at desc` thấy diff_json đầy đủ
- [ ] CHECK constraint reject negative balance: `select safe_withdraw_other(99999999, 'other', 'test')` → exception "Balance không đủ"

---

## Out of scope (Phase 2 sau)

- Export CSV / in báo cáo sổ quỹ (chỉ xem bảng phase này)
- Đồng bộ với KiotViet voucher/coupon
- Multiple safes (chỉ 1 safe cho 1 cửa hàng)
- Multi-currency
- Email notification khi balance < threshold
- Bank deposit transaction type (hiện tại chỉ withdraw_other với category)
- Auto-recurring withdraw (vd tiền thuê hàng tháng tự động trừ)
- Mobile-specific UI tối ưu (giữ pattern hiện có với responsive đã làm v2.1)

---

## Risks + mitigation

| Risk | Mitigation |
|------|------------|
| Insert race condition (2 owner cùng rút → balance_after sai) | Dùng row-level lock trong RPC: `select balance_after from safe_transactions order by occurred_at desc limit 1 for update` (advisory lock hoặc table lock) |
| Owner adjust để gian lận | audit_log ghi diff + actor; thêm CHECK note bắt buộc cho adjustment |
| Balance underflow (rút nhiều hơn có) | RPC `safe_withdraw_other` + `withdraw_open` validate balance ≥ amount, raise exception |
| Cash close ngày cũ → safe deposit nhưng user chưa muốn → khó undo | Phase 2 thêm "Hoàn tác giao dịch" RPC. Hiện tại owner phải `safe_adjust` thủ công |
| Manager chốt két nhưng không biết deposit | UI cash-panel hiển thị thông báo "Đã nạp X vào sổ quỹ" sau khi chốt két thành công |

---

## Acceptance criteria

- ✅ Owner có tab "Sổ quỹ" với balance + history
- ✅ Chốt két cuối ngày tự động deposit dư vào sổ quỹ
- ✅ Mở ngày mới có 3 scenarios (carry / withdraw safe / combine)
- ✅ Owner rút sổ quỹ cho mục đích khác với 5 categories cố định
- ✅ Owner adjust khi count lệch
- ✅ Audit log ghi mọi thao tác
- ✅ RLS owner-only enforced
- ✅ Build pass (tsc + next build)
