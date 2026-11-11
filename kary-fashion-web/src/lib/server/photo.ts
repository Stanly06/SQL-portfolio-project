import "server-only";
import sharp from "sharp";

export interface EnhanceOptions {
  light: boolean;      // mejorar luz, contraste y color
  frame: boolean;      // encuadre 4:5 sobre fondo claro (como catálogo)
  removeBg: boolean;   // quitar el fondo con IA (requiere servicio externo)
}

export function aiBackgroundAvailable() {
  return Boolean(process.env.REMOVE_BG_API_KEY);
}

/** Quita el fondo con el servicio de IA configurado (remove.bg). Devuelve PNG con transparencia. */
async function removeBackground(input: Buffer): Promise<Buffer> {
  const key = process.env.REMOVE_BG_API_KEY;
  if (!key) throw new Error("El servicio de IA para quitar fondos no está configurado.");
  const body = new FormData();
  body.append("image_file", new Blob([new Uint8Array(input)]), "foto.png");
  body.append("size", "auto");
  const res = await fetch("https://api.remove.bg/v1.0/removebg", { method: "POST", headers: { "X-Api-Key": key }, body });
  if (!res.ok) throw new Error(`El servicio de IA no pudo procesar la foto (${res.status}).`);
  return Buffer.from(await res.arrayBuffer());
}

/**
 * Prepara la foto original (girada según el celular y reducida) y, si se pidió, una versión mejorada.
 * La mejora de luz y el encuadre se hacen aquí mismo, sin costo; quitar el fondo usa IA externa.
 */
export async function processPhoto(file: Buffer, opts: EnhanceOptions): Promise<{ original: Buffer; enhanced: Buffer | null; notes: string[] }> {
  const notes: string[] = [];
  const meta = await sharp(file).metadata().catch(() => null);
  if (!meta?.format || !["jpeg", "png", "webp", "heif", "avif", "tiff"].includes(meta.format)) {
    throw new Error("El archivo no es una foto válida (use JPG, PNG, WEBP o HEIC).");
  }
  const base = await sharp(file).rotate().resize(1600, 1600, { fit: "inside", withoutEnlargement: true }).png().toBuffer();
  const original = await sharp(base).webp({ quality: 85 }).toBuffer();
  if (!opts.light && !opts.frame && !opts.removeBg) return { original, enhanced: null, notes };

  let work: Buffer = base;
  if (opts.removeBg) {
    work = await removeBackground(work);
    notes.push("Fondo quitado con IA.");
  }
  let img = sharp(work);
  if (opts.light) {
    img = img.normalise({ lower: 1, upper: 99 }).modulate({ brightness: 1.04, saturation: 1.08 }).sharpen({ sigma: 0.8 });
    notes.push("Luz y color mejorados.");
  }
  if (opts.frame || opts.removeBg) {
    img = sharp(await img.png().toBuffer())
      .resize(1200, 1500, { fit: "contain", background: { r: 255, g: 248, b: 245, alpha: 1 } })
      .flatten({ background: { r: 255, g: 248, b: 245 } });
    notes.push("Encuadre 4:5 con fondo claro.");
  }
  return { original, enhanced: await img.webp({ quality: 86 }).toBuffer(), notes };
}
