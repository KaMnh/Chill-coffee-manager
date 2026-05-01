"use client";

import { useEffect, useState } from "react";

export function OfflineBanner() {
  const [isOffline, setOffline] = useState(false);

  useEffect(() => {
    const syncState = () => setOffline(!window.navigator.onLine);
    syncState();
    window.addEventListener("online", syncState);
    window.addEventListener("offline", syncState);
    return () => {
      window.removeEventListener("online", syncState);
      window.removeEventListener("offline", syncState);
    };
  }, []);

  if (!isOffline) return null;
  return (
    <div className="offlineBanner" role="alert">
      Mất kết nối mạng. Dữ liệu có thể chưa được cập nhật.
    </div>
  );
}
