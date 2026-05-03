# Chạy Chill Manager v2 từ đầu

Quick-start guide. Đọc xong file này là chạy được app từ zero.

## Bước 1: Apply database lên Supabase

Đọc `docs/apply-database.md`. Tóm tắt: chạy 4 file SQL `database/001 → 002 → 003 → 004` trên Supabase Studio.

Nếu DB đã có dữ liệu cũ, chạy `database/000_reset.sql` TRƯỚC (DESTRUCTIVE).

## Bước 2: Tạo owner đầu tiên

Tạo user trong Supabase Auth → map vào `employee_accounts` với role `owner`. Chi tiết ở `docs/apply-database.md` mục 3.

## Bước 3: Tạo `.env.local` cho dev

```bash
cp .env.example .env.local
```

Điền các giá trị:
- `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` — public Supabase config
- `SUPABASE_SERVICE_ROLE_KEY` — server-only, lấy ở Studio → Settings → API → "secret"
- `INGEST_CLIENT_ID` + `INGEST_CLIENT_SECRET` — phải khớp row `integration_clients` (xem `apply-database.md` mục 5)
- `CRON_SECRET` — generate bằng `openssl rand -hex 32` (cho cron polling, optional)

## Bước 4: Chạy local

```bash
npm install
npm run dev
```

Mở `http://localhost:3009`. Login với owner account vừa tạo.

## Bước 5: Cấu hình KiotViet (POS sync)

Settings → KiotViet (FNB) → nhập credentials → **Lưu** → bấm **Force sync** để test.

Pivot view sẽ hiển thị invoice từ KiotViet.

## Bước 6: Deploy lên Linux server

Đọc `docs/deploy-linux.md` — Docker compose setup với Nginx Proxy Manager + HTTPS.

## Bước 7: Setup polling cron (production)

Đọc `docs/kiotviet-polling.md` — system cron hoặc systemd timer gọi `/api/kiotviet/sync` mỗi 2 phút (KiotViet FNB không có invoice webhook, phải polling).

## Bước 8 (optional): Setup webhook KiotViet

Cho product/customer/stock updates. Settings → KiotViet → "Generate webhook secret" → Copy URL → Đăng ký bên KiotViet manager → Thiết lập → Webhook.

---

## Tham khảo

- `docs/apply-database.md` — Apply SQL + tạo accounts
- `docs/kiotviet-polling.md` — Setup polling cron + webhook
- `docs/deploy-linux.md` — Docker deploy production
- `docs/cash-close-report.md` — Logic chốt két
- `docs/samples/` — Payload samples
- `database/README.md` — Schema overview
