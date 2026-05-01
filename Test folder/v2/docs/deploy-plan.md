# Deploy / Rollout Plan — Chill Manager v2 (P0+P1+P2)

Plan này áp dụng sau khi đã hoàn tất 16 task P0+P1+P2 trong code. Phạm vi: đưa thay đổi từ working copy lên staging → production.

## Tóm tắt thành phần thay đổi

| Component | File / Object | Risk |
|---|---|---|
| Database schema | `database/001_schema.sql` (+pos_sync_attempts, audit_log, 9 CHECK constraints) | **HIGH** (CHECK có thể fail nếu data cũ vi phạm) |
| Database functions | `database/002_functions.sql` (numeric guards, denomination whitelist, length checks, audit triggers) | MEDIUM |
| Database RLS | `database/003_rls.sql` (employee_viewer tightened, new policies) | MEDIUM (đổi behaviour viewer) |
| Database seed | `database/004_seed.sql` (xoá default `n8n-local`) | LOW (cần manual insert thay thế) |
| Edge Function | `supabase/functions/trigger-pos-sync/index.ts` (CORS, rate limit, HMAC `${ts}.${body}`) | HIGH (n8n phải update đồng bộ) |
| Frontend | Next.js refactor + TanStack Query + middleware + lazy modal | LOW (backward compatible) |
| Docs | `docs/n8n-ingest.md` HMAC bắt buộc | LOW |

## Pre-flight checklist

Chạy trên **staging trước** rồi mới production. Backup DB trước khi bắt đầu.

### 1. Backup
```bash
pg_dump -h <host> -U postgres -Fc <db> > pre-deploy-$(date +%Y%m%d-%H%M).dump
```

### 2. Data integrity check (bắt buộc trước khi apply CHECK constraints)
Chạy 9 query này. Nếu bất kỳ row nào trả về > 0 → dọn data trước, không deploy.

```sql
-- 1. employees.hourly_rate
select count(*) as bad_employees from public.employees where hourly_rate < 0 or hourly_rate > 10000000;

-- 2. expenses.amount/quantity/unit_price
select count(*) as bad_expenses from public.expenses
where amount < 0 or amount > 1000000000 or quantity < 0 or quantity > 99999 or unit_price < 0;

-- 3. shift_payroll_records
select count(*) as bad_payroll from public.shift_payroll_records
where base_pay < 0 or total_pay < 0 or allowance_amount < 0 or hourly_rate < 0;

-- 4. sales_orders
select count(*) as bad_orders from public.sales_orders
where net_amount < 0 or total_payment < 0 or gross_amount < 0 or discount_amount < 0;

-- 5. sales_order_items
select count(*) as bad_items from public.sales_order_items
where quantity < 0 or unit_price < 0 or line_total < 0 or discount_amount < 0;

-- 6. cash_counts
select count(*) as bad_counts from public.cash_counts
where total_physical < 0 or pos_total < 0 or pos_cash_total < 0 or pos_non_cash_total < 0;

-- 7. cash_day_openings
select count(*) as bad_openings from public.cash_day_openings where opening_total < 0;

-- 8. denomination data ngoài whitelist 1k-500k
select id, denominations_json from public.cash_day_openings
where exists (
  select 1 from jsonb_each_text(denominations_json) as d(k, v)
  where k !~ '^(1000|2000|5000|10000|20000|50000|100000|200000|500000)$' or v::numeric > 10000
);

-- 9. integration_clients còn dùng default secret (ví hash check khó, nên chỉ verify thủ công sau khi xoá seed)
select id, client_id, is_active, last_used_at from public.integration_clients;
```

### 3. Pre-flight checklist khác
- [ ] Đã có file backup `.dump`
- [ ] 8/8 data integrity query trả 0
- [ ] Đã thông báo owner: viewer mất quyền xem expenses 2 ngày gần nhất nếu chưa có `expense_history_permissions`
- [ ] Đã thông báo team n8n: workflow phải update HMAC verify
- [ ] Đã chuẩn bị secret `N8N_POS_SYNC_SECRET` mới nếu rotate
- [ ] Đã có domain whitelist cho `APP_ALLOWED_ORIGINS` (vd: `https://chill.example.com,http://localhost:3009`)

---

## Stage 1 — Database migration

