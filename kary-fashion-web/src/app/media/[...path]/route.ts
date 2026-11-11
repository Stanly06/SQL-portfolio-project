import { NextResponse } from "next/server";
import { readLocalImage } from "@/lib/server/storage";

/** Sirve las fotos guardadas localmente (modo desarrollo). En producción las fotos están en Supabase Storage. */
export async function GET(_: Request, ctx: RouteContext<"/media/[...path]">) {
  const { path } = await ctx.params;
  const img = await readLocalImage(path);
  if (!img) return new NextResponse("No encontrado", { status: 404 });
  return new NextResponse(new Uint8Array(img.data), {
    headers: { "Content-Type": img.type, "Cache-Control": "public, max-age=31536000, immutable" },
  });
}
