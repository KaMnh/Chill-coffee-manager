import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  Banknote,
  FileText,
  LayoutDashboard,
  PiggyBank,
  Settings,
  Users,
  Wallet
} from "@/shared/icons";
import type { Account, AppSettings, UserRole } from "@/lib/types";

export type ViewKey = "dashboard" | "expenses" | "shifts" | "cash" | "safe" | "reports" | "pivot" | "settings";

export const NAV_ITEMS: Array<{ key: ViewKey; label: string; icon: LucideIcon; roles: UserRole[] }> = [
  { key: "dashboard", label: "Bảng vận hành", icon: LayoutDashboard, roles: ["owner", "manager", "staff_operator", "employee_viewer"] },
  { key: "expenses", label: "Chi phí", icon: Wallet, roles: ["owner", "manager", "staff_operator"] },
  { key: "shifts", label: "Ca & lương", icon: Users, roles: ["owner", "manager", "staff_operator"] },
  { key: "cash", label: "Chốt két", icon: Banknote, roles: ["owner", "manager", "staff_operator"] },
  { key: "safe", label: "Sổ quỹ", icon: PiggyBank, roles: ["owner"] },
  { key: "reports", label: "Báo cáo chốt két", icon: FileText, roles: ["owner", "manager", "staff_operator"] },
  { key: "pivot", label: "Pivot", icon: BarChart3, roles: ["owner", "manager"] },
  { key: "settings", label: "Thiết lập", icon: Settings, roles: ["owner", "manager"] }
];

export const DEFAULT_SIDEBAR_BY_ROLE: Record<UserRole, ViewKey[]> = {
  owner: ["dashboard", "expenses", "shifts", "cash", "safe", "reports", "pivot", "settings"],
  manager: ["dashboard", "expenses", "shifts", "cash", "reports", "pivot", "settings"],
  staff_operator: ["dashboard", "expenses", "shifts", "cash", "reports"],
  employee_viewer: ["dashboard"]
};

export const ROLE_LABELS: Record<UserRole, string> = {
  owner: "Chủ quán",
  manager: "Quản lý",
  staff_operator: "Nhân viên vận hành",
  employee_viewer: "Viewer"
};

export function hasBasePageAccess(role: UserRole, key: ViewKey) {
  return Boolean(NAV_ITEMS.find((item) => item.key === key)?.roles.includes(role));
}

export function normalizeSidebarItems(role: UserRole, items?: string[] | null): ViewKey[] {
  const source = items?.length ? items : DEFAULT_SIDEBAR_BY_ROLE[role];
  return source.filter((key): key is ViewKey =>
    NAV_ITEMS.some((item) => item.key === key && hasBasePageAccess(role, key as ViewKey))
  );
}

export function getVisibleNav(account: Account | null, settings: AppSettings) {
  if (!account) return [];
  const configured = account.sidebar_config ?? settings.sidebar_defaults?.[account.role] ?? DEFAULT_SIDEBAR_BY_ROLE[account.role];
  const keys = normalizeSidebarItems(account.role, configured);
  return NAV_ITEMS.filter((item) => keys.includes(item.key));
}

export function canSee(account: Account | null, key: ViewKey, settings: AppSettings) {
  return getVisibleNav(account, settings).some((item) => item.key === key);
}
