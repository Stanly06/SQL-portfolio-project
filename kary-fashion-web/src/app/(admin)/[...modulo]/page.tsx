import { notFound } from "next/navigation";
import { Construction } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { NAV_ITEMS, findNavItem } from "@/lib/navigation";

const PHASES: Record<number, string> = {
  3: "Fase 3 · Operaciones comerciales",
  4: "Fase 4 · Finanzas",
  5: "Fase 5 · E-commerce",
  6: "Fase 6 · Pruebas y despliegue",
};

export function generateStaticParams() {
  const paths = NAV_ITEMS.filter((i) => i.phase >= 4).flatMap((i) => [i.href, ...(i.children?.map((c) => c.href) ?? [])]);
  return [...new Set(paths)].filter((p) => p !== "/").map((p) => ({ modulo: p.slice(1).split("/") }));
}

export async function generateMetadata(props: PageProps<"/[...modulo]">) {
  const { modulo } = await props.params;
  return { title: findNavItem("/" + modulo.join("/"))?.label ?? "Módulo" };
}

/** Página provisional de los módulos que se construyen en fases posteriores. */
export default async function ModulePage(props: PageProps<"/[...modulo]">) {
  const { modulo } = await props.params;
  const path = "/" + modulo.join("/");
  const item = findNavItem(path);
  if (!item) notFound();
  const sub = item.children?.find((c) => c.href === path);
  const Icon = item.icon;

  return (
    <div className="mx-auto max-w-3xl pt-6 animate-fade-up">
      <div className="relative overflow-hidden rounded-[1.75rem] border border-blush bg-gradient-to-br from-cream via-blush-soft to-lavender-soft p-8 text-center shadow-[var(--shadow-card)] sm:p-12">
        <span className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-white text-pink shadow-sm">
          <Icon className="h-8 w-8" strokeWidth={1.6} />
        </span>
        <p className="mt-5 text-xs font-semibold uppercase tracking-[0.2em] text-lavender">{PHASES[item.phase] ?? "Próximamente"}</p>
        <h1 className="mt-2 text-3xl font-bold">
          {item.label}
          {sub && sub.href !== item.href && <span className="text-plum/60"> · {sub.label}</span>}
        </h1>
        <p className="mx-auto mt-3 max-w-lg text-[15px] text-plum/75">{item.description}</p>
        <p className="mx-auto mt-6 flex max-w-md items-center justify-center gap-2 rounded-xl bg-white/70 px-4 py-2.5 text-sm text-muted">
          <Construction className="h-4 w-4 text-warning" />
          Este módulo se construye en una fase posterior del plan.
        </p>
        <ButtonLink href="/" className="mt-6">Volver al inicio</ButtonLink>
      </div>
    </div>
  );
}
