"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useQueryClient } from "@tanstack/react-query";
import { completeHandoverSession, updateHandoverNote, updateHandoverTask } from "@/lib/data";
import { formatVND, todayIso } from "@/lib/format";
import { hasSupabaseConfig } from "@/lib/supabase/client";
import type {
  CashCloseReport,
  DashboardData,
  ExpenseTemplate,
  HandoverSession
} from "@/lib/types";
import { EmptyState, MetricCard, NoticeBar, OfflineBanner, type Notice } from "@/shared";
import { LoginPanel } from "@/features/auth/login-panel";
import { DashboardView } from "@/features/dashboard/dashboard-view";
import { ExpenseForm } from "@/features/expenses/expense-form";
import { ShiftPanel } from "@/features/shifts/shift-panel";
import { CashPanel } from "@/features/cash/cash-panel";
import { LoadingScreen } from "./loading";

// Lazy: only loaded when the user opens these modals/views.
const ChecklistEditorModal = dynamic(
  () => import("@/features/handover/checklist-editor-modal").then((m) => m.ChecklistEditorModal),
  { ssr: false, loading: () => <div className="modalBackdrop" /> }
);
const EndOfDayWizard = dynamic(
  () => import("@/features/handover/end-of-day-wizard").then((m) => m.EndOfDayWizard),
  { ssr: false, loading: () => <div className="modalBackdrop" /> }
);
const PivotView = dynamic(() => import("@/features/pivot/pivot-view").then((m) => m.PivotView), { ssr: false });
const SettingsView = dynamic(
  () => import("@/features/settings/settings-view").then((m) => m.SettingsView),
  { ssr: false }
);
const ReportsPanel = dynamic(
  () => import("@/features/reports/reports-panel").then((m) => m.ReportsPanel),
  { ssr: false }
);
import { NAV_ITEMS, canSee, getVisibleNav, type ViewKey } from "@/features/navigation";
import { LogOut, Menu, RefreshCw } from "@/shared/icons";
import { useSupabase } from "@/hooks/use-supabase";
import {
  queryKeys,
  useAccountQuery,
  useAppSettingsQuery,
  useCashOpeningQuery,
  useDashboardQuery,
  useEmployeesQuery,
  useExpenseCategoriesQuery,
  useExpenseTemplatesQuery,
  useHandoverQuery,
  usePayrollQuery,
  useReportsQuery,
  useSettingsAccountsQuery,
  useShiftsQuery
} from "@/hooks/queries";
import { usePosSync } from "@/hooks/use-pos-sync";
import { useRealtimeInvalidate } from "@/hooks/use-realtime-invalidate";
import { useAuthCookieSync } from "@/hooks/use-auth-cookie-sync";

function emptyDashboard(date: string): DashboardData {
  return {
    business_date: date,
    total_sales: 0,
    cash_sales: 0,
    non_cash_sales: 0,
    opening_cash: 0,
    total_expenses: 0,
    payroll_paid: 0,
    active_staff: 0,
    expenses: [],
    sales_orders: []
  };
}