### Order of execution
Apply theo thứ tự **001 → 002 → 003 → 004**. Mỗi file là idempotent.

```bash
psql -h <host> -U postgres -d <db> -f database/001_schema.sql
psql -h <host> -U postgres -d <db> -f database/002_functions.sql
psql -h <host> -U postgres -d <db> -f database/003_rls.sql
psql -h <host> -U postgres -d <db> -f database/004_seed.sql
```

### Sau khi apply 001 (mới: pos_sync_attempts, audit_log, CHECK constraints)
```sql
-- Verify bảng mới
select count(*) from public.pos_sync_attempts;  -- 0
select count(*) from public.audit_log;            -- 0

-- Verify CHECK constraint đã đăng ký
select conname from pg_constraint
where conname in (
  'employees_hourly_rate_check', 'expenses_amount_check', 'expenses_quantity_check',
  'expenses_unit_price_check', 'payroll_pay_check', 'sales_orders_amount_check',
  'sales_items_quantity_check', 'sales_items_price_check', 'cash_counts_total_check',
  'cash_opening_total_check'
);
-- Phải trả 10 dòng
```

### Sau khi apply 002 (function guards + audit triggers)
```sql
-- Test ingest_kiotviet_batch reject âm
select public.ingest_kiotviet_batch(jsonb_build_object(
  'client_id','test','client_secret','test',
  'orders', jsonb_build_array(jsonb_build_object(
    'id','t1','invoice_details', jsonb_build_array(jsonb_build_object('quantity',-1,'unit_price',1000)),
    'payments', jsonb_build_array()))));
-- Phải lỗi 'Integration client không hợp lệ' (validate trước, không cần row trong table)

-- Test denomination whitelist
select public.save_cash_day_opening(jsonb_build_object(
  'business_date', current_date, 'denominations_json', '{"99999999":1}'::jsonb));
-- Phải lỗi 'denominations_json: chỉ chấp nhận mệnh giá VND 1k-500k...'

-- Test compute_cash_theory tương lai
select public.compute_cash_theory(current_date, now() + interval '1 hour', 0);
-- Phải lỗi 'p_counted_at không được trong tương lai'

-- Test create_expense length
select public.create_expense(jsonb_build_object(
  'business_date', current_date, 'description', repeat('x', 600), 'amount', 1000));
-- Phải lỗi 'description vượt 500 ký tự'

-- Verify 8 audit trigger
select tgname from pg_trigger where tgname like 'audit_%' order by 1;
-- Phải có: audit_app_settings, audit_cash_close, audit_cash_opening, audit_employee_accounts,
-- audit_employees, audit_expenses, audit_integration_clients, audit_payroll
```

### Sau khi apply 003 (RLS)
```sql
-- Verify bảng mới có RLS
select tablename, rowsecurity from pg_tables
where schemaname = 'public' and tablename in ('pos_sync_attempts', 'audit_log');
-- Cả hai phải rowsecurity = true

-- Verify policy mới
select polname from pg_policy where polname like 'pos_sync_attempts_%' or polname like 'audit_log_%';
-- Phải có 4 policy

-- Verify expenses_staff_read đã update
select pg_get_expr(polqual, polrelid) from pg_policy
where polname = 'expenses_staff_read';
-- KHÔNG được chứa 'current_date - 2'
```

### Sau khi apply 004 (seed)
```sql
-- Verify default n8n-local seed đã không tồn tại HOẶC đã rotate
select client_id, is_active, last_used_at from public.integration_clients;
-- Nếu còn 'n8n-local' với is_active=false thì OK; nếu là true phải đảm bảo secret đã thay
```

### Setup integration_clients cho n8n (manual sau khi xoá seed)
```sql
-- 1. Generate secret 32 byte trong shell:
-- openssl rand -base64 32
-- 2. Insert
insert into public.integration_clients (client_id, client_secret_hash, name, is_active)
values ('n8n-local', crypt('<paste-secret-from-step-1>', gen_salt('bf')), 'n8n production', true);
-- 3. Lưu secret vào n8n env: N8N_CLIENT_SECRET=<secret-step-1>
```

