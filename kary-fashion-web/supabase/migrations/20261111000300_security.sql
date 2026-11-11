-- =====================================================================
--  KARY FASHION · Fase 2 · 3/4  Seguridad: permisos, RLS y vistas seguras
--
--  Principios
--    1. Toda tabla tiene Row Level Security activado: sin política, no hay acceso.
--    2. Los visitantes (anon) solo ven el catálogo publicado, sin costos.
--    3. Las clientas solo ven sus propios datos y pedidos.
--    4. Las empleadas operan la tienda pero NO ven costos, ganancias, gastos ni proveedores.
--    5. Dinero e inventario solo cambian mediante las funciones de 2/4 (no hay INSERT/UPDATE directos).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Funciones: nadie ejecuta nada que no se le haya concedido explícitamente
-- ---------------------------------------------------------------------
revoke all on schema app from public;
grant usage on schema app to anon, authenticated;
revoke execute on all functions in schema app from public;
grant execute on function app.current_role(), app.is_staff(), app.is_admin(), app.is_owner() to anon, authenticated;

revoke execute on function
  public.adjust_stock(bigint, int, text),
  public.register_sale(jsonb),
  public.cancel_sale(bigint, text),
  public.register_return(bigint, jsonb, text, public.payment_method),
  public.receive_purchase_order(bigint),
  public.change_order_status(bigint, public.order_status, text, boolean),
  public.create_order(jsonb),
  public.add_order_payment(bigint, public.payment_method, bigint, text),
  public.complete_order(bigint, jsonb, bigint, public.invoice_kind),
  public.set_user_role(uuid, text, boolean)
from public, anon;

grant execute on function
  public.adjust_stock(bigint, int, text),
  public.register_sale(jsonb),
  public.cancel_sale(bigint, text),
  public.register_return(bigint, jsonb, text, public.payment_method),
  public.receive_purchase_order(bigint),
  public.change_order_status(bigint, public.order_status, text, boolean),
  public.create_order(jsonb),
  public.add_order_payment(bigint, public.payment_method, bigint, text),
  public.complete_order(bigint, jsonb, bigint, public.invoice_kind),
  public.set_user_role(uuid, text, boolean)
to authenticated;

revoke all on app.counters from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Tablas: base sin privilegios, luego solo lo necesario
-- ---------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- Lectura (cada política decide QUÉ filas)
grant select on public.roles, public.categories, public.products, public.product_variants,
               public.order_status_transitions to anon, authenticated;
grant select on public.profiles, public.settings, public.suppliers, public.variant_costs,
               public.inventory_movements, public.customers, public.purchase_orders, public.purchase_order_items,
               public.orders, public.order_items, public.order_status_history, public.sales, public.payments,
               public.returns, public.return_items, public.fiscal_sequences, public.invoices, public.expenses,
               public.audit_logs, public.sale_items
  to authenticated;

-- Escritura directa permitida solo en catálogos y datos maestros
grant insert, update on public.categories, public.products, public.suppliers, public.customers to authenticated;
grant insert (product_id, sku, size, color, barcode, price_cents, compare_at_cents, min_stock, image_url, active),
      update (sku, size, color, barcode, price_cents, compare_at_cents, min_stock, image_url, active, deleted_at)
  on public.product_variants to authenticated;           -- la columna stock queda fuera
grant insert (variant_id, extra_cost_cents), update (extra_cost_cents) on public.variant_costs to authenticated;
grant insert (number, supplier_id, status, order_date, supplier_invoice, shipping_cents, other_costs_cents,
              payment_status, notes),
      update (supplier_id, status, order_date, supplier_invoice, shipping_cents, other_costs_cents, payment_status, notes)
  on public.purchase_orders to authenticated;
grant insert (purchase_order_id, variant_id, quantity, unit_cost_cents),
      update (quantity, unit_cost_cents), delete
  on public.purchase_order_items to authenticated;
grant insert, update, delete on public.expenses to authenticated;
grant update (shipping_address, province, municipality, expected_date, notes) on public.orders to authenticated;
grant update (full_name, phone) on public.profiles to authenticated;
grant update (value) on public.settings to authenticated;
grant update (description, next_number, last_number, expires_on, active) on public.fiscal_sequences to authenticated;
grant usage on all sequences in schema public to authenticated;

