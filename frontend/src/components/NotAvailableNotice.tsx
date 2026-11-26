/**
 * NotAvailableNotice — an honest "this is not built yet" state.
 *
 * Kiri shows this where a real data source or engine is missing.
 * It never shows example or generated results in its place.
 */

import type { ReactNode } from "react";

interface Props {
  title: string;
  children: ReactNode;
}

export function NotAvailableNotice({ title, children }: Props) {
  return (
    <div
      role="note"
      className="rounded-xl border border-kiri-warning/40 bg-kiri-warning/10 p-5 text-sm text-kiri-text"
    >
      <h3 className="font-semibold mb-1">{title}</h3>
      <div className="text-kiri-text-muted leading-relaxed">{children}</div>
    </div>
  );
}
