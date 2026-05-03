"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { updateSidebarDefaults, updateUserSidebarConfig } from "@/lib/data";
import { formatVND } from "@/lib/format";
import type { Account, AppSettings, SettingsAccount, UserRole } from "@/lib/types";
import { EmptyState, type Notice } from "@/shared";
import { NAV_ITEMS, ROLE_LABELS, hasBasePageAccess, normalizeSidebarItems, type ViewKey } from "../navigation";
import { ExpenseTemplateAdmin } from "./expense-template-admin";
import { KiotvietSettings } from "./kiotviet-settings";

export function SettingsView({
  supabase,
  account,
  appSettings,
  settingsAccounts,
  onSettingsChange,
  onAccountsChange,
  onNotice
}: {
  supabase: SupabaseClient;
  account: Account;
  appSettings: AppSettings;
  settingsAccounts: SettingsAccount[];
  onSettingsChange: (settings: AppSettings) => void;
  onAccountsChange: (accounts: SettingsAccount[]) => void;
  onNotice: (notice: Notice) => void;
}) {
  const roles: UserRole[] = ["owner", "manager", "staff_operator", "employee_viewer"];

  async function toggleRolePage(role: UserRole, key: ViewKey) {
    const current = normalizeSidebarItems(role, appSettings.sidebar_defaults?.[role]);
    if (role === "owner" && key === "settings" && current.includes("settings")) return;
    const next = current.includes(key) ? current.filter((item) => item !== key) : [...current, key];
    try {
      const sidebarDefaults = await updateSidebarDefaults(supabase, role, next);
      onSettingsChange({ ...appSettings, sidebar_defaults: sidebarDefaults });
      onNotice({ type: "success", message: "Đã cập nhật quyền xem trang." });
    } catch (error) {
      onNotice({ type: "error", message: error instanceof Error ? error.message : "Không lưu được quyền xem trang." });
    }
  }

  async function updateUserOverride(target: SettingsAccount, nextItems: ViewKey[] | null) {
    try {
      await updateUserSidebarConfig(supabase, target.auth_user_id, nextItems);
      onAccountsChange(
        settingsAccounts.map((item) =>
          item.auth_user_id === target.auth_user_id ? { ...item, sidebar_config: nextItems } : item
        )
      );
      onNotice({ type: "success", message: nextItems ? "Đã lưu override nhân viên." : "Đã xóa override nhân viên." });
    } catch (error) {
      onNotice({ type: "error", message: error instanceof Error ? error.message : "Không lưu được override." });
    }
  }

  if (!(account.role === "owner" || account.role === "manager")) {
    return (
      <section className="panel">
        <EmptyState title="Không có quyền thiết lập" description="Chỉ owner/manager được xem màn này." />
      </section>
    );
  }

  return (
    <div className="settingsWorkspace">
      <section className="panel settingsCard wide">
        <div className="panelHeader">
          <div>
            <p className="eyebrow">Quyền xem trang</p>
            <h2>Phân quyền theo vai trò</h2>
          </div>
          <span className="muted">Override từng nhân viên nằm bên dưới</span>
        </div>
        <div className="roleMatrix">
          <div className="roleMatrixTable">
            <div className="roleMatrixHead">
              <span>Trang</span>
              {roles.map((role) => (
                <strong key={role}>{ROLE_LABELS[role]}</strong>
              ))}
            </div>
            {NAV_ITEMS.map((item) => (
              <div className="roleMatrixRow" key={item.key}>
                <strong>{item.label}</strong>
                {roles.map((role) => {
                  const checked = normalizeSidebarItems(role, appSettings.sidebar_defaults?.[role]).includes(item.key);
                  const disabled = !hasBasePageAccess(role, item.key) || (role === "owner" && item.key === "settings");
                  return (
                    <label key={role} className="matrixCheck">
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={disabled}
                        onChange={() => toggleRolePage(role, item.key)}
                      />
                      <span />
                    </label>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </section>
      <section className="panel settingsCard">
        <div className="panelHeader">
          <div>
            <p className="eyebrow">Override nhân viên</p>
            <h2>Tùy chỉnh riêng từng tài khoản</h2>
          </div>
          <span>{settingsAccounts.length} tài khoản</span>
        </div>
        <div className="settingsAccountList">
          {settingsAccounts.length === 0 && (
            <EmptyState title="Chưa có tài khoản" description="Danh sách employee_accounts sẽ hiện khi Supabase có dữ liệu." />
          )}
          {settingsAccounts.map((item) => {
            const effective = normalizeSidebarItems(item.role, item.sidebar_config ?? appSettings.sidebar_defaults?.[item.role]);
            return (
              <article className="settingsAccountRow" key={item.id}>
                <div>
                  <strong>{item.employee_name ?? item.auth_user_id}</strong>
                  <span>
                    {ROLE_LABELS[item.role]} · {item.employee_position ?? item.status}
                  </span>
                </div>
                <div className="pageChipList">
                  {NAV_ITEMS.filter((nav) => hasBasePageAccess(item.role, nav.key)).map((nav) => (
                    <button
                      key={nav.key}
                      type="button"
                      className={effective.includes(nav.key) ? "pageChip active" : "pageChip"}
                      onClick={() => {
                        const base = effective.includes(nav.key)
                          ? effective.filter((key) => key !== nav.key)
                          : [...effective, nav.key];
                        updateUserOverride(item, base);
                      }}
                    >
                      {nav.label}
                    </button>
                  ))}
                </div>
                <button className="ghostButton slimButton" type="button" onClick={() => updateUserOverride(item, null)}>
                  Theo role
                </button>
              </article>
            );
          })}
        </div>
      </section>
      <section className="panel settingsCard">
        <p className="eyebrow">Checklist công việc</p>
        <h2>Mẫu mặc định</h2>
        <p className="muted">Dùng icon chỉnh checklist ở Bảng vận hành để sửa mẫu hoặc sửa riêng ngày hiện tại.</p>
        <div className="listRows">
          {(appSettings.handover_default_tasks ?? []).map((task) => (
            <article className="listRow" key={task.key}>
              <div>
                <strong>{task.label}</strong>
                <span>{task.key}</span>
              </div>
            </article>
          ))}
        </div>
      </section>
      <section className="panel settingsCard">
        <p className="eyebrow">Chốt két</p>
        <h2>Công thức và mệnh giá</h2>
        <div className="summaryRows">
          <span>Mệnh giá</span>
          <strong>
            {(appSettings.denominations ?? [500000, 200000, 100000, 50000, 20000, 10000, 5000, 2000, 1000]).length} loại
          </strong>
          <span>Cảnh báo lệch</span>
          <strong>
            {appSettings.cash_diff_threshold?.warn ? formatVND(appSettings.cash_diff_threshold.warn) : "Chưa cấu hình"}
          </strong>
          <span>Công thức</span>
          <strong>Tổng POS - đối soát</strong>
        </div>
      </section>
      <ExpenseTemplateAdmin supabase={supabase} onNotice={onNotice} />
      <KiotvietSettings supabase={supabase} onNotice={onNotice} />
    </div>
  );
}