### Bật Realtime publication (cho P2.4)
```sql
-- Cho phép realtime trên 4 bảng đang subscribe trong useRealtimeInvalidate
alter publication supabase_realtime add table public.sales_sync_runs;
alter publication supabase_realtime add table public.cash_close_reports;
alter publication supabase_realtime add table public.handover_tasks;
alter publication supabase_realtime add table public.expenses;

-- Verify
select * from pg_publication_tables where pubname = 'supabase_realtime'
and tablename in ('sales_sync_runs', 'cash_close_reports', 'handover_tasks', 'expenses');
```

### Rollback Stage 1
```sql
-- Roll back từng bảng (ngược thứ tự apply)
-- ⚠️ Chỉ làm nếu staging fail; production rollback từ pg_dump nhanh hơn

-- 1. Drop CHECK constraints
alter table public.employees drop constraint if exists employees_hourly_rate_check;
-- (lặp cho 9 constraint còn lại)

-- 2. Drop audit triggers
drop trigger if exists audit_payroll on public.shift_payroll_records;
-- (lặp cho 7 trigger còn lại)
drop function if exists public._audit_row_change();

-- 3. Drop bảng mới
drop table if exists public.audit_log cascade;
drop table if exists public.pos_sync_attempts cascade;

-- 4. Restore function bản cũ: pg_restore từ pre-deploy dump
pg_restore -h <host> -U postgres -d <db> -t public.ingest_kiotviet_batch \
  -t public.save_cash_day_opening -t public.save_cash_count \
  -t public.compute_cash_theory -t public.create_expense \
  --section=POST-DATA --clean pre-deploy-*.dump

-- 5. Restore RLS expenses_staff_read bản cũ (manual)
drop policy if exists expenses_staff_read on public.expenses;
create policy expenses_staff_read on public.expenses for select to authenticated using (
  public.app_is_staff_or_above()
  or (public.app_role() = 'employee_viewer' and (
    business_date >= current_date - 2
    or exists (select 1 from public.employee_accounts ea
      join public.expense_history_permissions p on p.employee_id = ea.employee_id
      where ea.auth_user_id = auth.uid() and expenses.business_date between p.date_from and p.date_to)
  ))
);
```

---

## Stage 2 — Edge Function deploy

### Set environment variables (Supabase project)
```bash
supabase secrets set --project-ref <ref> \
  N8N_POS_SYNC_WEBHOOK_URL=https://n8n.example.com/webhook/chill-pos-sync \
  N8N_POS_SYNC_SECRET=<long-random-secret-shared-with-n8n> \
  POS_SYNC_COOLDOWN_SECONDS=300 \
  APP_ALLOWED_ORIGINS=https://chill.example.com,http://localhost:3009
```

### Deploy
```bash
cd "<repo>/supabase"
supabase functions deploy trigger-pos-sync --project-ref <ref>
```

### Smoke test (staging)
```bash
# Test 1: từ chối thiếu Authorization
curl -X POST https://<ref>.supabase.co/functions/v1/trigger-pos-sync \
  -H "Content-Type: application/json" \
  -d '{}'
# Mong đợi: 401 "Thiếu Authorization Bearer token."

# Test 2: từ chối origin lạ (CORS)
curl -X OPTIONS https://<ref>.supabase.co/functions/v1/trigger-pos-sync \
  -H "Origin: https://evil.com" -i | grep -i access-control-allow-origin
# Mong đợi: header Allow-Origin trống, KHÔNG phải https://evil.com

# Test 3: Login user → call function. Lặp 7 lần liên tiếp lần thứ 7 phải 429
SUPA_TOKEN=$(curl -s -X POST "$SUPA_URL/auth/v1/token?grant_type=password" \
  -H "apikey: $ANON" -H "Content-Type: application/json" \
  -d '{"email":"owner@test","password":"..."}' | jq -r .access_token)
for i in {1..7}; do
  curl -X POST https://<ref>.supabase.co/functions/v1/trigger-pos-sync \
    -H "Authorization: Bearer $SUPA_TOKEN" \
    -H "Content-Type: application/json" \
    -H "Origin: http://localhost:3009" \
    -d '{"business_date":"2026-05-01","force":true,"reason":"smoke"}'
  echo
done
# Mong đợi: 6 response 200/skipped, lần thứ 7 nhận 429

# Test 4: verify pos_sync_attempts log
psql ... -c "select count(*), max(requested_at) from public.pos_sync_attempts where reason='smoke';"
```

