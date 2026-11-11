-- =====================================================================
--  KARY FASHION · El subtotal de una compra lo calcula la base de datos
--  (suma de cantidad × costo de sus artículos); nadie lo escribe a mano.
-- =====================================================================
create or replace function app.refresh_purchase_subtotal() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_id bigint := coalesce(new.purchase_order_id, old.purchase_order_id);
begin
  update public.purchase_orders
     set subtotal_cents = coalesce((select sum(quantity::bigint * unit_cost_cents)
                                      from public.purchase_order_items where purchase_order_id = v_id), 0)
   where id = v_id and status in ('draft', 'ordered');
  return null;
end $$;

create trigger purchase_items_subtotal
  after insert or update or delete on public.purchase_order_items
  for each row execute function app.refresh_purchase_subtotal();

revoke execute on function app.refresh_purchase_subtotal() from public;
