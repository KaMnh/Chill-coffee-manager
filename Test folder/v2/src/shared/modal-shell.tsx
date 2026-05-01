"use client";

import type { PropsWithChildren } from "react";

export function ModalBackdrop({ children }: PropsWithChildren) {
  return (
    <div className="modalBackdrop" role="presentation">
      {children}
    </div>
  );
}

export function ModalSheet({ children, className }: PropsWithChildren<{ className?: string }>) {
  const sheetClass = ["modalSheet", className].filter(Boolean).join(" ");
  return (
    <section className={sheetClass} role="dialog" aria-modal="true">
      {children}
    </section>
  );
}
