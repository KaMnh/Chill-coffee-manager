"use client";

import { formatDateTime, formatVND } from "@/lib/format";
import {
  SAFE_TRANSACTION_LABELS,
  SAFE_WITHDRAW_CATEGORY_LABELS,
  type SafeTransaction,
  type SafeTransactionType,
  type SafeWithdrawCategory
} from "@/lib/types";
import { EmptyState } from "@/shared";

const TYPE_OPTIONS: Array<{ value: "" | SafeTransactionType; label: string }> = [
  { value: "", label: "Tất cả loại" },
  { value: "initial_setup", label: SAFE_TRANSACTION_LABELS.initial_setup },
  { value: "deposit_close", label: SAFE_TRANSACTION_LABELS.deposit_close },
  { value: "withdraw_open", label: SAFE_TRANSACTION_LABELS.withdraw_open },
  { value: "withdraw_other", label: SAFE_TRANSACTION_LABELS.withdraw_other },
  { value: "adjustment", label: SAFE_TRANSACTION_LABELS.adjustment }
];

export function SafeHistoryTable({
  transactions,
  isLoading,
  filterFrom,
  filterTo,
  filterType,
  onFilterFromChange,
  onFilterToChange,
  onFilterTypeChange
}: {
  transactions: SafeTransaction[];
  isLoading: boolean;
  filterFrom: string;
  filterTo: string;
  filterType: "" | SafeTransactionType;
  onFilterFromChange: (value: string) => void;
  onFilterToChange: (value: string) => void;
  onFilterTypeChange: (value: "" | SafeTransactionType) => void;
}) {
  return (
    <section className="panel safeHistoryPanel">
      <div className="panelHeader">
        <div>
          <p className="eyebrow">Sổ quỹ</p>
          <h2>Lịch sử giao dịch</h2>
        </div>
        <div className="safeHistoryFilters">
          <label className="fieldStack inline">
            <span className="srOnly">Từ ngày</span>
            <input
              type="date"
              value={filterFrom}
              onChange={(event) => onFilterFromChange(event.target.value)}
              aria-label="Từ ngày"
            />
          </label>
          <label className="fieldStack inline">
            <span className="srOnly">Đến ngày</span>
            <input
              type="date"
              value={filterTo}
              onChange={(event) => onFilterToChange(event.target.value)}
              aria-label="Đến ngày"
            />
          </label>
          <label className="fieldStack inline">
            <span className="srOnly">Loại</span>
            <select
              value={filterType}
              onChange={(event) => onFilterTypeChange(event.target.value as "" | SafeTransactionType)}
              aria-label="Lọc theo loại"
            >
              {TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {isLoading ? (
        <p className="muted">Đang tải...</p>
      ) : transactions.length === 0 ? (
        <EmptyState
          title="Chưa có giao dịch"
          description="Khi chốt két cuối ngày, dư sẽ tự động nạp vào đây. Hoặc bấm Điều chỉnh để khởi tạo."
        />
      ) : (
        <div className="tableWrap safeHistoryTable">
          <table>
            <thead>
              <tr>
                <th>Thời gian</th>
                <th>Loại giao dịch</th>
                <th className="alignRight">Số tiền</th>
                <th className="alignRight">Số dư sau</th>
                <th>Ghi chú</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((t) => (
                <tr key={t.id}>
                  <td className="nowrap">{formatDateTime(t.occurred_at)}</td>
                  <td>
                    <span className={"badge " + badgeClass(t.transaction_type)}>
                      {SAFE_TRANSACTION_LABELS[t.transaction_type]}
                    </span>
                    {t.reason_category && (
                      <span className="muted safeReasonInline">
                        {" "}
                        · {SAFE_WITHDRAW_CATEGORY_LABELS[t.reason_category as SafeWithdrawCategory] ??
                          t.reason_category}
                      </span>
                    )}
                  </td>
                  <td className={"alignRight nowrap " + (t.amount >= 0 ? "goodText" : "dangerText")}>
                    {t.amount >= 0 ? "+" : ""}
                    {formatVND(t.amount)}
                  </td>
                  <td className="alignRight nowrap">{formatVND(t.balance_after)}</td>
                  <td className="muted">{t.description ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function badgeClass(type: SafeTransactionType): string {
  switch (type) {
    case "initial_setup":
      return "soft";
    case "deposit_close":
      return "good";
    case "withdraw_open":
    case "withdraw_other":
      return "soft";
    case "adjustment":
      return "soft";
    default:
      return "soft";
  }
}
