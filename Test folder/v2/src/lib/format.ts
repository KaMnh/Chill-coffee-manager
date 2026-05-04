export function formatNumber(value: number | null | undefined) {
  return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 }).format(Number(value ?? 0));
}

export function formatVND(value: number | null | undefined) {
  return `${formatNumber(value)} ₫`;
}

export function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) return "Chưa có";
  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "short",
    timeStyle: "short",
    hour12: false
  }).format(new Date(value));
}

export function formatTime(value: string | null | undefined) {
  if (!value) return "--:--";
  return new Intl.DateTimeFormat("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date(value));
}

export function durationLabel(minutes: number | null | undefined) {
  const total = Math.max(0, Math.round(Number(minutes ?? 0)));
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${h}:${String(m).padStart(2, "0")} giờ`;
}

export function moneyFromInput(value: string) {
  return Number(value.replace(/[^0-9-]/g, "")) || 0;
}
