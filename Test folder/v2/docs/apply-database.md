# Apply database lên Supabase

## 1. Chuẩn bị

Cần quyền chạy SQL trên Supabase Postgres — qua Supabase Studio SQL Editor hoặc `psql`.

## 2. Chạy SQL theo thứ tự

Trong Studio SQL Editor (hoặc psql), chạy lần lượt:

1. `database/001_schema.sql` — Tables + indexes + CHECK constraints + base triggers
2. `database/002_functions.sql` — RPC functions + audit triggers
3. `database/003_rls.sql` — Row Level Security policies
4. `database/004_seed.sql` — Default categories + templates + app_settings

**Không đảo thứ tự**: RLS phụ thuộc function role (002), seed phụ thuộc schema (001) + functions (002).

Tất cả file **idempotent** — re-run an toàn.

Nếu DB cũ còn leftover state khiến 001 báo lỗi (vd: `column does not exist`), chạy `database/000_reset.sql` TRƯỚC để dọn schema sạch (DESTRUCTIVE — xóa hết data).

## 3. Tạo owner đầu tiên

Tạo user trong Supabase Auth (Studio → Authentication → Users → Add user). Sau đó map user vào `employee_accounts`:

```sql
-- Bước A: Tạo employee row
insert into public.employees (name, position, hourly_rate, is_active)
values ('Owner Name', 'Chủ quán', 0, true)
returning id;

-- Bước B: Link auth user vào employee với role owner
insert into public.employee_accounts (employee_id, auth_user_id, role, status)
values (
  '<employee_id từ bước A>',
  '<auth_user_id từ Auth dashboard>',
  'owner',
  'active'
);

-- Optional: thêm profile metadata
insert into public.profiles (id, display_name)
values ('<auth_user_id>', 'Owner Name')
on conflict (id) do nothing;
```

## 4. Tạo nhân viên mẫu (optional)

```sql
insert into public.employees (code, name, position, hourly_rate)
values
  ('NV001', 'Lan', 'Thu ngân', 26000),
  ('NV002', 'Minh', 'Pha chế', 28000),
  ('NV003', 'Phúc', 'Phục vụ', 25000)
on conflict (code) do update
  set name = excluded.name,
      position = excluded.position,
      hourly_rate = excluded.hourly_rate;
```

## 5. Tạo integration_clients (cho POS sync)

Next.js API route `/api/kiotviet/sync` cần authenticate với RPC `ingest_kiotviet_batch` qua row trong `integration_clients`. Generate secret an toàn:

```bash
# Linux/Mac
openssl rand -base64 32

# Hoặc Windows PowerShell
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Maximum 256 }))
```

```sql
insert into public.integration_clients (client_id, client_secret_hash, name, is_active)
values (
  'chill-erp',
  crypt('<paste-secret-từ-bước-trên>', gen_salt('bf')),
  'Chill ERP Next.js',
  true
);
```

Sau đó set 2 env trong Next.js (`.env.local` cho dev, server `.env` cho prod):

```env
INGEST_CLIENT_ID=chill-erp
INGEST_CLIENT_SECRET=<paste-secret-plain-text>
```

## 6. Cấu hình KiotViet credentials

Login ERP → Settings → KiotViet (FNB) → nhập:
- **Retailer**: tên cửa hàng (vd: `chillcoffeegarden`)
- **Client ID** + **Client Secret**: lấy từ KiotViet manager → Thiết lập → Kết nối API
- Tích **Bật KiotViet sync**
- Bấm **Lưu cấu hình**

Test bằng cách bấm **Force sync** → kiểm tra danh sách invoice trong tab Pivot.

## 7. Setup polling cron (optional)

Để invoice tự sync 2 phút/lần, đọc `docs/kiotviet-polling.md` — setup system crontab hoặc systemd timer trên Linux server.

## 8. Setup webhook (optional, cho product/stock updates)

KiotViet FNB hỗ trợ webhook cho `product.update`, `customer.update`, `stock.update`. Đọc `docs/kiotviet-polling.md` mục 8.

---

Xem thêm chi tiết payload của RPC `ingest_kiotviet_batch` ở `docs/samples/supabase-rpc-ingest-payload.json`.
