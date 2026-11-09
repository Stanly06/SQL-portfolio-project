# Manufacturing & Supply Chain Analytics — Proyecto de SQL Avanzado

*Read in English: [README.md](README.md)*

Proyecto personal de portafolio en **SQL Server (T-SQL)**. Modela a **NovaLeaf Manufacturing**, un productor
**ficticio** de cajas de té de hierbas, y sigue sus datos desde los proveedores hasta los clientes:

```
Proveedores ─► Lotes recibidos ─► Inspección de entrada ─► Inventario ─► Órdenes de producción ─► Inspección final ─► Ventas
```

Todos los datos son ficticios e intencionalmente pequeños (enero–marzo 2025, de 4 a 54 filas por tabla) para
poder verificar cada número a mano. Es un proyecto de aprendizaje y portafolio, **no** un sistema en producción.

## Estado del proyecto

| Etapa | Contenido | Estado |
|---|---|---|
| 1 | Modelo fuente, tablas de aterrizaje, datos con problemas de calidad sembrados | ✅ Hecho y probado |
| 2 | Staging tipado, reglas de limpieza, cuarentena, controles de calidad entre procesos, pruebas automáticas | ✅ Hecho y probado |
| 3 | Modelo dimensional (hechos, dimensiones, claves sustitutas) | 🔜 Siguiente |
| 4 | Consultas de KPI: producción, calidad, inventario, proveedores, ventas (funciones de ventana, CTE) | Planificado |
| 5 | Carga incremental + idempotencia, SCD Tipo 2 | Planificado |
| 6 | Dashboard opcional en Power BI; traducción de consultas a PostgreSQL / Databricks SQL | Planificado |

## Arquitectura

```
 land  (extractos crudos, todo NVARCHAR, sin restricciones)
   │   etl.usp_load_staging: TRIM/UPPER, TRY_CONVERT, deduplicación con ROW_NUMBER, reglas de rechazo
   ▼
 stg   (tablas tipadas con PK / FK / CHECK)  ──►  dq.rejected_rows (cuarentena, fila original en JSON)
   │   dq.usp_run_checks: reconciliación entre procesos
   ▼
 dq.check_result (PASS / FAIL / WARN por control, historial por ejecución)
   ▼
 dw    (modelo dimensional — etapa 3)
```

Son **esquemas dentro de una sola base de datos SQL Server**. La idea se parece a las capas Bronze/Silver/Gold
de una arquitectura Medallion en un lakehouse, pero no es lo mismo: no hay almacenamiento en archivos, ni
tablas Delta, ni separación entre almacenamiento y cómputo. Ver
[docs/decisions_and_limitations.md](docs/decisions_and_limitations.md).

El diagrama del modelo fuente está en el [README en inglés](README.md#source-data-model-staging), y la
granularidad, claves y unidades de cada tabla en [docs/data_dictionary.md](docs/data_dictionary.md).

## Calidad de datos: qué detecta el pipeline

Los datos de ejemplo contienen 15 problemas sembrados a propósito
([docs/data_quality_catalog.md](docs/data_quality_catalog.md)). Resultado actual y reproducible de
`EXEC dq.usp_run_checks`:

| Control | Severidad | Filas con falla | Causa en los datos |
|---|---|---|---|
| C02 Cada lote tiene exactamente un movimiento RECEIPT | ERROR | **1** | LOT-2513 se recibió pero nunca se registró en inventario |
| C04 Ningún lote con saldo negativo | ERROR | **1** | Misma causa: se consumieron bolsitas de LOT-2513 sin entrada |
| C06 Despachos cuadran con las líneas del pedido | ERROR | **1** | SO-5005 se despachó, pero su línea quedó en cuarentena (descuento ambiguo) |
| C07 Material consumido de un lote no aprobado | WARNING | **1** | LOT-2507 falló la inspección de entrada y se usó en PO-1004 |
| C08 Producción termina antes de empezar | WARNING | **1** | PO-1006 con horas invertidas |
| C09 Despachado antes de pedido | WARNING | **1** | SO-5006 |
| C11 Filas en cuarentena | WARNING | **5** | Ver catálogo |
| C01, C03, C05, C10 | — | 0 | PASS |

## Cómo ejecutarlo

Requisitos: SQL Server 2019 o posterior (desarrollado y probado en **SQL Server 2022 Developer**, y también
ejecutado con nivel de compatibilidad 150) y SSMS. Guía de instalación: [docs/setup_windows.md](docs/setup_windows.md).

1. Abre `sql/run_all.sql` en SSMS, activa **Query → SQLCMD Mode**, edita `ProjectPath` y presiona F5.
   *O* ejecuta los archivos de `sql/` en orden numérico.
2. Ejecuta `tests/test_stage2_expected_results.sql`. Última línea esperada: `ALL STAGE 2 TESTS PASSED`.

## Notas de alcance y honestidad

- Proyecto personal con datos ficticios. No describe a ninguna empresa real.
- Los resultados con este volumen pequeño demuestran **corrección**, no rendimiento ni escalabilidad.
- Cualquier mejora de rendimiento (índices, planes de ejecución) se reportará solo si fue medida.
