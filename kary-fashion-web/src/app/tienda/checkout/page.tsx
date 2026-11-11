import { getStoreInfo } from "@/lib/server/store";
import { StoreUnavailable } from "../unavailable";
import { CheckoutForm } from "./checkout-form";

export const metadata = { title: "Hacer pedido" };

export default async function CheckoutPage() {
  const info = await getStoreInfo();
  if (!info) return <StoreUnavailable />;
  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="text-3xl font-bold">Hacer pedido</h1>
      <CheckoutForm deliveryFee={info.delivery_fee_cents} pickupAddress={info.pickup_address} open={info.open} />
    </div>
  );
}
