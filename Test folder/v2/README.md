# Chill Manager v2

`v2` là bản frontend-only của Chill Coffee Garden Ops. App chỉ gọi Supabase self-hosted bằng anon key + RLS, không chứa API route, Prisma, SQLite, service role hoặc Supabase Docker stack.

## Chạy local

```powershell
cd "F:\Chill manager\v2"
copy .env.example .env.local
npm install
npm run dev
```

Mở: http://localhost:3009

## Deploy Docker Linux

```bash
cd /path/to/Chill-manager/v2
cp .env.example .env
docker compose --env-file .env up -d --build
```

## Database

Apply SQL trong thư mục `database/` vào Supabase server theo thứ tự:

1. `database/001_schema.sql`
2. `database/002_functions.sql`
3. `database/003_rls.sql`
4. `database/004_seed.sql`

Xem hướng dẫn chi tiết trong `docs/apply-database.md`.
