# Database contract for Chill Manager v2

Apply these files to your self-hosted Supabase Postgres in this exact order:

1. `001_schema.sql`
2. `002_functions.sql`
3. `003_rls.sql`
4. `004_seed.sql`

Nếu database đã tồn tại từ bản cũ, apply thêm:

5. `005_cash_template_pos_sync_update.sql`

Sau đó chạy lại `002_functions.sql` để cập nhật RPC `compute_cash_theory`, `save_cash_count`, `finalize_cash_close_report` và `create_expense_template`.

The frontend does not use a service-role key. All writes are done through RLS-safe tables or `SECURITY DEFINER` RPC functions.

## n8n integration client

After applying seed, create your real n8n secret:

```sql
update public.integration_clients
set
  client_secret_hash = crypt('YOUR_LONG_RANDOM_SECRET', gen_salt('bf')),
  is_active = true
where client_id = 'n8n-local';
```

n8n calls `rpc/ingest_kiotviet_batch` with `client_id` and `client_secret` in the JSON payload. Do not put Supabase service role in n8n.