### Rollback Stage 2
```bash
# Re-deploy version cũ từ git
git checkout <previous-tag> -- supabase/functions/trigger-pos-sync/index.ts
supabase functions deploy trigger-pos-sync --project-ref <ref>
git checkout HEAD -- supabase/functions/trigger-pos-sync/index.ts
```

---

## Stage 3 — n8n workflow update

⚠️ **Phải làm cùng lúc với Stage 2** (HMAC algorithm đổi từ `body` thành `${ts}.${body}` — không backward compat).

### Steps
1. Mở workflow `chill-pos-sync` trong n8n
2. Thêm Code node ngay sau Webhook Trigger với code mẫu trong `docs/n8n-ingest.md` mục 2 (HMAC verify + timestamp check)
3. Set env trong n8n:
   - `N8N_POS_SYNC_SECRET` = giống edge function
   - `N8N_CLIENT_ID` = `n8n-local`
   - `N8N_CLIENT_SECRET` = secret đã insert ở Stage 1 manual
4. Save và activate workflow
5. Smoke test:
   - Bấm "Làm mới" trên app → n8n nhận signature, log "ok"
   - `curl -X POST <n8n-webhook-url>` không có header → n8n từ chối
   - Edit body 1 byte sau khi sign → từ chối

### Rollback Stage 3
- Disable Code node verify HMAC tạm thời (nếu Stage 2 đã rollback)
- Revert Stage 2 trước khi rollback Stage 3

---

## Stage 4 — Frontend deploy

### Build & test local
```bash
cd "<repo>"
npm install                                    # cài @tanstack/react-query
npm run build                                  # phải xanh, đã verify
npm run dev                                    # smoke test local trước
```

### Set production env (Vercel/host)
```
NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
NEXT_PUBLIC_APP_URL=https://chill.example.com
```

### Deploy
- Vercel: `vercel --prod` hoặc auto-deploy theo branch
- Self-host: `npm run build && pm2 restart chill-manager`
- Docker: `docker build -t chill-v2 . && docker compose up -d`

### Smoke test sau deploy
- [ ] Login owner/manager/staff/viewer trên domain prod
- [ ] Truy cập từng tab: dashboard / expenses / shifts / cash / reports / pivot / settings
- [ ] Tạo 1 expense → thấy ngay trong "Lịch sử ngày" (realtime invalidate)
- [ ] Check-in 1 employee → kiểm `audit_log`: `select * from audit_log where action like 'shift%' order by occurred_at desc limit 1;`
- [ ] Bấm "Làm mới" → n8n nhận webhook → POS sync xong dashboard tự update (realtime)
- [ ] DevTools Network: chuyển Pivot → Dashboard → Pivot → Dashboard không refetch nếu chưa stale
- [ ] DevTools Network: mở `End-of-day wizard` → có chunk JS riêng được load
- [ ] Login viewer chưa có expense permission → tab `Chi phí` empty (đã tighten RLS)

### Rollback Stage 4
- Vercel: revert deployment qua dashboard hoặc `vercel rollback`
- Self-host: `git checkout <previous-tag> && npm run build && pm2 restart`

---

## Production cutover

### Sequence (đề xuất, 1 buổi tối)

| Time | Action | Owner |
|---|---|---|
| 22:00 | Backup prod DB | DevOps |
| 22:05 | Run pre-flight integrity queries trên prod | DevOps |
| 22:10 | Apply 001 → 002 → 003 → 004 SQL | DevOps |
| 22:30 | Verify CHECK + RLS + functions theo Stage 1 | DevOps |
| 22:35 | Bật `supabase_realtime` publication | DevOps |
| 22:40 | Manual insert integration_clients với secret mới | Dev/Owner |
| 22:45 | Set Edge Function env vars (APP_ALLOWED_ORIGINS, secret rotate) | DevOps |
| 22:50 | Deploy Edge Function | DevOps |
| 22:55 | Update n8n workflow: HMAC Code node + env secret mới | Dev |
| 23:00 | Smoke test Edge + n8n end-to-end | Dev |
| 23:10 | Deploy frontend prod | DevOps |
| 23:15 | Smoke test frontend full checklist | Dev |
| 23:30 | Notify users đã update | PM |

