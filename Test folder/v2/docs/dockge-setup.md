# Setup với Dockge (hoặc Portainer/Coolify/Docker CLI)

Hướng dẫn deploy "một phát ăn ngay" qua Dockge stack manager.

---

## Yêu cầu trước

| Component | Phải có sẵn |
|-----------|-------------|
| Linux server | Ubuntu/Debian/Alpine + Docker + docker-compose-plugin |
| Dockge | Đã cài (hoặc Portainer/Coolify cũng OK) |
| Supabase | Self-hosted hoặc supabase.com project — sẵn sàng nhận SQL |
| Domain | Đã point A record về server IP |
| Reverse proxy | Nginx Proxy Manager / Caddy / Traefik (cho HTTPS) |
| KiotViet account | Đã đăng ký FNB + có Client ID/Secret |

---

## Quy trình tổng quát

```
[ Bước A — Database ]   →  [ Bước B — Generate secrets ]  →  [ Bước C — Dockge stack ]
  Supabase Studio              Linux terminal                   Dockge UI
  Apply 4 SQL files            openssl rand -base64 32          Tạo stack + .env + Up
  Tạo owner account            (3 secrets)                       Build + start container
                                                                 ↓
                                         [ Bước D — Reverse proxy + SSL ]
                                                NPM/Caddy add proxy host
                                                ↓
                                         [ Bước E — Cấu hình KiotViet ]
                                                Login → Settings → KiotViet
                                                ↓
                                         [ Bước F — Cron polling (optional) ]
                                                crontab -e
```

---

## Bước A — Setup Supabase (làm 1 lần)

### A.1. Apply 4 SQL files

Trên **Supabase Studio → SQL Editor → New query**, lần lượt copy + paste + Run từng file:
1. `database/001_schema.sql`
2. `database/002_functions.sql`
3. `database/003_rls.sql`
4. `database/004_seed.sql`

Nếu DB cũ còn data gây lỗi `column does not exist`, chạy `database/000_reset.sql` TRƯỚC (DESTRUCTIVE).

### A.2. Tạo `integration_clients` row

Trên cùng SQL Editor, paste + Run:
```sql
-- Generate secret trong terminal trước:
-- $ openssl rand -base64 32
-- Copy output rồi paste thay <YOUR-SECRET>

insert into public.integration_clients (client_id, client_secret_hash, name, is_active)
values (
  'chill-erp',
  crypt('<YOUR-SECRET>', gen_salt('bf')),
  'Chill ERP Next.js',
  true
);
```

⚠️ Lưu giá trị `<YOUR-SECRET>` — sẽ paste vào `.env` ở Bước C.

### A.3. Bật Realtime publication

```sql
alter publication supabase_realtime add table public.cash_counts;
alter publication supabase_realtime add table public.cash_close_reports;
alter publication supabase_realtime add table public.handover_tasks;
alter publication supabase_realtime add table public.expenses;
alter publication supabase_realtime add table public.sales_sync_runs;
```

### A.4. Tạo owner đầu tiên

**A.4.1**: Studio → Authentication → Users → Add user → email + password (nhớ tick "Auto Confirm User")

**A.4.2**: Lấy `id` của user vừa tạo (cột "User UID"). Quay lại SQL Editor:
```sql
-- Tạo employee row
insert into public.employees (name, position, hourly_rate, is_active)
values ('Owner Name', 'Chủ quán', 0, true)
returning id;
-- Lưu lại employee_id

-- Link với auth user, role owner
insert into public.employee_accounts (employee_id, auth_user_id, role, status)
values (
  '<employee_id từ trên>',
  '<auth_user_id từ Authentication>',
  'owner',
  'active'
);
```

---

## Bước B — Generate secrets trên server

SSH vào Linux server:
```bash
# 3 secrets cần generate
echo "INGEST_CLIENT_SECRET = (đã có từ Bước A.2 — paste lại)"
echo "CRON_SECRET = $(openssl rand -hex 32)"

# Lưu Supabase service_role key có sẵn ở Studio → Settings → API → "service_role secret"
```

---

## Bước C — Setup Dockge stack

### C.1. Clone repo

Nếu Dockge stack folder mặc định ở `/opt/stacks/`:
```bash
cd /opt/stacks/
sudo git clone <YOUR-GITHUB-REPO> chill-manager
cd chill-manager/"Test folder/v2"

# Đảm bảo Dockge user (thường docker group) đọc được
sudo chown -R $USER:$USER /opt/stacks/chill-manager
```

### C.2. Tạo `.env`

```bash
cp .env.example .env
nano .env
```

Điền 7 giá trị sau:
```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://supabase.your-domain.com
NEXT_PUBLIC_SUPABASE_ANON_KEY=<paste anon key>
SUPABASE_SERVICE_ROLE_KEY=<paste service_role key>

# App URL (cho webhook display + OAuth callback)
NEXT_PUBLIC_APP_URL=https://chill.your-domain.com
APP_PORT=3009

# Ingest auth (khớp với row vừa insert ở Bước A.2)
INGEST_CLIENT_ID=chill-erp
INGEST_CLIENT_SECRET=<paste secret từ Bước A.2>

# Cron (optional — để rỗng nếu chưa cần polling)
CRON_SECRET=<paste secret từ Bước B>
```

### C.3. Add stack vào Dockge UI

1. Mở Dockge UI (thường ở `http://your-server:5001`)
2. **+ Compose** → "Or, you can directly load the existing stack from filesystem"
3. Chọn directory: `/opt/stacks/chill-manager/Test folder/v2`
4. Dockge sẽ auto-detect `docker-compose.yml`
5. Bấm **Deploy** → Dockge sẽ chạy `docker compose up -d --build`

