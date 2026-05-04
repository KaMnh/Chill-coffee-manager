/**
 * Centralised icon exports — chỉ re-export icons app dùng để tree-shake tốt.
 * Bundle impact: ~10 KB sau tree-shake.
 *
 * Convention: dùng `<IconName size={18} />` cho buttons, `<IconName size={20} />`
 * cho navigation. Thêm `aria-label` khi icon-only (không có text bên cạnh).
 */
export {
  // Navigation tabs
  LayoutDashboard,
  Wallet,
  Users,
  Banknote,
  FileText,
  BarChart3,
  Settings,

  // Common actions
  Plus,
  Pencil,
  Trash2,
  Check,
  X,
  RefreshCw,
  LogOut,
  Save,
  Copy,
  Eye,
  EyeOff,
  Download,

  // Navigation/state
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Menu,

  // Status
  AlertCircle,
  CheckCircle2,
  Info,

  // Misc
  KeyRound,
  Zap,
  PiggyBank,
  ArrowDownToLine,
  ArrowUpFromLine,
  Calculator,
  SlidersHorizontal,
  Wallet2
} from "lucide-react";
