-- =====================================================================
--  KARY FASHION · Fase 2 · 2/4  Reglas de negocio y operaciones atómicas
--
--  Todas las operaciones que mueven dinero o inventario son funciones
--  SECURITY DEFINER: validan el rol en el servidor, bloquean las filas que
--  tocan (FOR UPDATE) y se ejecutan en una sola transacción. Si algo falla,
--  no se guarda nada.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Identidad y roles
-- ---------------------------------------------------------------------
create or replace function app.current_role() returns text
language sql stable security definer set search_path = '' as $$
  select p.role from public.profiles p where p.id = auth.uid() and p.active
$$;

create or replace function app.is_staff() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(app.current_role() in ('owner', 'admin', 'employee'), false)
$$;

create or replace function app.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(app.current_role() in ('owner', 'admin'), false)
$$;

create or replace function app.is_owner() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(app.current_role() = 'owner', false)
$$;

create or replace function app.require_staff() returns void
language plpgsql stable set search_path = '' as $$
begin
  if not app.is_staff() then
    raise exception 'Acceso denegado: se requiere una cuenta de la tienda activa.' using errcode = '42501';
  end if;
end $$;

create or replace function app.require_admin() returns void
language plpgsql stable set search_path = '' as $$
begin
  if not app.is_admin() then
    raise exception 'Acceso denegado: solo la administración puede realizar esta operación.' using errcode = '42501';
  end if;
end $$;

create or replace function app.setting(p_key text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select value from public.settings where key = p_key
$$;

create or replace function app.next_counter(p_name text) returns bigint
language sql volatile security definer set search_path = '' as $$
  update app.counters set value = value + 1 where name = p_name returning value
$$;

-- Nuevos usuarios de Supabase Auth reciben un perfil de "clienta".
-- Solo la dueña puede convertir a alguien en personal de la tienda (ver set_user_role).
create or replace function app.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, full_name, role)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)), 'customer')
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function app.handle_new_user();

-- ---------------------------------------------------------------------
-- Inventario: única puerta para cambiar la existencia
-- ---------------------------------------------------------------------
create or replace function app.guard_stock_column() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.stock is distinct from old.stock and coalesce(current_setting('app.stock_write', true), '') <> 'on' then
    raise exception 'La existencia solo cambia mediante movimientos de inventario.' using errcode = '42501';
  end if;
  new.updated_at := now();
  return new;
end $$;

create trigger product_variants_guard_stock
  before update on public.product_variants
  for each row execute function app.guard_stock_column();

create or replace function app.apply_movement(
  p_variant_id bigint, p_quantity int, p_type public.movement_type,
  p_unit_cost_cents bigint, p_ref_table text, p_ref_id bigint, p_note text
) returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_stock int;
  v_name  text;
  v_allow_negative boolean := coalesce((app.setting('inventory') ->> 'allow_negative_stock')::boolean, false);
begin
  select pv.stock, p.name || coalesce(' ' || pv.color, '') || coalesce(' T/' || pv.size, '')
    into v_stock, v_name
    from public.product_variants pv join public.products p on p.id = pv.product_id
   where pv.id = p_variant_id
   for update of pv;
  if not found then
    raise exception 'La variante % no existe.', p_variant_id;
  end if;
  if v_stock + p_quantity < 0 and not v_allow_negative then
    raise exception 'Existencia insuficiente de «%»: hay %, se necesitan %.', v_name, v_stock, -p_quantity
      using errcode = 'P0001';
  end if;
  perform set_config('app.stock_write', 'on', true);
  update public.product_variants set stock = stock + p_quantity where id = p_variant_id;
  perform set_config('app.stock_write', 'off', true);
  insert into public.inventory_movements (variant_id, type, quantity, stock_after, unit_cost_cents, ref_table, ref_id, note, created_by)
  values (p_variant_id, p_type, p_quantity, v_stock + p_quantity, p_unit_cost_cents, p_ref_table, p_ref_id, p_note, auth.uid());
  return v_stock + p_quantity;
end $$;

-- Ajuste manual (conteo físico, mercancía dañada, regalo...)
create or replace function public.adjust_stock(p_variant_id bigint, p_new_stock int, p_reason text)
returns int
language plpgsql security definer set search_path = '' as $$
declare v_stock int;
begin
  perform app.require_admin();
  if p_new_stock < 0 then raise exception 'La existencia no puede ser negativa.'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Indique el motivo del ajuste.'; end if;
  select stock into v_stock from public.product_variants where id = p_variant_id for update;
  if not found then raise exception 'La variante no existe.'; end if;
  if v_stock = p_new_stock then return v_stock; end if;
  return app.apply_movement(p_variant_id, p_new_stock - v_stock, 'adjustment',
                            (select avg_cost_cents from public.variant_costs where variant_id = p_variant_id),
                            null, null, p_reason);
