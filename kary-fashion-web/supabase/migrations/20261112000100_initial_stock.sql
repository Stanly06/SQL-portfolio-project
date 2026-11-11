-- =====================================================================
--  KARY FASHION · Inventario inicial
--  Para cargar la mercancía que ya existe en la tienda al empezar a usar el sistema,
--  con su costo, sin tener que registrarla como una compra.
-- =====================================================================
create or replace function public.register_initial_stock(p_variant_id bigint, p_quantity int, p_unit_cost_cents bigint)
returns int
language plpgsql security definer set search_path = '' as $$
begin
  perform app.require_admin();
  if p_quantity <= 0 then raise exception 'La existencia inicial debe ser mayor que cero.'; end if;
  if coalesce(p_unit_cost_cents, -1) < 0 then raise exception 'Indique el costo por unidad.'; end if;
  if exists (select 1 from public.inventory_movements where variant_id = p_variant_id) then
    raise exception 'Esta variante ya tiene movimientos; use una compra o un ajuste.';
  end if;
  insert into public.variant_costs (variant_id, avg_cost_cents, last_cost_cents)
  values (p_variant_id, p_unit_cost_cents, p_unit_cost_cents)
  on conflict (variant_id) do update set avg_cost_cents = excluded.avg_cost_cents,
                                         last_cost_cents = excluded.last_cost_cents, updated_at = now();
  return app.apply_movement(p_variant_id, p_quantity, 'initial', p_unit_cost_cents, null, null, 'Existencia inicial');
end $$;

revoke execute on function public.register_initial_stock(bigint, int, bigint) from public, anon;
grant execute on function public.register_initial_stock(bigint, int, bigint) to authenticated;
