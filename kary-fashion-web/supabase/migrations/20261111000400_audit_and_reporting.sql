-- =====================================================================
--  KARY FASHION · Fase 2 · 4/4  Auditoría automática y consultas del dashboard
-- =====================================================================

-- ---------------------------------------------------------------------
-- Auditoría: quién cambió qué, con valores antes y después
-- ---------------------------------------------------------------------
create or replace function app.audit_row() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_old jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  v_new jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
begin
  -- Los cambios de existencia ya quedan en el kardex: no se duplican aquí.
  if tg_op = 'UPDATE' and (v_old - 'stock' - 'updated_at') = (v_new - 'stock' - 'updated_at') then
    return null;
  end if;
  insert into public.audit_logs (table_name, record_id, action, old_data, new_data, actor_id)
  values (tg_table_name, coalesce(v_new ->> 'id', v_old ->> 'id', v_new ->> 'variant_id', v_new ->> 'key'),
          tg_op, v_old, v_new, auth.uid());
  return null;
end $$;

do $$
declare t text;
begin
  foreach t in array array['products', 'product_variants', 'variant_costs', 'customers', 'suppliers', 'expenses',
                           'purchase_orders', 'purchase_order_items', 'settings', 'fiscal_sequences', 'profiles',
                           'categories', 'orders'] loop
    execute format('create trigger %I after insert or update or delete on public.%I
                    for each row execute function app.audit_row()', t || '_audit', t);
  end loop;
end $$;

-- Las ventas no se editan: solo se crean (función) o se anulan (función).
create or replace function app.block_sale_edits() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Las ventas no se eliminan; se anulan con cancel_sale().' using errcode = '42501';
  end if;
  if (to_jsonb(old) - array['status', 'cancelled_at', 'cancelled_by', 'cancel_reason'])
     <> (to_jsonb(new) - array['status', 'cancelled_at', 'cancelled_by', 'cancel_reason']) then
    raise exception 'Los montos de una venta registrada no se pueden modificar.' using errcode = '42501';
  end if;
  return new;
end $$;

create trigger sales_immutable before update or delete on public.sales
  for each row execute function app.block_sale_edits();

create or replace function app.block_changes() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'Los registros de % no se modifican ni se eliminan.', tg_table_name using errcode = '42501';
end $$;

create trigger sale_items_immutable before update or delete on public.sale_items
  for each row execute function app.block_changes();
create trigger movements_immutable before update or delete on public.inventory_movements
  for each row execute function app.block_changes();
create trigger audit_logs_immutable before update or delete on public.audit_logs
  for each row execute function app.block_changes();

-- ---------------------------------------------------------------------
-- Reportes (solo administración). Fechas = días de negocio en RD.
-- ---------------------------------------------------------------------
create or replace function app.biz_date(ts timestamptz) returns date
language sql immutable set search_path = '' as $$
  select (ts at time zone 'America/Santo_Domingo')::date
$$;

-- Líneas vendidas válidas con costo y ganancia (base de casi todos los reportes)
create view public.sales_lines with (security_barrier) as
select s.id as sale_id, s.number, s.sale_date, app.biz_date(s.sale_date) as business_date, s.channel, s.customer_id,
       s.sold_by, si.variant_id, pv.product_id, p.category_id, si.sku, si.description, si.quantity,
       si.unit_price_cents, si.discount_cents, si.line_total_cents,
       si.quantity * si.unit_cost_cents                    as cost_cents,
       si.line_total_cents - si.quantity * si.unit_cost_cents as gross_profit_cents
from public.sales s
join public.sale_items si on si.sale_id = s.id
left join public.product_variants pv on pv.id = si.variant_id
left join public.products p on p.id = pv.product_id
where s.status = 'completed' and app.is_admin();

revoke all on public.sales_lines from public, anon;
grant select on public.sales_lines to authenticated;

-- Estado de resultados del período. Coincide con IncomeStatementInput del frontend.
create or replace function public.income_statement(p_from date, p_to date)
returns table (
  gross_sales_cents bigint, discounts_cents bigint, returns_cents bigint, sales_tax_cents bigint,
  cost_of_goods_sold_cents bigint, operating_expenses_cents bigint, financial_expenses_cents bigint,
  income_tax_cents bigint, inventory_purchases_cents bigint, net_revenue_cents bigint, gross_profit_cents bigint,
  operating_profit_cents bigint, net_profit_cents bigint, sales_count bigint, avg_ticket_cents bigint
)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_gross bigint; v_disc bigint; v_tax bigint; v_cogs bigint; v_count bigint;
  v_ret bigint; v_ret_tax bigint; v_ret_cost bigint;
  v_opex bigint; v_fin bigint; v_purch bigint; v_net bigint;
begin
  perform app.require_admin();
  -- Ventas (los montos de la tienda incluyen ITBIS; se separa con tax_cents)
  select coalesce(sum(s.subtotal_cents + s.shipping_cents), 0), coalesce(sum(s.discount_cents), 0),
         coalesce(sum(s.tax_cents), 0), count(*)
    into v_gross, v_disc, v_tax, v_count
    from public.sales s
   where s.status = 'completed' and app.biz_date(s.sale_date) between p_from and p_to;
  select coalesce(sum(si.quantity * si.unit_cost_cents), 0) into v_cogs
    from public.sales s join public.sale_items si on si.sale_id = s.id
   where s.status = 'completed' and app.biz_date(s.sale_date) between p_from and p_to;

  -- Devoluciones del período: restan ingreso, ITBIS proporcional y (si vuelven al inventario) costo
  select coalesce(sum(ri.amount_cents), 0),
         coalesce(sum(case when s.total_cents > 0 then round(ri.amount_cents::numeric * s.tax_cents / s.total_cents) else 0 end), 0),
         coalesce(sum(case when ri.restock then ri.quantity * si.unit_cost_cents else 0 end), 0)
    into v_ret, v_ret_tax, v_ret_cost
    from public.returns r
    join public.return_items ri on ri.return_id = r.id
    join public.sale_items si on si.id = ri.sale_item_id
    join public.sales s on s.id = r.sale_id
   where app.biz_date(r.created_at) between p_from and p_to;

  select coalesce(sum(amount_cents) filter (where not is_financial), 0),
         coalesce(sum(amount_cents) filter (where is_financial), 0)
    into v_opex, v_fin
    from public.expenses where expense_date between p_from and p_to;
  select coalesce(sum(total_cents), 0) into v_purch
    from public.purchase_orders where status = 'received' and app.biz_date(received_at) between p_from and p_to;

  -- Montos sin ITBIS: el impuesto se informa aparte y no es ingreso
  sales_tax_cents           := v_tax - v_ret_tax;
  discounts_cents           := v_disc;
  returns_cents             := v_ret - v_ret_tax;
  gross_sales_cents         := v_gross - v_tax;     -- ITBIS de las ventas fuera de las ventas brutas
  net_revenue_cents         := gross_sales_cents - discounts_cents - returns_cents;
  cost_of_goods_sold_cents  := v_cogs - v_ret_cost;
  gross_profit_cents        := net_revenue_cents - cost_of_goods_sold_cents;
  operating_expenses_cents  := v_opex;
  operating_profit_cents    := gross_profit_cents - v_opex;
  financial_expenses_cents  := v_fin;
  income_tax_cents          := 0;                   -- ISR se calcula en el cierre fiscal anual
  net_profit_cents          := operating_profit_cents - v_fin - income_tax_cents;
  inventory_purchases_cents := v_purch;
  sales_count               := v_count;
  avg_ticket_cents          := case when v_count > 0 then (v_gross - v_disc) / v_count else 0 end;
  return next;
end $$;

-- Serie para el gráfico de ventas y ganancias
create or replace function public.sales_series(p_from date, p_to date, p_grain text default 'day')
returns table (bucket date, net_sales_cents bigint, gross_profit_cents bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform app.require_admin();
  if p_grain not in ('day', 'week', 'month') then raise exception 'Agrupación inválida.'; end if;
  return query
  with g as (
    select generate_series(date_trunc(p_grain, p_from::timestamp), date_trunc(p_grain, p_to::timestamp),
                           ('1 ' || p_grain)::interval)::date as bucket
  ), l as (
    select date_trunc(p_grain, app.biz_date(s.sale_date)::timestamp)::date as bucket,
           sum(si.line_total_cents) as sales, sum(si.line_total_cents - si.quantity * si.unit_cost_cents) as profit
      from public.sales s join public.sale_items si on si.sale_id = s.id
     where s.status = 'completed' and app.biz_date(s.sale_date) between p_from and p_to
     group by 1
  )
  select g.bucket, coalesce(l.sales, 0)::bigint, coalesce(l.profit, 0)::bigint
    from g left join l using (bucket) order by g.bucket;
end $$;

create or replace function public.top_products(p_from date, p_to date, p_limit int default 10)
returns table (product_id bigint, name text, category text, units bigint, revenue_cents bigint, gross_profit_cents bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform app.require_admin();
  return query
  select p.id, p.name, c.name::text, sum(si.quantity)::bigint, sum(si.line_total_cents)::bigint,
         sum(si.line_total_cents - si.quantity * si.unit_cost_cents)::bigint
    from public.sales s
    join public.sale_items si on si.sale_id = s.id
    join public.product_variants pv on pv.id = si.variant_id
    join public.products p on p.id = pv.product_id
    join public.categories c on c.id = p.category_id
   where s.status = 'completed' and app.biz_date(s.sale_date) between p_from and p_to
   group by p.id, p.name, c.name
   order by 4 desc, 5 desc
   limit p_limit;
end $$;

-- Inventario valorizado por categoría (al costo y a precio de venta)
create or replace function public.inventory_valuation()
returns table (category text, variants bigint, units bigint, low_stock bigint, out_of_stock bigint,
               cost_value_cents bigint, retail_value_cents bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform app.require_admin();
  return query
  select c.name::text, count(*), sum(greatest(pv.stock, 0))::bigint,
         count(*) filter (where pv.stock <= pv.min_stock), count(*) filter (where pv.stock <= 0),
         sum(greatest(pv.stock, 0)::bigint * coalesce(vc.avg_cost_cents, 0))::bigint,
         sum(greatest(pv.stock, 0)::bigint * pv.price_cents)::bigint
    from public.product_variants pv
    join public.products p on p.id = pv.product_id
    join public.categories c on c.id = p.category_id
    left join public.variant_costs vc on vc.variant_id = pv.id
   where pv.active and pv.deleted_at is null and p.deleted_at is null
   group by c.name order by 6 desc;
end $$;

-- Alertas de stock: disponible para todo el personal (sin costos)
create view public.low_stock_alerts with (security_barrier) as
select pv.id as variant_id, pv.sku, p.name, pv.size, pv.color, pv.stock, pv.min_stock, c.name::text as category,
       coalesce(pv.image_url, p.image_url) as image_url
from public.product_variants pv
join public.products p on p.id = pv.product_id
join public.categories c on c.id = p.category_id
where pv.active and pv.deleted_at is null and p.deleted_at is null and pv.stock <= pv.min_stock and app.is_staff();

revoke all on public.low_stock_alerts from public, anon;
grant select on public.low_stock_alerts to authenticated;

-- Saldo de pedidos (lo que falta por cobrar)
create view public.order_balances with (security_barrier) as
select o.id, o.number, o.customer_id, c.full_name as customer, o.status, o.channel, o.total_cents,
       coalesce(sum(pay.amount_cents) filter (where pay.status = 'confirmed'), 0) as paid_cents,
       o.total_cents - coalesce(sum(pay.amount_cents) filter (where pay.status = 'confirmed'), 0) as balance_cents,
       o.expected_date, o.created_at
from public.orders o
join public.customers c on c.id = o.customer_id
left join public.payments pay on pay.order_id = o.id
where app.is_staff() or c.auth_user_id = auth.uid()
group by o.id, c.full_name;

revoke all on public.order_balances from public, anon;
grant select on public.order_balances to authenticated;

revoke execute on function public.income_statement(date, date), public.sales_series(date, date, text),
  public.top_products(date, date, int), public.inventory_valuation() from public, anon;
grant execute on function public.income_statement(date, date), public.sales_series(date, date, text),
  public.top_products(date, date, int), public.inventory_valuation() to authenticated;
revoke execute on all functions in schema app from public;
grant execute on function app.current_role(), app.is_staff(), app.is_admin(), app.is_owner(), app.biz_date(timestamptz)
  to anon, authenticated;
