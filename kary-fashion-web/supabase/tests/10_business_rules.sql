-- =====================================================================
--  Pruebas de reglas de negocio y seguridad (se ejecutan con tests/run.sh)
--  Cada prueba lanza un error si falla; el script se detiene en el primero.
-- =====================================================================
\set ON_ERROR_STOP 1
\set owner    '00000000-0000-0000-0000-0000000000a1'
\set admin    '00000000-0000-0000-0000-0000000000a2'
\set employee '00000000-0000-0000-0000-0000000000a3'
\set client   '00000000-0000-0000-0000-0000000000a4'

-- ---------- utilidades de prueba ----------
create schema test;
grant usage on schema test to anon, authenticated;
create function test.ok(cond boolean, msg text) returns void language plpgsql as $$
begin
  if cond is distinct from true then raise exception 'FALLO: %', msg; end if;
  raise notice '✔ %', msg;
end $$;
create function test.fails(stmt text, pattern text, msg text) returns void language plpgsql as $$
begin
  begin
    execute stmt;
  exception when others then
    if sqlerrm ilike '%' || pattern || '%' then raise notice '✔ %', msg; return; end if;
    raise exception 'FALLO: % (error inesperado: %)', msg, sqlerrm;
  end;
  raise exception 'FALLO: % (no dio error)', msg;
end $$;
grant execute on all functions in schema test to anon, authenticated;

-- Las pruebas de anticipo usan la regla del 50% (la tienda hoy usa 100%)
update public.settings set value = jsonb_set(value, '{min_deposit_pct}', '50') where key = 'orders';

-- ---------- usuarios ----------
insert into auth.users (id, email, raw_user_meta_data) values
  (:'owner', 'kary@example.com', '{"full_name":"Kary (dueña)"}'),
  (:'admin', 'admin@example.com', '{"full_name":"Administradora"}'),
  (:'employee', 'empleada@example.com', '{"full_name":"Empleada"}'),
  (:'client', 'clienta@example.com', '{"full_name":"Clienta online"}');
-- La primera dueña se asigna una sola vez desde el panel SQL de Supabase (ver README).
update public.profiles set role = 'owner' where id = :'owner';
update public.profiles set role = 'admin' where id = :'admin';
update public.profiles set role = 'employee' where id = :'employee';
select test.ok((select role from public.profiles where id = :'client') = 'customer', 'usuario nuevo recibe rol de clienta');
insert into public.customers (full_name, phone, auth_user_id) values ('Clienta online', '809-555-0199', :'client');

-- ========== ANÓNIMO (visitante de la tienda) ==========
set role anon;
select test.ok((select count(*) from public.store_catalog) = 4, 'catálogo público muestra solo variantes publicadas');
select test.ok((select count(*) from public.products) = 3, 'anónimo ve solo productos publicados');
select test.fails('select * from public.customers', 'permission denied', 'anónimo no puede leer clientes');
select test.fails('select * from public.variant_costs', 'permission denied', 'anónimo no puede leer costos');
select test.fails('select public.register_sale(''{}'')', 'permission denied', 'anónimo no puede vender');
reset role;

-- ========== ADMINISTRADORA: compra con transporte prorrateado ==========
select set_config('request.jwt.claim.sub', :'admin', false);
set role authenticated;
insert into public.purchase_orders (number, supplier_id, status, shipping_cents)
values ('OC-0001', (select id from public.suppliers limit 1), 'ordered', 30000);
insert into public.purchase_order_items (purchase_order_id, variant_id, quantity, unit_cost_cents) values
  ((select id from public.purchase_orders where number = 'OC-0001'), (select id from public.product_variants where sku = 'BLU-0102-BL-S'), 10, 50000),
  ((select id from public.purchase_orders where number = 'OC-0001'), (select id from public.product_variants where sku = 'JEA-0088-AZ-8'), 5, 90000);
select test.fails($$update public.purchase_orders set status = 'received' where number = 'OC-0001'$$, 'row-level security',
                  'no se puede marcar «recibida» sin pasar por la función');
