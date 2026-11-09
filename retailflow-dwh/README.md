# RetailFlow DWH — Pipeline ELT + Data Warehouse + Analítica en SQL avanzado

Proyecto de portafolio de **Data Engineering / BI / Data Analysis** construido 100% en **PostgreSQL**.
Simula una tienda e-commerce latinoamericana y recorre todo el ciclo de vida del dato:

```
 Sistemas fuente          BRONZE (raw)          SILVER (staging)          GOLD (dw)                 Consumo
 ───────────────          ────────────          ────────────────          ─────────                 ───────
 CRM (clientes)    ──►    texto sucio,   ──►    limpio, tipado,   ──►    esquema estrella   ──►    analytics.*  (10 análisis)
 ERP (órdenes)            duplicados,           deduplicado              SCD Tipo 2                 mv_daily_sales (Power BI)
 Web (eventos JSON)       JSONB                 JSON aplanado            carga incremental          tests de calidad
                                                                         (watermark + MERGE)
```

## ¿Qué demuestra este proyecto? (lo que piden las vacantes)

| Habilidad que piden las ofertas | Dónde está |
|---|---|
| Window functions: `ROW_NUMBER`, `RANK`, `DENSE_RANK`, `NTILE`, `LAG/LEAD`, `FIRST_VALUE/LAST_VALUE`, `PERCENT_RANK`, frames `ROWS` vs `RANGE` | `analytics/a01`–`a10`, `02_staging.sql`, `03_dimensional_model.sql` |
| CTEs y CTEs recursivos (jerarquías) | `03_dimensional_model.sql`, `a09` |
| Deduplicación de datos | `02_staging.sql` |
| Modelado dimensional (Kimball): hechos, dimensiones, surrogate keys, grano | `03_dimensional_model.sql` |
| **SCD Tipo 2** (historial de cambios) + join "point-in-time" | `03`, `04_load_procedures.sql`, `a10` |
| Carga **incremental e idempotente** (watermark, `MERGE`, upsert) | `04_load_procedures.sql`, `05`, `06` |
| Stored procedures (PL/pgSQL), manejo de transacciones | `04_load_procedures.sql` |
| Data quality tests (unicidad, FK, reconciliación, frescura) | `07_data_quality.sql` |
| Optimización: `EXPLAIN ANALYZE`, índices (cubrientes, parciales), particionamiento, vistas materializadas | `08_performance.sql` |
| JSON / datos semi-estructurados | `01`, `02_staging.sql` |
| Gaps & Islands, sesionización | `a05` |
| Cohortes, retención, RFM, funnel, Pareto/ABC, LTV, churn | `a02`–`a06`, `a10` |
| `ROLLUP`, `CUBE`, `GROUPING SETS`, pivot | `a08` |
| Percentiles, mediana, outliers (z-score, IQR) | `a07` |

## Estructura

```
retailflow-dwh/
├── sql/
│   ├── 00_schemas.sql              # Esquemas raw/staging/dw/analytics/audit
│   ├── 01_raw_generate.sql         # Datos sintéticos reproducibles (con "suciedad" real)
│   ├── 02_staging.sql              # Limpieza + deduplicación (capa silver)
│   ├── 03_dimensional_model.sql    # Esquema estrella + SCD2 (capa gold)
│   ├── 04_load_procedures.sql      # Procedimientos de carga incremental (MERGE, watermark)
│   ├── 05_new_batch.sql            # Simula la llegada de un nuevo lote de datos
│   ├── 06_incremental_load.sql     # Ejecuta la carga incremental (idempotente)
│   ├── 07_data_quality.sql         # 10 tests de calidad de datos
│   ├── 08_performance.sql          # Planes de ejecución, índices, particiones, MV
│   └── analytics/
│       ├── a01_running_totals_moving_avg.sql
│       ├── a02_ranking_top_n.sql
│       ├── a03_cohort_retention.sql
│       ├── a04_rfm_segmentation.sql
│       ├── a05_gaps_and_islands.sql
│       ├── a06_funnel_conversion.sql
│       ├── a07_percentiles_outliers.sql
│       ├── a08_rollup_grouping_sets_pivot.sql
│       ├── a09_recursive_hierarchy.sql
│       └── a10_customer_ltv_churn.sql
├── docs/
│   ├── guia_entrevistas.md         # Conceptos explicados + preguntas de entrevista
│   ├── postgres_vs_sqlserver.md    # Equivalencias T-SQL <-> PostgreSQL
│   └── roadmap.md                  # Próximas fases del proyecto
├── run_all.sh / run_all.ps1        # Ejecuta todo el pipeline (Linux-Mac / Windows)
└── docker-compose.yml              # PostgreSQL 16 + pgAdmin en un comando
```

