# Conceptos técnicos aplicados — RetailFlow DWH

Explicación de las técnicas usadas en el proyecto y del archivo donde se aplica cada una.

---

## 1. Window functions (funciones de ventana)

**Qué son:** calculan un valor usando un *conjunto de filas relacionadas* con la fila actual, **sin colapsar
las filas** (a diferencia de `GROUP BY`).

```sql
funcion() OVER (
    PARTITION BY ...   -- "grupos" independientes (opcional)
    ORDER BY ...       -- orden dentro de cada grupo
    ROWS BETWEEN ...   -- el "frame": qué filas ve la función (opcional)
)
```

| Familia | Funciones | Uso típico | Archivo |
|---|---|---|---|
| Ranking | `ROW_NUMBER`, `RANK`, `DENSE_RANK`, `NTILE`, `PERCENT_RANK` | Top-N por grupo, deduplicar, segmentar en cuantiles | `a02`, `a04`, `02_staging` |
| Navegación | `LAG`, `LEAD`, `FIRST_VALUE`, `LAST_VALUE` | MoM/YoY, tiempo entre eventos, detectar cambios | `a01`, `a10`, `03` |
| Agregados | `SUM/AVG/COUNT/MIN/MAX OVER` | Running totals, medias móviles, % del total | `a01`, `a02`, `a03` |

**Orden lógico de ejecución de un SELECT:**
`FROM → JOIN → WHERE → GROUP BY → HAVING → WINDOW FUNCTIONS → SELECT → DISTINCT → ORDER BY → LIMIT`.
Por eso **no puedes filtrar una window function en el `WHERE`**: se usa un CTE/subconsulta (ver `a02`) o
`QUALIFY` en Snowflake/BigQuery/Databricks.

**ROWS vs RANGE** (`a10`): `ROWS` cuenta filas físicas; `RANGE` agrupa las filas con el mismo valor del
`ORDER BY` (empates). El frame por defecto con `ORDER BY` es `RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW`,
por eso `LAST_VALUE` "no funciona" si no defines el frame completo.

---

## 2. Deduplicación (`02_staging.sql`)
```sql
ROW_NUMBER() OVER (PARTITION BY order_id ORDER BY _ingested_at DESC) AS rn  ... WHERE rn = 1
```
*"Particiono por la llave de negocio, ordeno por la columna que define cuál es la versión buena (la más
reciente) y me quedo con la primera."* Alternativas: `DISTINCT ON` (PostgreSQL), `QUALIFY` (Snowflake).

---

## 3. Modelado dimensional (`03_dimensional_model.sql`)
- **Hecho (fact):** eventos medibles (ventas). **Dimensión:** contexto (quién, qué, cuándo).
- **Grano:** *"una fila por línea de orden"*. Es lo primero que debes definir.
- **Surrogate key** (`customer_sk`): llave técnica autoincremental. Necesaria para SCD2 porque el mismo
  `customer_id` (natural key) tiene varias versiones.
- **Esquema estrella vs copo de nieve:** la estrella desnormaliza las dimensiones → menos joins, mejor para BI.
  Aquí `dim_category` se aplanó con su ruta completa (`category_path`).

## 4. SCD (Slowly Changing Dimensions)
| Tipo | Qué hace | Ejemplo |
|---|---|---|
| 0 | Nunca cambia | fecha de registro |
| 1 | Sobrescribe (pierde historia) | corregir un typo en el nombre |
| **2** | Nueva fila por cada cambio, con `valid_from / valid_to / is_current` | cliente que se muda de ciudad |
| 3 | Columna "valor anterior" | `previous_segment` |

Implementación (`04_load_procedures.sql`): (1) se calcula un `md5` de los atributos versionados; (2) si cambió,
se **expira** la versión vigente (`valid_to`, `is_current = false`); (3) se **inserta** la nueva versión.
La tabla de hechos se une con un **join point-in-time**:
`o.order_ts >= c.valid_from AND o.order_ts < c.valid_to`.
Un **índice único parcial** (`WHERE is_current`) garantiza una sola versión vigente por cliente.

