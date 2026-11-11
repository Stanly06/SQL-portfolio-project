import { Download } from "lucide-react";
import { NeedsDatabase, PageHeader, Panel } from "@/components/ui/page";
import { authMode, requireAdmin } from "@/lib/server/auth";
import { IMPORT_COLUMNS } from "./columns";
import { ImportForm } from "./import-form";

export const metadata = { title: "Importar productos" };

export default async function ImportPage() {
  if (authMode() === "demo") return <NeedsDatabase />;
  await requireAdmin();
  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader title="Cargar catálogo desde Excel" back={{ href: "/productos", label: "Productos" }}
                  description="Para registrar muchos productos de una vez, con su existencia y costo actual." />
      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <ImportForm />
        <Panel title="Cómo hacerlo">
          <ol className="list-decimal space-y-2 pl-5 text-sm">
            <li>Descargue la plantilla y ábrala en Excel o Google Sheets.</li>
            <li>Escriba una fila por cada talla/color. Repita el nombre del producto en cada fila.</li>
            <li>Suba el archivo con «Solo revisar» marcado para ver si hay errores.</li>
            <li>Si todo está bien, desmárquelo y procéselo otra vez para guardar.</li>
          </ol>
          {/* Es una descarga de archivo (no una página), por eso no usa <Link> */}
          <a href="/productos/importar/plantilla" download className="mt-4 inline-flex items-center gap-2 rounded-xl bg-pink px-4 py-2.5 text-sm font-semibold text-white hover:bg-pink-strong">
            <Download className="h-4 w-4" /> Descargar plantilla
          </a>
          <p className="mt-4 text-xs font-semibold text-plum">Columnas</p>
          <ul className="mt-1 space-y-1 text-xs text-muted">
            {IMPORT_COLUMNS.map((c) => <li key={c.key}><b className="text-ink">{c.header}{c.required && " *"}</b> · {c.note}</li>)}
          </ul>
          <p className="mt-3 text-xs text-muted">Si algo falla no se guarda nada, para que nunca quede el catálogo a medias.</p>
        </Panel>
      </div>
    </div>
  );
}
