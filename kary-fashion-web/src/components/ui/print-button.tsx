"use client";

import { Printer } from "lucide-react";

export function PrintButton({ label = "Imprimir / PDF" }: { label?: string }) {
  return (
    <button onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-xl border border-line bg-white px-4 py-2.5 text-sm font-medium text-plum hover:bg-blush-soft print:hidden">
      <Printer className="h-4 w-4" /> {label}
    </button>
  );
}
