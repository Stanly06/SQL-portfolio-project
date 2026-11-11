/** Columnas de la plantilla de importación (el orden es el de la plantilla). */
export const IMPORT_COLUMNS = [
  { key: "name", header: "Producto", required: true, example: "Blusa de lino", width: 30, note: "Nombre del producto (se repite en cada talla/color)" },
  { key: "category", header: "Categoría", required: true, example: "Blusas", width: 16, note: "Blusas, Vestidos, Jeans, Pantalones, Chaquetas, Calzados, Perfumes, Accesorios… (si no existe se crea)" },
  { key: "color", header: "Color", required: false, example: "Blanco", width: 14, note: "Opcional" },
  { key: "size", header: "Talla", required: false, example: "M", width: 10, note: "Opcional (S, M, L, 8, 37…)" },
  { key: "price", header: "Precio venta", required: true, example: 1300, width: 14, note: "En pesos, sin RD$" },
  { key: "cost", header: "Costo", required: false, example: 600, width: 12, note: "Lo que costó cada unidad (necesario si hay cantidad)" },
  { key: "qty", header: "Cantidad", required: false, example: 5, width: 11, note: "Unidades que hay hoy en la tienda" },
  { key: "min", header: "Mínimo", required: false, example: 2, width: 10, note: "Avisar cuando queden estas o menos (2 si se deja vacío)" },
  { key: "sku_base", header: "Código", required: false, example: "BLU-0102", width: 14, note: "Opcional: si se deja vacío se crea uno" },
  { key: "brand", header: "Marca", required: false, example: "", width: 14, note: "Opcional" },
  { key: "description", header: "Descripción", required: false, example: "", width: 30, note: "Opcional" },
] as const;

export type ImportKey = (typeof IMPORT_COLUMNS)[number]["key"];
