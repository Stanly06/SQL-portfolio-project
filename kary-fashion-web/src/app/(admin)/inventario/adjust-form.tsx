"use client";

import { useActionState, useState } from "react";
import { SubmitButton } from "@/components/ui/form";
import { adjustStock } from "./actions";

export function AdjustForm({ variantId, stock }: { variantId: number; stock: number }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(adjustStock, null);
  if (!open) {
    return (
      <span className="flex items-center gap-2">
        <button onClick={() => setOpen(true)} className="rounded-lg border border-line px-2.5 py-1 text-xs font-medium text-plum hover:bg-blush-soft">
          Ajustar
        </button>
        {state?.message && <span className="text-xs text-success">{state.message}</span>}
      </span>
    );
  }
  return (
    <form action={action} className="flex flex-wrap items-center gap-1.5">
      <input type="hidden" name="variant_id" value={variantId} />
      <input name="new_stock" defaultValue={stock} inputMode="numeric" aria-label="Existencia real" className="input w-16 py-1.5" />
      <input name="reason" placeholder="Motivo" aria-label="Motivo" className="input w-36 py-1.5" />
      <SubmitButton variant="outline" pendingText="…" className="px-3 py-1.5 text-xs">OK</SubmitButton>
      <button type="button" onClick={() => setOpen(false)} className="text-xs text-muted hover:text-ink">Cerrar</button>
      {state?.error && <span className="w-full text-xs text-danger">{state.error}</span>}
      {state?.message && <span className="w-full text-xs text-success">{state.message}</span>}
    </form>
  );
}
