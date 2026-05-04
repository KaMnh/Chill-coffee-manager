"use client";

import { useState } from "react";
import { formatDateTime, formatNumber, formatVND } from "@/lib/format";
import type { CashCount } from "@/lib/types";
import { EmptyState } from "@/shared";
import { DENOMINATIONS } from "./denominations";

/**
 * Hiển thị lịch sử kiểm két (cash_counts) trong ngày.
 * Bao gồm cả "Kiểm két nhanh" (spot_audit) lẫn "Chốt két" (shift_close).
 *
 * Data load qua RPC `list_cash_counts` (xem database/002_functions.sql).
 * Component nhận sẵn list — cha (CashPanel) dùng useCashCountsQuery để fetch
 * và pass xuống. Click 1 row để expand chi tiết mệnh giá + POS snapshot.
 */
export function CashHistorySection({
  counts,
  isLoading,
  isFetching
}: {
  counts: CashCount[];
  isLoading: boolean;
  isFetching: boolean;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  function toggleExpand(id: string) {
    setExpandedId((current) => (current === id ? null : id));
  }

  return (
    <section className="panel">
      <div className="panelHeader">
        <div>
          <p className="eyebrow">Lịch sử trong ngày</p>
          <h2>Kiểm két & chốt két</h2>
        </div>
        {isFetching && !isLoading && <span className="refreshPill">Đang cập nhật...</span>}
      </div>
      {isLoading && counts.length === 0 ? (
        <EmptyState title="Đang tải..." description="Đang lấy lịch sử kiểm két." />
      ) : counts.length === 0 ? (
        <EmptyState
          title="Chưa có lượt kiểm két nào hôm nay"
          description='Bấm "Kiểm két nhanh" để lưu một spot audit, hoặc "Chốt két & tạo báo cáo" để chốt cuối ca.'
        />
      ) : (
        <div className="cashHistoryList">
          {counts.map((count) => {
            const isExpanded = expandedId === count.id;
            const isShiftClose = count.count_type === "shift_close";
            return (
              <article
                key={count.id}
                className={"cashHistoryRow" + (isExpanded ? " expanded" : "")}
              >
                <button
                  type="button"
                  className="cashHistoryRowHeader"
                  onClick={() => toggleExpand(count.id)}
                  aria-expanded={isExpanded}
                >
                  <div className="cashHistoryRowMeta">
                    <span
                      className={"cashHistoryBadge " + (isShiftClose ? "shiftClose" : "spotAudit")}
                    >
                      {isShiftClose ? "Chốt két" : "Kiểm két nhanh"}
                    </span>
                    <span className="cashHistoryTime">{formatDateTime(count.counted_at)}</span>
                  </div>
                  <div className="cashHistoryRowFigures">
                    <span className="muted">Đếm thực</span>
                    <strong>{formatVND(count.total_physical)}</strong>
                    <span className="muted">Chênh lệch</span>
                    <strong className={count.difference === 0 ? "goodText" : "dangerText"}>
                      {formatVND(count.difference)}
                    </strong>
                  </div>
                  <span className="cashHistoryToggle" aria-hidden="true">
                    {isExpanded ? "▲" : "▼"}
                  </span>
                </button>
                {isExpanded && <CashHistoryDetail count={count} />}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function CashHistoryDetail({ count }: { count: CashCount }) {
  const denominations = count.denominations_json ?? {};
  const hasDenominations = Object.values(denominations).some((value) => Number(value) > 0);

  return (
    <div className="cashHistoryDetail">
      <div className="cashHistoryDetailGrid">
        <section>
          <p className="eyebrow">Chi tiết mệnh giá</p>
          {!hasDenominations ? (
            <p className="muted">Không có dữ liệu mệnh giá.</p>
          ) : (
            <div className="cashHistoryDenomGrid">
              {DENOMINATIONS.map((denom) => {
                const qty = Number(denominations[String(denom)] ?? 0);
                if (qty <= 0) return null;
                return (
                  <div className="cashHistoryDenomCell" key={denom}>
                    <strong>{formatVND(denom)}</strong>
                    <span>× {formatNumber(qty)}</span>
                    <em>{formatVND(denom * qty)}</em>
                  </div>
                );
              })}
            </div>
          )}
        </section>
        <section>
          <p className="eyebrow">POS & đối soát tại thời điểm đếm</p>
          <dl className="cashHistorySnapshot">
            <dt>Tổng POS</dt>
            <dd>{formatVND(count.pos_total ?? 0)}</dd>
            <dt>POS tiền mặt</dt>
            <dd>{formatVND(count.pos_cash_total ?? 0)}</dd>
            <dt>POS chuyển khoản</dt>
            <dd>{formatVND(count.pos_non_cash_total ?? 0)}</dd>
            <dt>Tiền vào ca</dt>
            <dd>{formatVND(count.opening_cash ?? 0)}</dd>
            <dt>Chuyển khoản đã nhận</dt>
            <dd>{formatVND(count.bank_transfer_confirmed ?? 0)}</dd>
            <dt>Tổng đối soát</dt>
            <dd>{formatVND(count.reconciliation_total ?? 0)}</dd>
            <dt>Lý thuyết</dt>
            <dd>{formatVND(count.total_theory ?? 0)}</dd>
            <dt>Trạng thái báo cáo</dt>
            <dd>
              {count.report_id
                ? count.report_status === "final"
                  ? "Đã chốt"
                  : count.report_status ?? "—"
                : "Chưa chốt"}
            </dd>
          </dl>
        </section>
      </div>
      {count.note && (
        <div className="cashHistoryNote">
          <p className="eyebrow">Ghi chú</p>
          <p>{count.note}</p>
        </div>
      )}
    </div>
  );
}
