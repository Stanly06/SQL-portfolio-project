import type { Metadata, Viewport } from "next";
import "@fontsource/poppins/400.css";
import "@fontsource/poppins/500.css";
import "@fontsource/poppins/600.css";
import "@fontsource/poppins/700.css";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "@fontsource/great-vibes/400.css";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Kary Fashion · Panel de administración",
    template: "%s · Kary Fashion",
  },
  description:
    "Gestiona la tienda Kary Fashion: ventas, pedidos, inventario, clientes, finanzas y reportes.",
};

export const viewport: Viewport = {
  themeColor: "#211625",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es-DO" className="h-full">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
