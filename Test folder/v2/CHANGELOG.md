# Changelog

All notable changes to Chill Manager v2.

Format follows [Keep a Changelog](https://keepachangelog.com/), versioning [Semantic Versioning](https://semver.org/).

---

## [2.2.0] — 2026-05-04

### Added
- **Sổ quỹ (cash safe)** — owner-only ledger riêng biệt với két ca:
  - 2 tables mới (`safe_transactions` + `safe_counts`) với 5 transaction types: initial_setup / deposit_close / withdraw_open / withdraw_other / adjustment.
  - 6 RPCs mới (`safe_balance_now`, `safe_setup_initial`, `safe_withdraw_other`, `safe_adjust`, `safe_count`, `safe_list_transactions`) — security definer + role-check. Row-level lock chống race condition.
  - Sidebar tab "Sổ quỹ" (icon PiggyBank) — owner only.
  - Balance card + history table với filter (date range + transaction type).
  - 3 modals: Withdraw (5 categories cố định) / Adjust (note bắt buộc ≥5 chars) / Count (snapshot mệnh giá, KHÔNG auto-adjust).
  - Audit triggers cho cả 2 bảng → `audit_log`.
- **Chốt két → tự động nạp sổ quỹ**: field "Để lại cho ngày mai" trong cash-panel. Default 0 = nạp toàn bộ dư vào sổ quỹ. RPC `finalize_cash_close_report` accept `p_leave_for_next_day`.
- **Mở két ngày mới — 3 scenarios**: opening cash modal có block "Rút từ sổ quỹ" (owner only). Carry-over only / Withdraw safe / Combine.
  - `cash_close_reports` thêm cột `safe_deposit_amount`, `leave_for_next_day`.
  - `cash_day_openings` thêm cột `carried_amount`, `safe_withdrawal_amount`.

### Bundle impact
- 6 lucide icons mới (`PiggyBank`, `ArrowDownToLine`, `ArrowUpFromLine`, `Calculator`, `SlidersHorizontal`, `Wallet2`).
- SafePanel dynamic import (~code-split).

### Database migration
- Apply lại `database/001_schema.sql` → `004_seed.sql` (idempotent).
- Hoặc apply chỉ delta: tables mới + columns mới + RPCs trong `002_functions.sql` (tất cả `create or replace`).

### Spec
- Full design tại `docs/specs/2026-05-04-so-quy-design.md`.

---

## [2.1.0] — 2026-05-04

### Added
- **Settings → Mẫu chi phí nhanh**: Owner/manager CRUD UI cho expense templates. Tạo, sửa inline, ẩn/hiện (soft delete), xem cả templates inactive. Reuse RLS owner/manager direct.
- **Settings → Quản lý tài khoản**: Admin form tạo + sửa + vô hiệu hóa accounts. API routes mới `POST /api/users`, `PATCH /api/users/[id]`, `DELETE /api/users/[id]`. Generate password ngẫu nhiên 12 ký tự. Toggle role + active/disabled inline.
- **Mobile-first navigation**: Sidebar nav + header buttons dùng [lucide-react](https://lucide.dev) icons. Trên mobile <760px, ẩn label trong tight buttons (header refresh, sidebar đăng xuất). Spinning indicator cho refresh icon khi đang sync.
- **CHANGELOG.md** này.

### Fixed
- **Cash close formula overflow**: Khi số tiền POS lớn (~9 triệu) cộng nhiều operand, công thức đối soát tràn ra ngoài card. Thêm `flex-wrap`, `clamp()` font-size, mobile stack vertical.

### Changed
- **Bỏ disclaimer kiến trúc** khỏi page header ("Frontend-only, Supabase RLS là lớp bảo mật chính. Không dùng service role trong app." + "Trạm điều phối dữ liệu" eyebrow). Giữ lại text hữu ích cho người dùng.
- `layout.tsx` metadata description: "Frontend-only operations dashboard" → "Hệ thống quản lý vận hành Chill Coffee Garden"
- Sidebar nav buttons: thêm icon bên trái label.
- Header refresh button: icon `RefreshCw` (animate khi syncing) thay text-only.
- Mobile menu hamburger: icon `Menu` thay ký tự `☰`.

### Dependencies
- Added: `lucide-react@^1.14.0` (~10 KB sau tree-shake, 25 icons re-export trong `src/shared/icons.tsx`)

### Bundle impact
- Page `/`: 83.2 → 85.1 kB first-load JS (+1.9 kB cho icons)
- API routes mới: `/api/users`, `/api/users/[id]` (~138 B mỗi route)

---

## [2.0.0] — 2026-05-03

Initial baseline — security hardening + frontend refactor + KiotViet direct integration.

### Added
- **Database** (4 SQL files: 001-004 + 000_reset.sql):
  - 25 tables, 29 RPC functions, 50+ RLS policies, 8 audit triggers
  - 10 CHECK constraints chống numeric âm/overflow
  - `audit_log` + `pos_sync_attempts` cho rate limit + audit trail
- **Frontend refactor**: Next.js 15 + React 19 + TanStack Query 5
  - `page.tsx` 575 → orchestration layer; tách feature-by-feature trong `src/features/`
  - 12 useQuery hooks thay Promise.all blast
  - Realtime invalidate cho 5 bảng
  - Validation client-side mirror SQL CHECK
- **KiotViet direct integration**: replace n8n/Edge Function bằng Next.js API routes
  - `src/lib/kiotviet/`: auth + client + transform + sync orchestrator
  - `/api/kiotviet/sync` (manual + cron polling), `/api/kiotviet/config`, `/api/kiotviet/webhook/[secret]`
  - Settings UI cho credentials + webhook URL display
- **Cash management UX**:
  - Cash History section: list mọi cash_counts trong ngày (spot_audit + shift_close), expandable detail
  - Manual POS input: override khi KiotViet API offline
  - Owner edit affordance: nút "Sửa tiền đầu ngày" rõ ràng
- **Docker setup**: docker-compose.yml với 8 env vars + healthcheck + log rotation. Tương thích Dockge.
- **Documentation**: `dockge-setup.md`, `kiotviet-polling.md`, `apply-database.md`, `deploy-plan.md`, `README-RUN-FIRST.md`

### Removed
- `supabase/functions/trigger-pos-sync/` (Edge Function n8n bridge)
- `docs/n8n-ingest.md`
- `getFunctionErrorMessage()` (dead code)

### Security
- HMAC sign `${timestamp}.${body}` (chống replay) cho legacy endpoints
- Per-user rate limit 6/min (owner 12/min) qua `pos_sync_attempts`
- Service role chỉ dùng server-side, never exposed to browser
- RLS thắt chặt cho `employee_viewer` (chỉ qua `expense_history_permissions`)

### Performance
- `next.config.mjs` `output: 'standalone'` cho Docker
- 5 dynamic imports (Checklist, Wizard, Pivot, Settings, Reports)
- TanStack Query stale time 30s-5min theo domain
- React Query DevTools cho dev

---

## [1.x] — Internal MVP

(Pre-v2 — không tracked. Đã rebuild từ đầu trong v2.0.0.)
