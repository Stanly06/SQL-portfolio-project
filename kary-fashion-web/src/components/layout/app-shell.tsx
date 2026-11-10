"use client";

import { usePathname } from "next/navigation";
import { useState, useSyncExternalStore, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { SearchEntry } from "./global-search";
import { Sidebar, type SidebarBadges } from "./sidebar";
import { Topbar, type TopbarNotification } from "./topbar";

const COLLAPSE_KEY = "kary:menu-contraido";
const COLLAPSE_EVENT = "kary:menu-contraido";

/** Preferencia del menú guardada en este navegador. */
function readCollapsed() {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === "1";
  } catch {
    return false;
  }
}

function subscribe(cb: () => void) {
  window.addEventListener(COLLAPSE_EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(COLLAPSE_EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

export function AppShell({
  children,
  badges,
  searchIndex,
  notifications,
}: {
  children: ReactNode;
  badges: SidebarBadges;
  searchIndex: SearchEntry[];
  notifications: TopbarNotification[];
}) {
  const pathname = usePathname();
  const collapsed = useSyncExternalStore(subscribe, readCollapsed, () => false);
  // El menú móvil queda abierto solo en la página donde se abrió (al navegar se cierra solo).
  const [openedAt, setOpenedAt] = useState<string | null>(null);
  const mobileOpen = openedAt === pathname;
  const setMobileOpen = (open: boolean) => setOpenedAt(open ? pathname : null);

  function toggleCollapsed() {
    try {
      localStorage.setItem(COLLAPSE_KEY, collapsed ? "0" : "1");
    } catch {
      /* almacenamiento no disponible */
    }
    window.dispatchEvent(new Event(COLLAPSE_EVENT));
  }

  return (
    <div className="min-h-screen">
      <Sidebar
        badges={badges}
        collapsed={collapsed && !mobileOpen}
        onToggleCollapsed={toggleCollapsed}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
      />
      <div className={cn("transition-[padding] duration-300", collapsed ? "lg:pl-[84px]" : "lg:pl-[268px]")}>
        <Topbar onOpenMenu={() => setMobileOpen(true)} searchIndex={searchIndex} notifications={notifications} />
        <main className="px-4 pb-10 pt-5 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
