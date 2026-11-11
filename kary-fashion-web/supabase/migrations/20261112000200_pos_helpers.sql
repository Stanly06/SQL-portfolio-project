-- =====================================================================
--  KARY FASHION · Ayudas para el punto de venta
--  Las empleadas pueden emitir los comprobantes habilitados, pero no ven ni
--  cambian las secuencias autorizadas (eso sigue siendo solo de administración).
-- =====================================================================
create view public.active_invoice_kinds with (security_barrier) as
select kind::text, description
from public.fiscal_sequences
where active and next_number <= last_number
  and (expires_on is null or expires_on >= app.biz_date(now()))
  and app.is_staff();

revoke all on public.active_invoice_kinds from public, anon;
grant select on public.active_invoice_kinds to authenticated;
