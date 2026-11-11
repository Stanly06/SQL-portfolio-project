import { NeedsDatabase, PageHeader, Panel } from "@/components/ui/page";
import { authMode, requireUser } from "@/lib/server/auth";
import { createCustomer } from "../actions";
import { CustomerForm } from "../customer-form";

export const metadata = { title: "Nuevo cliente" };

export default async function NewCustomerPage() {
  if (authMode() === "demo") return <NeedsDatabase />;
  await requireUser();
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Nuevo cliente" back={{ href: "/clientes", label: "Clientes" }} />
      <Panel><CustomerForm action={createCustomer} /></Panel>
    </div>
  );
}