-- ---------------------------------------------------------------------
-- Políticas
-- ---------------------------------------------------------------------
-- Roles y transiciones: catálogos de referencia
create policy roles_read on public.roles for select using (true);
create policy transitions_read on public.order_status_transitions for select using (true);

-- Perfiles: cada quien ve el suyo; la administración ve todos.
create policy profiles_read on public.profiles for select to authenticated
  using (id = auth.uid() or app.is_admin());
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- Configuración: la lee el personal, la cambia la dueña.
create policy settings_read on public.settings for select to authenticated using (app.is_staff());
create policy settings_write on public.settings for update to authenticated using (app.is_owner()) with check (app.is_owner());

-- Categorías
create policy categories_read on public.categories for select using (true);
create policy categories_insert on public.categories for insert to authenticated with check (app.is_admin());
create policy categories_update on public.categories for update to authenticated using (app.is_admin()) with check (app.is_admin());

-- Productos: el público ve solo lo publicado; el personal ve todo; la administración edita.
create policy products_read_public on public.products for select
  using (published and status = 'active' and deleted_at is null);
create policy products_read_staff on public.products for select to authenticated using (app.is_staff());
create policy products_insert on public.products for insert to authenticated with check (app.is_admin());
create policy products_update on public.products for update to authenticated using (app.is_admin()) with check (app.is_admin());

create policy variants_read_public on public.product_variants for select
  using (active and deleted_at is null and exists (
    select 1 from public.products p where p.id = product_id and p.published and p.status = 'active' and p.deleted_at is null));
create policy variants_read_staff on public.product_variants for select to authenticated using (app.is_staff());
create policy variants_insert on public.product_variants for insert to authenticated with check (app.is_admin());
create policy variants_update on public.product_variants for update to authenticated using (app.is_admin()) with check (app.is_admin());

-- Costos: solo administración
create policy costs_admin_read on public.variant_costs for select to authenticated using (app.is_admin());
create policy costs_admin_insert on public.variant_costs for insert to authenticated with check (app.is_admin());
create policy costs_admin_update on public.variant_costs for update to authenticated using (app.is_admin()) with check (app.is_admin());
create policy movements_admin_read on public.inventory_movements for select to authenticated using (app.is_admin());

-- Proveedores y compras: solo administración
create policy suppliers_admin_read on public.suppliers for select to authenticated using (app.is_admin());
create policy suppliers_admin_insert on public.suppliers for insert to authenticated with check (app.is_admin());
create policy suppliers_admin_update on public.suppliers for update to authenticated using (app.is_admin()) with check (app.is_admin());

create policy po_admin_read on public.purchase_orders for select to authenticated using (app.is_admin());
-- «recibida» solo la marca receive_purchase_order()
create policy po_admin_insert on public.purchase_orders for insert to authenticated
  with check (app.is_admin() and status in ('draft', 'ordered'));
create policy po_admin_update on public.purchase_orders for update to authenticated
  using (app.is_admin() and status in ('draft', 'ordered'))
  with check (app.is_admin() and status in ('draft', 'ordered', 'cancelled'));

create policy poi_admin_read on public.purchase_order_items for select to authenticated using (app.is_admin());
create policy poi_admin_write on public.purchase_order_items for insert to authenticated
  with check (app.is_admin() and exists (select 1 from public.purchase_orders po
                                         where po.id = purchase_order_id and po.status in ('draft', 'ordered')));
create policy poi_admin_update on public.purchase_order_items for update to authenticated
  using (app.is_admin() and exists (select 1 from public.purchase_orders po
                                    where po.id = purchase_order_id and po.status in ('draft', 'ordered')));
create policy poi_admin_delete on public.purchase_order_items for delete to authenticated
  using (app.is_admin() and exists (select 1 from public.purchase_orders po
                                    where po.id = purchase_order_id and po.status in ('draft', 'ordered')));

-- Clientes: el personal los gestiona; cada clienta ve y edita solo su ficha.
create policy customers_staff_read on public.customers for select to authenticated using (app.is_staff());
create policy customers_self_read on public.customers for select to authenticated using (auth_user_id = auth.uid());
create policy customers_staff_insert on public.customers for insert to authenticated with check (app.is_staff());
create policy customers_staff_update on public.customers for update to authenticated using (app.is_staff()) with check (app.is_staff());
create policy customers_self_update on public.customers for update to authenticated
  using (auth_user_id = auth.uid()) with check (auth_user_id = auth.uid());

