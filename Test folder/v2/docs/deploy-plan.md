# Deploy Plan — Chill Manager v2

Plan deploy lên production sau khi Phase 1 + Phase 2 KiotViet integration xong.

Architecture: **Next.js 15 (Docker) + Supabase Postgres + KiotViet API (direct)**. KHÔNG còn dùng n8n + Edge Function.

---

## Tóm tắt thành phần

| Component | Where | Risk |
|---|---|---|
| Database schema | Supabase Postgres (4 SQL files: 001-004) | MEDIUM (CHECK có thể fail nếu data cũ vi phạm) |
| Next.js app | Docker container trên Linux server | LOW (idempotent build) |
| Cron polling | System cron hoặc systemd timer | LOW |
| Reverse proxy | Nginx Proxy Manager + Let's Encrypt | LOW |
| KiotViet config | Database app_settings + Settings UI | LOW |

---

## Pre-flight checklist

### 1. Backup
```bash
# Backup full DB trước khi apply schema mới
pg_dump -h <supabase-host> -U postgres -Fc <db> \
  > pre-deploy-$(date +%Y%m%d-%H%M).dump
```

### 2. Data integrity check (chỉ cần nếu DB đã có data)
9 query này phải trả về 0. Nếu có row vi phạm → dọn data trước hoặc skip CHECK constraint.

```sql
select count(*) from public.employees where hourly_rate < 0 or hourly_rate > 10000000;
select count(*) from public.expenses where amount < 0 or amount > 1000000000 or quantity < 0 or quantity > 99999 or unit_price < 0;
select count(*) from public.shift_payroll_records where base_pay < 0 or total_pay < 0 or allowance_amount < 0 or hourly_rate < 0;
select count(*) from public.sales_orders where net_amount < 0 or total_payment < 0 or gross_amount < 0 or discount_amount < 0;
select count(*) from public.sales_order_items where quantity < 0 or unit_price < 0 or line_total < 0 or discount_amount < 0;
select count(*) from public.cash_counts where total_physical < 0 or pos_total < 0 or pos_cash_total < 0 or pos_non_cash_total < 0;
select count(*) from public.cash_day_openings where opening_total < 0;
select id, denominations_json from public.cash_day_openings
where exists (select 1 from jsonb_each_text(denominations_json) as d(k, v)
  where k !~ '^(1000|2000|5000|10000|20000|50000|100000|200000|500000)$' or v::numeric > 10000);
select id, client_id, is_active from public.integration_clients;
```

