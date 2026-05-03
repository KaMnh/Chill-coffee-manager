"use client";

/**
 * Admin form quản lý tài khoản nhân viên — owner/manager only.
 * Tạo, sửa role, active/disable accounts qua API routes.
 *
 * Endpoints:
 *   POST   /api/users          tạo mới
 *   PATCH  /api/users/<id>     update role/status/name/position/hourly_rate
 *   DELETE /api/users/<id>     soft delete (disable + employees.is_active=false)
 */
import { useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createUserAccount,
  deactivateUserAccount,
  loadSettingsAccounts,
  updateUserAccount,
  type CreateUserPayload
} from "@/lib/data";
import { ROLE_LABELS } from "@/features/navigation";
import type { SettingsAccount, UserRole } from "@/lib/types";
import { EmptyState, type Notice } from "@/shared";
import { Eye, EyeOff, Plus, Trash2, X, Zap } from "@/shared/icons";

const ROLES: UserRole[] = ["owner", "manager", "staff_operator", "employee_viewer"];

function generatePassword(length = 12): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$";
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

export function AccountManagement({
  supabase,
  accounts,
  onAccountsChange,
  onNotice
}: {
  supabase: SupabaseClient;
  accounts: SettingsAccount[];
  onAccountsChange: (accounts: SettingsAccount[]) => void;
  onNotice: (notice: Notice) => void;
}) {
  const [showCreate, setShowCreate] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isSaving, setSaving] = useState(false);

  const [form, setForm] = useState<CreateUserPayload>({
    email: "",
    password: "",
    name: "",
    role: "staff_operator",
    position: "",
    hourly_rate: 0,
    code: ""
  });

  function reset() {
    setForm({
      email: "",
      password: "",
      name: "",
      role: "staff_operator",
      position: "",
      hourly_rate: 0,
      code: ""
    });
    setShowPassword(false);
  }

  async function refreshAccounts() {
    try {
      const next = await loadSettingsAccounts(supabase);
      onAccountsChange(next);
    } catch (error) {
      onNotice({ type: "error", message: error instanceof Error ? error.message : "Không tải lại được." });
    }
  }

  async function handleCreate() {
    // Client-side validate
    if (!form.email || !form.password || !form.name) {
      onNotice({ type: "error", message: "Email, mật khẩu, tên bắt buộc." });
      return;
    }
    if (form.password.length < 8) {
      onNotice({ type: "error", message: "Mật khẩu tối thiểu 8 ký tự." });
      return;
    }

    setSaving(true);
    try {
      await createUserAccount(supabase, form);
      onNotice({
        type: "success",
        message: `Đã tạo user ${form.email}. Hãy gửi mật khẩu cho nhân viên qua kênh an toàn.`
      });
      reset();
      setShowCreate(false);
      await refreshAccounts();
    } catch (error) {
      onNotice({ type: "error", message: error instanceof Error ? error.message : "Tạo user thất bại." });
    } finally {
      setSaving(false);
    }
  }

  async function handleRoleChange(authUserId: string, newRole: UserRole) {
    setSaving(true);
    try {
      await updateUserAccount(supabase, authUserId, { role: newRole });
      onAccountsChange(
        accounts.map((a) => (a.auth_user_id === authUserId ? { ...a, role: newRole } : a))
      );
      onNotice({ type: "success", message: "Đã đổi role." });
    } catch (error) {
      onNotice({ type: "error", message: error instanceof Error ? error.message : "Đổi role thất bại." });
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleStatus(account: SettingsAccount) {
    const next: "active" | "disabled" = account.status === "active" ? "disabled" : "active";
    setSaving(true);
    try {
      await updateUserAccount(supabase, account.auth_user_id, { status: next });
      onAccountsChange(
        accounts.map((a) => (a.auth_user_id === account.auth_user_id ? { ...a, status: next } : a))
      );
      onNotice({
        type: "success",
        message: next === "active" ? "Đã kích hoạt lại tài khoản." : "Đã vô hiệu hóa tài khoản."
      });
    } catch (error) {
      onNotice({ type: "error", message: error instanceof Error ? error.message : "Đổi status thất bại." });
    } finally {
      setSaving(false);
    }
  }

  async function handleSoftDelete(account: SettingsAccount) {
    if (
      !confirm(
        `Vô hiệu hóa tài khoản ${account.employee_name ?? "này"}? Account và employee sẽ disable. Auth user vẫn còn (admin xóa thủ công nếu cần).`
      )
    )
      return;
    setSaving(true);
    try {
      await deactivateUserAccount(supabase, account.auth_user_id);
      await refreshAccounts();
      onNotice({ type: "success", message: "Đã vô hiệu hóa." });
    } catch (error) {
      onNotice({ type: "error", message: error instanceof Error ? error.message : "Lỗi." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="panel settingsCard">
      <div className="panelHeader">
        <div>
          <p className="eyebrow">Tài khoản</p>
          <h2>Quản lý tài khoản nhân viên</h2>
          <p className="muted">
            Owner/manager tạo + quản lý account. Mật khẩu mới gửi cho nhân viên qua kênh an toàn (Zalo/WhatsApp).
          </p>
        </div>
        <button
          type="button"
          className="primaryButton"
          onClick={() => setShowCreate((v) => !v)}
        >
          {showCreate ? <X size={16} /> : <Plus size={16} />}
          <span className="iconLabel">{showCreate ? " Hủy" : " Thêm tài khoản"}</span>
        </button>
      </div>

      {showCreate && (
        <div className="userCreateForm">
          <div className="formGrid2">
            <label className="fieldStack">
              Email *
              <input
                type="email"
                value={form.email}
                onChange={(event) => setForm({ ...form, email: event.target.value })}
                placeholder="staff@chill.local"
                autoComplete="off"
              />
            </label>
            <label className="fieldStack">
              Mật khẩu * (≥8 ký tự)
              <div className="secretRow">
                <input
                  type={showPassword ? "text" : "password"}
                  value={form.password}
                  onChange={(event) => setForm({ ...form, password: event.target.value })}
                  placeholder="••••••••"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  className="ghostButton compactButton"
                  title={showPassword ? "Ẩn" : "Hiện"}
                  onClick={() => setShowPassword((v) => !v)}
                >
                  {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
                <button
                  type="button"
                  className="ghostButton compactButton"
                  title="Generate ngẫu nhiên 12 ký tự"
                  onClick={() => {
                    const pwd = generatePassword(12);
                    setForm({ ...form, password: pwd });
                    setShowPassword(true);
                  }}
                >
                  <Zap size={14} />
                </button>
              </div>
            </label>
          </div>

          <div className="formGrid2">
            <label className="fieldStack">
              Họ tên *
              <input
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                placeholder="Nguyễn Văn A"
              />
            </label>
            <label className="fieldStack">
              Mã nhân viên (tùy chọn)
              <input
                value={form.code ?? ""}
                onChange={(event) => setForm({ ...form, code: event.target.value })}
                placeholder="NV-OP-01"
              />
            </label>
          </div>

          <div className="formGrid3">
            <label className="fieldStack">
              Vị trí
              <input
                value={form.position ?? ""}
                onChange={(event) => setForm({ ...form, position: event.target.value })}
                placeholder="Pha chế, Thu ngân..."
              />
            </label>
            <label className="fieldStack">
              Lương / giờ
              <input
                type="number"
                min={0}
                max={10000000}
                value={form.hourly_rate ?? 0}
                onChange={(event) => setForm({ ...form, hourly_rate: Number(event.target.value) || 0 })}
                placeholder="25000"
              />
            </label>
            <label className="fieldStack">
              Vai trò *
              <select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value as UserRole })}>
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="buttonRow">
            <button className="primaryButton" type="button" disabled={isSaving} onClick={handleCreate}>
              <Plus size={16} />
              <span className="iconLabel">{isSaving ? " Đang tạo..." : " Tạo tài khoản"}</span>
            </button>
          </div>
        </div>
      )}

      <hr className="settingsDivider" />

      {accounts.length === 0 ? (
        <EmptyState title="Chưa có tài khoản" description="Bấm Thêm tài khoản để bắt đầu." />
      ) : (
        <div className="tableWrap accountTable">
          <table>
            <thead>
              <tr>
                <th>Tên</th>
                <th>Vị trí</th>
                <th>Vai trò</th>
                <th>Trạng thái</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((acc) => (
                <tr key={acc.auth_user_id} className={acc.status === "active" ? "" : "inactiveRow"}>
                  <td>
                    <strong>{acc.employee_name ?? "—"}</strong>
                  </td>
                  <td>{acc.employee_position ?? "—"}</td>
                  <td>
                    <select
                      value={acc.role}
                      disabled={isSaving}
                      onChange={(event) => handleRoleChange(acc.auth_user_id, event.target.value as UserRole)}
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABELS[r]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="badgeButton"
                      title={acc.status === "active" ? "Đang active — bấm để vô hiệu hóa" : "Đang disabled — bấm để kích hoạt"}
                      disabled={isSaving}
                      onClick={() => handleToggleStatus(acc)}
                    >
                      <span className={"badge " + (acc.status === "active" ? "good" : "soft")}>
                        {acc.status === "active" ? "Active" : "Disabled"}
                      </span>
                    </button>
                  </td>
                  <td className="rowActions">
                    <button
                      type="button"
                      className="compactIconButton ghost"
                      title="Vô hiệu hóa"
                      disabled={isSaving || acc.status === "disabled"}
                      onClick={() => handleSoftDelete(acc)}
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