-- Pedidos
create policy orders_staff_read on public.orders for select to authenticated using (app.is_staff());
create policy orders_own_read on public.orders for select to authenticated
  using (exists (select 1 from public.customers c where c.id = customer_id and c.auth_user_id = auth.uid()));
create policy orders_staff_update on public.orders for update to authenticated using (app.is_staff()) with check (app.is_staff());

create policy order_items_admin_read on public.order_items for select to authenticated using (app.is_admin());  -- tiene costos
create policy order_items_own_read on public.order_items for select to authenticated
  using (exists (select 1 from public.orders o join public.customers c on c.id = o.customer_id
                 where o.id = order_id and c.auth_user_id = auth.uid()));
create policy order_history_staff_read on public.order_status_history for select to authenticated using (app.is_staff());
create policy order_history_own_read on public.order_status_history for select to authenticated
  using (exists (select 1 from public.orders o join public.customers c on c.id = o.customer_id
                 where o.id = order_id and c.auth_user_id = auth.uid()));

-- Ventas, pagos, facturas, devoluciones: lectura del personal (escritura solo por funciones)
create policy sales_staff_read on public.sales for select to authenticated using (app.is_staff());
create policy sales_own_read on public.sales for select to authenticated
  using (exists (select 1 from public.customers c where c.id = customer_id and c.auth_user_id = auth.uid()));
create policy sale_items_admin_read on public.sale_items for select to authenticated using (app.is_admin());  -- tiene costos
create policy payments_staff_read on public.payments for select to authenticated using (app.is_staff());
create policy invoices_staff_read on public.invoices for select to authenticated using (app.is_staff());
create policy returns_staff_read on public.returns for select to authenticated using (app.is_staff());
create policy return_items_staff_read on public.return_items for select to authenticated using (app.is_staff());

create policy fiscal_admin_read on public.fiscal_sequences for select to authenticated using (app.is_admin());
create policy fiscal_owner_update on public.fiscal_sequences for update to authenticated using (app.is_owner()) with check (app.is_owner());

-- Gastos y auditoría: solo administración
create policy expenses_admin_read on public.expenses for select to authenticated using (app.is_admin());
create policy expenses_admin_insert on public.expenses for insert to authenticated with check (app.is_admin());
create policy expenses_admin_update on public.expenses for update to authenticated using (app.is_admin()) with check (app.is_admin());
create policy expenses_admin_delete on public.expenses for delete to authenticated using (app.is_admin());
create policy audit_admin_read on public.audit_logs for select to authenticated using (app.is_admin());

-- ---------------------------------------------------------------------
-- Vistas seguras (sin columnas de costo)
--   Se ejecutan con los permisos del dueño de la vista, por eso filtran el rol ellas mismas.
-- ---------------------------------------------------------------------
create view public.staff_sale_items with (security_barrier) as
select si.id, si.sale_id, si.variant_id, si.sku, si.description, si.quantity, si.unit_price_cents,
       si.discount_cents, si.line_total_cents
from public.sale_items si
where app.is_staff()
   or exists (select 1 from public.sales s join public.customers c on c.id = s.customer_id
              where s.id = si.sale_id and c.auth_user_id = auth.uid());

create view public.staff_order_items with (security_barrier) as
select oi.id, oi.order_id, oi.variant_id, oi.description, oi.quantity, oi.unit_price_cents
from public.order_items oi
where app.is_staff();

-- Catálogo de la tienda online: solo publicado, sin costos ni existencias exactas.
create view public.store_catalog with (security_invoker = true) as
select p.id as product_id, p.name, p.description, p.brand, c.name::text as category, c.slug as category_slug,
       coalesce(pv.image_url, p.image_url) as image_url,
       pv.id as variant_id, pv.sku, pv.size, pv.color, pv.price_cents, pv.compare_at_cents,
       (pv.stock > 0) as in_stock
from public.products p
join public.categories c on c.id = p.category_id
join public.product_variants pv on pv.product_id = p.id
where p.published and p.status = 'active' and p.deleted_at is null and pv.active and pv.deleted_at is null;

revoke all on public.staff_sale_items, public.staff_order_items, public.store_catalog from public, anon, authenticated;
grant select on public.staff_sale_items, public.staff_order_items to authenticated;
grant select on public.store_catalog to anon, authenticated;