export default function Home() {
  const supabase = useSupabase();
  const queryClient = useQueryClient();
  const clientError = !hasSupabaseConfig() ? "Thiếu cấu hình Supabase. Tạo .env.local từ .env.example." : "";

  const [notice, setNotice] = useState<Notice>(null);
  const [isAuthed, setAuthed] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [view, setView] = useState<ViewKey>("dashboard");
  const [businessDate, setBusinessDate] = useState(todayIso());
  const [selectedReport, setSelectedReport] = useState<CashCloseReport | null>(null);
  const [selectedExpenseTemplate, setSelectedExpenseTemplate] = useState<ExpenseTemplate | null>(null);
  const [isWizardOpen, setWizardOpen] = useState(false);
  const [isChecklistEditorOpen, setChecklistEditorOpen] = useState(false);
  const [isNavOpen, setNavOpen] = useState(false);

  // Auth lifecycle (kept as-is — Supabase auth doesn't fit useQuery cleanly)
  useEffect(() => {
    if (!supabase) {
      setAuthChecked(true);
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      setAuthed(Boolean(data.session));
      setAuthChecked(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthed(Boolean(session));
      setAuthChecked(true);
      if (!session) {
        queryClient.removeQueries({ queryKey: queryKeys.account() });
      }
    });
    return () => data.subscription.unsubscribe();
  }, [queryClient, supabase]);

  // Queries — only run when authed.
  const accountQuery = useAccountQuery(supabase, isAuthed);
  const account = accountQuery.data ?? null;
  const role = account?.role;
  const isAdmin = role === "owner" || role === "manager";

  const settingsAccountsQuery = useSettingsAccountsQuery(supabase, isAuthed && isAdmin);
  const appSettingsQuery = useAppSettingsQuery(supabase, isAuthed);
  const dashboardQuery = useDashboardQuery(supabase, businessDate, isAuthed);
  const categoriesQuery = useExpenseCategoriesQuery(supabase, isAuthed);
  const templatesQuery = useExpenseTemplatesQuery(supabase, isAuthed);
  const employeesQuery = useEmployeesQuery(supabase, isAuthed);
  const shiftsQuery = useShiftsQuery(supabase, businessDate, isAuthed);
  const payrollQuery = usePayrollQuery(supabase, businessDate, isAuthed);
  const reportsQuery = useReportsQuery(supabase, businessDate, isAuthed);
  const cashOpeningQuery = useCashOpeningQuery(supabase, businessDate, isAuthed);
  const handoverQuery = useHandoverQuery(supabase, businessDate, isAuthed);

  const dashboard = dashboardQuery.data ?? emptyDashboard(businessDate);
  const appSettings = appSettingsQuery.data ?? { sidebar_defaults: {}, handover_default_tasks: [] };
  const handover = handoverQuery.data ?? null;
  const cashOpening = cashOpeningQuery.data ?? null;
  const reports = useMemo(() => reportsQuery.data ?? [], [reportsQuery.data]);
  const categories = categoriesQuery.data ?? [];
  const templates = templatesQuery.data ?? [];
  const employees = employeesQuery.data ?? [];
  const shifts = shiftsQuery.data ?? [];
  const payroll = payrollQuery.data ?? [];
  const settingsAccounts = settingsAccountsQuery.data ?? [];

  // Auto-select latest report when reports list changes.
  useEffect(() => {
    setSelectedReport((current) => current ?? reports[0] ?? null);
  }, [reports]);

  // POS auto-sync (replaces autoSyncKeys + accountRef).
  const posSyncMutation = usePosSync(supabase, businessDate, account, dashboard.latest_sync);

  // Realtime invalidation when sync runs / reports / handover / expenses change.
  useRealtimeInvalidate(supabase, businessDate);

  // Defense-in-depth: mirror auth state to a sentinel cookie for middleware.
  useAuthCookieSync(supabase);

  const isInitialLoading = !authChecked || (isAuthed && accountQuery.isLoading);
  const isRefreshing =
    dashboardQuery.isFetching ||
    shiftsQuery.isFetching ||
    payrollQuery.isFetching ||
    reportsQuery.isFetching ||
    cashOpeningQuery.isFetching ||
    handoverQuery.isFetching;

  const refresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: queryKeys.dashboard(businessDate) });
    queryClient.invalidateQueries({ queryKey: queryKeys.shifts(businessDate) });
    queryClient.invalidateQueries({ queryKey: queryKeys.payroll(businessDate) });
    queryClient.invalidateQueries({ queryKey: queryKeys.reports(businessDate) });
    queryClient.invalidateQueries({ queryKey: queryKeys.cashOpening(businessDate) });
    queryClient.invalidateQueries({ queryKey: queryKeys.cashCounts(businessDate) });
    queryClient.invalidateQueries({ queryKey: queryKeys.handover(businessDate) });
    queryClient.invalidateQueries({ queryKey: queryKeys.templates() });
    queryClient.invalidateQueries({ queryKey: queryKeys.employees() });
  }, [businessDate, queryClient]);

  const requestPosSync = useCallback(
    async (force: boolean, reason: string) => {
      if (!supabase || !account || account.role === "employee_viewer") {
        refresh();
        return;
      }
      try {
        const result = await posSyncMutation.mutateAsync({ force, reason });
        if (result.status === "skipped") {
          setNotice({ type: "info", message: result.message ?? "POS vừa được đồng bộ gần đây, chưa cần sync lại." });
          refresh();
          return;
        }
        setNotice({ type: "success", message: result.message ?? "Đã sync POS từ KiotViet." });
        // Realtime will invalidate dashboard when sync finishes; nudge after a short delay too.
        window.setTimeout(refresh, 2500);
      } catch (error) {
        setNotice({
          type: "error",
          message: error instanceof Error ? error.message : "Không gọi được Edge Function cập nhật POS."
        });
      }
    },
    [account, posSyncMutation, refresh, supabase]
  );

  // Escape closes mobile nav.
  useEffect(() => {
    if (!isNavOpen) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setNavOpen(false);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isNavOpen]);

  async function handleHandoverTask(taskId: string, isDone: boolean) {
    if (!supabase || !handover) return;
    // Optimistic update
    queryClient.setQueryData<HandoverSession | null>(queryKeys.handover(businessDate), (current) =>
      current
        ? {
            ...current,
            tasks: current.tasks.map((task) =>
              task.id === taskId
                ? { ...task, is_done: isDone, checked_at: isDone ? new Date().toISOString() : null }
                : task
            )
          }
        : current
    );
    try {
      await updateHandoverTask(supabase, taskId, isDone);
      setNotice({ type: "success", message: "Đã cập nhật checklist bàn giao." });
    } catch (error) {
      setNotice({
        type: "error",
        message: error instanceof Error ? error.message : "Không cập nhật được checklist."
      });
    } finally {
      queryClient.invalidateQueries({ queryKey: queryKeys.handover(businessDate) });
    }
  }

  async function handleHandoverNote(note: string) {
    if (!supabase || !handover) return;
    queryClient.setQueryData<HandoverSession | null>(queryKeys.handover(businessDate), (current) =>
      current ? { ...current, note } : current
    );
    try {
      await updateHandoverNote(supabase, handover.id, note);
    } catch (error) {
      setNotice({
        type: "error",
        message: error instanceof Error ? error.message : "Không lưu được ghi chú bàn giao."
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.handover(businessDate) });
    }
  }

  async function handleCompleteHandover() {
    if (!supabase || !handover) return;
    await completeHandoverSession(supabase, handover.id);
    setNotice({ type: "success", message: "Đã hoàn tất sổ bàn giao." });
    queryClient.invalidateQueries({ queryKey: queryKeys.handover(businessDate) });
  }

  if (!supabase || clientError) {
    return (
      <main className="loginShell">
        <section className="loginPanel">
          <img src="/chill-logo.png" alt="Chill Coffee Garden" className="loginLogo" />
          <h1>Thiếu cấu hình Supabase</h1>
          <p className="muted">
            Tạo .env.local từ .env.example, sau đó điền NEXT_PUBLIC_SUPABASE_URL và NEXT_PUBLIC_SUPABASE_ANON_KEY của
            Supabase self-hosted.
          </p>
          {clientError && <p className="dangerText">{clientError}</p>}
        </section>
      </main>
    );
  }

  if (authChecked && !isAuthed) {
    return (
      <>
        <OfflineBanner />
        <NoticeBar notice={notice} onClear={() => setNotice(null)} />
        <LoginPanel supabase={supabase} onNotice={setNotice} />
      </>
    );
  }
  if (isInitialLoading) return <LoadingScreen />;

  if (!account || account.status !== "active") {
    return (
      <main className="loginShell">
        <section className="loginPanel">
          <img src="/chill-logo.png" alt="Chill Coffee Garden" className="loginLogo" />
          <h1>Tài khoản chờ duyệt</h1>
          <p className="muted">
            Tài khoản Auth đã đăng nhập, nhưng chưa có employee_accounts active. Owner/manager cần duyệt trước khi dùng.
          </p>
          <button className="ghostButton" type="button" onClick={() => supabase.auth.signOut()}>
            Đăng xuất
          </button>
        </section>
      </main>
    );
  }

  const visibleNav = getVisibleNav(account, appSettings);
  const activeView = canSee(account, view, appSettings) ? view : visibleNav[0]?.key ?? "dashboard";
  const activeLabel = NAV_ITEMS.find((item) => item.key === activeView)?.label ?? "Bảng vận hành";
  const isSyncingPos = posSyncMutation.isPending;

  function handleSelectView(nextView: ViewKey) {
    setView(nextView);
    setNavOpen(false);
  }

  function handleSettingsChange(next: typeof appSettings) {
    queryClient.setQueryData(queryKeys.appSettings(), next);
  }

  function handleSettingsAccountsChange(next: typeof settingsAccounts) {
    queryClient.setQueryData(queryKeys.settingsAccounts(), next);
  }

  return (
    <main className="appShell">
      <OfflineBanner />
      {isNavOpen && (
        <button className="navBackdrop" type="button" aria-label="Đóng menu" onClick={() => setNavOpen(false)} />
      )}
      <aside className={"sidebar " + (isNavOpen ? "open" : "")} aria-label="Điều hướng chính">
        <img src="/chill-logo.png" alt="Chill Coffee Garden" className="sidebarLogo" />
        <div className="brandBlock">
          <strong>Chill Coffee Garden</strong>
          <span>Operations v2</span>
        </div>
        <nav className="navList">
          {visibleNav.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.key}
                type="button"
                aria-label={item.label}
                title={item.label}
                className={"navButton " + (activeView === item.key ? "active" : "")}
                onClick={() => handleSelectView(item.key)}
              >
                <Icon size={18} aria-hidden="true" />
                <span className="iconLabel">{item.label}</span>
              </button>
            );
          })}
        </nav>
        <div className="accountBox">
          <strong>{account.employee?.name ?? "Người dùng"}</strong>
          <span>{account.role}</span>
          <button className="iconButton" type="button" onClick={() => supabase.auth.signOut()}>
            <LogOut size={14} aria-hidden="true" />
            <span className="iconLabel"> Đăng xuất</span>
          </button>
        </div>
      </aside>
      <section className="mainPanel">
        <NoticeBar notice={notice} onClear={() => setNotice(null)} />
        <header className="pageHeader">
          <div className="pageTitleGroup">
            <button className="mobileMenuButton" type="button" aria-label="Mở menu" onClick={() => setNavOpen(true)}>
              <Menu size={22} aria-hidden="true" />
            </button>
            <div>
              <h1>{activeLabel}</h1>
              {isRefreshing && <span className="refreshPill">Đang cập nhật dữ liệu...</span>}
            </div>
          </div>
          <div className="headerActions">
            <input type="date" value={businessDate} onChange={(event) => setBusinessDate(event.target.value)} />
            <button
              className="ghostButton"
              type="button"
              disabled={isSyncingPos}
              aria-label={isSyncingPos ? "Đang sync POS" : "Làm mới"}
              title={isSyncingPos ? "Đang sync POS" : "Làm mới"}
              onClick={() => requestPosSync(true, "manual_refresh")}
            >
              <RefreshCw size={16} aria-hidden="true" className={isSyncingPos ? "spinning" : ""} />
              <span className="iconLabel">{isSyncingPos ? " Đang sync POS..." : " Làm mới"}</span>
            </button>
          </div>
        </header>

        <section className="metricsGrid">
          <MetricCard label="Tổng thu POS" value={formatVND(dashboard.total_sales)} icon="POS" />
          <MetricCard label="Thu tiền mặt" value={formatVND(dashboard.cash_sales)} icon="₫" />
          <MetricCard label="Tổng chi" value={formatVND(dashboard.total_expenses)} icon="CHI" />
          <MetricCard label="Lương đã phát" value={formatVND(dashboard.payroll_paid)} icon="L" />
          <MetricCard label="Đang trong ca" value={dashboard.active_staff + " nhân viên"} icon="NV" />
        </section>
        {activeView === "dashboard" && (
          <DashboardView
            dashboard={dashboard}
            date={businessDate}
            shifts={shifts}
            handover={handover}
            setView={handleSelectView}
            onOpenWizard={() => setWizardOpen(true)}
            onTaskChange={handleHandoverTask}
            onNoteSave={handleHandoverNote}
            canEditChecklist={isAdmin}
            onEditChecklist={() => setChecklistEditorOpen(true)}
          />
        )}
        {activeView === "expenses" && (
          <div className="expenseGrid expenseGridTwo">
            <ExpenseForm
              supabase={supabase}
              date={businessDate}
              categories={categories}
              templates={templates}
              selectedTemplate={selectedExpenseTemplate}
              onTemplateConsumed={() => setSelectedExpenseTemplate(null)}
              onSaved={refresh}
              onNotice={setNotice}
            />
            <aside className="panel compactPanel">
              <div className="panelHeader">
                <h2>Lịch sử ngày</h2>
                <strong>{formatVND(dashboard.total_expenses)}</strong>
              </div>
              <div className="listRows">
                {dashboard.expenses.length === 0 && (
                  <EmptyState title="Chưa có khoản chi" description="Các khoản chi trong ngày sẽ xuất hiện ở đây." />
                )}
                {dashboard.expenses.map((expense) => (
                  <article className="listRow" key={expense.id}>
                    <div>
                      <strong>{expense.description}</strong>
                      <span>
                        {expense.quantity ?? 1} {expense.unit ?? ""}
                      </span>
                    </div>
                    <strong>{formatVND(expense.amount)}</strong>
                  </article>
                ))}
              </div>
            </aside>
          </div>
        )}
        {activeView === "shifts" && (
          <ShiftPanel
            supabase={supabase}
            account={account}
            date={businessDate}
            employees={employees}
            shifts={shifts}
            payroll={payroll}
            onRefresh={refresh}
            onNotice={setNotice}
          />
        )}
        {activeView === "cash" && (
          <CashPanel
            supabase={supabase}
            account={account}
            date={businessDate}
            dashboard={dashboard}
            cashOpening={cashOpening}
            onRefresh={refresh}
            onNotice={setNotice}
          />
        )}
        {activeView === "reports" && (
          <ReportsPanel
            supabase={supabase}
            date={businessDate}
            reports={reports}
            selectedReport={selectedReport}
            setSelectedReport={setSelectedReport}
            onRefresh={refresh}
            onNotice={setNotice}
          />
        )}
        {activeView === "pivot" && <PivotView dashboard={dashboard} />}
        {activeView === "settings" && (
          <SettingsView
            supabase={supabase}
            account={account}
            appSettings={appSettings}
            settingsAccounts={settingsAccounts}
            onSettingsChange={handleSettingsChange}
            onAccountsChange={handleSettingsAccountsChange}
            onNotice={setNotice}
          />
        )}
      </section>
      {isChecklistEditorOpen && (
        <ChecklistEditorModal
          supabase={supabase}
          handover={handover}
          defaultTasks={appSettings.handover_default_tasks}
          onClose={() => setChecklistEditorOpen(false)}
          onSaved={() => {
            setChecklistEditorOpen(false);
            queryClient.invalidateQueries({ queryKey: queryKeys.handover(businessDate) });
            queryClient.invalidateQueries({ queryKey: queryKeys.appSettings() });
          }}
          onSettingsChange={(updater) => {
            queryClient.setQueryData(queryKeys.appSettings(), (current: typeof appSettings | undefined) => {
              const next = current ?? { sidebar_defaults: {}, handover_default_tasks: [] };
              return typeof updater === "function" ? updater(next) : updater;
            });
          }}
          onNotice={setNotice}
        />
      )}
      {isWizardOpen && (
        <EndOfDayWizard
          date={businessDate}
          shifts={shifts}
          handover={handover}
          onClose={() => setWizardOpen(false)}
          onTaskChange={handleHandoverTask}
          onCompleteHandover={handleCompleteHandover}
          onGoCash={() => {
            setWizardOpen(false);
            setView("cash");
          }}
        />
      )}
    </main>
  );
}