select public.receive_purchase_order((select id from public.purchase_orders where number = 'OC-0001'));
select test.ok((select stock from public.product_variants where sku = 'BLU-0102-BL-S') = 10, 'recepción suma existencia');
select test.ok((select avg_cost_cents from public.variant_costs vc join public.product_variants pv on pv.id = vc.variant_id
                where pv.sku = 'BLU-0102-BL-S') = 51579, 'costo real blusa = 500.00 + transporte prorrateado 15.79');
select test.ok((select avg_cost_cents from public.variant_costs vc join public.product_variants pv on pv.id = vc.variant_id
                where pv.sku = 'JEA-0088-AZ-8') = 92842, 'costo real jean = 900.00 + transporte prorrateado 28.42');
select test.ok((select total_cents from public.purchase_orders where number = 'OC-0001') = 980000, 'total compra = mercancía + transporte');
select test.fails($$select public.receive_purchase_order((select id from public.purchase_orders where number = 'OC-0001'))$$,
                  'ya fue recibida', 'una compra no se recibe dos veces');
reset role;

-- ========== EMPLEADA: venta en efectivo y límites ==========
select set_config('request.jwt.claim.sub', :'employee', false);
set role authenticated;
select test.ok((public.register_sale(jsonb_build_object(
    'items', jsonb_build_array(jsonb_build_object('variant_id', (select id from public.product_variants where sku = 'BLU-0102-BL-S'), 'quantity', 2)),
    'cash_received_cents', 300000)) ->> 'change_cents')::bigint = 40000, 'venta en efectivo calcula el cambio (3,000 - 2,600 = 400)');
select test.ok((select stock from public.product_variants where sku = 'BLU-0102-BL-S') = 8, 'la venta descuenta inventario');
select test.fails($$select public.register_sale(jsonb_build_object('discount_cents', 30000, 'items', jsonb_build_array(
                    jsonb_build_object('variant_id', (select id from public.product_variants where sku = 'BLU-0102-BL-S'), 'quantity', 1))))$$,
                  'hasta 10%', 'empleada no puede dar más de 10% de descuento');
select test.fails($$select public.register_sale(jsonb_build_object('items', jsonb_build_array(
                    jsonb_build_object('variant_id', (select id from public.product_variants where sku = 'JEA-0088-AZ-8'), 'quantity', 50))))$$,
                  'Existencia insuficiente', 'no se vende más de lo que hay');
select test.fails($$select public.register_sale(jsonb_build_object('cash_received_cents', 100000, 'items', jsonb_build_array(
                    jsonb_build_object('variant_id', (select id from public.product_variants where sku = 'BLU-0102-BL-S'), 'quantity', 1))))$$,
                  'no cubre el total', 'no hay ventas a crédito: el pago debe cubrir el total');
select test.ok((select count(*) from public.sales) = 1, 'las ventas fallidas no dejan registros a medias');
select test.ok((select count(*) from public.variant_costs) = 0, 'empleada no ve costos');
select test.ok((select count(*) from public.sale_items) = 0, 'empleada no ve costos de las ventas');
select test.ok((select count(*) from public.staff_sale_items) = 1, 'empleada ve las líneas de venta sin costo');
select test.ok((select count(*) from public.suppliers) = 0, 'empleada no ve proveedores');
select test.fails('update public.product_variants set stock = 99', 'permission denied', 'nadie cambia la existencia a mano');
select test.fails($$insert into public.sales (number, subtotal_cents, total_cents, sold_by) values (999, 1, 1, auth.uid())$$,
                  'permission denied', 'no se pueden insertar ventas directamente');
select test.fails($$insert into public.products (sku_base, name, category_id) values ('X', 'X', 1)$$,
                  'row-level security', 'empleada no crea productos');
select test.fails('select public.cancel_sale(1, ''prueba'')', 'solo la administración', 'empleada no anula ventas');
select test.fails($$select public.set_user_role('00000000-0000-0000-0000-0000000000a3', 'owner')$$, 'Solo la dueña',
                  'empleada no puede darse más permisos');
reset role;

