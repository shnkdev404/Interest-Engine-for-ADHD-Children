"use client";

import { Printer } from "lucide-react";

// Print all hooks; the browser's print dialog also saves as PDF.
export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line bg-surface px-4 text-sm font-semibold hover:bg-surface-2 print:hidden"
    >
      <Printer aria-hidden className="size-4" /> Print or save as PDF
    </button>
  );
}
