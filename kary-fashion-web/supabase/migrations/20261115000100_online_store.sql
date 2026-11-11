-- =====================================================================
--  KARY FASHION · Fase 5 · Tienda online
--  Las clientas compran SIN cuenta: el pedido queda «pendiente de pago»
--  (transferencia) y la tienda lo confirma. La mercancía se descuenta al
--  entregar (complete_order), como cualquier pedido.
-- =====================================================================
insert into public.settings (key, value) values
  ('store', '{"open":true,"whatsapp":"8095029189","announcement":"Envíos a todo el país","delivery_fee_cents":20000,
              "pickup_address":"Calle Duarte, Guatapanal, Mao, Valverde","bank_name":null,"account_type":null,
              "account_number":null,"account_holder":"Kary Fashion","max_orders_per_hour":5}')
on conflict (key) do nothing;

-- Datos públicos de la tienda (sin nada interno)
create or replace function public.store_info() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'name', b.value ->> 'name', 'phone', b.value ->> 'phone', 'address', b.value ->> 'address',
    'instagram', b.value ->> 'instagram', 'tiktok', b.value ->> 'tiktok',
    'open', coalesce((s.value ->> 'open')::boolean, true), 'whatsapp', s.value ->> 'whatsapp',
    'announcement', s.value ->> 'announcement', 'delivery_fee_cents', coalesce((s.value ->> 'delivery_fee_cents')::bigint, 0),
    'pickup_address', s.value ->> 'pickup_address', 'bank_name', s.value ->> 'bank_name', 'account_type', s.value ->> 'account_type',
    'account_number', s.value ->> 'account_number', 'account_holder', s.value ->> 'account_holder')
  from public.settings b, public.settings s where b.key = 'business' and s.key = 'store'
$$;

create or replace function app.digits(p text) returns text
language sql immutable set search_path = '' as $$ select regexp_replace(coalesce(p, ''), '\D', '', 'g') $$;

