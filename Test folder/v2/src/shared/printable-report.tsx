import { formatDateTime, formatVND } from "@/lib/format";
import type { CashCloseReport } from "@/lib/types";

export function PrintableReport({ report }: { report: CashCloseReport }) {
  const denominationRows = Object.entries(report.denominations_json ?? {})
    .map(([denomination, count]) => ({ denomination: Number(denomination), count: Number(count) }))
    .filter((row) => row.denomination > 0)
    .sort((a, b) => b.denomination - a.denomination);

  return (
    <article className="printableReport">
      <div className="printHeader">
        <img src="/chill-logo.png" alt="Chill Coffee Garden" />
        <div>
          <p>Chill Coffee Garden</p>
          <h1>Báo cáo chốt két</h1>
          <span>
            {report.business_date} · {formatDateTime(report.closed_at)}
          </span>
        </div>
      </div>
      <div className="reportStatusLine">
        <strong>{report.report_status === "final" ? "Đã chốt" : report.report_status}</strong>
        <span>Snapshot POS: {formatDateTime(report.sync_snapshot_at)}</span>
      </div>
      <div className="reportRows">
        <span>Tổng POS</span>
        <strong>{formatVND(report.pos_total ?? report.pos_cash_total)}</strong>
        <span>POS tiền mặt</span>
        <strong>{formatVND(report.pos_cash_total)}</strong>
        <span>POS không tiền mặt</span>
        <strong>{formatVND(report.pos_non_cash_total ?? 0)}</strong>
        <span>Tiền đầu ngày</span>
        <strong>{formatVND(report.opening_cash)}</strong>
        <span>Thực đếm trong két</span>
        <strong>{formatVND(report.physical_cash)}</strong>
        <span>Chuyển khoản đã nhận</span>
        <strong>{formatVND(report.bank_transfer_confirmed ?? 0)}</strong>
        <span>Chi phí cash</span>
        <strong>{formatVND(report.expense_cash_total)}</strong>
        <span>Lương đã phát</span>
        <strong>{formatVND(report.payroll_cash_total)}</strong>
        <span>Tổng đối soát</span>
        <strong>{formatVND(report.reconciliation_total ?? report.theory_cash)}</strong>
        <span>Chênh lệch</span>
        <strong>{formatVND(report.difference)}</strong>
      </div>
      <h3>Mệnh giá</h3>
      {denominationRows.length === 0 ? (
        <div className="denomPrintEmpty">Chưa có dữ liệu mệnh giá</div>
      ) : (
        <table className="denomPrintTable">
          <thead>
            <tr>
              <th>Mệnh giá</th>
              <th>Số tờ</th>
              <th>Thành tiền</th>
            </tr>
          </thead>
          <tbody>
            {denominationRows.map((row) => (
              <tr key={row.denomination}>
                <td>{formatVND(row.denomination)}</td>
                <td>{row.count}</td>
                <td>
                  <strong>{formatVND(row.denomination * row.count)}</strong>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="reportNote">Ghi chú: {report.note || "Không có"}</p>
      <div className="signatureGrid">
        <span>Người chốt</span>
        <span>Quản lý</span>
      </div>
    </article>
  );
}
