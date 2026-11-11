-- =====================================================================
--  KARY FASHION · Fase 4 · Cierre de caja diario
--  El sistema calcula lo que DEBE haber en caja (fondo + cobros en efectivo
--  − devoluciones en efectivo − gastos pagados en efectivo) y lo compara con
--  lo que se contó. El cierre queda guardado y no se modifica.
-- =====================================================================
create table public.cash_closings (
  id                  bigint generated always as identity primary key,
  business_date       date   not null unique,
  opening_cash_cents  bigint not null default 0 check (opening_cash_cents >= 0),
  expected_cash_cents bigint not null,
  counted_cash_cents  bigint not null check (counted_cash_cents >= 0),
  difference_cents    bigint generated always as (counted_cash_cents - expected_cash_cents) stored,
  summary             jsonb  not null,           -- totales por método al momento del cierre
  notes               text,
  closed_by           uuid   not null references auth.users (id),
  closed_at           timestamptz not null default now()
);
alter table public.cash_closings enable row level security;
revoke all on public.cash_closings from anon, authenticated;
grant select on public.cash_closings to authenticated;
create policy cash_closings_staff_read on public.cash_closings for select to authenticated using (app.is_staff());
create trigger cash_closings_immutable before update or delete on public.cash_closings
  for each row execute function app.block_changes();

-- Movimientos de dinero de un día de negocio, por método
create or replace function public.cash_summary(p_date date)
returns table (method text, sales_cents bigint, deposits_cents bigint, refunds_cents bigint, expenses_cents bigint, net_cents bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform app.require_staff();
  return query
  with m(method) as (values ('cash'), ('transfer'), ('card'), ('gateway')),
  pay as (
    select p.method::text as method,
           coalesce(sum(p.amount_cents) filter (where p.sale_id is not null), 0) as sales,
           coalesce(sum(p.amount_cents) filter (where p.sale_id is null), 0) as deposits
      from public.payments p
     where p.status = 'confirmed' and app.biz_date(p.received_at) = p_date
     group by 1
  ),
  ref as (
    select r.refund_method::text as method, coalesce(sum(r.refund_cents), 0) as refunds
      from public.returns r where r.refund_cents > 0 and app.biz_date(r.created_at) = p_date group by 1
  ),
  exp as (
    select e.payment_method::text as method, coalesce(sum(e.amount_cents), 0) as expenses
      from public.expenses e where e.expense_date = p_date group by 1
  )
  select m.method, coalesce(pay.sales, 0)::bigint, coalesce(pay.deposits, 0)::bigint,
         coalesce(ref.refunds, 0)::bigint, coalesce(exp.expenses, 0)::bigint,
         (coalesce(pay.sales, 0) + coalesce(pay.deposits, 0) - coalesce(ref.refunds, 0) - coalesce(exp.expenses, 0))::bigint
    from m left join pay using (method) left join ref using (method) left join exp using (method)
   order by array_position(array['cash', 'transfer', 'card', 'gateway'], m.method);
end $$;

create or replace function public.close_cash_register(p_date date, p_opening_cents bigint, p_counted_cents bigint, p_notes text default null)
returns bigint
language plpgsql security definer set search_path = '' as $$
declare v_expected bigint; v_summary jsonb; v_id bigint;
begin
  perform app.require_staff();
  if p_date > app.biz_date(now()) then raise exception 'No se puede cerrar un día futuro.'; end if;
  if not app.is_admin() and p_date <> app.biz_date(now()) then
    raise exception 'Las empleadas solo pueden cerrar la caja del día de hoy.' using errcode = '42501';
  end if;
  if coalesce(p_opening_cents, -1) < 0 or coalesce(p_counted_cents, -1) < 0 then raise exception 'Montos inválidos.'; end if;
  if exists (select 1 from public.cash_closings where business_date = p_date) then
    raise exception 'La caja de ese día ya fue cerrada.';
  end if;
  select coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb), coalesce(sum(s.net_cents) filter (where s.method = 'cash'), 0)
    into v_summary, v_expected from public.cash_summary(p_date) s;
  insert into public.cash_closings (business_date, opening_cash_cents, expected_cash_cents, counted_cash_cents, summary, notes, closed_by)
  values (p_date, p_opening_cents, p_opening_cents + v_expected, p_counted_cents, v_summary, nullif(trim(p_notes), ''), auth.uid())
  returning id into v_id;
  insert into public.audit_logs (table_name, record_id, action, new_data, actor_id)
  values ('cash_closings', v_id::text, 'CLOSE_CASH',
          jsonb_build_object('date', p_date, 'expected', p_opening_cents + v_expected, 'counted', p_counted_cents), auth.uid());
  return v_id;
end $$;

revoke execute on function public.cash_summary(date), public.close_cash_register(date, bigint, bigint, text) from public, anon;
grant execute on function public.cash_summary(date), public.close_cash_register(date, bigint, bigint, text) to authenticated;
