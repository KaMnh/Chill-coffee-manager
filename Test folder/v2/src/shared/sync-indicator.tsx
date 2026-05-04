export function SyncIndicator({ finishedAt, status }: { finishedAt?: string | null; status?: string | null }) {
  const ageMinutes = finishedAt ? Math.round((Date.now() - new Date(finishedAt).getTime()) / 60000) : null;
  const state = status === "failed" ? "danger" : ageMinutes === null || ageMinutes > 30 ? "warn" : "good";
  const label = state === "good" ? "Đồng bộ mới" : state === "warn" ? "Cần kiểm tra sync" : "Sync lỗi";
  return (
    <span className={`syncIndicator ${state}`}>
      <i />
      {label}
    </span>
  );
}
