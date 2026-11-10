"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import {
  Bell,
  CalendarDays,
  ChevronDown,
  CircleHelp,
  LogOut,
  Menu,
  Settings,
  User,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PERIOD_PARAM } from "@/lib/period";
import { cn } from "@/lib/utils";
import { GlobalSearch, type SearchEntry } from "./global-search";

export interface TopbarNotification {
  id: string;
  title: string;
  detail: string;
  tone: "info" | "warning" | "danger" | "success";
}

const TONE_DOT = { info: "bg-[#2f6fd1]", warning: "bg-warning", danger: "bg-danger", success: "bg-success" };

const PERIODS = [
  { value: "hoy", label: "Hoy" },
  { value: "semana", label: "Esta semana" },
  { value: "mes", label: "Este mes" },
  { value: "anio", label: "Este año" },
];

export function Topbar({
  onOpenMenu,
  searchIndex,
  notifications,
}: {
  onOpenMenu: () => void;
  searchIndex: SearchEntry[];
  notifications: TopbarNotification[];
}) {
  const [unread, setUnread] = useState(true);

  return (
    <header className="sticky top-0 z-20 border-b border-line/70 bg-canvas/85 backdrop-blur-md">
      <div className="flex items-center gap-2 px-4 py-3 sm:gap-3 lg:px-8">
        <button
          type="button"
          onClick={onOpenMenu}
          className="rounded-xl p-2 text-plum hover:bg-white lg:hidden"
          aria-label="Abrir menú"
        >
          <Menu className="h-6 w-6" />
        </button>

        <div className="min-w-0 flex-1">
          <GlobalSearch index={searchIndex} />
        </div>

        <CurrentDate />

        <Suspense fallback={<div className="hidden h-10 w-32 rounded-xl bg-white md:block" />}>
          <PeriodSelector />
        </Suspense>

        {/* Notificaciones */}
        <DropdownMenu onOpenChange={(o) => o && setUnread(false)}>
          <DropdownMenuTrigger
            className="relative rounded-xl p-2.5 text-plum transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink/40"
            aria-label="Notificaciones"
          >
            <Bell className="h-[22px] w-[22px]" strokeWidth={1.8} />
            {unread && (
              <span className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-pink ring-2 ring-canvas" />
            )}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80">
            <DropdownMenuLabel>Notificaciones</DropdownMenuLabel>
            {notifications.map((n) => (
              <DropdownMenuItem key={n.id} className="items-start">
                <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", TONE_DOT[n.tone])} />
                <span>
                  <span className="block font-medium text-ink">{n.title}</span>
                  <span className="block text-xs text-muted">{n.detail}</span>
                </span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Ayuda */}
        <DropdownMenu>
          <DropdownMenuTrigger
            className="hidden rounded-xl p-2.5 text-plum transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink/40 sm:block"
            aria-label="Ayuda"
          >
            <CircleHelp className="h-[22px] w-[22px]" strokeWidth={1.8} />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-72">
            <DropdownMenuLabel>Ayuda rápida</DropdownMenuLabel>
            <div className="space-y-2 px-3 pb-2 text-xs text-muted">
              <p><b className="text-ink">Ctrl + K</b> abre el buscador global.</p>
              <p>El selector de período cambia todas las cifras del inicio.</p>
              <p>Las cifras marcadas como <b className="text-pink-strong">Demostración</b> no son reales.</p>
            </div>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Usuario */}
        <DropdownMenu>
          <DropdownMenuTrigger className="flex items-center gap-2.5 rounded-2xl py-1 pl-1 pr-2 transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink/40">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-blush text-plum">
              <User className="h-5 w-5" strokeWidth={1.8} />
            </span>
            <span className="hidden text-left sm:block">
              <span className="block font-[family-name:var(--font-display)] text-sm font-semibold text-plum">Admin</span>
              <span className="block text-[11px] text-muted">Administradora</span>
            </span>
            <ChevronDown className="hidden h-4 w-4 text-plum sm:block" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Sesión de demostración</DropdownMenuLabel>
            <DropdownMenuItem asChild>
              <Link href="/configuracion"><User className="h-4 w-4" /> Mi perfil</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/configuracion"><Settings className="h-4 w-4" /> Configuración</Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled className="text-muted data-[disabled]:cursor-not-allowed">
              <LogOut className="h-4 w-4" /> Cerrar sesión
              <span className="ml-auto text-[10px]">Fase 6</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

/** La fecha se calcula en el navegador para mostrar siempre la hora local real. */
function CurrentDate() {
  const [text, setText] = useState("");
  useEffect(() => {
    const fmt = new Intl.DateTimeFormat("es-DO", {
      weekday: "long",
      day: "numeric",
      month: "long",
      timeZone: "America/Santo_Domingo",
    });
    const update = () => {
      const t = fmt.format(new Date());
      setText(t.charAt(0).toUpperCase() + t.slice(1));
    };
    update();
    const id = setInterval(update, 60_000);
    return () => clearInterval(id);
  }, []);
  return (
    <span className="hidden items-center gap-2 whitespace-nowrap rounded-xl px-3 py-2 text-sm text-muted xl:flex">
      <CalendarDays className="h-4 w-4 text-pink" />
      <span suppressHydrationWarning>{text}</span>
    </span>
  );
}

function PeriodSelector() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const current = params.get(PERIOD_PARAM) ?? "mes";
  const label = PERIODS.find((p) => p.value === current)?.label ?? "Este mes";

  function change(value: string) {
    const next = new URLSearchParams(params.toString());
    next.set(PERIOD_PARAM, value);
    // El período afecta el inicio; desde otras páginas se vuelve al inicio con ese período.
    router.push(`/?${next.toString()}`, { scroll: pathname !== "/" });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="hidden items-center gap-2 rounded-xl border border-line bg-white px-3.5 py-2 text-sm font-medium text-plum shadow-sm transition-colors hover:border-pink/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink/40 md:flex">
        {label}
        <ChevronDown className="h-4 w-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Período a analizar</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={current} onValueChange={change}>
          {PERIODS.map((p) => (
            <DropdownMenuRadioItem key={p.value} value={p.value}>
              {p.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
