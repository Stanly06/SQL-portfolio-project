-- =====================================================================
--  SOLO DESARROLLO LOCAL: actividad de ejemplo (DATOS FICTICIOS) para ver el
--  panel en uso. Todas las operaciones pasan por las funciones reales del sistema.
--  Al final se reparten las fechas en las últimas semanas (solo posible aquí,
--  desactivando temporalmente la protección de inmutabilidad).
-- =====================================================================
select setseed(0.26);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000d2', false);
set role authenticated;

-- Más productos con tallas y colores
insert into public.products (sku_base, name, category_id, brand, status, published, image_url)
select v.sku, v.name, c.id, 'Kary', 'active', true, null
from (values ('VES-0301', 'Vestido floral de tirantes', 'vestidos'), ('BLU-0145', 'Blusa satinada cuello V', 'blusas'),
             ('PAN-0077', 'Pantalón palazzo', 'pantalones'), ('CAL-0045', 'Sandalia de tacón bloque', 'calzados'),
             ('CAL-0052', 'Tenis plataforma', 'calzados'), ('ACC-0071', 'Cartera bandolera', 'accesorios'),
             ('ACC-0090', 'Set de aretes dorados', 'accesorios'), ('CHA-0012', 'Blazer oversize', 'chaquetas'),
             ('PER-0020', 'Perfume vainilla 50 ml', 'perfumes')) v(sku, name, cat)
join public.categories c on c.slug = v.cat;

insert into public.product_variants (product_id, sku, size, color, price_cents, min_stock)
select p.id, v.sku, v.size, v.color, v.price, v.min
from (values
  ('VES-0301','VES-0301-RO-S','S','Rojo',195000,2), ('VES-0301','VES-0301-RO-M','M','Rojo',195000,2), ('VES-0301','VES-0301-AM-M','M','Amarillo',195000,2),
  ('BLU-0145','BLU-0145-NE-S','S','Negro',115000,3), ('BLU-0145','BLU-0145-NE-M','M','Negro',115000,3), ('BLU-0145','BLU-0145-CH-M','M','Champán',115000,3),
  ('PAN-0077','PAN-0077-BE-M','M','Beige',165000,2), ('PAN-0077','PAN-0077-NE-L','L','Negro',165000,2),
  ('CAL-0045','CAL-0045-NE-37','37','Negro',190000,2), ('CAL-0045','CAL-0045-NU-38','38','Nude',190000,2),
  ('CAL-0052','CAL-0052-BL-37','37','Blanco',230000,2), ('CAL-0052','CAL-0052-BL-38','38','Blanco',230000,2),
  ('ACC-0071','ACC-0071-NE',null,'Negro',150000,2), ('ACC-0071','ACC-0071-CA',null,'Camel',150000,2),
  ('ACC-0090','ACC-0090-DO',null,'Dorado',45000,4), ('CHA-0012','CHA-0012-BE-M','M','Beige',280000,1),
  ('PER-0020','PER-0020-50',null,null,180000,2)
) v(base, sku, size, color, price, min)
join public.products p on p.sku_base = v.base;

-- Mercancía que ya estaba en la tienda (costo ~45-55% del precio)
select public.register_initial_stock(pv.id, 10 + floor(random() * 14)::int, round(pv.price_cents * (0.45 + random() * 0.1))::bigint)
from public.product_variants pv where not exists (select 1 from public.inventory_movements m where m.variant_id = pv.id)
  and pv.sku not in ('BLU-0102-BL-S', 'JEA-0088-AZ-8');

-- Una compra a proveedor con transporte
insert into public.purchase_orders (number, supplier_id, status, shipping_cents, supplier_invoice, notes)
values ('OC-0001', (select id from public.suppliers limit 1), 'ordered', 85000, 'F-2231', 'Mercancía de temporada (demo)');
insert into public.purchase_order_items (purchase_order_id, variant_id, quantity, unit_cost_cents)
select (select id from public.purchase_orders where number = 'OC-0001'), id, q, c
from (values ('BLU-0102-BL-S', 12, 52000), ('JEA-0088-AZ-8', 8, 88000)) x(sku, q, c)
join public.product_variants pv on pv.sku = x.sku;
select public.receive_purchase_order((select id from public.purchase_orders where number = 'OC-0001'));

-- Clientes de ejemplo
insert into public.customers (full_name, phone, whatsapp, province, municipality, notes) values
  ('Carolina Peña (demo)', '809-555-0103', '809-555-0103', 'Valverde', 'Mao', 'DEMO'),
  ('Massiel Taveras (demo)', '829-555-0104', '829-555-0104', 'Valverde', 'Esperanza', 'DEMO'),
  ('Rosanna Peralta (demo)', '849-555-0105', '849-555-0105', 'Santiago', 'Santiago de los Caballeros', 'DEMO'),
  ('Mildred Almonte (demo)', '809-555-0106', '809-555-0106', 'Valverde', 'Mao', 'DEMO'),
  ('Yanelis Cruz (demo)', '829-555-0107', '829-555-0107', 'Montecristi', 'Castañuelas', 'DEMO'),
  ('Paola Jiménez (demo)', '809-555-0108', '809-555-0108', 'Valverde', 'Laguna Salada', 'DEMO');