end $$;

-- ---------------------------------------------------------------------
-- Ventas
-- ---------------------------------------------------------------------
-- Núcleo común: punto de venta y entrega de pedidos.
--   p_items: [{variant_id, quantity, discount_cents?, unit_price_cents?, description?, unit_cost_cents?}]
--     unit_price_cents/description solo se aceptan cuando vienen de un pedido (precio pactado).
--   p_payments: [{method, amount_cents, reference?}]  (el efectivo es lo que queda)
create or replace function app.create_sale(
  p_customer_id bigint, p_channel public.order_channel, p_items jsonb, p_discount_cents bigint,
  p_shipping_cents bigint, p_payments jsonb, p_cash_received_cents bigint, p_invoice_kind public.invoice_kind,
  p_notes text, p_order_id bigint, p_prepaid_cents bigint
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_item        jsonb;
  v_pay         jsonb;
  v_lines       jsonb := '[]'::jsonb;
  v_line        jsonb;
  v_variant     record;
  v_qty         int;
  v_price       bigint;
  v_cost        bigint;
  v_line_disc   bigint;
  v_subtotal    bigint := 0;
  v_line_discs  bigint := 0;
  v_base        bigint;
  v_assigned    bigint := 0;
  v_share       bigint;
  v_total       bigint;
  v_other_pays  bigint := 0;
  v_cash        bigint;
  v_received    bigint;
  v_sale_id     bigint;
  v_sale_no     bigint;
  v_invoice_no  text;
  v_ncf         text;
  v_ncf_status  public.ncf_status := 'not_applicable';
  v_seq         record;
  v_doc         text;
  -- ITBIS solo si el negocio está registrado para cobrarlo (configuración «tax»)
  v_rate        numeric := case when coalesce((app.setting('tax') ->> 'charges_itbis')::boolean, false)
                                then coalesce((app.setting('tax') ->> 'itbis_rate_pct')::numeric, 18) else 0 end;
  v_max_disc    numeric := coalesce((app.setting('discounts') ->> 'employee_max_pct')::numeric, 10);
  v_idx         int := 0;
  v_n           int;
begin
  p_discount_cents := coalesce(p_discount_cents, 0);
  p_shipping_cents := coalesce(p_shipping_cents, 0);
  p_prepaid_cents  := coalesce(p_prepaid_cents, 0);
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Agregue al menos un artículo.';
  end if;
  if p_discount_cents < 0 or p_shipping_cents < 0 then
    raise exception 'Descuento y envío no pueden ser negativos.';
  end if;

  -- 1) Líneas: precio y costo desde la base de datos (nunca desde el navegador)
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty := (v_item ->> 'quantity')::int;
    if v_qty is null or v_qty <= 0 then raise exception 'Las cantidades deben ser mayores que cero.'; end if;
    v_line_disc := coalesce((v_item ->> 'discount_cents')::bigint, 0);

    if v_item ? 'variant_id' and v_item ->> 'variant_id' is not null then
      select pv.id, pv.sku, pv.price_cents, pv.active, pv.deleted_at, p.status,
             p.name || coalesce(' ' || pv.color, '') || coalesce(' T/' || pv.size, '') as label,
             coalesce(c.avg_cost_cents, 0) + coalesce(c.extra_cost_cents, 0) as cost
        into v_variant
        from public.product_variants pv
        join public.products p on p.id = pv.product_id
        left join public.variant_costs c on c.variant_id = pv.id
       where pv.id = (v_item ->> 'variant_id')::bigint;
      if not found or not v_variant.active or v_variant.deleted_at is not null or v_variant.status <> 'active' then
        raise exception 'Uno de los productos no está disponible para la venta.';
      end if;
      v_price := case when p_order_id is not null and v_item ? 'unit_price_cents'
                      then (v_item ->> 'unit_price_cents')::bigint else v_variant.price_cents end;
      v_line := jsonb_build_object('variant_id', v_variant.id, 'sku', v_variant.sku, 'description', v_variant.label,
                                   'quantity', v_qty, 'price', v_price, 'cost', v_variant.cost, 'discount', v_line_disc);
    elsif p_order_id is not null then
      v_price := (v_item ->> 'unit_price_cents')::bigint;
      v_line := jsonb_build_object('variant_id', null, 'sku', null, 'description', v_item ->> 'description',
                                   'quantity', v_qty, 'price', v_price,
                                   'cost', coalesce((v_item ->> 'unit_cost_cents')::bigint, 0), 'discount', v_line_disc);
    else
      raise exception 'Artículo inválido.';
    end if;

    if v_line_disc < 0 or v_line_disc > v_qty * v_price then
      raise exception 'El descuento de «%» no es válido.', v_line ->> 'description';
    end if;
    v_subtotal   := v_subtotal + v_qty * v_price;
    v_line_discs := v_line_discs + v_line_disc;
    v_lines      := v_lines || v_line;
  end loop;

  if p_discount_cents > v_subtotal - v_line_discs then
    raise exception 'El descuento es mayor que el valor de la venta.';
  end if;
  if not app.is_admin() and v_subtotal > 0
     and (v_line_discs + p_discount_cents) * 100 > v_subtotal * v_max_disc then
    raise exception 'Las empleadas pueden aplicar hasta % de descuento. Pida autorización.', v_max_disc || '%';
  end if;

  -- 2) Repartir el descuento general entre las líneas (ganancia por producto exacta)
  v_base := v_subtotal - v_line_discs;
  v_n := jsonb_array_length(v_lines);
  if p_discount_cents > 0 then
    for v_idx in 0 .. v_n - 1 loop
      v_line := v_lines -> v_idx;
      if v_idx = v_n - 1 then
        v_share := p_discount_cents - v_assigned;
      else
        v_share := floor(p_discount_cents::numeric * ((v_line ->> 'quantity')::bigint * (v_line ->> 'price')::bigint
                                                      - (v_line ->> 'discount')::bigint) / v_base);
      end if;
      v_assigned := v_assigned + v_share;
      v_lines := jsonb_set(v_lines, array[v_idx::text, 'discount'], to_jsonb((v_line ->> 'discount')::bigint + v_share));
    end loop;
    -- si el redondeo dejó una línea negativa, se corrige moviendo el exceso
    for v_idx in 0 .. v_n - 1 loop
      v_line := v_lines -> v_idx;
      if (v_line ->> 'discount')::bigint > (v_line ->> 'quantity')::bigint * (v_line ->> 'price')::bigint then
        raise exception 'No se pudo repartir el descuento; aplíquelo por artículo.';
      end if;
    end loop;
  end if;

  v_total := v_subtotal - v_line_discs - p_discount_cents + p_shipping_cents;

  -- 3) Pagos: no se permiten ventas a crédito
  if p_payments is not null and jsonb_typeof(p_payments) = 'array' then
    for v_pay in select * from jsonb_array_elements(p_payments) loop
      if (v_pay ->> 'method') = 'cash' then continue; end if;
      if coalesce((v_pay ->> 'amount_cents')::bigint, 0) <= 0 then raise exception 'Monto de pago inválido.'; end if;
      v_other_pays := v_other_pays + (v_pay ->> 'amount_cents')::bigint;
    end loop;
  end if;
  if p_prepaid_cents + v_other_pays > v_total then
    raise exception 'Los pagos (%) superan el total de la venta (%).', p_prepaid_cents + v_other_pays, v_total;
  end if;
  v_cash := v_total - p_prepaid_cents - v_other_pays;
  v_received := coalesce(p_cash_received_cents, v_cash);
  if v_cash > 0 and v_received < v_cash then
    raise exception 'El efectivo recibido no cubre el total: faltan RD$%.', to_char((v_cash - v_received) / 100.0, 'FM999,999,990.00');
  end if;

  -- 4) Cliente y comprobante
  if p_customer_id is not null then
    select document_id into v_doc from public.customers where id = p_customer_id;
    if not found then raise exception 'El cliente no existe.'; end if;
  end if;
  p_invoice_kind := coalesce(p_invoice_kind, 'commercial');
  if p_invoice_kind <> 'commercial' then
    select * into v_seq from public.fiscal_sequences where kind = p_invoice_kind for update;
    if not found or not v_seq.active then
      raise exception 'El comprobante % no está habilitado. Configure la secuencia autorizada por la DGII.', p_invoice_kind;
    end if;
    if v_seq.next_number > v_seq.last_number then
      raise exception 'Se agotó la secuencia autorizada de %. Solicite más a la DGII.', p_invoice_kind;
    end if;
    if v_seq.expires_on is not null and v_seq.expires_on < (now() at time zone 'America/Santo_Domingo')::date then
      raise exception 'La secuencia de % está vencida.', p_invoice_kind;
    end if;
    if p_invoice_kind in ('B01', 'E31') and coalesce(v_doc, '') = '' then
      raise exception 'El crédito fiscal requiere un cliente con RNC o cédula.';
    end if;
    v_ncf := p_invoice_kind::text || lpad(v_seq.next_number::text, case when p_invoice_kind::text like 'E%' then 10 else 8 end, '0');
    -- Serie B: rango autorizado por la DGII. Serie E: debe enviarse y aprobarse en la DGII (no se da por válido).
    v_ncf_status := case when p_invoice_kind::text like 'E%' then 'pending_authorization' else 'authorized' end;
    update public.fiscal_sequences set next_number = next_number + 1 where kind = p_invoice_kind;
  end if;

  -- 5) Guardar todo
  v_sale_no := app.next_counter('sale');
  insert into public.sales (number, customer_id, order_id, channel, subtotal_cents, discount_cents, shipping_cents,
                            total_cents, tax_cents, cash_received_cents, change_cents, sold_by, notes)
  values (v_sale_no, p_customer_id, p_order_id, coalesce(p_channel, 'store'), v_subtotal, v_line_discs + p_discount_cents,
          p_shipping_cents, v_total,
          v_total - round(v_total * 100 / (100 + v_rate)),
          case when v_cash > 0 then v_received else 0 end,
          case when v_cash > 0 then v_received - v_cash else 0 end,
          auth.uid(), nullif(trim(p_notes), ''))
  returning id into v_sale_id;

  for v_line in select * from jsonb_array_elements(v_lines) loop
    insert into public.sale_items (sale_id, variant_id, sku, description, quantity, unit_price_cents, discount_cents,
                                   line_total_cents, unit_cost_cents)
    values (v_sale_id, (v_line ->> 'variant_id')::bigint, v_line ->> 'sku', v_line ->> 'description',
            (v_line ->> 'quantity')::int, (v_line ->> 'price')::bigint, (v_line ->> 'discount')::bigint,
            (v_line ->> 'quantity')::bigint * (v_line ->> 'price')::bigint - (v_line ->> 'discount')::bigint,
            (v_line ->> 'cost')::bigint);
    if v_line ->> 'variant_id' is not null then
      perform app.apply_movement((v_line ->> 'variant_id')::bigint, -(v_line ->> 'quantity')::int, 'sale',
                                 (v_line ->> 'cost')::bigint, 'sales', v_sale_id, 'Venta #' || v_sale_no);
    end if;
  end loop;

  if p_payments is not null and jsonb_typeof(p_payments) = 'array' then
    for v_pay in select * from jsonb_array_elements(p_payments) loop
      continue when (v_pay ->> 'method') = 'cash';
      insert into public.payments (sale_id, order_id, method, amount_cents, reference, received_by)
      values (v_sale_id, p_order_id, (v_pay ->> 'method')::public.payment_method, (v_pay ->> 'amount_cents')::bigint,
              nullif(trim(v_pay ->> 'reference'), ''), auth.uid());
    end loop;
  end if;
  if v_cash > 0 then
    insert into public.payments (sale_id, order_id, method, amount_cents, received_by)
    values (v_sale_id, p_order_id, 'cash', v_cash, auth.uid());
  end if;

  v_invoice_no := 'FAC-' || lpad(app.next_counter('invoice')::text, 6, '0');
  insert into public.invoices (sale_id, number, kind, ncf, ncf_status)
  values (v_sale_id, v_invoice_no, p_invoice_kind, v_ncf, v_ncf_status);

  return jsonb_build_object('sale_id', v_sale_id, 'number', v_sale_no, 'invoice', v_invoice_no, 'ncf', v_ncf,
                            'total_cents', v_total, 'change_cents',
                            case when v_cash > 0 then v_received - v_cash else 0 end);
