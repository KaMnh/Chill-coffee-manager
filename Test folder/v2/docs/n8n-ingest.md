# n8n -> Supabase RPC ingest

v2 là frontend-only. Webapp không gọi KiotViet và không ghi POS trực tiếp. Flow đúng là:

```text
Webapp
  -> Supabase Edge Function trigger-pos-sync
  -> n8n webhook
  -> n8n lấy KiotViet API
  -> n8n transform dữ liệu
  -> Supabase RPC ingest_kiotviet_batch
  -> Webapp đọc sales_orders / sales_order_items / sales_payments
```

Frontend không giữ webhook secret n8n. n8n không giữ `SUPABASE_SERVICE_ROLE_KEY`.

## 1. Chuẩn bị integration client trong Supabase

Seed `004_seed.sql` KHÔNG còn tạo client mặc định. Owner phải tự insert sau khi apply SQL:

```sql
-- Bước 1: tạo secret ngẫu nhiên đủ dài (ví dụ 32 byte base64). Lưu thật chắc.
-- Bước 2: insert client (chỉ chạy một lần)
insert into public.integration_clients (client_id, client_secret_hash, description, is_active)
values (
  'n8n-local',
  crypt('YOUR_LONG_RANDOM_SECRET', gen_salt('bf')),
  'n8n local integration',
  true
);
```

Trong n8n lưu các giá trị này bằng credential/env:

```text
SUPABASE_URL=https://your-supabase-domain
SUPABASE_ANON_KEY=your-anon-key
N8N_CLIENT_ID=n8n-local
N8N_CLIENT_SECRET=YOUR_LONG_RANDOM_SECRET
```

## 2. Webhook/Schedule trigger trong n8n

Tạo 2 đường chạy trong cùng workflow:

- `Webhook Trigger`: nhận yêu cầu khi webapp bấm `Làm mới`.
- `Schedule Trigger`: chạy mỗi ngày lúc `23:30`, lấy dữ liệu 24h.

Payload Edge Function gửi sang n8n:

```json
{
  "source": "chill-manager-v2",
  "business_date": "2026-04-30",
  "date_from": "2026-04-30",
  "date_to": "2026-04-30",
  "reason": "manual_refresh",
  "requested_by": "auth-user-id",
  "requested_at": "2026-04-30T10:00:00.000Z"
}
```

n8n **BẮT BUỘC** kiểm header (không được bỏ qua trong production — webhook sẽ bị gọi bừa nếu thiếu):

```text
x-chill-signature: HMAC-SHA256(`${timestamp}.${body}`, N8N_POS_SYNC_SECRET)
x-chill-timestamp: ISO timestamp của lúc Edge Function gọi
```

Thêm Code node ngay sau Webhook Trigger để verify signature + timestamp ≤ 5 phút:

```javascript
const crypto = require('crypto');
const ts = $request.headers['x-chill-timestamp'];
if (!ts || Math.abs(Date.now() - new Date(ts).getTime()) > 5 * 60 * 1000) {
  throw new Error('x-chill-timestamp thiếu hoặc đã hết hạn (>5 phút).');
}
const body = JSON.stringify($json);
const expected = crypto
  .createHmac('sha256', $env.N8N_POS_SYNC_SECRET)
  .update(`${ts}.${body}`)
  .digest('hex');
const got = $request.headers['x-chill-signature'];
if (!got || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(got))) {
  throw new Error('x-chill-signature không khớp.');
}
return [{ json: $json }];
```

`N8N_POS_SYNC_SECRET` ở n8n phải khớp `N8N_POS_SYNC_SECRET` của Edge Function (xem `.env.example`).

## 3. Node lấy dữ liệu KiotViet

Dùng HTTP Request node của n8n gọi KiotViet API theo `date_from/date_to`. Output mong muốn là mảng hóa đơn KiotViet. Một hóa đơn mẫu nằm ở:

```text
docs/samples/kiotviet-order-sample.json
```

## 4. Code node transform KiotViet JSON

Thêm Code node sau node KiotViet. Node này gom toàn bộ hóa đơn thành một payload duy nhất để gọi Supabase RPC.

