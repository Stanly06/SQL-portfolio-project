import Image from "next/image";
import { Sparkles } from "lucide-react";
import { DemoBadge } from "./demo-badge";

/**
 * Banner de bienvenida. Para usar una fotografía de moda, coloque el archivo en
 * /public/brand/ y pase su ruta en `photoSrc` (idealmente un PNG recortado, 3:4).
 */
export function WelcomeBanner({ photoSrc, isDemo }: { photoSrc?: string; isDemo: boolean }) {
  return (
    <section className="relative overflow-hidden rounded-[1.75rem] border border-blush bg-gradient-to-r from-cream via-blush-soft to-blush shadow-[var(--shadow-card)] animate-fade-up">
      {/* Ondas decorativas */}
      <svg aria-hidden viewBox="0 0 800 200" preserveAspectRatio="none" className="absolute inset-0 h-full w-full opacity-70">
        <path d="M380 200 C 480 120, 560 40, 800 60 L 800 200 Z" fill="#f9cfe0" />
        <path d="M470 200 C 560 150, 650 110, 800 130 L 800 200 Z" fill="#f4bfd6" opacity="0.7" />
        <path d="M0 160 C 150 130, 260 190, 420 170" stroke="#fff" strokeWidth="2" fill="none" opacity="0.6" />
      </svg>

      <div className="relative flex items-center gap-6 px-6 py-7 sm:px-9 sm:py-9">
        <div className="max-w-xl">
          {isDemo && <DemoBadge className="mb-3 md:hidden" />}
          <h1 className="flex flex-wrap items-center gap-2 text-2xl font-bold tracking-tight sm:text-[32px]">
            ¡Bienvenido a Kary Fashion!
            <DressIcon className="h-9 w-9" />
          </h1>
          <p className="mt-2 text-[15px] text-plum/75 sm:text-base">
            Gestiona tu tienda online, ventas, inventario, finanzas y mucho más.
          </p>
        </div>

        <div className="relative ml-auto hidden shrink-0 items-center gap-4 md:flex">
          {photoSrc ? (
            <Image src={photoSrc} alt="Moda Kary Fashion" width={180} height={220} className="-my-9 h-[220px] w-auto object-contain" />
          ) : (
            <Image
              src="/brand/kary-logo.png"
              alt="Logotipo Kary Fashion"
              width={150}
              height={150}
              priority
              className="h-[130px] w-[130px] drop-shadow-[0_10px_24px_rgba(201,154,46,0.35)]"
            />
          )}
          <span className="font-[family-name:var(--font-script)] text-5xl leading-none text-plum/80 lg:text-6xl">
            Kary Fashion
          </span>
          <Sparkles className="absolute -top-3 right-4 h-5 w-5 text-gold" />
        </div>
      </div>
    </section>
  );
}

function DressIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden>
      <defs>
        <linearGradient id="dress" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#ff8dbb" />
          <stop offset="1" stopColor="#f65b9a" />
        </linearGradient>
      </defs>
      <path d="M18 4c0 4 2 7 2 9l-4 6h16l-4-6c0-2 2-5 2-9" fill="none" stroke="#e2407f" strokeWidth="2" strokeLinecap="round" />
      <path d="M16 19h16l9 23a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2z" fill="url(#dress)" />
      <path d="M16 19h16" stroke="#fff" strokeWidth="2" opacity=".6" />
    </svg>
  );
}
