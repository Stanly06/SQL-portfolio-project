import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Guarda fotos de productos.
 *  - Producción: Supabase Storage (bucket público «productos»), con SUPABASE_SERVICE_ROLE_KEY.
 *  - Desarrollo: carpeta local ./uploads, servida por /media/… (no se sube a GitHub).
 */
const LOCAL_DIR = path.resolve(/* turbopackIgnore: true */ process.cwd(), process.env.UPLOAD_DIR ?? "uploads");
const BUCKET = "productos";

export function usesSupabaseStorage() {
  return Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.NEXT_PUBLIC_SUPABASE_URL);
}

export async function saveImage(data: Buffer, ext: "webp" | "png" | "jpg" = "webp"): Promise<string> {
  const name = `${new Date().toISOString().slice(0, 7)}/${randomUUID()}.${ext}`;
  const type = ext === "png" ? "image/png" : ext === "jpg" ? "image/jpeg" : "image/webp";
  if (usesSupabaseStorage()) {
    const { createClient } = await import("@supabase/supabase-js");
    const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
    const { error } = await admin.storage.from(BUCKET).upload(name, data, { contentType: type, upsert: false });
    if (error) throw new Error(`No se pudo guardar la foto: ${error.message}`);
    return admin.storage.from(BUCKET).getPublicUrl(name).data.publicUrl;
  }
  const file = path.join(/* turbopackIgnore: true */ LOCAL_DIR, name);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, data);
  return `/media/${name}`;
}

/** Lee una foto local (solo modo desarrollo). Devuelve null si la ruta no es válida. */
export async function readLocalImage(parts: string[]): Promise<{ data: Buffer; type: string } | null> {
  const rel = parts.join("/");
  if (!/^[0-9]{4}-[0-9]{2}\/[0-9a-f-]{36}\.(webp|png|jpg)$/.test(rel)) return null;
  try {
    const data = await readFile(path.join(/* turbopackIgnore: true */ LOCAL_DIR, rel));
    const ext = rel.split(".").pop();
    return { data, type: ext === "png" ? "image/png" : ext === "jpg" ? "image/jpeg" : "image/webp" };
  } catch {
    return null;
  }
}
