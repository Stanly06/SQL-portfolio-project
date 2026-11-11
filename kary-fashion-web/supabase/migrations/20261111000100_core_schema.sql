-- =====================================================================
--  KARY FASHION · Fase 2 · 1/4  Esquema principal (PostgreSQL / Supabase)
--
--  Convenciones
--    * Montos en CENTAVOS de peso dominicano (bigint, sufijo _cents).
--    * Fechas con zona horaria (timestamptz). Días de negocio en America/Santo_Domingo.
--    * Ventas, pagos e inventario NO se borran: se anulan / revierten con trazabilidad.
--    * Escrituras de dinero e inventario solo mediante funciones atómicas (archivo 3/4).
-- =====================================================================

create extension if not exists pgcrypto;
create extension if not exists citext;

create schema if not exists app;   -- funciones internas (no expuestas por la API)

-- ---------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------
create type public.product_status   as enum ('draft', 'active', 'archived');
create type public.movement_type    as enum ('initial', 'purchase', 'sale', 'return', 'adjustment', 'sale_cancellation', 'purchase_reversal');
create type public.payment_method   as enum ('cash', 'transfer', 'card', 'gateway');
create type public.payment_status   as enum ('pending', 'confirmed', 'refunded', 'rejected');
create type public.order_status     as enum ('new', 'pending_payment', 'confirmed', 'preparing', 'shipped', 'delivered', 'cancelled', 'returned');
create type public.order_channel    as enum ('store', 'online', 'whatsapp', 'instagram', 'tiktok');
create type public.sale_status      as enum ('completed', 'cancelled');
create type public.purchase_status  as enum ('draft', 'ordered', 'received', 'cancelled');
create type public.settlement       as enum ('unpaid', 'partial', 'paid');
create type public.invoice_kind     as enum ('commercial', 'B01', 'B02', 'E31', 'E32');
create type public.ncf_status       as enum ('not_applicable', 'pending_authorization', 'authorized', 'rejected');
create type public.expense_category as enum ('advertising', 'transport', 'packaging', 'rent', 'internet', 'utilities',
                                             'commissions', 'salaries', 'bank_fees', 'taxes', 'other');

-- ---------------------------------------------------------------------
-- Usuarios y roles
--   auth.users lo administra Supabase (correo, contraseña, 2FA).
--   profiles agrega el rol dentro de la tienda.
-- ---------------------------------------------------------------------
create table public.roles (
  code        text primary key,
  name        text not null,
  description text not null,
  is_staff    boolean not null
);

insert into public.roles (code, name, description, is_staff) values
  ('owner',    'Dueña',          'Acceso total, incluida la gestión de usuarios y configuración.', true),
  ('admin',    'Administradora', 'Acceso total a operaciones, costos, ganancias y reportes.',       true),
  ('employee', 'Empleada',       'Vende, atiende pedidos y clientes. No ve costos ni ganancias.',   true),
  ('customer', 'Clienta',        'Compra en la tienda online y ve solo sus propios pedidos.',       false);

create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text not null,
  role        text not null default 'customer' references public.roles (code),
  active      boolean not null default true,
  phone       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

insert into public.settings (key, value) values
  ('business', '{"name":"Kary Fashion","address":"Calle Duarte, Guatapanal, Valverde, Mao, República Dominicana","phone":"809-502-9189","instagram":"@kary_fashion26","tiktok":"@karyfashion26","rnc":null}'),
  ('tax', '{"charges_itbis":false,"itbis_rate_pct":18,"prices_include_itbis":true}'),
  ('orders', '{"min_deposit_pct":50}'),
  ('discounts', '{"employee_max_pct":10}'),
  ('inventory', '{"allow_negative_stock":false,"default_min_stock":2}');

-- ---------------------------------------------------------------------
-- Catálogo
-- ---------------------------------------------------------------------
create table public.categories (
  id         bigint generated always as identity primary key,
  name       citext not null unique,
  slug       text   not null unique check (slug ~ '^[a-z0-9-]+$'),
  parent_id  bigint references public.categories (id),
  sort_order int not null default 0
);

