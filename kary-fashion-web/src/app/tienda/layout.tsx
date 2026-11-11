import Image from "next/image";
import Link from "next/link";
import { Camera, MapPin, MessageCircle } from "lucide-react";
import { CartButton } from "@/components/store/cart-button";
import { getStoreInfo, waLink } from "@/lib/server/store";

// Productos, precios y existencias cambian a cada momento: se consultan en cada visita.
export const dynamic = "force-dynamic";

export const metadata = {
  title: { default: "Kary Fashion · Tienda online", template: "%s · Kary Fashion" },
  description: "Ropa para damas, calzados, perfumes y accesorios. Mao, Valverde, República Dominicana. Envíos a todo el país.",
};

export default async function StoreLayout({ children }: LayoutProps<"/tienda">) {
  const info = await getStoreInfo();
  return (
    <div className="min-h-screen bg-cream">
      {info?.announcement && (
        <p className="bg-plum px-4 py-2 text-center text-xs font-medium tracking-wide text-white">{info.announcement}</p>
      )}
      <header className="sticky top-0 z-30 border-b border-blush bg-cream/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
          <Link href="/tienda" className="flex items-center gap-2">
            <Image src="/brand/kary-logo-sm.png" alt="Kary Fashion" width={44} height={44} className="h-11 w-11" priority />
            <span className="font-[family-name:var(--font-script)] text-3xl leading-none text-plum">Kary Fashion</span>
          </Link>
          <nav className="ml-auto hidden items-center gap-6 text-sm font-medium text-plum sm:flex">
            <Link href="/tienda/catalogo" className="hover:text-pink-strong">Catálogo</Link>
            <Link href="/tienda/seguimiento" className="hover:text-pink-strong">Mi pedido</Link>
          </nav>
          <div className="ml-auto sm:ml-0"><CartButton /></div>
        </div>
        <nav className="flex justify-center gap-6 pb-2 text-sm font-medium text-plum sm:hidden">
          <Link href="/tienda/catalogo">Catálogo</Link><Link href="/tienda/seguimiento">Mi pedido</Link>
        </nav>
      </header>
      <main>{children}</main>
      <footer className="mt-16 bg-night text-white/80">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:grid-cols-3">
          <div>
            <p className="font-[family-name:var(--font-script)] text-4xl text-white">Kary Fashion</p>
            <p className="mt-2 text-sm">Ropa para damas, calzados, perfumes y accesorios.</p>
          </div>
          <div className="space-y-2 text-sm">
            {info?.address && <p className="flex gap-2"><MapPin className="h-4 w-4 shrink-0 text-pink" /> {info.address}</p>}
            {info?.whatsapp && <a href={waLink(info.whatsapp, "Hola Kary Fashion")} target="_blank" rel="noreferrer" className="flex gap-2 hover:text-white">
              <MessageCircle className="h-4 w-4 text-pink" /> WhatsApp {info.phone}</a>}
          </div>
          <div className="space-y-2 text-sm">
            {info?.instagram && <a href={`https://instagram.com/${info.instagram.replace("@", "")}`} target="_blank" rel="noreferrer" className="flex gap-2 hover:text-white">
              <Camera className="h-4 w-4 text-pink" /> {info.instagram}</a>}
            {info?.tiktok && <a href={`https://tiktok.com/${info.tiktok}`} target="_blank" rel="noreferrer" className="flex gap-2 hover:text-white">
              <span className="w-4 text-center text-pink">♪</span> {info.tiktok}</a>}
          </div>
        </div>
      </footer>
    </div>
  );
}
