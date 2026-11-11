import { PageHeader, NeedsDatabase } from "@/components/ui/page";
import { loadAs } from "@/lib/server/page";
import { createProduct } from "../actions";
import { NewProductForm } from "../product-form";

export const metadata = { title: "Nuevo producto" };

export default async function NewProductPage() {
  const res = await loadAs(async (tx) => ({
    categories: await tx<{ id: number; name: string }[]>`select id, name::text from public.categories order by sort_order, name`,
    suppliers: await tx<{ id: number; name: string }[]>`select id, name from public.suppliers where active order by name`,
  }), { admin: true });
  if (!res) return <NeedsDatabase />;
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Nuevo producto" back={{ href: "/productos", label: "Productos" }}
                  description="Registre el producto y todas sus tallas y colores de una vez." />
      <NewProductForm action={createProduct} categories={res.data.categories} suppliers={res.data.suppliers} />
    </div>
  );
}
