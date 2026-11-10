"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ChevronDown, PanelLeftClose, PanelLeftOpen, Sparkles, X } from "lucide-react";
import { NAV_ITEMS, findNavItem, type NavItem } from "@/lib/navigation";
import { cn } from "@/lib/utils";

export interface SidebarBadges {
  orders: number;
  stock: number;
}

interface Props {
  badges: SidebarBadges;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

export function Sidebar({ badges, collapsed, onToggleCollapsed, mobileOpen, onCloseMobile }: Props) {
  const pathname = usePathname();
  const active = findNavItem(pathname);
  const [open, setOpen] = useState<string | null>(active?.children ? active.href : null);

  return (
    <>
      {/* Fondo oscuro en móvil */}
      <div
        aria-hidden
        onClick={onCloseMobile}
        className={cn(
          "fixed inset-0 z-30 bg-night/50 backdrop-blur-[2px] transition-opacity lg:hidden",
          mobileOpen ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      />
      <aside
        aria-label="Menú principal"
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex flex-col bg-night text-white/80 transition-[width,transform] duration-300",
          "bg-[radial-gradient(120%_60%_at_0%_0%,rgba(246,91,154,0.18),transparent_60%),radial-gradient(90%_50%_at_100%_100%,rgba(166,107,227,0.16),transparent_60%)]",
          collapsed ? "lg:w-[84px]" : "lg:w-[268px]",
          "w-[268px]",
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
        )}
      >
        {/* Marca */}
        <div className={cn("relative flex items-center gap-3 px-5 pb-4 pt-5", collapsed && "lg:justify-center lg:px-2")}>
          <Link href="/" className="flex min-w-0 items-center gap-3" onClick={onCloseMobile}>
            <Image
              src="/brand/kary-logo-sm.png"
              alt="Logotipo Kary Fashion"
              width={56}
              height={56}
              priority
              className="h-14 w-14 shrink-0 drop-shadow-[0_4px_12px_rgba(201,154,46,0.35)]"
            />
            <span className={cn("min-w-0", collapsed && "lg:hidden")}>
              <span className="block font-[family-name:var(--font-script)] text-[30px] leading-none text-white">
                Kary Fashion
              </span>
              <span className="mt-1 block text-[10.5px] uppercase tracking-[0.12em] text-white/55">
                Tienda de Ropa Online
              </span>
            </span>
          </Link>
          <button
            type="button"
            onClick={onCloseMobile}
            className="ml-auto rounded-lg p-1.5 text-white/60 hover:bg-white/10 hover:text-white lg:hidden"
            aria-label="Cerrar menú"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Navegación */}
        <nav className="scroll-thin flex-1 space-y-1 overflow-y-auto px-3 py-2">
          {NAV_ITEMS.map((item) => (
            <NavEntry
              key={item.href}
              item={item}
              isActive={active?.href === item.href}
              pathname={pathname}
              collapsed={collapsed}
              expanded={open === item.href}
              onToggle={() => setOpen(open === item.href ? null : item.href)}
              badge={item.badgeKey ? badges[item.badgeKey] : undefined}
              onNavigate={onCloseMobile}
            />
          ))}
        </nav>

        {/* Tarjeta de marca */}
        <div className={cn("p-3", collapsed && "lg:hidden")}>
          <Link
            href="/tienda-online"
            onClick={onCloseMobile}
            className="group relative block overflow-hidden rounded-2xl bg-gradient-to-br from-blush via-[#f3d3ef] to-lavender-soft p-4 text-plum"
          >
            <Image
              src="/brand/kary-logo-sm.png"
              alt=""
              width={96}
              height={96}
              className="absolute -right-5 -top-4 h-24 w-24 opacity-90 transition-transform duration-500 group-hover:rotate-6 group-hover:scale-105"
            />
            <span className="block font-[family-name:var(--font-script)] text-2xl leading-none">Kary Fashion</span>
            <span className="mt-1 flex items-center gap-1 text-xs font-medium text-plum/70">
              <Sparkles className="h-3.5 w-3.5 text-pink" /> Moda online
            </span>
            <span className="mt-3 inline-flex rounded-full bg-white/70 px-3 py-1 text-xs font-semibold text-pink-strong">
              Ver tienda →
            </span>
          </Link>
        </div>

        <button
          type="button"
          onClick={onToggleCollapsed}
          className="mx-3 mb-3 hidden items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs text-white/50 hover:bg-white/10 hover:text-white lg:flex"
          aria-label={collapsed ? "Expandir menú" : "Contraer menú"}
        >
          {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          <span className={cn(collapsed && "hidden")}>Contraer menú</span>
        </button>
      </aside>
    </>
  );
}

function NavEntry({
  item,
  isActive,
  pathname,
  collapsed,
  expanded,
  onToggle,
  badge,
  onNavigate,
}: {
  item: NavItem;
  isActive: boolean;
  pathname: string;
  collapsed: boolean;
  expanded: boolean;
  onToggle: () => void;
  badge?: number;
  onNavigate: () => void;
}) {
  const Icon = item.icon;
  const rowClass = cn(
    "group relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[14.5px] font-medium transition-colors",
    isActive
      ? "bg-gradient-to-r from-pink/90 to-[#c9479a]/80 text-white shadow-lg shadow-pink/20"
      : "text-white/75 hover:bg-white/[0.07] hover:text-white",
    collapsed && "lg:justify-center lg:px-0",
  );
  const badgeEl =
    badge && badge > 0 ? (
      <span
        className={cn(
          "ml-auto min-w-6 rounded-full px-1.5 py-0.5 text-center text-[11px] font-semibold",
          isActive ? "bg-white text-pink-strong" : "bg-pink text-white",
          collapsed && "lg:absolute lg:right-2 lg:top-1 lg:ml-0 lg:min-w-4 lg:px-1 lg:text-[9px]",
        )}
      >
        {badge}
      </span>
    ) : null;

  // Contraído en escritorio: el elemento con submenú lleva directo a su página principal.
  if (!item.children || collapsed) {
    return (
      <Link href={item.href} className={rowClass} onClick={onNavigate} title={collapsed ? item.label : undefined}
            aria-current={isActive ? "page" : undefined}>
        <Icon className="h-5 w-5 shrink-0" strokeWidth={1.8} />
        <span className={cn("truncate", collapsed && "lg:hidden")}>{item.label}</span>
        {badgeEl}
      </Link>
    );
  }

  return (
    <div>
      <button type="button" className={rowClass} onClick={onToggle} aria-expanded={expanded}
              title={collapsed ? item.label : undefined}>
        <Icon className="h-5 w-5 shrink-0" strokeWidth={1.8} />
        <span className={cn("truncate", collapsed && "lg:hidden")}>{item.label}</span>
        {badgeEl}
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 transition-transform",
            !badgeEl && "ml-auto",
            expanded && "rotate-180",
            collapsed && "lg:hidden",
          )}
        />
      </button>
      <div
        className={cn(
          "grid transition-[grid-template-rows] duration-300",
          expanded && !collapsed ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="overflow-hidden">
          <div className="ml-6 mt-1 space-y-0.5 border-l border-white/10 pl-3">
            {item.children.map((c) => (
              <Link
                key={c.href}
                href={c.href}
                onClick={onNavigate}
                className={cn(
                  "block rounded-lg px-3 py-1.5 text-[13.5px] transition-colors",
                  pathname === c.href ? "bg-white/10 text-white" : "text-white/60 hover:bg-white/[0.06] hover:text-white",
                )}
              >
                {c.label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