### Communication
**Trước cutover (24h)**:
- Email/Slack cho owner: "Tối nay 22-23h cập nhật bảo mật. Ứng dụng có thể chậm 1-2 phút."
- Heads-up cho viewer accounts: "Quyền xem chi phí thay đổi. Nếu sau cập nhật không thấy chi phí, liên hệ owner cấp permission."

**Sau cutover**:
- Confirm tới team: deploy thành công, các thay đổi chính
- Document version mới trong CHANGELOG

---

## Monitoring sau deploy (24-48h)

### Metrics cần theo dõi

```sql
-- 1. Audit log sức khoẻ — phải có row khi user thao tác
select date_trunc('hour', occurred_at) as hour, action, count(*)
from public.audit_log
where occurred_at > now() - interval '24 hours'
group by 1, 2 order by 1 desc;

-- 2. Pos sync attempts — phát hiện spam/abuse
select user_id, count(*) as attempts, max(requested_at) as last
from public.pos_sync_attempts
where requested_at > now() - interval '24 hours'
group by user_id
having count(*) > 50
order by attempts desc;

-- 3. Sales sync runs — không có status 'failed' liên tiếp
select status, count(*), max(finished_at)
from public.sales_sync_runs
where started_at > now() - interval '24 hours'
group by status;

-- 4. CHECK constraint violations (lý ra phải 0 vì đã pre-flight)
-- Nếu có error log với "violates check constraint" → user/integration đang gửi data sai
```

### Edge Function logs
```bash
supabase functions logs trigger-pos-sync --project-ref <ref> --since 1h | grep -E '429|500|error'
```

### Frontend monitoring
- Sentry / NewRelic cho client error
- Browser DevTools Performance: First Contentful Paint < 1.5s
- React Query DevTools: cache hit rate > 50%

### Tín hiệu phải rollback
- Tỷ lệ 5xx Edge Function > 1%
- Audit log không có row khi user thao tác (trigger gãy)
- User báo "không tạo được expense" (CHECK constraint sai bound)
- Realtime không invalidate (publication không enable)

---

## Hot-fix playbook

### Triệu chứng: User báo "Không tạo được expense"
1. Check Edge Function log gần nhất
2. `select * from audit_log where action='expenses.insert' order by occurred_at desc limit 5;`
3. Nếu CHECK constraint quá chặt: `alter table public.expenses drop constraint expenses_amount_check;` (tạm) → fix bound trong 002 → re-apply

### Triệu chứng: Owner báo "Báo cáo chốt két không cập nhật realtime"
1. Verify publication: `select * from pg_publication_tables where tablename='cash_close_reports';`
2. Nếu thiếu: `alter publication supabase_realtime add table public.cash_close_reports;`
3. Reconnect WS phía client (refresh page)

### Triệu chứng: n8n báo "Invalid HMAC"
1. Verify env `N8N_POS_SYNC_SECRET` ở Edge và n8n giống nhau
2. Verify Code node n8n dùng `${ts}.${body}` không phải `body` only
3. Test signature manual: 
   ```bash
   echo -n "2026-05-01T10:00:00.000Z.<body>" | openssl dgst -sha256 -hmac "<secret>"
   ```

### Triệu chứng: Viewer không thấy expense
1. Verify `expense_history_permissions` có row cho viewer đó
2. Owner cần `insert into expense_history_permissions(employee_id, date_from, date_to)`
3. (Tuỳ chọn) tạo cron tự upsert rolling 7-day cho mỗi viewer

---

## Definition of Done

- [ ] Backup pre-deploy đã lưu nơi an toàn
- [ ] 4 SQL files đã apply trên prod
- [ ] Edge Function deployed với env mới
- [ ] n8n workflow update HMAC + secret mới
- [ ] Frontend prod deploy, smoke test pass
- [ ] Realtime publication enable cho 4 bảng
- [ ] integration_clients có row active không phải default
- [ ] Audit log có row sau 1h sử dụng thật
- [ ] Không có 429/5xx liên tục trên Edge logs trong 24h
- [ ] Owner/team đã được training về thay đổi viewer permission
- [ ] CHANGELOG cập nhật, tag git release `v2.1.0` hoặc tương tự