create table public.suppliers (
  id          bigint generated always as identity primary key,
  name        text not null,
  contact     text,
  phone       text,
  whatsapp    text,
  email       citext,
  rnc         text,
  address     text,
  notes       text,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create table public.products (
  id           bigint generated always as identity primary key,
  sku_base     citext not null unique,
  name         text not null,
  description  text,
  category_id  bigint not null references public.categories (id),
  brand        text,
  supplier_id  bigint references public.suppliers (id),
  image_url    text,
  status       public.product_status not null default 'draft',
  published    boolean not null default false,   -- visible en la tienda online
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz,                       -- eliminación lógica
  check (not published or status = 'active')
);
create index products_category_idx on public.products (category_id) where deleted_at is null;
create index products_name_idx on public.products using gin (to_tsvector('spanish', name));

-- Cada combinación talla/color es una variante con su propio SKU y existencia.
create table public.product_variants (
  id                bigint generated always as identity primary key,
  product_id        bigint not null references public.products (id),
  sku               citext not null unique,
  size              text,
  color             text,
  barcode           text unique,
  price_cents       bigint not null check (price_cents >= 0),          -- precio de venta (con ITBIS)
  compare_at_cents  bigint check (compare_at_cents is null or compare_at_cents >= price_cents), -- precio "antes" para ofertas
  stock             int    not null default 0,
  min_stock         int    not null default 2 check (min_stock >= 0),
  image_url         text,
  active            boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz,
  unique nulls not distinct (product_id, size, color)
);
create index variants_product_idx on public.product_variants (product_id);
create index variants_low_stock_idx on public.product_variants (stock) where active and deleted_at is null;

-- Costos separados del catálogo: solo administración puede leerlos (RLS).
create table public.variant_costs (
  variant_id          bigint primary key references public.product_variants (id),
  avg_cost_cents      bigint not null default 0 check (avg_cost_cents >= 0),  -- costo promedio ponderado
  last_cost_cents     bigint,
  extra_cost_cents    bigint not null default 0 check (extra_cost_cents >= 0), -- costo adicional fijo por unidad (etiquetas, empaque)
  updated_at          timestamptz not null default now()
);

-- Kardex: única forma de cambiar la existencia (ver trigger en 3/4).
create table public.inventory_movements (
  id              bigint generated always as identity primary key,
  variant_id      bigint not null references public.product_variants (id),
  type            public.movement_type not null,
  quantity        int    not null check (quantity <> 0),        -- + entra / - sale
  stock_after     int    not null,
  unit_cost_cents bigint,
  ref_table       text,
  ref_id          bigint,
  note            text,
  created_by      uuid references auth.users (id),
  created_at      timestamptz not null default now()
);
create index movements_variant_idx on public.inventory_movements (variant_id, created_at desc);
create index movements_ref_idx on public.inventory_movements (ref_table, ref_id);

-- ---------------------------------------------------------------------
-- Clientes
-- ---------------------------------------------------------------------
create table public.customers (
  id            bigint generated always as identity primary key,
  auth_user_id  uuid unique references auth.users (id),   -- si tiene cuenta en la tienda online
  full_name     text not null,
  phone         text,
  whatsapp      text,
  email         citext,
  document_id   text,                                     -- cédula o RNC (para crédito fiscal)
  address       text,
  province      text,
  municipality  text,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index customers_name_idx on public.customers using gin (to_tsvector('simple', full_name));
create index customers_phone_idx on public.customers (phone);

-- ---------------------------------------------------------------------
-- Compras a proveedores
-- ---------------------------------------------------------------------
create table public.purchase_orders (
  id                bigint generated always as identity primary key,
  number            text   not null unique,
  supplier_id       bigint references public.suppliers (id),
  status            public.purchase_status not null default 'draft',
  order_date        date   not null default (now() at time zone 'America/Santo_Domingo')::date,
  received_at       timestamptz,
  supplier_invoice  text,
  shipping_cents    bigint not null default 0 check (shipping_cents >= 0),
  other_costs_cents bigint not null default 0 check (other_costs_cents >= 0),
  subtotal_cents    bigint not null default 0 check (subtotal_cents >= 0),
  total_cents       bigint generated always as (subtotal_cents + shipping_cents + other_costs_cents) stored,
  payment_status    public.settlement not null default 'unpaid',
  notes             text,
  created_by        uuid references auth.users (id),
  created_at        timestamptz not null default now(),
  check ((status = 'received') = (received_at is not null))
);
create index purchase_orders_supplier_idx on public.purchase_orders (supplier_id, order_date desc);

create table public.purchase_order_items (
  id                     bigint generated always as identity primary key,
  purchase_order_id      bigint not null references public.purchase_orders (id) on delete cascade,
  variant_id             bigint not null references public.product_variants (id),
  quantity               int    not null check (quantity > 0),
  unit_cost_cents        bigint not null check (unit_cost_cents >= 0),
  landed_unit_cost_cents bigint,          -- costo + transporte y otros prorrateados (al recibir)
  unique (purchase_order_id, variant_id)
);

-- ---------------------------------------------------------------------
-- Pedidos (intención de compra: online, WhatsApp, encargos)
--   Un pedido se convierte en UNA venta cuando se completa (sales.order_id es único):
--   así el ingreso se registra una sola vez.
-- ---------------------------------------------------------------------
create table public.orders (
  id               bigint generated always as identity primary key,
  number           text   not null unique,
  customer_id      bigint not null references public.customers (id),
  channel          public.order_channel not null default 'online',
  status           public.order_status not null default 'new',
  is_special_order boolean not null default false,  -- encargo: requiere anticipo mínimo
  subtotal_cents   bigint not null default 0 check (subtotal_cents >= 0),
  discount_cents   bigint not null default 0 check (discount_cents >= 0),
  shipping_cents   bigint not null default 0 check (shipping_cents >= 0),
  total_cents      bigint generated always as (subtotal_cents - discount_cents + shipping_cents) stored,
  shipping_address text,
  province         text,
  municipality     text,
  expected_date    date,
  notes            text,
  created_by       uuid references auth.users (id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (discount_cents <= subtotal_cents)
);
create index orders_status_idx on public.orders (status, created_at desc);
create index orders_customer_idx on public.orders (customer_id);

create table public.order_items (
  id               bigint generated always as identity primary key,
  order_id         bigint not null references public.orders (id) on delete cascade,
  variant_id       bigint references public.product_variants (id),  -- null: artículo por encargo sin ficha
  description      text   not null,
  quantity         int    not null check (quantity > 0),
  unit_price_cents bigint not null check (unit_price_cents >= 0),
  unit_cost_cents  bigint not null default 0                         -- costo estimado (encargos)
);

create table public.order_status_history (
  id          bigint generated always as identity primary key,
  order_id    bigint not null references public.orders (id) on delete cascade,
  from_status public.order_status,
  to_status   public.order_status not null,
  note        text,
  changed_by  uuid references auth.users (id),
  changed_at  timestamptz not null default now()
);

-- Transiciones permitidas (el cambio de estado se valida contra esta tabla).
create table public.order_status_transitions (
  from_status public.order_status not null,
  to_status   public.order_status not null,
  primary key (from_status, to_status)
);
insert into public.order_status_transitions values
  ('new', 'pending_payment'), ('new', 'confirmed'), ('new', 'cancelled'),
  ('pending_payment', 'confirmed'), ('pending_payment', 'cancelled'),
  ('confirmed', 'preparing'), ('confirmed', 'cancelled'),
  ('preparing', 'shipped'), ('preparing', 'delivered'), ('preparing', 'cancelled'),
  ('shipped', 'delivered'), ('shipped', 'returned'),
  ('delivered', 'returned');

-- ---------------------------------------------------------------------
-- Ventas (registro financiero definitivo)
-- ---------------------------------------------------------------------
create table public.sales (
  id                bigint generated always as identity primary key,
  number            bigint not null unique,
  sale_date         timestamptz not null default now(),
  customer_id       bigint references public.customers (id),
  order_id          bigint unique references public.orders (id),
  channel           public.order_channel not null default 'store',
  status            public.sale_status not null default 'completed',
  subtotal_cents    bigint not null check (subtotal_cents >= 0),   -- suma precio x cantidad (con ITBIS)
  discount_cents    bigint not null default 0 check (discount_cents >= 0),
  shipping_cents    bigint not null default 0 check (shipping_cents >= 0),
  total_cents       bigint not null,
  tax_cents         bigint not null default 0,                     -- ITBIS incluido en el total
  cash_received_cents bigint not null default 0,
  change_cents      bigint not null default 0,
  sold_by           uuid not null references auth.users (id),
  notes             text,
  cancelled_at      timestamptz,
  cancelled_by      uuid references auth.users (id),
  cancel_reason     text,
  created_at        timestamptz not null default now(),
  check (total_cents = subtotal_cents - discount_cents + shipping_cents),
  check (discount_cents <= subtotal_cents),
  check ((status = 'cancelled') = (cancelled_at is not null))
);
create index sales_date_idx on public.sales (sale_date desc);
create index sales_customer_idx on public.sales (customer_id);

create table public.sale_items (
  id               bigint generated always as identity primary key,
  sale_id          bigint not null references public.sales (id),
  variant_id       bigint references public.product_variants (id),
  sku              text,
  description      text   not null,
  quantity         int    not null check (quantity > 0),
  unit_price_cents bigint not null check (unit_price_cents >= 0),
  discount_cents   bigint not null default 0 check (discount_cents >= 0),  -- incluye la parte del descuento general
  line_total_cents bigint not null,
  unit_cost_cents  bigint not null default 0,                               -- costo al momento de vender
  check (line_total_cents = quantity * unit_price_cents - discount_cents),
  check (line_total_cents >= 0)
);
create index sale_items_sale_idx on public.sale_items (sale_id);
create index sale_items_variant_idx on public.sale_items (variant_id);

-- Pagos: pertenecen a un pedido (anticipos) o a una venta. Varios registros = pago combinado.
create table public.payments (
  id           bigint generated always as identity primary key,
  sale_id      bigint references public.sales (id),
  order_id     bigint references public.orders (id),
  method       public.payment_method not null,
  status       public.payment_status not null default 'confirmed',
  amount_cents bigint not null check (amount_cents > 0),
  reference    text,
  received_at  timestamptz not null default now(),
  received_by  uuid references auth.users (id),
  created_at   timestamptz not null default now(),
  check (num_nonnulls(sale_id, order_id) >= 1)
);
create index payments_sale_idx on public.payments (sale_id);
create index payments_order_idx on public.payments (order_id);
create index payments_date_idx on public.payments (received_at);

-- Devoluciones y reembolsos
create table public.returns (
  id            bigint generated always as identity primary key,
  sale_id       bigint not null references public.sales (id),
  reason        text   not null,
  refund_cents  bigint not null default 0 check (refund_cents >= 0),
  refund_method public.payment_method,
  created_by    uuid references auth.users (id),
  created_at    timestamptz not null default now(),
  check (refund_cents = 0 or refund_method is not null)
);

create table public.return_items (
  id            bigint generated always as identity primary key,
  return_id     bigint not null references public.returns (id) on delete cascade,
  sale_item_id  bigint not null references public.sale_items (id),
  quantity      int    not null check (quantity > 0),
  amount_cents  bigint not null check (amount_cents >= 0),   -- valor devuelto de la línea
  restock       boolean not null default true
);

-- ---------------------------------------------------------------------
-- Facturación
--   Factura comercial: siempre disponible.
--   Comprobante fiscal (NCF / e-CF): solo con secuencias autorizadas por la DGII.
--   El sistema NUNCA marca un e-CF como autorizado por su cuenta.
-- ---------------------------------------------------------------------
create table public.fiscal_sequences (
  kind         public.invoice_kind primary key check (kind <> 'commercial'),
  description  text   not null,
  next_number  bigint not null default 1 check (next_number > 0),
  last_number  bigint not null default 0,     -- último número autorizado por la DGII
  expires_on   date,
  active       boolean not null default false
);
insert into public.fiscal_sequences (kind, description) values
  ('B02', 'Factura de Consumo'), ('B01', 'Factura de Crédito Fiscal'),
  ('E32', 'Factura de Consumo Electrónica'), ('E31', 'Factura de Crédito Fiscal Electrónica');

create table public.invoices (
  id          bigint generated always as identity primary key,
  sale_id     bigint not null unique references public.sales (id),
  number      text   not null unique,                 -- consecutivo interno FAC-000001
  kind        public.invoice_kind not null default 'commercial',
  ncf         text unique,
  ncf_status  public.ncf_status not null default 'not_applicable',
  issued_at   timestamptz not null default now(),
  pdf_path    text,
  check ((kind = 'commercial') = (ncf is null)),
  check ((kind = 'commercial') = (ncf_status = 'not_applicable'))
);

-- ---------------------------------------------------------------------
-- Gastos operativos
-- ---------------------------------------------------------------------
create table public.expenses (
  id             bigint generated always as identity primary key,
  expense_date   date   not null default (now() at time zone 'America/Santo_Domingo')::date,
  category       public.expense_category not null,
  concept        text   not null,
  amount_cents   bigint not null check (amount_cents > 0),
  payment_method public.payment_method not null default 'cash',
  is_financial   boolean not null default false,   -- intereses/comisiones bancarias: van a gastos financieros
  receipt_path   text,                              -- comprobante en Storage
  notes          text,
  created_by     uuid references auth.users (id),
  created_at     timestamptz not null default now()
);
create index expenses_date_idx on public.expenses (expense_date);

-- ---------------------------------------------------------------------
-- Auditoría
-- ---------------------------------------------------------------------
create table public.audit_logs (
  id          bigint generated always as identity primary key,
  table_name  text not null,
  record_id   text,
  action      text not null,          -- INSERT / UPDATE / DELETE / o acción de negocio
  old_data    jsonb,
  new_data    jsonb,
  actor_id    uuid,
  created_at  timestamptz not null default now()
);
create index audit_logs_table_idx on public.audit_logs (table_name, record_id);
create index audit_logs_date_idx on public.audit_logs (created_at desc);

-- Consecutivos (factura, pedido, compra) sin huecos por transacción fallida
create table app.counters (
  name  text primary key,
  value bigint not null
);
insert into app.counters values ('sale', 0), ('invoice', 0), ('order', 1000), ('purchase', 0);