end $$;

-- Punto de venta (tienda, WhatsApp, Instagram): venta directa pagada completa.
create or replace function public.register_sale(p_sale jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform app.require_staff();
  return app.create_sale(
    (p_sale ->> 'customer_id')::bigint,
    coalesce((p_sale ->> 'channel')::public.order_channel, 'store'),
    p_sale -> 'items',
    (p_sale ->> 'discount_cents')::bigint,
    (p_sale ->> 'shipping_cents')::bigint,
    p_sale -> 'payments',
    (p_sale ->> 'cash_received_cents')::bigint,
    (p_sale ->> 'invoice_kind')::public.invoice_kind,
    p_sale ->> 'notes',
    null, 0);
end $$;

-- Anulación (solo administración): devuelve la mercancía y marca los pagos como reembolsados.
create or replace function public.cancel_sale(p_sale_id bigint, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_sale record;
  v_item record;
  v_returned int;
begin
  perform app.require_admin();
  if coalesce(trim(p_reason), '') = '' then raise exception 'Indique el motivo de la anulación.'; end if;
  select * into v_sale from public.sales where id = p_sale_id for update;
  if not found then raise exception 'La venta no existe.'; end if;
  if v_sale.status = 'cancelled' then raise exception 'La venta ya estaba anulada.'; end if;
  if exists (select 1 from public.returns where sale_id = p_sale_id) then
    raise exception 'La venta tiene devoluciones registradas; anule el saldo con otra devolución.';
  end if;

  update public.sales set status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid(), cancel_reason = p_reason
   where id = p_sale_id;
  for v_item in select * from public.sale_items where sale_id = p_sale_id and variant_id is not null loop
    perform app.apply_movement(v_item.variant_id, v_item.quantity, 'sale_cancellation', v_item.unit_cost_cents,
                               'sales', p_sale_id, 'Anulación venta #' || v_sale.number);
  end loop;
  update public.payments set status = 'refunded'
   where status = 'confirmed' and (sale_id = p_sale_id or (v_sale.order_id is not null and order_id = v_sale.order_id));
  if v_sale.order_id is not null then
    perform app.set_order_status(v_sale.order_id, 'cancelled', 'Venta anulada: ' || p_reason, true);
  end if;
  insert into public.audit_logs (table_name, record_id, action, new_data, actor_id)
  values ('sales', p_sale_id::text, 'CANCEL_SALE', jsonb_build_object('reason', p_reason, 'total_cents', v_sale.total_cents), auth.uid());
end $$;

-- Devolución parcial o total con reembolso opcional.
--   p_items: [{sale_item_id, quantity, restock?}]
create or replace function public.register_return(p_sale_id bigint, p_items jsonb, p_reason text,
                                                  p_refund_method public.payment_method default null)
returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  v_sale    record;
  v_line    record;
  v_item    jsonb;
  v_qty     int;
  v_already int;
  v_amount  bigint;
  v_total   bigint := 0;
  v_ret_id  bigint;
begin
  perform app.require_admin();
  if coalesce(trim(p_reason), '') = '' then raise exception 'Indique el motivo de la devolución.'; end if;
  select * into v_sale from public.sales where id = p_sale_id for update;
  if not found or v_sale.status <> 'completed' then raise exception 'Solo se pueden devolver ventas completadas.'; end if;

  insert into public.returns (sale_id, reason, created_by) values (p_sale_id, p_reason, auth.uid())
  returning id into v_ret_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    select * into v_line from public.sale_items where id = (v_item ->> 'sale_item_id')::bigint and sale_id = p_sale_id;
    if not found then raise exception 'El artículo no pertenece a esta venta.'; end if;
    v_qty := (v_item ->> 'quantity')::int;
    select coalesce(sum(ri.quantity), 0) into v_already from public.return_items ri where ri.sale_item_id = v_line.id;
    if v_qty is null or v_qty <= 0 or v_qty + v_already > v_line.quantity then
      raise exception 'Cantidad a devolver inválida para «%» (vendidas %, ya devueltas %).', v_line.description, v_line.quantity, v_already;
    end if;
    -- valor proporcional de la línea (respeta el descuento aplicado)
    v_amount := case when v_qty + v_already = v_line.quantity
                     then v_line.line_total_cents - coalesce((select sum(amount_cents) from public.return_items where sale_item_id = v_line.id), 0)
                     else round(v_line.line_total_cents::numeric * v_qty / v_line.quantity) end;
    insert into public.return_items (return_id, sale_item_id, quantity, amount_cents, restock)
    values (v_ret_id, v_line.id, v_qty, v_amount, coalesce((v_item ->> 'restock')::boolean, true));
    if v_line.variant_id is not null and coalesce((v_item ->> 'restock')::boolean, true) then
      perform app.apply_movement(v_line.variant_id, v_qty, 'return', v_line.unit_cost_cents, 'returns', v_ret_id,
                                 'Devolución venta #' || v_sale.number);
    end if;
    v_total := v_total + v_amount;
  end loop;

  update public.returns set refund_cents = case when p_refund_method is null then 0 else v_total end,
                            refund_method = p_refund_method
   where id = v_ret_id;
  return v_ret_id;
end $$;

-- ---------------------------------------------------------------------
-- Compras: recepción de mercancía con costo real (transporte prorrateado)
-- ---------------------------------------------------------------------
create or replace function public.receive_purchase_order(p_purchase_order_id bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_po       record;
  v_item     record;
  v_subtotal bigint;
  v_extra    bigint;
  v_assigned bigint := 0;
  v_share    bigint;
  v_landed   bigint;
  v_stock    int;
  v_avg      bigint;
  v_count    int;
  v_i        int := 0;
begin
  perform app.require_admin();
  select * into v_po from public.purchase_orders where id = p_purchase_order_id for update;
  if not found then raise exception 'La compra no existe.'; end if;
  if v_po.status not in ('draft', 'ordered') then raise exception 'Esta compra ya fue recibida o cancelada.'; end if;

  select coalesce(sum(quantity * unit_cost_cents), 0), count(*) into v_subtotal, v_count
    from public.purchase_order_items where purchase_order_id = p_purchase_order_id;
  if v_count = 0 then raise exception 'La compra no tiene artículos.'; end if;
  v_extra := v_po.shipping_cents + v_po.other_costs_cents;

  for v_item in select * from public.purchase_order_items where purchase_order_id = p_purchase_order_id order by id loop
    v_i := v_i + 1;
    -- transporte y otros costos repartidos según el valor de cada línea
    if v_i = v_count then
      v_share := v_extra - v_assigned;
    elsif v_subtotal > 0 then
      v_share := floor(v_extra::numeric * v_item.quantity * v_item.unit_cost_cents / v_subtotal);
    else
      v_share := floor(v_extra::numeric / v_count);
    end if;
    v_assigned := v_assigned + v_share;
    v_landed := v_item.unit_cost_cents + round(v_share::numeric / v_item.quantity);
    update public.purchase_order_items set landed_unit_cost_cents = v_landed where id = v_item.id;

    -- costo promedio ponderado: (existencia × costo actual + entrada × costo real) / total
    select pv.stock, coalesce(c.avg_cost_cents, 0) into v_stock, v_avg
      from public.product_variants pv left join public.variant_costs c on c.variant_id = pv.id
     where pv.id = v_item.variant_id for update of pv;
    insert into public.variant_costs (variant_id, avg_cost_cents, last_cost_cents)
    values (v_item.variant_id,
            round((greatest(v_stock, 0)::numeric * v_avg + v_item.quantity::numeric * v_landed) / (greatest(v_stock, 0) + v_item.quantity)),
            v_landed)
    on conflict (variant_id) do update
      set avg_cost_cents = excluded.avg_cost_cents, last_cost_cents = excluded.last_cost_cents, updated_at = now();

    perform app.apply_movement(v_item.variant_id, v_item.quantity, 'purchase', v_landed, 'purchase_orders',
                               p_purchase_order_id, 'Compra ' || v_po.number);
  end loop;

  update public.purchase_orders set status = 'received', received_at = now(), subtotal_cents = v_subtotal
   where id = p_purchase_order_id;
end $$;

-- ---------------------------------------------------------------------
-- Pedidos
-- ---------------------------------------------------------------------
create or replace function app.order_paid_cents(p_order_id bigint) returns bigint
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(amount_cents), 0) from public.payments where order_id = p_order_id and status = 'confirmed'
$$;

create or replace function app.set_order_status(p_order_id bigint, p_to public.order_status, p_note text, p_force boolean)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_from public.order_status;
  v_order record;
  v_min numeric := coalesce((app.setting('orders') ->> 'min_deposit_pct')::numeric, 50);
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'El pedido no existe.'; end if;
  v_from := v_order.status;
  if v_from = p_to then return; end if;
  if not p_force and p_to = 'delivered' and not exists (select 1 from public.sales where order_id = p_order_id and status = 'completed') then
    raise exception 'Para entregar el pedido use «complete_order»: así se cobra el balance y se factura.';
  end if;
  if not p_force and not exists (select 1 from public.order_status_transitions where from_status = v_from and to_status = p_to) then
    raise exception 'No se puede pasar un pedido de «%» a «%».', v_from, p_to;
  end if;
  if not p_force and p_to = 'confirmed' and v_order.is_special_order
     and app.order_paid_cents(p_order_id) * 100 < v_order.total_cents * v_min then
    raise exception 'Los encargos requieren un anticipo mínimo de %.', v_min || '%';
  end if;
  update public.orders set status = p_to, updated_at = now() where id = p_order_id;
  insert into public.order_status_history (order_id, from_status, to_status, note, changed_by)
  values (p_order_id, v_from, p_to, p_note, auth.uid());
end $$;

create or replace function public.change_order_status(p_order_id bigint, p_to public.order_status, p_note text default null,
                                                      p_refund_payments boolean default false)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform app.require_staff();
  if p_refund_payments then
    if not app.is_admin() then raise exception 'Solo la administración autoriza reembolsos.' using errcode = '42501'; end if;
    if p_to <> 'cancelled' then raise exception 'Solo se reembolsa al cancelar un pedido.'; end if;
  end if;
  perform app.set_order_status(p_order_id, p_to, p_note, false);
  if p_to = 'cancelled' and p_refund_payments then
    update public.payments set status = 'refunded' where order_id = p_order_id and status = 'confirmed';
  end if;
end $$;

-- Crear pedido. p_order: {customer_id, channel, is_special_order, items:[{variant_id?|description, quantity, unit_price_cents?, unit_cost_cents?}],
--                         discount_cents, shipping_cents, shipping_address, province, municipality, expected_date, notes,
--                         deposit:{method, amount_cents, reference}}
create or replace function public.create_order(p_order jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_id       bigint;
  v_number   text;
  v_item     jsonb;
  v_variant  record;
  v_price    bigint;
  v_subtotal bigint := 0;
  v_total    bigint;
  v_deposit  bigint := coalesce((p_order #>> '{deposit,amount_cents}')::bigint, 0);
  v_special  boolean := coalesce((p_order ->> 'is_special_order')::boolean, false);
  v_min      numeric := coalesce((app.setting('orders') ->> 'min_deposit_pct')::numeric, 50);
begin
  perform app.require_staff();
  if not exists (select 1 from public.customers where id = (p_order ->> 'customer_id')::bigint) then
    raise exception 'Seleccione un cliente registrado.';
  end if;
  if jsonb_typeof(p_order -> 'items') is distinct from 'array' or jsonb_array_length(p_order -> 'items') = 0 then
    raise exception 'Agregue al menos un artículo al pedido.';
  end if;

  v_number := 'KF-' || app.next_counter('order');
  insert into public.orders (number, customer_id, channel, is_special_order, discount_cents, shipping_cents,
                             shipping_address, province, municipality, expected_date, notes, created_by, status)
  values (v_number, (p_order ->> 'customer_id')::bigint, coalesce((p_order ->> 'channel')::public.order_channel, 'whatsapp'),
          v_special, coalesce((p_order ->> 'discount_cents')::bigint, 0), coalesce((p_order ->> 'shipping_cents')::bigint, 0),
          p_order ->> 'shipping_address', p_order ->> 'province', p_order ->> 'municipality',
          (p_order ->> 'expected_date')::date, p_order ->> 'notes', auth.uid(), 'new')
  returning id into v_id;

  for v_item in select * from jsonb_array_elements(p_order -> 'items') loop
    if (v_item ->> 'quantity')::int is null or (v_item ->> 'quantity')::int <= 0 then
      raise exception 'Cantidad inválida.';
    end if;
    if v_item ->> 'variant_id' is not null then
      select pv.id, pv.price_cents, p.name || coalesce(' ' || pv.color, '') || coalesce(' T/' || pv.size, '') as label,
             coalesce(c.avg_cost_cents, 0) as cost
        into v_variant
        from public.product_variants pv join public.products p on p.id = pv.product_id
        left join public.variant_costs c on c.variant_id = pv.id
       where pv.id = (v_item ->> 'variant_id')::bigint and pv.deleted_at is null;
      if not found then raise exception 'Producto no encontrado.'; end if;
      -- empleadas no pueden cambiar el precio de catálogo
      v_price := case when app.is_admin() and v_item ? 'unit_price_cents' then (v_item ->> 'unit_price_cents')::bigint
                      else v_variant.price_cents end;
      insert into public.order_items (order_id, variant_id, description, quantity, unit_price_cents, unit_cost_cents)
      values (v_id, v_variant.id, v_variant.label, (v_item ->> 'quantity')::int, v_price, v_variant.cost);
    else
      if not v_special then raise exception 'Los artículos sin ficha solo se permiten en encargos.'; end if;
      if coalesce(trim(v_item ->> 'description'), '') = '' or coalesce((v_item ->> 'unit_price_cents')::bigint, 0) <= 0 then
        raise exception 'Indique descripción y precio del artículo por encargo.';
      end if;
      v_price := (v_item ->> 'unit_price_cents')::bigint;
      insert into public.order_items (order_id, variant_id, description, quantity, unit_price_cents, unit_cost_cents)
      values (v_id, null, trim(v_item ->> 'description'), (v_item ->> 'quantity')::int, v_price,
              case when app.is_admin() then coalesce((v_item ->> 'unit_cost_cents')::bigint, 0) else 0 end);
    end if;
    v_subtotal := v_subtotal + (v_item ->> 'quantity')::int * v_price;
  end loop;

  update public.orders set subtotal_cents = v_subtotal where id = v_id returning total_cents into v_total;
  if v_total < 0 then raise exception 'El descuento supera el valor del pedido.'; end if;

  if v_special and v_deposit * 100 < v_total * v_min then
    raise exception 'Política de Kary Fashion: los encargos requieren un anticipo mínimo de % (RD$%).',
      v_min || '%', to_char(ceil(v_total * v_min / 100) / 100.0, 'FM999,999,990.00');
  end if;
  if v_deposit > v_total then raise exception 'El anticipo no puede superar el valor del pedido.'; end if;
  if v_deposit > 0 then
    insert into public.payments (order_id, method, amount_cents, reference, received_by)
    values (v_id, (p_order #>> '{deposit,method}')::public.payment_method, v_deposit, p_order #>> '{deposit,reference}', auth.uid());
  end if;
  insert into public.order_status_history (order_id, to_status, note, changed_by) values (v_id, 'new', 'Pedido creado', auth.uid());
  if v_deposit > 0 then
    perform app.set_order_status(v_id, 'confirmed', 'Anticipo recibido', false);
  end if;
  return jsonb_build_object('order_id', v_id, 'number', v_number, 'total_cents', v_total, 'paid_cents', v_deposit);
end $$;

create or replace function public.add_order_payment(p_order_id bigint, p_method public.payment_method,
                                                    p_amount_cents bigint, p_reference text default null)
returns bigint
language plpgsql security definer set search_path = '' as $$
declare v_order record; v_id bigint;
begin
  perform app.require_staff();
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'El pedido no existe.'; end if;
  if v_order.status in ('delivered', 'cancelled', 'returned') then raise exception 'El pedido ya está cerrado.'; end if;
  if p_amount_cents <= 0 then raise exception 'Monto inválido.'; end if;
  if app.order_paid_cents(p_order_id) + p_amount_cents > v_order.total_cents then
    raise exception 'El pago supera el balance pendiente.';
  end if;
  insert into public.payments (order_id, method, amount_cents, reference, received_by)
  values (p_order_id, p_method, p_amount_cents, p_reference, auth.uid()) returning id into v_id;
  if v_order.status in ('new', 'pending_payment') then
    perform app.set_order_status(p_order_id, 'confirmed', 'Pago registrado', true);
  end if;
  return v_id;
end $$;

-- Entregar un pedido: cobra el balance pendiente y genera UNA venta + factura.
create or replace function public.complete_order(p_order_id bigint, p_payments jsonb default '[]',
                                                 p_cash_received_cents bigint default null,
                                                 p_invoice_kind public.invoice_kind default 'commercial')
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_order  record;
  v_items  jsonb;
  v_result jsonb;
begin
  perform app.require_staff();
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'El pedido no existe.'; end if;
  if v_order.status not in ('confirmed', 'preparing', 'shipped') then
    raise exception 'Solo se entregan pedidos confirmados, en preparación o enviados (estado actual: %).', v_order.status;
  end if;
  select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
           'variant_id', oi.variant_id, 'description', oi.description, 'quantity', oi.quantity,
           'unit_price_cents', oi.unit_price_cents,
           'unit_cost_cents', case when oi.variant_id is null then oi.unit_cost_cents end)) order by oi.id)
    into v_items from public.order_items oi where oi.order_id = p_order_id;

  v_result := app.create_sale(v_order.customer_id, v_order.channel, v_items, v_order.discount_cents, v_order.shipping_cents,
                              p_payments, p_cash_received_cents, p_invoice_kind, 'Entrega de pedido ' || v_order.number,
                              p_order_id, app.order_paid_cents(p_order_id));
  perform app.set_order_status(p_order_id, 'delivered', 'Entregado y facturado', true);
  return v_result;
end $$;

-- Gestión de usuarios: solo la dueña asigna roles de personal.
create or replace function public.set_user_role(p_user_id uuid, p_role text, p_active boolean default true)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not app.is_owner() then
    raise exception 'Solo la dueña puede cambiar roles de usuarios.' using errcode = '42501';
  end if;
  if p_user_id = auth.uid() and (p_role <> 'owner' or not p_active) then
    raise exception 'No puede quitarse a sí misma el rol de dueña.';
  end if;
  if not exists (select 1 from public.roles where code = p_role) then raise exception 'Rol inválido.'; end if;
  update public.profiles set role = p_role, active = p_active, updated_at = now() where id = p_user_id;
  if not found then raise exception 'El usuario no existe.'; end if;
  insert into public.audit_logs (table_name, record_id, action, new_data, actor_id)
  values ('profiles', p_user_id::text, 'SET_ROLE', jsonb_build_object('role', p_role, 'active', p_active), auth.uid());
end $$;