Build lần đầu mất 3-5 phút (npm install + next build).

### C.4. Verify trên Dockge

- Container `chill-manager-v2` status: **Healthy** (sau 30-60s)
- Bấm vào container → Logs → phải thấy `▲ Next.js 15.x.x ... Ready in Xms`
- Test HTTP:
  ```bash
  curl -I http://localhost:3009
  # 200 OK
  ```

---

## Bước D — Reverse proxy + SSL

### Nếu dùng Nginx Proxy Manager

1. NPM UI → Hosts → Add Proxy Host
2. Domain: `chill.your-domain.com`
3. Forward Hostname/IP: `127.0.0.1` (hoặc Docker bridge IP)
4. Forward Port: `3009`
5. ☑ Block Common Exploits
6. ☑ Websockets Support  ← QUAN TRỌNG cho Realtime
7. SSL tab → Request new SSL Certificate (Let's Encrypt) → Save

### Nếu Caddy
```caddy
chill.your-domain.com {
    reverse_proxy 127.0.0.1:3009
}
```

### Verify
```bash
curl -I https://chill.your-domain.com  # 200 OK + valid cert
```

---

## Bước E — Cấu hình KiotViet (qua UI)

1. Mở `https://chill.your-domain.com` → Login với owner account (Bước A.4)
2. Settings → tìm section **KiotViet (FNB)**
3. Điền:
   - **Retailer**: tên cửa hàng (vd `chillcoffeegarden`)
   - **Client ID**: từ KiotViet manager → Thiết lập → Kết nối API
   - **Client Secret**: cùng chỗ
   - ☑ **Bật KiotViet sync**
4. (Optional) Bấm **Generate webhook secret** để tạo URL webhook
5. Bấm **Lưu cấu hình**
6. Bấm **Force sync** để test (phải thấy invoice trong tab Pivot)

### Đăng ký webhook URL ở KiotViet (optional)

Nếu Bước E.4 generate secret rồi:
1. Settings → KiotViet → "Webhook URL" → Bấm **Copy**
2. KiotViet manager → Thiết lập → Webhook → Add URL vừa copy
3. Chọn events: `product.update`, `customer.update`, `stock.update`
4. Save

---

## Bước F — Cron polling (production)

KiotViet FNB **không có invoice webhook** → phải poll. Setup cron trên server:

```bash
crontab -e

# Thêm dòng (thay <CRON_SECRET> bằng giá trị thật trong .env):
*/2 * * * * curl -sS -X POST -H "X-Cron-Secret: <CRON_SECRET>" -H "Content-Type: application/json" -d '{"force":false,"reason":"cron"}' http://localhost:3009/api/kiotviet/sync >> /var/log/kiotviet-sync.log 2>&1
```

Verify sau 2-3 phút:
```bash
tail -f /var/log/kiotviet-sync.log
# Hoặc Supabase Studio:
# select started_at, status, order_count from sales_sync_runs
# where source='kiotviet' order by started_at desc limit 5;
```

Chi tiết alternative (systemd timer, backfill, tuning): `docs/kiotviet-polling.md`.

---

## Update khi có code mới

```bash
cd /opt/stacks/chill-manager
git pull

# Trên Dockge UI, vào stack → bấm **Update** → Dockge chạy `docker compose up -d --build`
# Hoặc CLI:
cd "Test folder/v2"
docker compose --env-file .env up -d --build
```

---

## Troubleshooting

| Triệu chứng | Fix |
|-------------|-----|
| Container exit code 1 ngay khi start | Check `docker logs chill-manager-v2` — thường do thiếu env var. Verify `.env` đầy đủ 5 var bắt buộc. |
| Login OK nhưng "Tài khoản chờ duyệt" | Chưa tạo `employee_accounts` row cho user. Quay lại Bước A.4. |
| Settings → KiotViet hiện "Không có quyền" | Role không phải owner/manager. Update `employee_accounts.role = 'owner'`. |
| Force sync báo "Integration client không hợp lệ" | `INGEST_CLIENT_ID` / `INGEST_CLIENT_SECRET` trong `.env` không khớp row trong DB. Verify bằng SQL `select * from integration_clients where client_id='chill-erp'`. |
| Settings → KiotViet → Force sync báo "401 KiotViet" | Client ID/Secret KiotViet sai. Verify lại từ KiotViet manager. |
| Webhook KiotViet trả 200 nhưng không có log ở app | URL secret mismatch. Re-copy URL từ Settings → re-register ở KiotViet. |
| Cron không sync (log báo Auth failed) | `CRON_SECRET` trong cron command không khớp `.env`. Restart container sau sửa env. |
| Build fail trên Dockge | Disk space đầy? `docker system prune -a` rồi rebuild. |
| Realtime (2-tab sync) không update | Chưa bật publication. Quay lại Bước A.3. |

---

## Backup / Restore

### Backup
- **Database**: Backup tự động qua Supabase (nếu dùng cloud) hoặc `pg_dump` (self-hosted)
- **App config**: `.env` file (lưu vào 1Password/Bitwarden)
- **Code**: Git repo (đã có)

```bash
# Backup .env vào 1Password / Bitwarden / encrypted backup
cp .env /secure-backup/chill-erp.env
```

### Restore (server mới)
1. Apply lại 4 SQL files (Bước A.1)
2. Restore `.env` từ backup
3. `docker compose up -d --build`
4. KiotViet credentials còn nguyên trong DB → không cần config lại