-- ========== ADMINISTRADORA: pago combinado, anulación, devolución ==========
select set_config('request.jwt.claim.sub', :'admin', false);
set role authenticated;
select public.register_sale(jsonb_build_object(
  'discount_cents', 20000,
  'items', jsonb_build_array(
    jsonb_build_object('variant_id', (select id from public.product_variants where sku = 'JEA-0088-AZ-8'), 'quantity', 1),
    jsonb_build_object('variant_id', (select id from public.product_variants where sku = 'BLU-0102-BL-S'), 'quantity', 1)),
  'payments', jsonb_build_array(jsonb_build_object('method', 'transfer', 'amount_cents', 100000, 'reference', 'TR-1'))));
select test.ok((select total_cents from public.sales where number = 2) = 300000, 'total = 3,200 - 200 de descuento');
select test.ok((select string_agg(line_total_cents::text, ',' order by id) from public.sale_items
                where sale_id = (select id from public.sales where number = 2)) = '178125,121875',
               'el descuento general se reparte entre los artículos');
select test.ok((select string_agg(method || ':' || amount_cents, ',' order by id) from public.payments
                where sale_id = (select id from public.sales where number = 2)) = 'transfer:100000,cash:200000',
               'pago combinado: transferencia + efectivo');
select test.ok((select ncf from public.invoices where sale_id = (select id from public.sales where number = 2)) is null,
               'factura comercial sin NCF');

select public.cancel_sale((select id from public.sales where number = 1), 'Error de digitación');
select test.ok((select stock from public.product_variants where sku = 'BLU-0102-BL-S') = 9, 'anular devuelve la mercancía (8 - 1 + 2)');
select test.ok((select bool_and(status = 'refunded') from public.payments where sale_id = (select id from public.sales where number = 1)),
               'los pagos de la venta anulada quedan como reembolsados');
select test.fails('select public.cancel_sale((select id from public.sales where number = 1), ''otra vez'')', 'ya estaba anulada',
                  'no se anula dos veces');

select public.register_return((select id from public.sales where number = 2),
  jsonb_build_array(jsonb_build_object('sale_item_id', (select si.id from public.sale_items si join public.sales s on s.id = si.sale_id
                                                         where s.number = 2 and si.sku = 'BLU-0102-BL-S'), 'quantity', 1)),
  'Talla incorrecta', 'cash');
select test.ok((select refund_cents from public.returns limit 1) = 121875, 'reembolso = valor pagado por la línea (con su descuento)');
select test.ok((select stock from public.product_variants where sku = 'BLU-0102-BL-S') = 10, 'la devolución regresa al inventario');
select test.fails($$select public.register_return((select id from public.sales where number = 2),
  jsonb_build_array(jsonb_build_object('sale_item_id', (select si.id from public.sale_items si join public.sales s on s.id = si.sale_id
                                                         where s.number = 2 and si.sku = 'BLU-0102-BL-S'), 'quantity', 1)), 'otra', 'cash')$$,
  'inválida', 'no se devuelve más de lo vendido');

insert into public.expenses (category, concept, amount_cents) values ('rent', 'Alquiler (prueba)', 50000);
insert into public.expenses (category, concept, amount_cents, is_financial) values ('bank_fees', 'Comisión bancaria', 1000, true);

-- Estado de resultados de hoy (cifras calculadas a mano):
--   ventas 3,200 − descuentos 200 − devoluciones 1,218.75 = ingresos netos 1,781.25
--   costo vendido: 928.42 (jean) + 515.79 (blusa) − 515.79 (blusa devuelta) = 928.42
--   ganancia bruta 852.83 − gastos 500 = operativa 352.83 − financieros 10 = neta 342.83
--   compras 9,800 (no se restan)
select test.ok((select row(gross_sales_cents, discounts_cents, returns_cents, net_revenue_cents, cost_of_goods_sold_cents,
                           gross_profit_cents, operating_profit_cents, net_profit_cents, inventory_purchases_cents)::text
                from public.income_statement(app.biz_date(now()), app.biz_date(now())))
               = '(320000,20000,121875,178125,92842,85283,35283,34283,980000)',
               'estado de resultados correcto (las compras no reducen la ganancia)');
