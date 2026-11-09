-- =====================================================================
-- 03_dimensional_model.sql  (capa GOLD - DDL)
-- Esquema estrella (Kimball):
--          dim_date      dim_product -- dim_category (jerarquía)
--               \           /
--               fact_sales  (grano: 1 fila por línea de orden)
--               /
--          dim_customer  (SCD Tipo 2: guarda el historial de cambios)
-- Conceptos: surrogate keys, natural keys, grano, SCD2, constraints,
--            índices parciales, columnas generadas.
-- =====================================================================
SET client_min_messages = warning;
DROP TABLE IF EXISTS dw.fact_sales, dw.dim_customer, dw.dim_product, dw.dim_category, dw.dim_date CASCADE;

-- ---------------------------- dim_date --------------------------------
CREATE TABLE dw.dim_date (
    date_key       INT PRIMARY KEY,             -- 20240131 (smart key)
    full_date      DATE NOT NULL UNIQUE,
    year           SMALLINT NOT NULL,
    quarter        SMALLINT NOT NULL,
    month          SMALLINT NOT NULL,
    month_name     TEXT NOT NULL,
    year_month     TEXT NOT NULL,               -- '2024-01'
    week_of_year   SMALLINT NOT NULL,
    day_of_week    SMALLINT NOT NULL,           -- 1=lunes ... 7=domingo (ISO)
    day_name       TEXT NOT NULL,
    is_weekend     BOOLEAN NOT NULL,
    first_day_of_month DATE NOT NULL
);

INSERT INTO dw.dim_date
SELECT to_char(d, 'YYYYMMDD')::int,
       d,
       EXTRACT(YEAR FROM d),
       EXTRACT(QUARTER FROM d),
       EXTRACT(MONTH FROM d),
       (ARRAY['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto',
              'Septiembre','Octubre','Noviembre','Diciembre'])[EXTRACT(MONTH FROM d)],
       to_char(d, 'YYYY-MM'),
       EXTRACT(WEEK FROM d),
       EXTRACT(ISODOW FROM d),
       (ARRAY['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'])[EXTRACT(ISODOW FROM d)],
       EXTRACT(ISODOW FROM d) IN (6, 7),
       date_trunc('month', d)::date
FROM generate_series(DATE '2022-01-01', DATE '2026-12-31', INTERVAL '1 day') AS g(d);

-- -------------------------- dim_category ------------------------------
-- La jerarquía se "aplana" con un CTE RECURSIVO: cada categoría conoce su
-- ruta completa y su nivel.
CREATE TABLE dw.dim_category (
    category_id        INT PRIMARY KEY,
    category_name      TEXT NOT NULL,
    parent_category_id INT REFERENCES dw.dim_category(category_id),
    level              INT  NOT NULL,
    category_path      TEXT NOT NULL,      -- 'Todos los productos > Electrónica > Celulares'
    top_level_category TEXT                -- categoría de nivel 2 (Electrónica, Hogar, Moda)
);

INSERT INTO dw.dim_category
WITH RECURSIVE tree AS (
    -- ancla: la raíz
    SELECT category_id, category_name, parent_category_id,
           1 AS level,
           category_name::text AS category_path,
           NULL::text AS top_level_category
    FROM staging.categories
    WHERE parent_category_id IS NULL
    UNION ALL
    -- parte recursiva: hijos de lo que ya tenemos
    SELECT c.category_id, c.category_name, c.parent_category_id,
           t.level + 1,
           t.category_path || ' > ' || c.category_name,
           COALESCE(t.top_level_category, c.category_name)
    FROM staging.categories c
    JOIN tree t ON c.parent_category_id = t.category_id
)
SELECT * FROM tree ORDER BY level;

-- --------------------------- dim_product ------------------------------
CREATE TABLE dw.dim_product (
    product_sk    INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,   -- surrogate key
    product_id    TEXT NOT NULL UNIQUE,                           -- natural key
    product_name  TEXT NOT NULL,
    category_id   INT  NOT NULL REFERENCES dw.dim_category(category_id),
    list_price    NUMERIC(12,2) NOT NULL CHECK (list_price >= 0),
    unit_cost     NUMERIC(12,2) NOT NULL CHECK (unit_cost >= 0),
    margin_pct    NUMERIC(6,4) GENERATED ALWAYS AS ((list_price - unit_cost) / NULLIF(list_price, 0)) STORED,
    is_active     BOOLEAN NOT NULL
);

