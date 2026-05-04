"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { loadCashCloseReport, loadCashCloseReportsByDate } from "@/lib/data";
import { formatDateTime, formatVND } from "@/lib/format";
import type { CashCloseReport } from "@/lib/types";
import { EmptyState, PrintableReport, type Notice } from "@/shared";

export function ReportsPanel({
  supabase,
  date,
  reports,
  selectedReport,
  setSelectedReport,
  onRefresh
}: {
  supabase: SupabaseClient;
  date: string;
  reports: CashCloseReport[];
  selectedReport: CashCloseReport | null;
  setSelectedReport: (report: CashCloseReport | null) => void;
  onRefresh: () => void;
  onNotice: (notice: Notice) => void;
}) {
  async function selectReport(reportId: string) {
    const report = await loadCashCloseReport(supabase, reportId);
    setSelectedReport(report);
  }

  async function reload() {
    const list = await loadCashCloseReportsByDate(supabase, date);
    setSelectedReport(list[0] ?? null);
    onRefresh();
  }

  return (
    <div className="reportGrid">
      <section className="panel">
        <div className="panelHeader">
          <div>
            <p className="eyebrow">Báo cáo chốt két</p>
            <h2>Danh sách theo ngày</h2>
          </div>
          <button className="ghostButton" type="button" onClick={reload}>
            Tải lại
          </button>
        </div>
        <div className="listRows">
          {reports.length === 0 && (
            <EmptyState
              title="Chưa có báo cáo"
              description="Khi chốt két, báo cáo snapshot sẽ xuất hiện tại đây."
            />
          )}
          {reports.map((report) => (
            <button
              key={report.id}
              type="button"
              className={"reportListItem " + (selectedReport?.id === report.id ? "active" : "")}
              onClick={() => selectReport(report.id)}
            >
              <span>{formatDateTime(report.closed_at)}</span>
              <strong>{formatVND(report.difference)}</strong>
              <em>{report.report_status === "final" ? "Đã chốt" : report.report_status}</em>
            </button>
          ))}
        </div>
      </section>
      <section className="panel printPanel">
        <div className="panelHeader noPrint">
          <div>
            <p className="eyebrow">Bản in</p>
            <h2>Phiếu chốt két</h2>
          </div>
          <button className="primaryButton" type="button" disabled={!selectedReport} onClick={() => window.print()}>
            In báo cáo
          </button>
        </div>
        {selectedReport ? (
          <PrintableReport report={selectedReport} />
        ) : (
          <EmptyState title="Chọn báo cáo" description="Chọn một báo cáo ở cột trái để xem và in." />
        )}
      </section>
    </div>
  );
}
