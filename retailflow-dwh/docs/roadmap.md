# Roadmap: cómo seguir ampliando el proyecto

El núcleo (fases 1–3) ya está construido y probado. Las siguientes fases convierten el proyecto en un
portafolio completo de Data Engineering + BI.

| Fase | Contenido | Estado |
|---|---|---|
| 1 | Capas raw/staging/dw, esquema estrella, SCD2 | ✅ Hecho |
| 2 | Carga incremental idempotente, tests de calidad, optimización | ✅ Hecho |
| 3 | 10 análisis con SQL avanzado | ✅ Hecho |
| 4 | **Dashboard en Power BI** conectado a `analytics.mv_daily_sales` y `dw.*` (ventas, cohortes, funnel, RFM) | Pendiente |
| 5 | **dbt**: migrar `02`–`04` a modelos dbt (`staging/`, `marts/`), `snapshots` para SCD2 y tests en YAML | Pendiente |
| 6 | **Orquestación**: DAG de Airflow (o Prefect) que ejecute el pipeline diario | Pendiente |
| 7 | **Ingesta con Python**: cargar CSV/API reales a `raw` con pandas + SQLAlchemy | Pendiente |
| 8 | **Nube**: replicar en Snowflake, BigQuery o Databricks (cambia `MERGE`, `QUALIFY`, particionamiento) | Pendiente |

## Ejercicios para practicar (sin mirar soluciones)
1. Agrega `dim_channel` y conviértela en una dimensión SCD Tipo 1.
2. Crea un procedimiento que haga *backfill* de un rango de fechas en `fact_sales`.
3. Agrega una *lookback window* de 3 días al watermark para tolerar datos tardíos.
4. Calcula el **tiempo medio hasta la segunda compra** por cohorte.
5. Calcula la **canasta de mercado**: pares de productos que más se compran juntos (self-join en `fact_sales`).
6. Encuentra clientes que compraron **3 meses seguidos y luego dejaron de comprar**.
7. Crea un test de calidad que falle si las ventas diarias caen >50% vs. la media de 7 días.
8. Reescribe `a03` usando solo `GROUP BY` (sin window functions) y compara los planes de ejecución.