```javascript
const sourceItems = items.flatMap((item) => {
  if (Array.isArray(item.json)) return item.json;
  if (Array.isArray(item.json.data)) return item.json.data;
  if (Array.isArray(item.json.invoices)) return item.json.invoices;
  return [item.json];
});

function normalizeKiotVietDate(value) {
  if (!value) return new Date().toISOString();
  const normalized = String(value).replace(/(\.\d{3})\d+$/, "$1");
  return normalized.includes("+") || normalized.endsWith("Z")
    ? normalized
    : `${normalized}+07:00`;
}

function toNumber(value) {
  const numberValue = Number(value ?? 0);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

function toText(value) {
  if (value === null || value === undefined) return null;
  return String(value);
}

const orders = sourceItems.map((o) => {
  const purchaseAt = normalizeKiotVietDate(o.purchaseDate);
  const businessDate = purchaseAt.slice(0, 10);
  const totalPayment = toNumber(o.totalPayment ?? o.total);

  return {
    kiotviet_invoice_id: toText(o.id),
    invoice_uuid: o.uuid ?? null,
    invoice_code: o.code ?? null,
    kiotviet_order_id: toText(o.orderId),
    order_uuid: o.orderUuid ?? null,
    table_or_order_code: o.orderCode ?? null,

    purchase_at: purchaseAt,
    business_date: businessDate,

    branch_id: toText(o.branchId),
    branch_name: o.branchName ?? null,
    sold_by_id: toText(o.soldById),
    sold_by_name: o.soldByName ?? null,
    customer_code: o.customerCode ?? "",
    customer_name: o.customerName ?? "",

    gross_amount: toNumber(o.total),
    discount_amount: toNumber(o.discount),
    net_amount: totalPayment,
    total_payment: totalPayment,
    status_code: toText(o.status),
    status_value: o.statusValue ?? "",
    using_cod: Boolean(o.usingCod),
    source_created_at: o.createdDate ? normalizeKiotVietDate(o.createdDate) : null,

    invoice_details: (o.invoiceDetails ?? []).map((line, index) => ({
      item_key: `${line.productId ?? "item"}-${index}`,
      product_id: toText(line.productId),
      product_code: line.productCode ?? null,
      product_name: line.productName ?? "Sản phẩm",
      quantity: toNumber(line.quantity),
      unit_price: toNumber(line.price),
      discount_amount: toNumber(line.discount),
      discount_ratio: toNumber(line.discountRatio),
      line_total: toNumber(line.subTotal),
      note: line.note ?? "",
      return_quantity: toNumber(line.returnQuantity),
      raw_json: line
    })),

    payments: [
      {
        payment_method: "cash",
        amount: totalPayment,
        source: "kiotviet",
        confidence: "derived"
      }
    ],

    raw_json: o
  };
});

const dates = orders.map((order) => order.business_date).sort();
const businessDateFrom = dates[0] ?? new Date().toISOString().slice(0, 10);
const businessDateTo = dates[dates.length - 1] ?? businessDateFrom;

return [
  {
    json: {
      p_payload: {
        client_id: $env.N8N_CLIENT_ID ?? "n8n-local",
        client_secret: $env.N8N_CLIENT_SECRET,
        batch_id: `kiotviet-${businessDateFrom}-${new Date().toISOString()}`,
        source: "kiotviet",
        started_at: new Date().toISOString(),
        business_date_from: businessDateFrom,
        business_date_to: businessDateTo,
        orders
      }
    }
  }
];
```

Ghi chú payment:

- Nếu KiotViet/n8n lấy được dữ liệu tiền khách đưa và tiền thối, thay `payments` thành:

```json
[
  {
    "payment_method": "cash",
    "amount": 165000,
    "cash_received": 200000,
    "change_given": 35000,
    "source": "kiotviet",
    "confidence": "exact"
  }
]
```

- Nếu là chuyển khoản, dùng:

```json
[
  {
    "payment_method": "bank_transfer",
    "amount": 165000,
    "source": "kiotviet",
    "confidence": "exact"
  }
]
```

## 5. HTTP Request node gọi Supabase RPC

Thêm HTTP Request node sau Code node.

```text
Method: POST
URL: {{$env.SUPABASE_URL}}/rest/v1/rpc/ingest_kiotviet_batch
Body Content Type: JSON
Body: {{ $json }}
```

Headers:

```text
apikey: {{$env.SUPABASE_ANON_KEY}}
Authorization: Bearer {{$env.SUPABASE_ANON_KEY}}
Content-Type: application/json
```

Response thành công:

```json
{
  "run_id": "uuid",
  "inserted_or_updated_orders": 1,
  "items": 2,
  "payments": 1,
  "status": "success"
}
```

## 6. Kiểm tra sau khi chạy n8n

Chạy các query này trong Supabase SQL editor:

```sql
select * from public.sales_sync_runs order by started_at desc limit 5;
select * from public.sales_orders order by purchase_at desc limit 5;
select * from public.sales_order_items order by created_at desc limit 10;
select * from public.sales_payments order by created_at desc limit 10;
select * from public.cash_drawer_events order by occurred_at desc limit 10;
```

Khi các bảng có dữ liệu, webapp sẽ đọc được ở Bảng vận hành, Pivot, Chốt két và Báo cáo.

## 7. Test bằng Postman hoặc n8n HTTP node

Bạn có thể copy payload mẫu ở:

```text
docs/samples/supabase-rpc-ingest-payload.json
```

Gửi tới:

```text
POST https://your-supabase-domain/rest/v1/rpc/ingest_kiotviet_batch
```

Với headers:

```text
apikey: SUPABASE_ANON_KEY
Authorization: Bearer SUPABASE_ANON_KEY
Content-Type: application/json
```
