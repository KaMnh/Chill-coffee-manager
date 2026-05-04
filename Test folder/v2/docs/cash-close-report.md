# Báo cáo chốt két hằng ngày

Báo cáo chốt két là chứng từ vận hành, nên backend lưu snapshot trong bảng `cash_close_reports`.

## Flow

1. Nhân viên/manager nhập mệnh giá ở màn `Chốt két`.
2. Frontend gọi RPC `save_cash_count`.
3. Nếu là chốt chính thức, frontend gọi RPC `finalize_cash_close_report`.
4. Backend tính và lưu snapshot:
   - tổng POS
   - tiền đầu ngày
   - POS cash
   - POS không tiền mặt
   - tiền chuyển khoản đã nhận
   - chi phí cash
   - lương đã phát
   - tổng đối soát
   - tiền thực đếm
   - chênh lệch
   - mệnh giá, số tờ và thành tiền từng dòng
   - sync snapshot time
5. Màn `Báo cáo chốt két` chỉ đọc report snapshot và in bằng `window.print()`.

## Vì sao cần snapshot?

Nếu sau khi chốt két có POS sync trễ hoặc chỉnh lại chi phí, báo cáo đã `final` vẫn giữ số liệu cũ. Đây là điều đúng cho chứng từ vận hành.

Nếu báo cáo sai, owner/manager dùng RPC `void_cash_close_report(report_id, reason)` để hủy mềm, không xóa dữ liệu gốc.

## Công thức chênh lệch

```text
Chênh lệch =
Tổng POS - ((Tiền thực đếm - Tiền vào ca) + Tiền chuyển khoản đã nhận + Chi phí cash + Lương đã phát cash)
```

`Tiền chuyển khoản đã nhận` là số chủ/quản lý xác nhận tại thời điểm chốt. Số này được lưu snapshot trong `cash_counts.bank_transfer_confirmed` và `cash_close_reports.bank_transfer_confirmed`.
