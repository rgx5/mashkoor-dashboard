import { X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";

/** Accessible modal built on the native <dialog> element (focus trap and Esc handled by the browser). */
export function Dialog({ open, onClose, title, description, children, size = "md" }: { open: boolean; onClose: () => void; title: string; description?: string; children: ReactNode; size?: "md" | "lg" }) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className={`m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] ${size === "lg" ? "max-w-2xl" : "max-w-lg"} rounded-2xl border border-line bg-white p-0 shadow-2xl backdrop:bg-plum-950/40`}
    >
      <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-4">
        <div>
          <h2 className="text-lg font-semibold text-ink-900">{title}</h2>
          {description && <p className="mt-0.5 text-sm text-ink-500">{description}</p>}
        </div>
        <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-ink-500 hover:bg-surface" aria-label="Close">
          <X className="h-5 w-5" aria-hidden />
        </button>
      </div>
      <div className="px-6 py-5">{open && children}</div>
    </dialog>
  );
}
