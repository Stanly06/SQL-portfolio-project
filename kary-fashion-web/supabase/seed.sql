-- =====================================================================
--  Datos de DEMOSTRACIÓN para desarrollo local. NO usar en producción.
--  (Catálogo y clientes de ejemplo; las ventas se crean desde la app o las pruebas.)
-- =====================================================================
insert into public.categories (name, slug, sort_order) values
  ('Blusas', 'blusas', 1), ('Vestidos', 'vestidos', 2), ('Jeans', 'jeans', 3), ('Pantalones', 'pantalones', 4),
  ('Chaquetas', 'chaquetas', 5), ('Calzados', 'calzados', 6), ('Perfumes', 'perfumes', 7), ('Accesorios', 'accesorios', 8)
on conflict do nothing;

insert into public.suppliers (name, contact, phone, notes)
values ('Proveedor Demo Santiago', 'Ana (demo)', '809-000-0000', 'DEMO');

insert into public.products (sku_base, name, category_id, brand, status, published)
select v.sku, v.name, c.id, 'Kary', 'active', v.pub
from (values ('BLU-0102', 'Blusa crop de lino', 'blusas', true),
             ('JEA-0088', 'Jean mom fit', 'jeans', true),
             ('VES-0214', 'Vestido satinado midi', 'vestidos', true),
             ('PER-0012', 'Perfume floral 100 ml', 'perfumes', false)) v(sku, name, cat, pub)
join public.categories c on c.slug = v.cat;

insert into public.product_variants (product_id, sku, size, color, price_cents, min_stock)
select p.id, v.sku, v.size, v.color, v.price, v.min
from (values ('BLU-0102', 'BLU-0102-BL-S', 'S', 'Blanco', 130000, 3),
             ('BLU-0102', 'BLU-0102-BL-M', 'M', 'Blanco', 130000, 3),
             ('JEA-0088', 'JEA-0088-AZ-8', '8', 'Azul claro', 190000, 3),
             ('VES-0214', 'VES-0214-RS-M', 'M', 'Rosa', 220000, 2),
             ('PER-0012', 'PER-0012-100', null, null, 250000, 2)) v(base, sku, size, color, price, min)
join public.products p on p.sku_base = v.base;

insert into public.customers (full_name, phone, whatsapp, province, municipality, notes) values
  ('Laura Gómez (demo)', '809-555-0101', '809-555-0101', 'Valverde', 'Mao', 'DEMO'),
  ('Yokasta Rodríguez (demo)', '809-555-0102', '809-555-0102', 'Santiago', 'Santiago de los Caballeros', 'DEMO');
