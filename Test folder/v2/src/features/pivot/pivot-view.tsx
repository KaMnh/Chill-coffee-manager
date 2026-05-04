import { formatVND } from "@/lib/format";
import type { DashboardData } from "@/lib/types";

export function PivotView({ dashboard }: { dashboard: DashboardData }) {
  return (
    <section className="panel">
      <div className="panelHeader">
        <div>
          <p className="eyebrow">Pivot nhanh</p>
          <h2>Doanh thu theo hóa đơn</h2>
        </div>
        <span>{dashboard.sales_orders.length} dòng</span>
      </div>
      <div className="tableWrap">
        <table>
          <thead>
            <tr>
              <th>Hóa đơn</th>
              <th>Người bán</th>
              <th>Thanh toán</th>
              <th>Doanh thu</th>
            </tr>
          </thead>
          <tbody>
            {dashboard.sales_orders.length === 0 && (
              <tr>
                <td colSpan={4}>Chưa có dữ liệu POS.</td>
              </tr>
            )}
            {dashboard.sales_orders.map((order) => (
              <tr key={order.id}>
                <td>{order.invoice_code}</td>
                <td>{order.sold_by_name}</td>
                <td>{order.payment_method}</td>
                <td>{formatVND(order.net_amount ?? 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
