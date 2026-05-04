"use client";

import { formatVND } from "@/lib/format";
import { ArrowDownToLine, ArrowUpFromLine, Calculator, PiggyBank, SlidersHorizontal } from "@/shared/icons";

export function SafeBalanceCard({
  balance,
  isLoading,
  isFetching,
  transactionCount,
  lastUpdatedAt,
  canManage,
  onWithdraw,
  onAdjust,
  onCount
}: {
  balance: number;
  isLoading: boolean;
  isFetching: boolean;
  transactionCount: number;
  lastUpdatedAt: string | null;
  canManage: boolean;
  onWithdraw: () => void;
  onAdjust: () => void;
  onCount: () => void;
}) {
  return (
    <section className="panel safeBalanceCard">
      <div className="safeBalanceLeft">
        <div className="safeBalanceHeader">
          <PiggyBank size={20} aria-hidden="true" />
          <p className="eyebrow">Số dư hiện tại</p>
          {isFetching && !isLoading && <span className="refreshPill">Đang cập nhật...</span>}
        </div>
        <strong className="safeBalanceAmount">{isLoading ? "—" : formatVND(balance)}</strong>
        <span className="muted safeBalanceMeta">
          {transactionCount > 0
            ? `${transactionCount} giao dịch · cập nhật ${lastUpdatedAt ?? "lần đầu"}`
            : "Chưa có giao dịch nào — bấm Điều chỉnh để khởi tạo."}
        </span>
      </div>
      {canManage && (
        <div className="safeBalanceActions">
          <button type="button" className="ghostButton" onClick={onWithdraw}>
            <ArrowUpFromLine size={16} />
            <span className="iconLabel"> Rút khác</span>
          </button>
          <button type="button" className="ghostButton" onClick={onCount}>
            <Calculator size={16} />
            <span className="iconLabel"> Đếm sổ quỹ</span>
          </button>
          <button type="button" className="primaryButton" onClick={onAdjust}>
            <SlidersHorizontal size={16} />
            <span className="iconLabel"> Điều chỉnh</span>
          </button>
        </div>
      )}
    </section>
  );
}
