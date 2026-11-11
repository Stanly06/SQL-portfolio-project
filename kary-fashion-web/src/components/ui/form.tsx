"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { CircleCheck, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

export type FormState = { ok?: boolean; error?: string; message?: string } | null;

export function Field({ label, hint, children, className }: { label: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={cn("block", className)}>
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

export function SubmitButton({ children, pendingText = "Guardando…", variant = "primary", className, confirm }: {
  children: ReactNode; pendingText?: string; variant?: "primary" | "outline" | "danger"; className?: string; confirm?: string;
}) {
  const { pending } = useFormStatus();
  const styles = {
    primary: "bg-pink text-white hover:bg-pink-strong shadow-sm shadow-pink/30",
    outline: "border border-line bg-white text-plum hover:border-pink/40 hover:bg-blush-soft",
    danger: "bg-danger text-white hover:bg-[#c23a51]",
  }[variant];
  return (
    <button
      type="submit"
      disabled={pending}
      onClick={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
      className={cn("inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors disabled:opacity-60", styles, className)}
    >
      {pending ? pendingText : children}
    </button>
  );
}

export function FormMessage({ state }: { state: FormState }) {
  if (!state) return null;
  if (state.error)
    return (
      <p role="alert" className="flex items-start gap-2 rounded-xl bg-danger-soft px-3 py-2.5 text-sm text-danger">
        <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" /> {state.error}
      </p>
    );
  if (state.message)
    return (
      <p role="status" className="flex items-start gap-2 rounded-xl bg-success-soft px-3 py-2.5 text-sm text-success">
        <CircleCheck className="mt-0.5 h-4 w-4 shrink-0" /> {state.message}
      </p>
    );
  return null;
}
