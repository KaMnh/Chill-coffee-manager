# Deploy v2 trên Docker Linux

`v2` chỉ là frontend Next.js. Supabase server chạy riêng.

## 1. Chuẩn bị env

```bash
cd /path/to/Chill-manager/v2
cp .env.example .env
nano .env
```

Điền:

```env
NEXT_PUBLIC_SUPABASE_URL=https://supabase.your-domain.com
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
NEXT_PUBLIC_APP_URL=https://chill.your-domain.com
APP_PORT=3009
```

## 2. Build và chạy

```bash
docker compose --env-file .env up -d --build
```

Mở app tại `http://server-ip:3009` hoặc domain reverse proxy của bạn.

## 3. Update frontend khi có bug UI

Khi sửa bug giao diện, bạn chỉ cần pull code mới và build lại frontend:

```bash
git pull
docker compose --env-file .env up -d --build
```

Không cần reset database nếu chỉ sửa frontend.
