"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Package, Receipt, Search, ShoppingBag, User } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SearchEntry {
  type: "producto" | "pedido" | "cliente" | "factura";
  title: string;
  subtitle: string;
  href: string;
}

const ICONS = { producto: Package, pedido: ShoppingBag, cliente: User, factura: Receipt };

function normalize(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export function GlobalSearch({ index }: { index: SearchEntry[] }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(0);
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  const results = useMemo(() => {
    const q = normalize(query.trim());
    if (!q) return [];
    return index.filter((e) => normalize(`${e.title} ${e.subtitle}`).includes(q)).slice(0, 8);
  }, [index, query]);

  // Atajo Ctrl/⌘ + K
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    }
    function onClick(e: MouseEvent) {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onClick);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onClick);
    };
  }, []);

  return (
    <div ref={boxRef} className="relative w-full max-w-xl">
      <label className="flex items-center gap-3 rounded-2xl border border-line bg-white px-4 py-2.5 shadow-sm transition-colors focus-within:border-pink/50 focus-within:ring-4 focus-within:ring-pink/10">
        <Search className="h-[18px] w-[18px] shrink-0 text-muted" />
        <span className="sr-only">Buscar</span>
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setCursor(0);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") setCursor((c) => Math.min(c + 1, results.length - 1));
            if (e.key === "ArrowUp") setCursor((c) => Math.max(c - 1, 0));
            if (e.key === "Escape") setOpen(false);
            if (e.key === "Enter" && results[cursor]) {
              setOpen(false);
              router.push(results[cursor].href);
            }
          }}
          placeholder="Buscar producto, pedido, cliente, factura…"
          className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-muted/80"
          role="combobox"
          aria-expanded={open && results.length > 0}
          aria-controls="resultados-busqueda"
        />
        <kbd className="hidden whitespace-nowrap rounded-md border border-line px-1.5 py-0.5 text-[10px] text-muted md:block">Ctrl K</kbd>
      </label>

      {open && query.trim() && (
        <div
          id="resultados-busqueda"
          role="listbox"
          className="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-2xl border border-line bg-white p-1.5 shadow-[var(--shadow-pop)] animate-fade-up"
        >
          {results.length === 0 ? (
            <p className="px-3 py-4 text-center text-sm text-muted">Sin resultados para «{query}»</p>
          ) : (
            results.map((r, i) => {
              const Icon = ICONS[r.type];
              return (
                <Link
                  key={`${r.type}-${r.title}-${i}`}
                  href={r.href}
                  role="option"
                  aria-selected={i === cursor}
                  onClick={() => setOpen(false)}
                  onMouseEnter={() => setCursor(i)}
                  className={cn("flex items-center gap-3 rounded-xl px-3 py-2", i === cursor && "bg-blush-soft")}
                >
                  <span className="grid h-8 w-8 place-items-center rounded-lg bg-canvas text-plum">
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-ink">{r.title}</span>
                    <span className="block truncate text-xs text-muted">{r.subtitle}</span>
                  </span>
                  <span className="ml-auto text-[11px] capitalize text-muted">{r.type}</span>
                </Link>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