## 5. Cargas incrementales e idempotencia (`04`, `05`, `06`)
- **Full load:** recargar todo. Simple pero caro.
- **Incremental:** solo lo nuevo/cambiado desde el último **watermark** (`audit.etl_watermark`).
- **Idempotente:** ejecutarlo 2 veces da el mismo resultado → no duplica. Se logra con `MERGE` / `INSERT ... ON CONFLICT`.
- `MERGE` (PostgreSQL 15+, SQL Server, Snowflake): `WHEN MATCHED THEN UPDATE` / `WHEN NOT MATCHED THEN INSERT`.

**Incidente real durante el desarrollo:** al generar duplicados de prueba con
`now() + 1 minute` como hora de ingesta, el watermark quedó en el futuro y el siguiente lote (ingerido
segundos después) se ignoró. El test de **completitud** de `07_data_quality.sql` lo detectó (1,000 filas
faltantes). Solución: timestamps de ingesta deterministas. Lección: *el watermark debe venir de un reloj
confiable y monotónico, y siempre hay que reconciliar conteos entre capas.*

## 6. Calidad de datos (`07_data_quality.sql`)
Unicidad, integridad referencial, valores aceptados, reglas de negocio, reconciliación entre capas,
frescura. Es exactamente lo que hacen los *tests* de **dbt** (`unique`, `not_null`, `relationships`,
`accepted_values`).

## 7. Rendimiento (`08_performance.sql`)
- `EXPLAIN ANALYZE`: Seq Scan vs Index Scan, Hash Join vs Nested Loop, filas estimadas vs reales.
- **Sargable:** no envuelvas la columna indexada en funciones (`date_trunc(col)`) → usa rangos.
- **Índice cubriente** (`INCLUDE`) → *Index Only Scan*. **Índice parcial** → solo filas relevantes.
- **Particionamiento** por fecha → *partition pruning*.
- **Vista materializada** + `REFRESH ... CONCURRENTLY` → agregados rápidos para dashboards.

## 8. Patrones analíticos
| Patrón | Truco clave | Archivo |
|---|---|---|
| Running total / media móvil | `SUM/AVG OVER (ORDER BY ... ROWS BETWEEN n PRECEDING AND CURRENT ROW)` | `a01` |
| MoM / YoY | `LAG(x)` y `LAG(x, 12)` | `a01` |
| Top-N por grupo | `DENSE_RANK() OVER (PARTITION BY grupo ...)` + filtro en CTE | `a02` |
| Pareto / ABC | suma acumulada / total | `a02` |
| Cohortes | `MIN(fecha) OVER (PARTITION BY cliente)` | `a03` |
| RFM | `NTILE(5)` sobre 3 métricas | `a04` |
| Gaps & Islands | `valor - ROW_NUMBER()` es constante dentro de una racha | `a05` |
| Sesionización | `LAG` → flag de nueva sesión → `SUM(flag) OVER` acumulado | `a05`, `a06` |
| Funnel | `bool_or` + `COUNT(*) FILTER (WHERE ...)` | `a06` |
| Mediana / outliers | `PERCENTILE_CONT(0.5) WITHIN GROUP`, z-score, IQR | `a07` |
| Subtotales | `ROLLUP`, `CUBE`, `GROUPING SETS`, `GROUPING()` | `a08` |
| Jerarquías | `WITH RECURSIVE` | `a09` |

---

## 9. Mediana sin funciones de percentil
```sql
WITH v AS (
  SELECT order_value,
         ROW_NUMBER() OVER (ORDER BY order_value) AS rn,
         COUNT(*)     OVER ()                     AS n
  FROM (SELECT order_id, sum(net_amount) AS order_value FROM dw.fact_sales GROUP BY order_id) t
)
SELECT avg(order_value) AS median
FROM v
WHERE rn IN ((n + 1) / 2, (n + 2) / 2);   -- n impar: 1 fila central; n par: las 2 centrales
```
> Trampa común: la versión con `ROW_NUMBER` ascendente **y** descendente falla cuando hay valores
> empatados, porque cada ventana puede romper el empate en distinto orden. Esta versión usa una sola.
