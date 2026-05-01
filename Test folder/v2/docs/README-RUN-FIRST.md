# Chạy Chill Manager v2 từ đầu

## Bước 1: Apply database

Đọc `docs/apply-database.md` và chạy các file SQL trong `database/` lên Supabase self-hosted.

## Bước 2: Tạo owner

Tạo user trong Supabase Auth, sau đó map user đó vào `employee_accounts` với role `owner`.

## Bước 3: Tạo env frontend

```bash
cp .env.example .env.local
```

Điền Supabase URL và anon key.

## Bước 4: Chạy local

```bash
npm install
npm run dev
```

Mở `http://localhost:3009`.

## Bước 5: Deploy Docker Linux

Xem `docs/deploy-linux.md`.

## Bước 6: Kết nối n8n POS sync

Đọc `docs/n8n-ingest.md`.

- n8n ghi dữ liệu POS bằng RPC `ingest_kiotviet_batch`.
- App bấm `Làm mới` sẽ gọi Edge Function `trigger-pos-sync`.
- Edge Function giữ webhook secret của n8n, frontend không giữ secret.
- Sync tự động 23:30 nên cấu hình bằng `Schedule Trigger` trong n8n.