select test.ok((select sum(net_sales_cents) from public.sales_series(app.biz_date(now()) - 6, app.biz_date(now()))) = 300000,
               'serie del gráfico suma las ventas válidas');
select test.ok((select count(*) from public.sales_series(app.biz_date(now()) - 6, app.biz_date(now()))) = 7,
               'la serie incluye los días sin ventas');
select test.ok((select cost_value_cents from public.inventory_valuation() where category = 'Blusas') = 10 * 51579,
               'inventario valorizado al costo');
select public.adjust_stock((select id from public.product_variants where sku = 'JEA-0088-AZ-8'), 3, 'Conteo físico');
select test.ok((select quantity from public.inventory_movements where type = 'adjustment') = -1, 'ajuste queda en el kardex');
update public.products set name = 'Blusa crop de lino premium' where sku_base = 'BLU-0102';
select test.ok(exists (select 1 from public.audit_logs where table_name = 'products' and action = 'UPDATE'
                       and actor_id = '00000000-0000-0000-0000-0000000000a2'), 'los cambios quedan en la auditoría con su autora');
select test.fails($$select public.set_user_role('00000000-0000-0000-0000-0000000000a3', 'admin')$$, 'Solo la dueña',
                  'una administradora no puede asignar roles');
reset role;

-- ========== PEDIDOS: encargo con anticipo mínimo 50% ==========
select set_config('request.jwt.claim.sub', :'employee', false);
set role authenticated;
select test.fails($$select public.create_order(jsonb_build_object('customer_id', (select id from public.customers where full_name like 'Laura%'),
                    'is_special_order', true,
                    'items', jsonb_build_array(jsonb_build_object('description', 'Vestido de fiesta por encargo', 'quantity', 1, 'unit_price_cents', 400000)),
                    'deposit', jsonb_build_object('method', 'transfer', 'amount_cents', 150000)))$$,
                  'anticipo mínimo de 50%', 'encargo con menos de 50% de anticipo se rechaza');
select public.create_order(jsonb_build_object('customer_id', (select id from public.customers where full_name like 'Laura%'),
  'is_special_order', true,
  'items', jsonb_build_array(jsonb_build_object('description', 'Vestido de fiesta por encargo', 'quantity', 1, 'unit_price_cents', 400000)),
  'deposit', jsonb_build_object('method', 'transfer', 'amount_cents', 200000, 'reference', 'TR-77')));
select test.ok((select status from public.orders where number = 'KF-1001') = 'confirmed', 'con 50% de anticipo el encargo queda confirmado');
select test.ok((select balance_cents from public.order_balances where number = 'KF-1001') = 200000, 'balance pendiente = 2,000');
select public.add_order_payment((select id from public.orders where number = 'KF-1001'), 'cash', 50000);
select test.fails($$select public.add_order_payment((select id from public.orders where number = 'KF-1001'), 'cash', 999999)$$,
                  'supera el balance', 'no se cobra más del balance');
select test.fails($$select public.change_order_status((select id from public.orders where number = 'KF-1001'), 'delivered')$$,
                  'complete_order', 'no se marca entregado sin cobrar ni facturar');
select test.ok((public.complete_order((select id from public.orders where number = 'KF-1001'), '[]', 200000) ->> 'change_cents')::bigint = 50000,
               'al entregar se cobra el balance (1,500) y se da cambio');
select test.ok((select status from public.orders where number = 'KF-1001') = 'delivered', 'pedido entregado');
select test.ok((select count(*) from public.sales where order_id = (select id from public.orders where number = 'KF-1001')) = 1,
               'un pedido genera una sola venta');
select test.ok((select sum(amount_cents) from public.payments where order_id = (select id from public.orders where number = 'KF-1001')) = 400000,
               'anticipo + abono + pago final = total del pedido');
-- pedido online de la clienta con cuenta
select public.create_order(jsonb_build_object('customer_id', (select id from public.customers where auth_user_id = :'client'),
  'channel', 'online', 'items', jsonb_build_array(jsonb_build_object('variant_id', (select id from public.product_variants where sku = 'BLU-0102-BL-M'), 'quantity', 1))));
