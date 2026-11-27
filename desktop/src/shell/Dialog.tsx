import type React from "react";
import { useEffect } from "react";
import { X } from "lucide-react";

export function Dialog({ title, children, onClose, footer, width = 540 }: { title: string; children: React.ReactNode; onClose: () => void; footer?: React.ReactNode; width?: number }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog" role="dialog" aria-modal="true" aria-label={title} style={{ width }}>
        <div className="row-between"><h2 className="dialog-title">{title}</h2><button className="icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button></div>
        <div className="dialog-body">{children}</div>
        {footer && <div className="dialog-foot">{footer}</div>}
      </div>
    </div>
  );
}