-- Gastos del mes
insert into public.expenses (category, concept, amount_cents, payment_method) values
  ('rent', 'Alquiler del local', 1800000, 'transfer'), ('utilities', 'Energía eléctrica (Edenorte)', 420000, 'transfer'),
  ('advertising', 'Promoción en Instagram', 250000, 'card'), ('packaging', 'Fundas y papel de seda', 135000, 'cash'),
  ('internet', 'Internet y teléfono', 210000, 'transfer');
reset role;

-- Ventas de ejemplo (empleada y administradora alternan)
do $$
declare i int; v record; n int; who text; pay jsonb; total bigint;
begin
  for i in 1..175 loop
    who := case when random() < 0.6 then '00000000-0000-0000-0000-0000000000d3' else '00000000-0000-0000-0000-0000000000d2' end;
    perform set_config('request.jwt.claim.sub', who, false);
    select pv.id, pv.price_cents into v from public.product_variants pv
     where pv.stock > 2 order by random() limit 1;
    exit when not found;
    n := case when random() < 0.25 then 2 else 1 end;
    total := v.price_cents * n;
    pay := case when random() < 0.45 then jsonb_build_array(jsonb_build_object('method','transfer','amount_cents', total, 'reference', 'TR-' || (1000 + i)))
                when random() < 0.25 then jsonb_build_array(jsonb_build_object('method','card','amount_cents', total, 'reference', 'AP-' || (500 + i)))
                else '[]'::jsonb end;
    execute 'set local role authenticated';
    perform public.register_sale(jsonb_build_object(
      'customer_id', case when random() < 0.6 then (select id from public.customers order by random() limit 1) end,
      'channel', (array['store','store','store','whatsapp','instagram','tiktok'])[1 + floor(random() * 6)::int],
      'items', jsonb_build_array(jsonb_build_object('variant_id', v.id, 'quantity', n)),
      'payments', pay));
    execute 'reset role';
  end loop;
end $$;

-- Pedidos en distintos estados
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000d3', false);
set role authenticated;
select public.create_order(jsonb_build_object('customer_id', (select id from public.customers where full_name like 'Rosanna%'),
  'channel', 'whatsapp', 'is_special_order', true, 'expected_date', (current_date + 6)::text,
  'items', jsonb_build_array(jsonb_build_object('description', 'Vestido de fiesta largo, talla M, color esmeralda', 'quantity', 1, 'unit_price_cents', 480000)),
  'deposit', jsonb_build_object('method', 'transfer', 'amount_cents', 480000, 'reference', 'TR-8812')));
select public.create_order(jsonb_build_object('customer_id', (select id from public.customers where full_name like 'Yanelis%'),
  'channel', 'instagram', 'shipping_cents', 25000, 'province', 'Montecristi', 'municipality', 'Castañuelas', 'expected_date', (current_date + 2)::text,
  'items', jsonb_build_array(jsonb_build_object('variant_id', (select id from public.product_variants where sku = 'VES-0301-RO-M'), 'quantity', 1),
                             jsonb_build_object('variant_id', (select id from public.product_variants where sku = 'ACC-0090-DO'), 'quantity', 1))));
select public.change_order_status((select id from public.orders order by id desc limit 1), 'pending_payment', 'Esperando transferencia');
select public.create_order(jsonb_build_object('customer_id', (select id from public.customers where full_name like 'Massiel%'),
  'channel', 'tiktok', 'items', jsonb_build_array(jsonb_build_object('variant_id', (select id from public.product_variants where sku = 'CAL-0052-BL-38'), 'quantity', 1)),
  'deposit', jsonb_build_object('method', 'transfer', 'amount_cents', 230000, 'reference', 'TR-8820')));
select public.change_order_status((select id from public.orders order by id desc limit 1), 'preparing', null);
select public.create_order(jsonb_build_object('customer_id', (select id from public.customers where full_name like 'Laura%'),
  'channel', 'instagram', 'items', jsonb_build_array(jsonb_build_object('variant_id', (select id from public.product_variants where sku = 'BLU-0145-CH-M'), 'quantity', 2)),
  'deposit', jsonb_build_object('method', 'cash', 'amount_cents', 100000)));
select public.complete_order((select id from public.orders order by id desc limit 1), '[]', 200000);
reset role;

-- Repartir las fechas en las últimas 6 semanas (solo en esta base de prueba)
alter table public.sales disable trigger sales_immutable;
alter table public.inventory_movements disable trigger movements_immutable;
with s as (select id, row_number() over (order by id) as rn, count(*) over () as total from public.sales where order_id is null)
update public.sales x set sale_date = now() - ((s.total - s.rn) * interval '6 hours') - (random() * interval '3 hours'),
                          created_at = now() - ((s.total - s.rn) * interval '6 hours')
from s where x.id = s.id;
update public.payments p set received_at = s.sale_date from public.sales s where p.sale_id = s.id and p.order_id is null;
update public.invoices i set issued_at = s.sale_date from public.sales s where i.sale_id = s.id;
update public.inventory_movements m set created_at = s.sale_date from public.sales s where m.ref_table = 'sales' and m.ref_id = s.id;
update public.inventory_movements set created_at = now() - interval '50 days' where type in ('initial');
update public.inventory_movements set created_at = now() - interval '20 days' where type = 'purchase';
update public.purchase_orders set order_date = current_date - 21, received_at = now() - interval '20 days';
update public.expenses set expense_date = (date_trunc('month', current_date) + interval '2 days')::date where category in ('rent', 'internet');
alter table public.sales enable trigger sales_immutable;
alter table public.inventory_movements enable trigger movements_immutable;