select test.fails($$select public.change_order_status((select id from public.orders where number = 'KF-1002'), 'shipped')$$,
                  'No se puede pasar', 'las transiciones de estado se controlan');
reset role;

-- ========== CLIENTA: solo sus datos ==========
select set_config('request.jwt.claim.sub', :'client', false);
set role authenticated;
select test.ok((select count(*) from public.orders) = 1, 'la clienta ve solo su pedido');
select test.ok((select count(*) from public.customers) = 1, 'la clienta ve solo su ficha');
select test.ok((select count(*) from public.sales) = 0, 'la clienta no ve ventas ajenas');
select test.ok((select count(*) from public.payments) = 0, 'la clienta no ve pagos de la tienda');
select test.fails('select public.register_sale(''{}'')', 'Acceso denegado', 'la clienta no puede registrar ventas');
reset role;

-- ========== DUEÑA: comprobantes fiscales e ITBIS ==========
select set_config('request.jwt.claim.sub', :'owner', false);
set role authenticated;
select test.fails($$select public.register_sale(jsonb_build_object('invoice_kind', 'B02', 'items', jsonb_build_array(
                    jsonb_build_object('variant_id', (select id from public.product_variants where sku = 'BLU-0102-BL-S'), 'quantity', 1))))$$,
                  'no está habilitado', 'sin secuencia autorizada por la DGII no se emite NCF');
update public.fiscal_sequences set active = true, last_number = 100, expires_on = '2027-12-31' where kind in ('B02', 'E32');
update public.settings set value = jsonb_set(value, '{charges_itbis}', 'true') where key = 'tax';
select test.ok((public.register_sale(jsonb_build_object('invoice_kind', 'B02', 'items', jsonb_build_array(
                  jsonb_build_object('variant_id', (select id from public.product_variants where sku = 'BLU-0102-BL-S'), 'quantity', 1)))) ->> 'ncf')
               = 'B0200000001', 'NCF de consumo con su secuencia');
select test.ok((select tax_cents from public.sales order by id desc limit 1) = 19831, 'ITBIS 18% incluido en 1,300 = 198.31');
select public.register_sale(jsonb_build_object('invoice_kind', 'E32', 'items', jsonb_build_array(
  jsonb_build_object('variant_id', (select id from public.product_variants where sku = 'BLU-0102-BL-S'), 'quantity', 1))));
select test.ok((select ncf_status from public.invoices order by id desc limit 1) = 'pending_authorization',
               'un e-CF queda pendiente hasta que la DGII lo apruebe');
select test.fails($$select public.register_sale(jsonb_build_object('invoice_kind', 'B01', 'items', jsonb_build_array(
                    jsonb_build_object('variant_id', (select id from public.product_variants where sku = 'BLU-0102-BL-S'), 'quantity', 1))))$$,
                  'no está habilitado', 'crédito fiscal no habilitado');
select public.set_user_role(:'employee', 'admin');
select test.ok((select role from public.profiles where id = :'employee') = 'admin', 'la dueña puede promover usuarios');
select test.fails($$select public.set_user_role('00000000-0000-0000-0000-0000000000a1', 'admin')$$, 'No puede quitarse',
                  'la dueña no puede quedarse sin acceso por error');
reset role;

-- ========== Integridad (incluso para el superusuario) ==========
select test.fails('update public.sales set total_cents = 1 where number = 2', 'no se pueden modificar', 'los montos de una venta no se editan');
select test.fails('delete from public.sales where number = 2', 'no se eliminan', 'las ventas no se borran');
select test.fails('delete from public.inventory_movements', 'no se modifican', 'el kardex no se borra');
select test.fails('update public.audit_logs set action = ''x''', 'no se modifican', 'la auditoría no se altera');
select test.ok((select bool_and(pv.stock = coalesce((select sum(quantity) from public.inventory_movements m where m.variant_id = pv.id), 0))
                from public.product_variants pv), 'la existencia siempre coincide con la suma del kardex');