### 3. Pre-flight checklist khác
- [ ] Backup `.dump` đã tạo
- [ ] Data integrity 8/8 query trả 0
- [ ] Đã có credentials KiotViet (Client ID + Secret từ KiotViet manager)
- [ ] Đã có domain + reverse proxy (Nginx Proxy Manager)
- [ ] SSL cert ready (Let's Encrypt qua NPM)
- [ ] Đã chuẩn bị `CRON_SECRET` random 32 byte
- [ ] Đã chuẩn bị `INGEST_CLIENT_SECRET` random 32 byte
- [ ] Đã có Supabase service_role key

---

## Stage 1 — Database migration

Apply 4 file SQL theo thứ tự. Idempotent, có thể chạy lại an toàn.

```bash
# Trên Supabase Studio SQL Editor (hoặc psql):
# 1. database/001_schema.sql
# 2. database/002_functions.sql
# 3. database/003_rls.sql
# 4. database/004_seed.sql
```

Nếu DB cũ có schema không khớp gây lỗi `column does not exist`, chạy `database/000_reset.sql` TRƯỚC (DESTRUCTIVE — xóa hết data).

### Verify sau Stage 1

```sql
-- 1. Tables (~25)
select count(*) from information_schema.tables where table_schema = 'public';

-- 2. RPCs (~29)
select count(*) from pg_proc where pronamespace = 'public'::regnamespace and prokind = 'f';

-- 3. CHECK constraints (10)
select conname from pg_constraint where conname like '%_check'
  and conname in (
    'employees_hourly_rate_check', 'expenses_amount_check', 'expenses_quantity_check',
    'expenses_unit_price_check', 'payroll_pay_check', 'sales_orders_amount_check',
    'sales_items_quantity_check', 'sales_items_price_check', 'cash_counts_total_check',
    'cash_opening_total_check'
  ) order by conname;

-- 4. Audit triggers (8)
select count(*) from pg_trigger where tgname like 'audit_%';

-- 5. RLS policies (50+)
select count(*) from pg_policies where schemaname = 'public';

-- 6. Seed data
select key from public.app_settings order by key;
-- Phải thấy: cash_diff_threshold, denominations, handover_default_tasks,
--            kiotviet_credentials, sidebar_defaults
```

### Setup integration_clients (cho POS ingest auth)

```bash
# Generate secret
SECRET=$(openssl rand -base64 32)
echo "Save this secret to .env later: $SECRET"
```

```sql
insert into public.integration_clients (client_id, client_secret_hash, name, is_active)
values (
  'chill-erp',
  crypt('<paste-SECRET-từ-bước-trên>', gen_salt('bf')),
  'Chill ERP Next.js',
  true
);
```

### Setup owner account đầu tiên

```sql
-- Trong Supabase Studio → Authentication → Users → Add user (email + password)
-- Sau đó:
insert into public.employees (name, position, hourly_rate, is_active)
values ('Owner Name', 'Chủ quán', 0, true)
returning id;

insert into public.employee_accounts (employee_id, auth_user_id, role, status)
values (
  '<employee_id từ trên>',
  '<auth_user_id từ Auth dashboard>',
  'owner',
  'active'
);
```

### Bật Realtime publication

```sql
alter publication supabase_realtime add table public.cash_counts;
alter publication supabase_realtime add table public.cash_close_reports;
alter publication supabase_realtime add table public.handover_tasks;
alter publication supabase_realtime add table public.expenses;
alter publication supabase_realtime add table public.sales_sync_runs;
```

### Rollback Stage 1
```bash
psql -h <host> -U postgres -d <db> < pre-deploy-$(date +%Y%m%d-%H%M).dump
```

---

## Stage 2 — Linux server setup

### 2a. Cài Docker

```bash
ssh user@your-server
sudo apt update
sudo apt install -y docker.io docker-compose-plugin
sudo usermod -aG docker $USER
# Logout + login lại
```

### 2b. Clone code + tạo .env

```bash
mkdir -p ~/apps && cd ~/apps
git clone <YOUR-GITHUB-REPO> chill-manager
cd chill-manager/"Test folder/v2"

cp .env.example .env
nano .env
```

Điền các giá trị:
```env
NEXT_PUBLIC_SUPABASE_URL=https://supabase.your-domain.com
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
NEXT_PUBLIC_APP_URL=https://chill.your-domain.com

SUPABASE_SERVICE_ROLE_KEY=<service_role key>
INGEST_CLIENT_ID=chill-erp
INGEST_CLIENT_SECRET=<plain secret từ Stage 1>
CRON_SECRET=<openssl rand -hex 32>

APP_PORT=3009
```

### 2c. Build + start container

```bash
docker compose --env-file .env up -d --build

# Verify
docker compose ps                    # status: Up
docker compose logs -f --tail 50     # phải thấy "Ready in Xms"
curl -I http://localhost:3009         # 200 OK
```

### Rollback Stage 2
```bash
docker compose down
git checkout <previous-tag>
docker compose --env-file .env up -d --build
```

---

## Stage 3 — Reverse proxy + SSL

### 3a. Nginx Proxy Manager (nếu dùng)

Login NPM UI → Hosts → Add Proxy Host:
- Domain: `chill.your-domain.com`
- Forward to: `127.0.0.1:3009`
- Block common exploits: ✓
- Websockets support: ✓
- SSL: Request new Let's Encrypt cert

### 3b. Hoặc Nginx thuần

`/etc/nginx/sites-available/chill.your-domain.com`:
```nginx
server {
    server_name chill.your-domain.com;
    location / {
        proxy_pass http://127.0.0.1:3009;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
    listen 80;
}
```

```bash
sudo ln -s /etc/nginx/sites-available/chill.your-domain.com /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d chill.your-domain.com
```

### Verify
```bash
curl -I https://chill.your-domain.com   # 200 OK + valid cert
```

---

## Stage 4 — Cấu hình KiotViet + bật polling

### 4a. Login + cấu hình credentials

1. Mở `https://chill.your-domain.com` → login owner account
2. Settings → KiotViet (FNB) → nhập:
   - **Retailer**: tên cửa hàng (vd: `chillcoffeegarden`)
   - **Client ID** + **Client Secret** (từ KiotViet manager → Thiết lập → Kết nối API)
   - Tích **Bật KiotViet sync**
3. Bấm **Lưu cấu hình**
4. Bấm **Force sync** để test (phải thấy invoice trong tab Pivot)

### 4b. Setup webhook (optional, cho product/stock)

5. Trong Settings → KiotViet → "Webhook URL" → bấm **Generate webhook secret**
6. Bấm **Lưu cấu hình** lần nữa
7. Copy URL hiện ra
8. KiotViet manager → Thiết lập → Webhook → Add URL + chọn events `product.update`, `customer.update`, `stock.update`

### 4c. Setup polling cron

```bash
crontab -e
# Thêm dòng (thay <CRON_SECRET> bằng giá trị thật trong .env):
*/2 * * * * curl -sS -X POST -H "X-Cron-Secret: <CRON_SECRET>" -H "Content-Type: application/json" -d '{"force":false,"reason":"cron"}' http://localhost:3009/api/kiotviet/sync >> /var/log/kiotviet-sync.log 2>&1
```

Verify sau 2-3 phút:
```bash
tail -f /var/log/kiotviet-sync.log

# Hoặc trên Supabase Studio:
# select started_at, status, order_count from public.sales_sync_runs
# where source='kiotviet' order by started_at desc limit 5;
```

Chi tiết alternative (systemd timer, backfill, tuning): `docs/kiotviet-polling.md`.

---

## Production cutover timeline

| Time | Step | Owner |
|---|---|---|
| 22:00 | Backup DB + data integrity check | Dev |
| 22:15 | Stage 1: Apply 4 SQL files | Dev |
| 22:30 | Stage 1: Setup integration_clients + owner | Dev |
| 22:45 | Stage 2: Docker build + start | Dev |
| 23:00 | Stage 3: Nginx + SSL | Ops |
| 23:15 | Stage 4: KiotViet config + force sync test | Owner |
| 23:25 | Stage 4: Setup cron + webhook | Dev |
| 23:30 | Smoke test E2E | Owner + Dev |

Total: ~1.5h từ pre-flight đến live.

---

## Smoke tests (post-deploy)

Trên ERP UI:
- [ ] Login owner account → Dashboard load → metrics hiển thị (có thể = 0 nếu DB mới)
- [ ] Tab Expenses → tạo expense test → save → toast success
- [ ] Tab Shifts → check-in 1 employee → check-out → lương hiển thị
- [ ] Tab Cash → đếm mệnh giá → "Kiểm két nhanh" → row mới trong "Lịch sử trong ngày"
- [ ] Settings → KiotViet → Force sync → vào tab Pivot thấy invoice
- [ ] Tab Reports → "Chốt két & tạo báo cáo" → in báo cáo
- [ ] Open second tab → make change tab 1 → tab 2 update <2s (realtime working)

Trên server:
- [ ] `docker compose logs --tail 100` không có ERROR
- [ ] Cron log `/var/log/kiotviet-sync.log` hiển thị success mỗi 2 phút
- [ ] Supabase Studio: `audit_log` có row mới sau mỗi action quan trọng

Trên KiotViet:
- [ ] Tạo invoice test → trong 2-4 phút phải xuất hiện ở Pivot view
- [ ] Update product → ERP webhook log thấy event (nếu setup webhook ở 4b)

---

## Monitoring queries (chạy hàng ngày)

```sql
-- Sync runs gần nhất (phải có row mỗi 2 phút)
select started_at, finished_at, status, order_count
from public.sales_sync_runs
where source = 'kiotviet'
order by started_at desc limit 20;

-- Nếu sync fail liên tục 3+ lần → alert
select status, count(*) from public.sales_sync_runs
where source = 'kiotviet' and started_at > now() - interval '1 hour'
group by status;

-- Audit log row mới (phải có activity hằng ngày nếu app đang dùng)
select action, count(*)
from public.audit_log
where occurred_at > now() - interval '1 day'
group by action order by 2 desc;

-- Rate limit attempts (theo dõi spam)
select user_id, count(*)
from public.pos_sync_attempts
where requested_at > now() - interval '1 hour'
group by user_id order by 2 desc limit 10;
```

---

## Hot-fix playbook

### Triệu chứng: Cron không sync, log báo "Auth failed"
1. Check `CRON_SECRET` env trong `.env` server khớp với header trong cron command
2. Restart container sau khi sửa `.env`: `docker compose --env-file .env up -d`

### Triệu chứng: Sync báo "Integration client không hợp lệ"
1. Verify `INGEST_CLIENT_ID` + `INGEST_CLIENT_SECRET` trong `.env` khớp với row `integration_clients`
2. Test bằng `select * from integration_clients where client_id = 'chill-erp' and is_active = true;` (phải có 1 row)

### Triệu chứng: Sync báo "401 Unauthorized" từ KiotViet
1. Settings → KiotViet → check Client ID + Client Secret đúng chưa
2. Token có thể expired — bấm Force sync lần nữa (auto-refresh)
3. Verify retailer name khớp với cửa hàng trên KiotViet manager

### Triệu chứng: Webhook KiotViet trả 200 nhưng app không xử lý
1. `docker logs chill-manager-v2 | grep kiotviet-webhook` xem log
2. Verify webhook_secret trong DB khớp với secret embedded trong URL đăng ký KiotViet
3. KiotViet có gửi đúng events không? Check Notifications.Action trong log

### Triệu chứng: Tab Cash → "Sửa tiền đầu ngày" báo lỗi RLS
1. Verify user có role `owner` trong employee_accounts
2. Verify policy `cash_openings_owner_update` tồn tại

### Triệu chứng: `audit_log does not exist` khi insert/update
1. Re-apply `database/001_schema.sql` (idempotent — không hại) để tạo bảng audit_log
2. Hoặc apply `database/000_reset.sql` rồi 001-004 nếu schema cũ corrupt

---

## Definition of Done

- [ ] 4 SQL files applied + verify queries pass
- [ ] integration_clients row tồn tại
- [ ] Owner account login OK
- [ ] Realtime publication added cho 5 bảng
- [ ] Docker container `Up` + log clean
- [ ] HTTPS hoạt động qua reverse proxy
- [ ] KiotViet config + force sync OK
- [ ] Cron polling chạy mỗi 2 phút (verify trong sales_sync_runs)
- [ ] Webhook đăng ký (optional)
- [ ] Smoke test E2E pass
- [ ] Backup `.dump` đã lưu
- [ ] Owner đã được hướng dẫn dùng app
