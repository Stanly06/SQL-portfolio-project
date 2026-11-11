-- =====================================================================
--  KARY FASHION · Reglas actuales de la tienda
--  * Sin RNC: no se cobra ITBIS ni se emiten NCF (se puede activar luego en Configuración).
--  * Hoy todo se vende al contado (100%): los encargos se pagan completos por adelantado.
--    La dueña puede bajar este porcentaje en Configuración cuando lo decida.
-- =====================================================================
update public.settings set value = jsonb_set(value, '{min_deposit_pct}', '100'), updated_at = now() where key = 'orders';
update public.settings set value = jsonb_set(value, '{charges_itbis}', 'false'), updated_at = now() where key = 'tax';

-- Validación de los valores que la dueña puede cambiar desde la aplicación
create or replace function app.validate_settings() returns trigger
language plpgsql set search_path = '' as $$
declare v numeric;
begin
  if new.key = 'orders' then
    v := (new.value ->> 'min_deposit_pct')::numeric;
    if v is null or v < 0 or v > 100 then raise exception 'El anticipo mínimo debe estar entre 0%% y 100%%.'; end if;
  elsif new.key = 'discounts' then
    v := (new.value ->> 'employee_max_pct')::numeric;
    if v is null or v < 0 or v > 100 then raise exception 'El descuento máximo debe estar entre 0%% y 100%%.'; end if;
  elsif new.key = 'tax' then
    v := (new.value ->> 'itbis_rate_pct')::numeric;
    if v is null or v < 0 or v > 30 then raise exception 'La tasa de ITBIS no es válida.'; end if;
  elsif new.key = 'business' then
    if coalesce(trim(new.value ->> 'name'), '') = '' then raise exception 'El nombre del negocio es obligatorio.'; end if;
  end if;
  new.updated_at := now();
  return new;
end $$;

create trigger settings_validate before update on public.settings
  for each row execute function app.validate_settings();

-- Lista del personal para la pantalla de usuarios (solo dueña y administradoras)
create view public.staff_directory with (security_barrier) as
select p.id, p.full_name, p.role, p.active, u.email::text as email, p.created_at
from public.profiles p join auth.users u on u.id = p.id
where app.is_admin();

revoke all on public.staff_directory from public, anon;
grant select on public.staff_directory to authenticated;
