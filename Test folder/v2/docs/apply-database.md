# Apply database lên Supabase self-hosted

## 1. Chuẩn bị

Bạn cần có quyền chạy SQL trên Supabase Postgres. Có thể dùng Supabase Studio SQL Editor hoặc `psql`.

## 2. Chạy SQL theo thứ tự

Trong Studio SQL Editor, copy và chạy lần lượt:

1. `database/001_schema.sql`
2. `database/002_functions.sql`
3. `database/003_rls.sql`
4. `database/004_seed.sql`

Không đảo thứ tự vì RLS phụ thuộc function role, còn seed phụ thuộc schema.

Nếu database đã chạy bản cũ, chạy thêm:

5. `database/005_cash_template_pos_sync_update.sql`

Sau đó chạy lại `database/002_functions.sql` để cập nhật RPC mới cho template chi phí, công thức chốt két và báo cáo snapshot.

## 3. Tạo owner đầu tiên

Tạo user trong Supabase Auth trước. Sau đó map user đó vào owner:

```sql
insert into public.profiles (id, display_name)
values ('AUTH_USER_UUID', 'Chủ quán')
on conflict (id) do update set display_name = excluded.display_name;

insert into public.employee_accounts (auth_user_id, role, status)
values ('AUTH_USER_UUID', 'owner', 'active')
on conflict (auth_user_id) do update set role = 'owner', status = 'active';
```

## 4. Tạo nhân viên mẫu

```sql
insert into public.employees (code, name, position, hourly_rate)
values
  ('NV001', 'Lan', 'Thu ngân', 26000),
  ('NV002', 'Minh', 'Pha chế', 28000),
  ('NV003', 'Phúc', 'Phục vụ', 25000)
on conflict (code) do update set name = excluded.name, position = excluded.position, hourly_rate = excluded.hourly_rate;
```

## 5. Bật n8n client

```sql
update public.integration_clients
set client_secret_hash = crypt('YOUR_LONG_RANDOM_SECRET', gen_salt('bf')), is_active = true
where client_id = 'n8n-local';
```

Giữ secret này trong n8n. Không đưa `SUPABASE_SERVICE_ROLE_KEY` vào n8n.

## 6. Deploy Edge Function gọi n8n

```bash
supabase functions deploy trigger-pos-sync
supabase secrets set N8N_POS_SYNC_WEBHOOK_URL="https://n8n.example.com/webhook/chill-pos-sync"
supabase secrets set N8N_POS_SYNC_SECRET="YOUR_LONG_RANDOM_WEBHOOK_SECRET"
supabase secrets set POS_SYNC_COOLDOWN_SECONDS="300"
```

Xem thêm payload và HMAC ở `docs/n8n-ingest.md`.
