"use client";

import { useEffect } from "react";
import type { Notice } from "./notice";

export function NoticeBar({ notice, onClear }: { notice: Notice; onClear: () => void }) {
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(onClear, 3600);
    return () => window.clearTimeout(timer);
  }, [notice, onClear]);

  if (!notice) return null;
  return (
    <div className={`notice ${notice.type}`} role="status" aria-live="polite">
      <span>{notice.message}</span>
      <button type="button" onClick={onClear} aria-label="Đóng thông báo">
        Đóng
      </button>
    </div>
  );
}
