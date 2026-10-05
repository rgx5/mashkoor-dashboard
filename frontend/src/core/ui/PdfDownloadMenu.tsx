import { ChevronDown, Download } from "lucide-react";
import { useState } from "react";
import { Button } from "./Button";

/** "Download PDF" with the two ways a priced document can be printed: with every item's price, or the items and one total. */
export function PdfDownloadMenu({ onDownload, withLabel = "With price breakup", withHint = "Every item with its own price, discount and tax", withoutLabel = "Without breakup", withoutHint = "The items, and one price for all of them" }: { onDownload: (breakup: boolean) => void; withLabel?: string; withHint?: string; withoutLabel?: string; withoutHint?: string }) {
  const [open, setOpen] = useState(false);
  const pick = (breakup: boolean) => {
    setOpen(false);
    onDownload(breakup);
  };
  return (
    <div className="relative">
      <Button variant="secondary" size="sm" onClick={() => setOpen(!open)} aria-haspopup="menu" aria-expanded={open}>
        <Download className="h-4 w-4" aria-hidden /> Download PDF <ChevronDown className="h-3.5 w-3.5" aria-hidden />
      </Button>
      {open && (
        <>
          <button type="button" aria-label="Close menu" className="fixed inset-0 z-10 cursor-default" onClick={() => setOpen(false)} />
          <div role="menu" className="absolute left-0 z-20 mt-1 w-72 overflow-hidden rounded-lg border border-line bg-white shadow-lg">
            <button type="button" role="menuitem" className="block w-full px-4 py-2.5 text-left hover:bg-plum-50" onClick={() => pick(true)}>
              <span className="block text-sm font-semibold text-ink-900">{withLabel}</span>
              <span className="block text-xs text-ink-500">{withHint}</span>
            </button>
            <button type="button" role="menuitem" className="block w-full border-t border-line px-4 py-2.5 text-left hover:bg-plum-50" onClick={() => pick(false)}>
              <span className="block text-sm font-semibold text-ink-900">{withoutLabel}</span>
              <span className="block text-xs text-ink-500">{withoutHint}</span>
            </button>
          </div>
        </>
      )}
    </div>
  );
}
