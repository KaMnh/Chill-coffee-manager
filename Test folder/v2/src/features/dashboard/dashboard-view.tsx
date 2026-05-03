"use client";

import { formatDateTime, formatTime, formatVND } from "@/lib/format";
import type { DashboardData, HandoverSession, ShiftAssignment } from "@/lib/types";
import { EmptyState, MetricCard, SyncIndicator } from "@/shared";
import type { ViewKey } from "../navigation";
import { HandoverPanel } from "./handover-panel";

export function DashboardView({
  dashboard,
  date,
  shifts,
  handover,
  setView,
  onOpenWizard,
  onTaskChange,
  onNoteSave,
  canEditChecklist,
  onEditChecklist
}: {
  dashboard: DashboardData;
  date: string;
  shifts: ShiftAssignment[];
  handover: HandoverSession | null;
  setView: (view: ViewKey) => void;
  onOpenWizard: () => void;
  onTaskChange: (taskId: string, isDone: boolean) => void;
  onNoteSave: (note: string) => void;
  canEditChecklist: boolean;
  onEditChecklist: () => void;
}) {
  const activeStaff = shifts.filter((shift) => shift.status === "checked_in");
  return (
    <div className="dashboardGrid">
      <section className="panel">
        <div className="panelHeader">
          <div>
            <p className="eyebrow">Shortcut vận hành</p>
            <h2>Bảng điều khiển nhanh</h2>
          </div>
          <span>{date}</span>
        </div>
        <div className="shortcutGrid">
          <button type="button" onClick={() => setView("expenses")}>
            <strong>Thêm chi</strong>
            <span>Mở form nhập nhanh</span>
          </button>
          <button type="button" onClick={() => setView("shifts")}>
            <strong>Ra/vào ca</strong>
            <span>Ghi nhận lượt làm</span>
          </button>
          <button type="button" onClick={() => setView("cash")}>
            <strong>Kiểm két nhanh</strong>
            <span>Đếm két tức thời</span>
          </button>
          <button type="button" onClick={onOpenWizard}>
            <strong>Đóng quầy</strong>
            <span>Đi theo từng bước</span>
          </button>
          <button type="button" onClick={() => setView("reports")}>
            <strong>In báo cáo</strong>
            <span>Phiếu chốt két</span>
          </button>
        </div>
      </section>
      <HandoverPanel
        handover={handover}
        onTaskChange={onTaskChange}
        onNoteSave={onNoteSave}
        canEdit={canEditChecklist}
        onEdit={onEditChecklist}
      />
      <section className="panel">
        <div className="panelHeader">
          <div>
            <p className="eyebrow">Chi phí hôm nay</p>
            <h2>Sổ chi trong ngày</h2>
          </div>
          <strong>{formatVND(dashboard.total_expenses)}</strong>
        </div>
        <div className="listRows">
          {dashboard.expenses.slice(0, 4).map((expense) => (
            <article className="listRow" key={expense.id}>
              <div>
                <strong>{expense.description}</strong>
                <span>
                  {expense.category_name ?? "Chi phí"} · {formatTime(expense.created_at)}
                </span>
              </div>
              <strong>{formatVND(expense.amount)}</strong>
            </article>
          ))}
          {dashboard.expenses.length === 0 && (
            <EmptyState title="Chưa có khoản chi" description="Khi nhân viên nhập chi, dòng mới sẽ hiện tại đây." />
          )}
        </div>
      </section>
      <section className="panel">
        <div className="panelHeader">
          <h2>Tình trạng quầy hôm nay</h2>
          <SyncIndicator finishedAt={dashboard.latest_sync?.finished_at} status={dashboard.latest_sync?.status} />
        </div>
        <div className="miniGrid">
          <MetricCard label="Nhân sự đang làm" value={activeStaff.length + " người"} />
          <MetricCard
            label="Kiểm két gần nhất"
            value={dashboard.latest_cash_count ? formatVND(dashboard.latest_cash_count.difference) : "Chưa có"}
          />
          <MetricCard label="Sync POS gần nhất" value={formatDateTime(dashboard.latest_sync?.finished_at)} />
        </div>
      </section>
      <section className="panel">
        <div className="panelHeader">
          <h2>Thu từ KiotViet</h2>
          <strong>Tổng thu {formatVND(dashboard.total_sales)}</strong>
        </div>
        <div className="listRows">
          {dashboard.sales_orders.length === 0 && (
            <EmptyState title="Chưa có đơn POS" description="Dữ liệu KiotViet sau khi sync sẽ hiện ở đây." />
          )}
          {dashboard.sales_orders.slice(0, 5).map((order) => (
            <article className="listRow" key={order.id}>
              <div>
                <strong>{order.invoice_code ?? order.order_code ?? "Hóa đơn"}</strong>
                <span>
                  {order.sold_by_name ?? "POS"} · {order.payment_method ?? "payment"}
                </span>
              </div>
              <strong>{formatVND(order.net_amount ?? order.total_payment ?? 0)}</strong>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
