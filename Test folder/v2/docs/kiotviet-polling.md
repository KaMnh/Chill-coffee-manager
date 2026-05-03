# KiotViet Polling Cron Setup

KiotViet FNB **không có webhook cho invoice** — chỉ có webhook cho `product.update`, `customer.update`, `stock.update`. Do đó để sync invoice tự động, phải dùng **polling** (gọi định kỳ `/api/kiotviet/sync`).

Volume thực tế ~70-80 invoice/ngày → polling 2 phút/lần là đủ.

---

## 1. Cấu hình env trên server

Trên server Linux (file `.env` cạnh `docker-compose.yml`):

```env
# Generate ngẫu nhiên 32 byte hex
CRON_SECRET=<openssl rand -hex 32>
```

Restart container để load env mới:
```bash
cd /path/to/v2
docker compose --env-file .env up -d
```

---

## 2. Setup cron job (chọn 1 trong 2 cách)

### Cách A — System crontab (đơn giản nhất)

```bash
# Mở crontab editor
crontab -e

# Thêm dòng dưới đây (sync mỗi 2 phút, thay <CRON_SECRET> bằng giá trị thật)
*/2 * * * * curl -sS -X POST -H "X-Cron-Secret: <CRON_SECRET>" -H "Content-Type: application/json" -d '{"force":false,"reason":"cron"}' http://localhost:3009/api/kiotviet/sync >> /var/log/kiotviet-sync.log 2>&1

# Lưu + thoát
```

Verify cron đã active:
```bash
crontab -l
sudo systemctl status cron     # hoặc cronie tùy distro
```

Xem log sau vài phút:
```bash
tail -f /var/log/kiotviet-sync.log
```

### Cách B — systemd timer (production-grade)

`/etc/systemd/system/kiotviet-sync.service`:
```ini
[Unit]
Description=Chill ERP — KiotViet POS sync
After=network.target

[Service]
Type=oneshot
User=root
EnvironmentFile=/etc/kiotviet-sync.env
ExecStart=/usr/bin/curl -sS -X POST \
  -H "X-Cron-Secret: ${CRON_SECRET}" \
  -H "Content-Type: application/json" \
  -d '{"force":false,"reason":"systemd-cron"}' \
  http://localhost:3009/api/kiotviet/sync
StandardOutput=journal
StandardError=journal
```

`/etc/systemd/system/kiotviet-sync.timer`:
```ini
[Unit]
Description=Chill ERP — KiotViet sync every 2 minutes
Requires=kiotviet-sync.service

[Timer]
OnBootSec=30s
OnUnitActiveSec=2min
AccuracySec=10s

[Install]
WantedBy=timers.target
```

`/etc/kiotviet-sync.env`:
```env
CRON_SECRET=<paste your CRON_SECRET here>
```

Activate:
```bash
sudo chmod 600 /etc/kiotviet-sync.env
sudo systemctl daemon-reload
sudo systemctl enable --now kiotviet-sync.timer

# Verify
sudo systemctl list-timers kiotviet-sync.timer
sudo journalctl -u kiotviet-sync.service -f
```

---

## 3. Verify polling hoạt động

### Test thủ công (curl)
```bash
curl -X POST \
  -H "X-Cron-Secret: <CRON_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{"force":true,"reason":"manual_test"}' \
  http://localhost:3009/api/kiotviet/sync
```

Response thành công:
```json
{
  "status": "success",
  "message": "Đã sync 12 hóa đơn (45 items, 14 payments).",
  "fetched": 12,
  "ingested": { "orders": 12, "items": 45, "payments": 14 },
  "run_id": "...",
  "pages_scanned": 1
}
```

### Verify trong Supabase
```sql
-- Sync runs gần nhất
select started_at, finished_at, status, order_count, business_date_from, business_date_to
from public.sales_sync_runs
where source = 'kiotviet'
order by started_at desc
limit 10;

-- Last successful cursor
select public.get_last_sync_cursor('kiotviet');
```

### Verify trong UI
- Vào ERP → Settings → KiotViet → "Lần sync gần nhất" thấy thời gian cập nhật mỗi 2 phút.
- Vào tab Pivot → thấy danh sách invoice mới.

---

## 4. Tuning

| Vấn đề | Fix |
|--------|-----|
| Sync quá chậm (>30s) | Tăng `KV_RATE_LIMIT_PER_SEC` trong KiotViet config (max 5 theo doc, mặc định 4). |
| Cron chạy quá dày, dup data | App đã có cooldown 30s — request thứ 2 trong 30s sẽ skip. KHÔNG cần lo. |
| Cron gọi nhưng KiotViet không trả invoice mới | Verify `is_active=true` trong app_settings.kiotviet_credentials. |
| 401 từ KiotViet | OAuth token expired — app sẽ auto-refresh; nếu vẫn fail check client_id/secret. |
| 429 từ ERP | CRON_SECRET không khớp env → fallback user auth → user JWT không có → 401 thay 429. Check `X-Cron-Secret` header. |
| Polling không bắt được invoice trong 1-2 phút đầu sau khi tạo | KiotViet có lag 30-60s trước khi invoice xuất hiện trong API list. Bình thường. |

---

## 5. Tăng/giảm tần suất

```cron
# Mỗi phút (load cao)
* * * * * curl ...

# Mỗi 5 phút (load thấp)
*/5 * * * * curl ...

# Mỗi 15 phút (chỉ giờ hành chính)
*/15 8-22 * * * curl ...
```

Lưu ý: Cron interval ngắn hơn cooldown 30s sẽ bị app reject (status: skipped). Đặt ≥ 1 phút.

---

## 6. Disable polling (khi cần)

```bash
# Cách A (system cron)
crontab -e
# Comment dòng curl hoặc xóa

# Cách B (systemd)
sudo systemctl disable --now kiotviet-sync.timer

# Hoặc tắt trong env (rồi restart container)
unset CRON_SECRET
docker compose --env-file .env up -d
```

Khi `CRON_SECRET` rỗng, route `/api/kiotviet/sync` chỉ chấp nhận user JWT → cron sẽ nhận 401 → không sync.

---

## 7. Backfill historical data

Polling chỉ bắt invoice từ thời điểm bật. Để backfill dữ liệu cũ:

### Cách A — Settings UI
1. Login ERP với owner account
2. Settings → KiotViet → "Sync thủ công"
3. Nhập "Từ ngày" + "Đến ngày" (vd: `2026-04-01` → `2026-05-01`)
4. Bấm **Force sync**

Limitation: 1 lần fetch tối đa 5000 invoice (50 page × 100). Nếu > 5000, chia nhỏ thời gian.

### Cách B — curl từ server
```bash
curl -X POST \
  -H "X-Cron-Secret: <CRON_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{"fromDate":"2026-04-01","toDate":"2026-04-30","force":true,"reason":"backfill"}' \
  http://localhost:3009/api/kiotviet/sync
```

---

## 8. Webhook (cho product/stock — không phải invoice)

KiotViet FNB hỗ trợ webhook cho 5 events nhưng KHÔNG có cho invoice. Để bật webhook cho product updates:

1. ERP Settings → KiotViet → "Generate webhook secret" → Copy URL
2. KiotViet manager → Thiết lập → Webhook → Đăng ký mới:
   - URL: `https://chill.your-domain.com/api/kiotviet/webhook/<secret>`
   - Events: chọn `product.update`, `customer.update`, `stock.update`
   - Save

ERP sẽ nhận webhook và log ra stderr (xem `docker logs chill-manager-v2`). Hiện tại Phase 2A chỉ ack — handlers chi tiết để Phase 2B.