INSERT INTO dw.dim_product (product_id, product_name, category_id, list_price, unit_cost, is_active)
SELECT product_id, product_name, category_id, list_price, unit_cost, is_active
FROM staging.products;

-- -------------------------- dim_customer (SCD2) -----------------------
CREATE TABLE dw.dim_customer (
    customer_sk  INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    customer_id  TEXT NOT NULL,
    full_name    TEXT NOT NULL,
    email        TEXT,
    city         TEXT,
    country      TEXT,
    segment      TEXT,
    signup_date  DATE,
    valid_from   TIMESTAMP NOT NULL,
    valid_to     TIMESTAMP NOT NULL DEFAULT '9999-12-31',
    is_current   BOOLEAN   NOT NULL DEFAULT TRUE,
    row_hash     TEXT      NOT NULL,           -- md5 de los atributos que versionamos
    CHECK (valid_from < valid_to)
);
-- Solo puede existir UNA versión vigente por cliente -> índice único PARCIAL
CREATE UNIQUE INDEX ux_dim_customer_current ON dw.dim_customer (customer_id) WHERE is_current;
CREATE INDEX ix_dim_customer_lookup ON dw.dim_customer (customer_id, valid_from, valid_to);

-- Carga inicial del historial:
--  1) LAG() detecta si una versión realmente cambió algo respecto a la anterior
--     (el CRM a veces manda "cambios" que no cambian nada).
--  2) LEAD() calcula hasta cuándo es válida cada versión.
INSERT INTO dw.dim_customer (customer_id, full_name, email, city, country, segment, signup_date,
                             valid_from, valid_to, is_current, row_hash)
WITH hashed AS (
    SELECT *,
           md5(concat_ws('|', city, country, segment)) AS row_hash
    FROM staging.customers_history
),
changes_only AS (
    SELECT *
    FROM (
        SELECT *,
               LAG(row_hash) OVER (PARTITION BY customer_id ORDER BY valid_from) AS prev_hash
        FROM hashed
    ) x
    WHERE prev_hash IS DISTINCT FROM row_hash          -- primera versión (prev NULL) o cambio real
),
versioned AS (
    SELECT *,
           ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY valid_from) AS version_no,
           LEAD(valid_from) OVER (PARTITION BY customer_id ORDER BY valid_from) AS next_from
    FROM changes_only
)
SELECT customer_id, full_name, email, city, country, segment, signup_date,
       -- la 1a versión se extiende al pasado para que ninguna orden quede huérfana
       CASE WHEN version_no = 1 THEN TIMESTAMP '1900-01-01' ELSE valid_from END,
       COALESCE(next_from, TIMESTAMP '9999-12-31'),
       next_from IS NULL,
       row_hash
FROM versioned;

-- ---------------------------- fact_sales ------------------------------
CREATE TABLE dw.fact_sales (
    order_id      TEXT     NOT NULL,
    line_no       INT      NOT NULL,
    date_key      INT      NOT NULL REFERENCES dw.dim_date(date_key),
    customer_sk   INT      NOT NULL REFERENCES dw.dim_customer(customer_sk),
    product_sk    INT      NOT NULL REFERENCES dw.dim_product(product_sk),
    order_ts      TIMESTAMP NOT NULL,
    channel       TEXT     NOT NULL,
    order_status  TEXT     NOT NULL,
    quantity      INT      NOT NULL CHECK (quantity > 0),
    unit_price    NUMERIC(12,2) NOT NULL,
    discount_pct  NUMERIC(5,2)  NOT NULL,
    net_amount    NUMERIC(14,2) NOT NULL,
    cost_amount   NUMERIC(14,2) NOT NULL,
    gross_profit  NUMERIC(14,2) GENERATED ALWAYS AS (net_amount - cost_amount) STORED,
    is_revenue    BOOLEAN GENERATED ALWAYS AS (order_status IN ('delivered', 'shipped')) STORED,
    loaded_at     TIMESTAMP NOT NULL DEFAULT now(),
    PRIMARY KEY (order_id, line_no)
);
CREATE INDEX ix_fact_sales_date     ON dw.fact_sales (date_key);
CREATE INDEX ix_fact_sales_customer ON dw.fact_sales (customer_sk);
CREATE INDEX ix_fact_sales_product  ON dw.fact_sales (product_sk);
