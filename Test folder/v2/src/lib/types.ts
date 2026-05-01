export type UserRole = "owner" | "manager" | "staff_operator" | "employee_viewer";

export type Account = {
  id: string;
  auth_user_id: string;
  employee_id: string | null;
  role: UserRole;
  status: string;
  employee?: {
    name: string;
    position: string | null;
  } | null;
  sidebar_config?: string[] | null;
};

export type AppSettings = {
  sidebar_defaults: Partial<Record<UserRole, string[]>>;
  handover_default_tasks: Array<{ key: string; label: string }>;
  denominations?: number[];
  cash_diff_threshold?: Record<string, number>;
};

export type SettingsAccount = {
  id: string;
  auth_user_id: string;
  role: UserRole;
  status: string;
  employee_name: string | null;
  employee_position: string | null;
  sidebar_config: string[] | null;
};

export type DashboardData = {
  business_date: string;
  total_sales: number;
  cash_sales: number;
  non_cash_sales?: number;
  opening_cash?: number;
  total_expenses: number;
  payroll_paid: number;
  active_staff: number;
  latest_cash_count?: CashCount | null;
  latest_sync?: SalesSyncRun | null;
  expenses: Expense[];
  sales_orders: SalesOrder[];
};

export type ExpenseCategory = {
  id: string;
  name: string;
  type?: string | null;
  sort_order?: number | null;
  is_active?: boolean | null;
};

export type Expense = {
  id: string;
  business_date: string;
  description: string;
  quantity: number | null;
  unit: string | null;
  unit_price: number | null;
  amount: number;
  note: string | null;
  created_at: string;
  category_id?: string | null;
  category_name?: string | null;
};

export type Employee = {
  id: string;
  code: string | null;
  name: string;
  position: string | null;
  hourly_rate: number;
  is_active: boolean;
};

export type ShiftAssignment = {
  id: string;
  employee_id: string;
  business_date: string;
  check_in_at: string | null;
  check_out_at: string | null;
  total_minutes: number | null;
  status: string;
  employee_name?: string | null;
  position?: string | null;
};

export type PayrollRecord = {
  id: string;
  shift_assignment_id: string | null;
  employee_id: string;
  business_date: string;
  check_in_at: string | null;
  check_out_at: string | null;
  total_minutes: number;
  hourly_rate: number;
  base_pay: number;
  allowance_amount: number;
  total_pay: number;
  note: string | null;
  created_at: string;
  edited_at?: string | null;
  employee_name?: string | null;
};

export type SalesOrder = {
  id: string;
  invoice_code: string | null;
  order_code?: string | null;
  sold_by_name: string | null;
  payment_method?: string | null;
  net_amount: number | null;
  total_payment?: number | null;
  purchase_at: string;
};

export type SalesSyncRun = {
  id: string;
  source: string;
  status: string;
  started_at: string | null;
  finished_at: string | null;
};

export type CashCount = {
  id: string;
  business_date: string;
  count_type: string;
  counted_at: string;
  total_physical: number;
  total_theory: number;
  difference: number;
  pos_total?: number | null;
  pos_cash_total?: number | null;
  pos_non_cash_total?: number | null;
  opening_cash?: number | null;
  bank_transfer_confirmed?: number | null;
  reconciliation_total?: number | null;
  report_id?: string | null;
};

export type CashDayOpening = {
  id: string;
  business_date: string;
  denominations_json: Record<string, number>;
  opening_total: number;
  carried_from_previous_day: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type CashCloseReport = {
  id: string;
  business_date: string;
  cash_count_id: string;
  closed_at: string;
  closed_by: string | null;
  pos_total?: number;
  opening_cash: number;
  pos_cash_total: number;
  pos_non_cash_total?: number;
  bank_transfer_confirmed?: number;
  expense_cash_total: number;
  payroll_cash_total: number;
  theory_cash: number;
  reconciliation_total?: number;
  physical_cash: number;
  difference: number;
  denominations_json: Record<string, number>;
  sync_snapshot_at: string | null;
  note: string | null;
  report_status: "draft" | "final" | "voided";
  void_reason?: string | null;
};


export type ExpenseTemplate = {
  id: string;
  label: string;
  default_category_id: string | null;
  default_unit: string | null;
  last_unit_price: number;
  usage_count: number;
  is_active: boolean | null;
};

export type HandoverTask = {
  id: string;
  task_key: string;
  label: string;
  is_done: boolean;
  checked_by: string | null;
  checked_at: string | null;
  sort_order: number;
};

export type HandoverSession = {
  id: string;
  business_date: string;
  status: "draft" | "completed";
  note: string | null;
  created_by: string | null;
  created_at: string;
  completed_at: string | null;
  tasks: HandoverTask[];
};
