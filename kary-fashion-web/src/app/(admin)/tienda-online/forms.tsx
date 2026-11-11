"use client";

import { useActionState } from "react";
import { Eye, EyeOff, Star, Trash2 } from "lucide-react";
import { SubmitButton } from "@/components/ui/form";
import { deletePhoto, setMainPhoto, togglePublish, uploadPhoto } from "./actions";

export function PublishToggle({ id, published }: { id: number; published: boolean }) {
  const [state, action] = useActionState(togglePublish, null);
  return (
    <form action={action} className="inline-flex items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <SubmitButton variant="outline" pendingText="…" className="px-3 py-1.5 text-xs">
        {published ? <><EyeOff className="h-3.5 w-3.5" /> Retirar</> : <><Eye className="h-3.5 w-3.5" /> Publicar</>}
      </SubmitButton>
      {state?.error && <span className="text-xs text-danger">{state.error}</span>}
    </form>
  );
}

export function UploadPhotoForm({ productId, aiAvailable }: { productId: number; aiAvailable: boolean }) {
  const [state, action] = useActionState(uploadPhoto, null);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="product_id" value={productId} />
      <label className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-blush bg-blush-soft/40 px-6 py-6 text-center hover:bg-blush-soft">
        <span className="font-medium text-plum">Tomar o elegir una foto</span>
        <span className="text-xs text-muted">Desde el celular abre la cámara. JPG, PNG o HEIC, hasta 12 MB.</span>
        <input type="file" name="photo" accept="image/*" capture="environment" required className="text-sm" />
      </label>
      <fieldset className="space-y-2 text-sm">
        <legend className="label">Mejoras</legend>
        <label className="flex items-center gap-2"><input type="checkbox" name="light" defaultChecked className="h-4 w-4 accent-pink" /> Mejorar luz y color</label>
        <label className="flex items-center gap-2"><input type="checkbox" name="frame" defaultChecked className="h-4 w-4 accent-pink" /> Encuadre de catálogo (4:5, fondo claro)</label>
        <label className={`flex items-center gap-2 ${aiAvailable ? "" : "text-muted"}`}>
          <input type="checkbox" name="remove_bg" disabled={!aiAvailable} className="h-4 w-4 accent-pink" /> Quitar el fondo con IA
          {!aiAvailable && <span className="text-xs">(se activa al contratar el servicio de IA)</span>}
        </label>
      </fieldset>
      {state?.error && <p role="alert" className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">{state.error}</p>}
      {state?.message && <p role="status" className="rounded-xl bg-success-soft px-3 py-2 text-sm text-success">{state.message}</p>}
      <SubmitButton pendingText="Procesando foto…" className="w-full">Subir foto</SubmitButton>
    </form>
  );
}

export function PhotoActions({ productId, imageId, url, isMain }: { productId: number; imageId: number; url: string; isMain: boolean }) {
  const [ms, main] = useActionState(setMainPhoto, null);
  const [ds, del] = useActionState(deletePhoto, null);
  return (
    <div className="flex flex-wrap items-center gap-2">
      {!isMain && <form action={main}><input type="hidden" name="product_id" value={productId} /><input type="hidden" name="url" value={url} />
        <SubmitButton variant="outline" pendingText="…" className="px-2.5 py-1 text-xs"><Star className="h-3.5 w-3.5" /> Principal</SubmitButton></form>}
      <form action={del}><input type="hidden" name="product_id" value={productId} /><input type="hidden" name="image_id" value={imageId} />
        <SubmitButton variant="outline" pendingText="…" confirm="¿Eliminar esta foto?" className="px-2.5 py-1 text-xs"><Trash2 className="h-3.5 w-3.5" /></SubmitButton></form>
      {(ms?.error || ds?.error) && <span className="text-xs text-danger">{ms?.error ?? ds?.error}</span>}
    </div>
  );
}