## Modelo de datos (capa gold)

```
                ┌──────────────┐
                │   dim_date   │
                └──────┬───────┘
┌──────────────┐       │        ┌──────────────┐    ┌──────────────┐
│ dim_customer │───────┼────────│ dim_product  │────│ dim_category │◄─┐ jerarquía
│   (SCD2)     │   ┌───┴────┐   └──────────────┘    └──────┬───────┘  │ (parent_id)
└──────────────┘───│fact_sales│                             └─────────┘
                   └────────┘
            grano: 1 fila por línea de orden
```

## Cómo ejecutarlo

### Opción A — Windows con instalador (recomendada para empezar)
1. Instala PostgreSQL 16 desde <https://www.postgresql.org/download/windows/> (incluye pgAdmin y `psql`).
2. Crea la base de datos: en pgAdmin → *Databases* → *Create* → `retailflow`.
3. En PowerShell, dentro de la carpeta `retailflow-dwh`:
   ```powershell
   $env:PGPASSWORD = "tu_clave"
   .\run_all.ps1 -Db retailflow -User postgres
   ```
   O abre cada archivo `.sql` en pgAdmin / DBeaver y ejecútalos **en orden numérico**.

### Opción B — Docker
```bash
docker compose up -d
docker exec -it retailflow-db bash -c "cd /project && PGUSER=analyst ./run_all.sh retailflow"
```
Luego explora en pgAdmin (<http://localhost:8080>) o DBeaver conectando a `localhost:5432` (analyst / analyst).

### Opción C — Linux / Mac con psql
```bash
createdb retailflow
./run_all.sh retailflow
```

Salida esperada al final:
```
 test_name                                | failures | status
------------------------------------------+----------+-------
 unique: staging.orders.order_id          |        0 | PASS
 scd2: una versión vigente por cliente    |        0 | PASS
 reconciliación: net_amount staging = dw  |        0 | PASS
 ...
Pipeline completado OK.
```

## Volumen de datos
~2,000 clientes (con ~330 versiones históricas SCD2), 200 productos, 26,000 órdenes, ~63,500 líneas de venta y
~64,000 eventos web en 20,000 sesiones. Los datos son sintéticos pero **reproducibles** (`setseed`) y con
patrones de negocio reales: productos estrella (Pareto), crecimiento, pico de Black Friday, abandono de
carrito mayor en mobile, duplicados de ingesta y datos sucios.

## Hallazgos de ejemplo (lo que contarías en una entrevista)
- **Estacionalidad:** noviembre casi duplica las ventas de octubre (Black Friday) → `a01`.
- **Pareto:** ~40% de los productos genera el 80% de los ingresos → `a02`.
- **Funnel:** mobile pierde mucho más en el paso carrito → checkout (≈45% vs ≈60% en desktop) → `a06`.
- **SCD2:** permite atribuir cada venta a la ciudad donde vivía el cliente *cuando compró* → `a10`.
- **Bug atrapado por los tests:** usar `now()` como `_ingested_at` en datos de prueba movía el watermark al
  futuro y el siguiente lote se saltaba; el test de completitud lo detectó → ver `docs/guia_entrevistas.md`.

## Cómo estudiar con este proyecto
1. Ejecuta todo una vez y explora las tablas de cada capa.
2. Lee cada archivo: **cada consulta empieza con la pregunta de negocio** y explica la técnica.
3. Antes de mirar la solución de cada análisis, intenta escribirla tú.
4. Usa `docs/guia_entrevistas.md` para practicar explicándolo en voz alta.
5. Sigue el `docs/roadmap.md` para ampliar el proyecto (dbt, Airflow, Power BI).
