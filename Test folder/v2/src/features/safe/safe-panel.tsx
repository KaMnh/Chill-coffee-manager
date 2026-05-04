"use client";

import { useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useSafeBalanceQuery, useSafeTransactionsQuery } from "@/hooks/queries";
import { formatDateTime } from "@/lib/format";
import type { Account, SafeTransactionType } from "@/lib/types";
import type { Notice } from "@/shared";
import { AdjustModal } from "./adjust-modal";
import { CountModal } from "./count-modal";
import { SafeBalanceCard } from "./safe-balance-card";
import { SafeHistoryTable } from "./safe-history-table";
import { WithdrawModal } from "./withdraw-modal";

/**
 * SafePanel — main view cho tab "Sổ quỹ" (owner only).
 * Render khi activeView === 'safe' trong page.tsx.
 */
export function SafePanel({
  supabase,
  account,
  onNotice
}: {
  supabase: SupabaseClient;
  account: Account;
  onNotice: (notice: Notice) => void;
}) {
  const canManage = account.role === "owner";
  const balanceQuery = useSafeBalanceQuery(supabase);

  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");
  const [filterType, setFilterType] = useState<"" | SafeTransactionType>("");

  const transactionsQuery = useSafeTransactionsQuery(supabase, {
    fromDate: filterFrom || undefined,
    toDate: filterTo || undefined,
    type: filterType || undefined
  });

  const [showWithdraw, setShowWithdraw] = useState(false);
  const [showAdjust, setShowAdjust] = useState(false);
  const [showCount, setShowCount] = useState(false);

  const transactions = useMemo(() => transactionsQuery.data ?? [], [transactionsQuery.data]);
  const lastTransaction = transactions[0];
  const lastUpdatedLabel = lastTransaction ? formatDateTime(lastTransaction.occurred_at) : null;

  return (
    <div className="stack">
      <SafeBalanceCard
        balance={balanceQuery.data ?? 0}
        isLoading={balanceQuery.isLoading}
        isFetching={balanceQuery.isFetching}
        transactionCount={transactions.length}
        lastUpdatedAt={lastUpdatedLabel}
        canManage={canManage}
        onWithdraw={() => setShowWithdraw(true)}
        onAdjust={() => setShowAdjust(true)}
        onCount={() => setShowCount(true)}
      />
      <SafeHistoryTable
        transactions={transactions}
        isLoading={transactionsQuery.isLoading}
        filterFrom={filterFrom}
        filterTo={filterTo}
        filterType={filterType}
        onFilterFromChange={setFilterFrom}
        onFilterToChange={setFilterTo}
        onFilterTypeChange={setFilterType}
      />
      {showWithdraw && canManage && (
        <WithdrawModal
          supabase={supabase}
          currentBalance={balanceQuery.data ?? 0}
          onClose={() => setShowWithdraw(false)}
          onSaved={() => {
            setShowWithdraw(false);
            void balanceQuery.refetch();
            void transactionsQuery.refetch();
          }}
          onNotice={onNotice}
        />
      )}
      {showAdjust && canManage && (
        <AdjustModal
          supabase={supabase}
          currentBalance={balanceQuery.data ?? 0}
          hasTransactions={transactions.length > 0}
          onClose={() => setShowAdjust(false)}
          onSaved={() => {
            setShowAdjust(false);
            void balanceQuery.refetch();
            void transactionsQuery.refetch();
          }}
          onNotice={onNotice}
        />
      )}
      {showCount && canManage && (
        <CountModal
          supabase={supabase}
          expectedBalance={balanceQuery.data ?? 0}
          onClose={() => setShowCount(false)}
          onSaved={() => {
            setShowCount(false);
            void balanceQuery.refetch();
          }}
          onNotice={onNotice}
        />
      )}
    </div>
  );
}