-- ========== Inventario inicial ==========
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a2', false);
set role authenticated;
select public.register_initial_stock((select id from public.product_variants where sku = 'PER-0012-100'), 4, 120000);
select test.ok((select stock from public.product_variants where sku = 'PER-0012-100') = 4, 'existencia inicial cargada');
select test.ok((select avg_cost_cents from public.variant_costs vc join public.product_variants pv on pv.id = vc.variant_id
                where pv.sku = 'PER-0012-100') = 120000, 'costo inicial registrado');
select test.fails($$select public.register_initial_stock((select id from public.product_variants where sku = 'PER-0012-100'), 1, 1)$$,
                  'ya tiene movimientos', 'la existencia inicial se carga una sola vez');
reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a4', false);
set role authenticated;
select test.fails($$select public.register_initial_stock((select id from public.product_variants where sku = 'VES-0214-RS-M'), 1, 1)$$,
                  'solo la administración', 'una clienta no puede cargar inventario');
reset role;

-- ========== Subtotal de compras calculado por la base ==========
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a2', false);
set role authenticated;
insert into public.purchase_orders (number, status) values ('OC-0099', 'ordered');
insert into public.purchase_order_items (purchase_order_id, variant_id, quantity, unit_cost_cents)
values ((select id from public.purchase_orders where number = 'OC-0099'), (select id from public.product_variants where sku = 'VES-0214-RS-M'), 3, 70000);
select test.ok((select subtotal_cents from public.purchase_orders where number = 'OC-0099') = 210000, 'el subtotal de la compra se calcula solo');
select test.fails($$update public.purchase_orders set subtotal_cents = 1 where number = 'OC-0099'$$, 'permission denied',
                  'el subtotal no se puede escribir a mano');
reset role;

-- ========== Configuración validada ==========
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', false);
set role authenticated;
select test.fails($$update public.settings set value = jsonb_set(value, '{min_deposit_pct}', '150') where key = 'orders'$$,
                  'entre 0% y 100%', 'no se acepta un anticipo mayor al 100%');
update public.settings set value = jsonb_set(value, '{employee_max_pct}', '15') where key = 'discounts';
select test.ok((select (value ->> 'employee_max_pct')::int from public.settings where key = 'discounts') = 15, 'la dueña cambia el descuento máximo');
select test.ok((select count(*) from public.staff_directory) >= 3, 'la dueña ve el directorio del personal');
reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a4', false);
set role authenticated;
select test.ok((select count(*) from public.staff_directory) = 0, 'una clienta no ve el personal');
reset role;

-- ========== Cierre de caja ==========
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a2', false);
set role authenticated;
select public.register_sale(jsonb_build_object('items', jsonb_build_array(
  jsonb_build_object('variant_id', (select id from public.product_variants where sku = 'PER-0012-100'), 'quantity', 1))));
insert into public.expenses (category, concept, amount_cents, payment_method) values ('packaging', 'Fundas', 30000, 'cash');
select test.ok((select sales_cents from public.cash_summary(app.biz_date(now())) where method = 'cash') > 0, 'el resumen de caja suma las ventas en efectivo');
select test.ok((select expenses_cents from public.cash_summary(app.biz_date(now())) where method = 'cash') >= 30000, 'el resumen resta los gastos pagados en efectivo');
select public.close_cash_register(app.biz_date(now()), 100000,
  (select 100000 + net_cents from public.cash_summary(app.biz_date(now())) where method = 'cash') - 5000, 'Prueba');
select test.ok((select difference_cents from public.cash_closings where business_date = app.biz_date(now())) = -5000, 'el cierre muestra el faltante');
select test.fails($$select public.close_cash_register(app.biz_date(now()), 0, 0)$$, 'ya fue cerrada', 'un día se cierra una sola vez');
select test.fails($$update public.cash_closings set counted_cash_cents = 1$$, 'permission denied', 'un cierre no se edita');
reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a4', false);
set role authenticated;
select test.fails($$select * from public.cash_summary(app.biz_date(now()))$$, 'Acceso denegado', 'una clienta no ve la caja');
reset role;
