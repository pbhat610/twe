"use client";

import { X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";

/**
 * Right-hand slide-over panel: keeps the page in view instead of a modal.
 * Esc or the backdrop closes it; focus moves into the panel on open.
 */
export function SlideOver({
  open,
  title,
  subtitle,
  onClose,
  children,
  footer,
  width = "max-w-2xl",
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  width?: string;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    panelRef.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal aria-labelledby="slideover-title">
      <button aria-label="Close panel" onClick={onClose} className="absolute inset-0 bg-[rgb(20_24_21/0.18)]" />
      <div
        ref={panelRef}
        tabIndex={-1}
        className={`slide-in relative flex h-full w-full ${width} flex-col border-l border-border bg-surface shadow-lg outline-none`}
      >
        <header className="flex items-start gap-4 border-b border-border px-6 py-4">
          <div className="min-w-0 flex-1">
            <h2 id="slideover-title" className="t-h2">
              {title}
            </h2>
            {subtitle && <p className="mt-0.5 text-[13px] text-faint">{subtitle}</p>}
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded-sm p-1 text-faint transition-colors hover:bg-surface-2 hover:text-text">
            <X className="h-5 w-5" />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer && <footer className="border-t border-border bg-surface px-6 py-3">{footer}</footer>}
      </div>
    </div>
  );
}