-- Pedido desde la tienda online.
-- p_order: {customer:{full_name, phone, email?, address?, province?, municipality?}, delivery:'pickup'|'delivery',
--           notes?, items:[{variant_id, quantity}], website (campo trampa: debe venir vacío)}
create or replace function public.place_online_order(p_order jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_store    jsonb := (select value from public.settings where key = 'store');
  v_c        jsonb := p_order -> 'customer';
  v_name     text  := left(trim(coalesce(v_c ->> 'full_name', '')), 120);
  v_phone    text  := app.digits(v_c ->> 'phone');
  v_delivery text  := coalesce(p_order ->> 'delivery', 'pickup');
  v_item     jsonb;
  v_var      record;
  v_qty      int;
  v_cust     bigint;
  v_id       bigint;
  v_number   text;
  v_subtotal bigint := 0;
  v_ship     bigint := 0;
  v_total    bigint;
begin
  if coalesce(p_order ->> 'website', '') <> '' then raise exception 'No se pudo registrar el pedido.'; end if;
  if not coalesce((v_store ->> 'open')::boolean, true) then raise exception 'La tienda online no está recibiendo pedidos en este momento.'; end if;
  if length(v_name) < 3 then raise exception 'Escriba su nombre completo.'; end if;
  if length(v_phone) = 11 and left(v_phone, 1) = '1' then v_phone := substr(v_phone, 2); end if;
  if length(v_phone) <> 10 or left(v_phone, 3) not in ('809', '829', '849') then
    raise exception 'Escriba un teléfono dominicano válido (809, 829 u 849).';
  end if;
  if v_delivery not in ('pickup', 'delivery') then raise exception 'Forma de entrega inválida.'; end if;
  if v_delivery = 'delivery' and coalesce(trim(v_c ->> 'address'), '') = '' then raise exception 'Escriba la dirección de envío.'; end if;
  if jsonb_typeof(p_order -> 'items') is distinct from 'array' or jsonb_array_length(p_order -> 'items') = 0 then
    raise exception 'El carrito está vacío.';
  end if;
  if jsonb_array_length(p_order -> 'items') > 20 then raise exception 'Máximo 20 artículos por pedido.'; end if;
  -- límite de pedidos por teléfono (evita abusos)
  if (select count(*) from public.orders o join public.customers c on c.id = o.customer_id
       where app.digits(c.phone) = v_phone and o.created_at > now() - interval '1 hour')
     >= coalesce((v_store ->> 'max_orders_per_hour')::int, 5) then
    raise exception 'Ya recibimos varios pedidos de este teléfono. Escríbanos por WhatsApp.';
  end if;

  -- cliente: se reconoce por el teléfono
  select id into v_cust from public.customers where app.digits(phone) = v_phone order by id limit 1;
  if v_cust is null then
    insert into public.customers (full_name, phone, whatsapp, email, address, province, municipality, notes)
    values (v_name, v_phone, v_phone, nullif(trim(v_c ->> 'email'), ''), nullif(trim(v_c ->> 'address'), ''),
            nullif(trim(v_c ->> 'province'), ''), nullif(trim(v_c ->> 'municipality'), ''), 'Registrada desde la tienda online')
    returning id into v_cust;
  end if;

  v_number := 'KF-' || app.next_counter('order');
  if v_delivery = 'delivery' then v_ship := coalesce((v_store ->> 'delivery_fee_cents')::bigint, 0); end if;
  insert into public.orders (number, customer_id, channel, status, shipping_cents, shipping_address, province, municipality, notes)
  values (v_number, v_cust, 'online', 'new', v_ship,
          case when v_delivery = 'delivery' then left(trim(v_c ->> 'address'), 300) else 'Retiro en tienda' end,
          nullif(left(trim(v_c ->> 'province'), 60), ''), nullif(left(trim(v_c ->> 'municipality'), 60), ''),
          nullif(left(trim(p_order ->> 'notes'), 500), ''))
  returning id into v_id;

  for v_item in select * from jsonb_array_elements(p_order -> 'items') loop
    v_qty := (v_item ->> 'quantity')::int;
    if v_qty is null or v_qty < 1 or v_qty > 10 then raise exception 'Cantidad inválida (de 1 a 10 por artículo).'; end if;
    select pv.id, pv.price_cents, pv.stock, coalesce(vc.avg_cost_cents, 0) as cost,
           p.name || coalesce(' ' || pv.color, '') || coalesce(' T/' || pv.size, '') as label
      into v_var
      from public.product_variants pv join public.products p on p.id = pv.product_id
      left join public.variant_costs vc on vc.variant_id = pv.id
     where pv.id = (v_item ->> 'variant_id')::bigint and pv.active and pv.deleted_at is null
       and p.published and p.status = 'active' and p.deleted_at is null;
    if not found then raise exception 'Un artículo del carrito ya no está disponible.'; end if;
    if v_var.stock < v_qty then
      raise exception 'De «%» solo quedan % disponibles.', v_var.label, greatest(v_var.stock, 0);
    end if;
    insert into public.order_items (order_id, variant_id, description, quantity, unit_price_cents, unit_cost_cents)
    values (v_id, v_var.id, v_var.label, v_qty, v_var.price_cents, v_var.cost);
    v_subtotal := v_subtotal + v_qty * v_var.price_cents;
  end loop;

  update public.orders set subtotal_cents = v_subtotal where id = v_id returning total_cents into v_total;
  insert into public.order_status_history (order_id, to_status, note) values (v_id, 'new', 'Pedido desde la tienda online');
  update public.orders set status = 'pending_payment', updated_at = now() where id = v_id;
  insert into public.order_status_history (order_id, from_status, to_status, note)
  values (v_id, 'new', 'pending_payment', 'Esperando transferencia');
  return jsonb_build_object('number', v_number, 'total_cents', v_total, 'shipping_cents', v_ship, 'subtotal_cents', v_subtotal);
end $$;

-- Seguimiento: solo con el número del pedido Y el teléfono con que se hizo
create or replace function public.track_order(p_number text, p_phone text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_phone text := app.digits(p_phone); v_o record;
begin
  if length(v_phone) = 11 and left(v_phone, 1) = '1' then v_phone := substr(v_phone, 2); end if;
  select o.id, o.number, o.status, o.total_cents, o.shipping_cents, o.created_at, o.shipping_address,
         app.order_paid_cents(o.id) as paid_cents, o.total_cents - app.order_paid_cents(o.id) as balance_cents
    into v_o
    from public.orders o join public.customers c on c.id = o.customer_id
   where upper(o.number) = upper(trim(p_number)) and app.digits(c.phone) = v_phone;
  if not found then return null; end if;
  return jsonb_build_object(
    'number', v_o.number, 'status', v_o.status, 'total_cents', v_o.total_cents, 'shipping_cents', v_o.shipping_cents,
    'paid_cents', v_o.paid_cents, 'balance_cents', v_o.balance_cents, 'created_at', v_o.created_at, 'shipping_address', v_o.shipping_address,
    'items', (select coalesce(jsonb_agg(jsonb_build_object('description', description, 'quantity', quantity, 'unit_price_cents', unit_price_cents) order by id), '[]')
                from public.order_items where order_id = v_o.id),
    'history', (select coalesce(jsonb_agg(jsonb_build_object('status', to_status, 'at', changed_at) order by id), '[]')
                  from public.order_status_history where order_id = v_o.id));
end $$;

revoke execute on function app.digits(text) from public;
revoke execute on function public.store_info(), public.place_online_order(jsonb), public.track_order(text, text) from public;
grant execute on function public.store_info(), public.place_online_order(jsonb), public.track_order(text, text) to anon, authenticated;

-- Galería: varias fotos por producto (la principal sigue en products.image_url)
create table public.product_images (
  id          bigint generated always as identity primary key,
  product_id  bigint not null references public.products (id) on delete cascade,
  url         text   not null,
  sort_order  int    not null default 0,
  enhanced    boolean not null default false,
  created_by  uuid references auth.users (id),
  created_at  timestamptz not null default now()
);
alter table public.product_images enable row level security;
revoke all on public.product_images from anon, authenticated;
grant select on public.product_images to anon, authenticated;
grant insert, update, delete on public.product_images to authenticated;
grant usage on all sequences in schema public to authenticated;
create policy product_images_public on public.product_images for select
  using (exists (select 1 from public.products p where p.id = product_id and p.published and p.status = 'active' and p.deleted_at is null));
create policy product_images_staff_read on public.product_images for select to authenticated using (app.is_staff());
create policy product_images_admin_insert on public.product_images for insert to authenticated with check (app.is_admin());
create policy product_images_admin_update on public.product_images for update to authenticated using (app.is_admin()) with check (app.is_admin());
create policy product_images_admin_delete on public.product_images for delete to authenticated using (app.is_admin());
