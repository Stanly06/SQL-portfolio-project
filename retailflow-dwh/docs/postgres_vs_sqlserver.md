# PostgreSQL ↔ SQL Server (T-SQL): equivalencias

Tus proyectos anteriores (Shark Tank, Censo India) están en T-SQL. Esta tabla te ayuda a moverte entre ambos.
**Las window functions, CTEs, `MERGE`, `ROLLUP`/`CUBE`/`GROUPING SETS` son casi idénticas en los dos.**

| Concepto | PostgreSQL | SQL Server |
|---|---|---|
| Limitar filas | `LIMIT 10` | `TOP 10` / `OFFSET ... FETCH` |
| Autoincremental | `GENERATED ALWAYS AS IDENTITY` | `IDENTITY(1,1)` |
| Concatenar | `a \|\| b` / `concat_ws` | `a + b` / `CONCAT` / `CONCAT_WS` |
| Cast | `x::int` / `CAST(x AS int)` | `CAST(x AS int)` / `TRY_CAST` |
| Fecha actual | `now()`, `current_date` | `GETDATE()`, `SYSDATETIME()` |
| Truncar fecha | `date_trunc('month', d)` | `DATETRUNC(month, d)` (2022+) / `DATEFROMPARTS(YEAR(d), MONTH(d), 1)` |
| Diferencia de días | `d2 - d1` | `DATEDIFF(day, d1, d2)` |
| Nombre del día | `to_char(d, 'Day')` | `DATENAME(dw, d)` |
| Generar series | `generate_series(1, 10)` | `GENERATE_SERIES(1, 10)` (2022+) o CTE recursivo |
| CTE recursivo | `WITH RECURSIVE` | `WITH` (sin la palabra RECURSIVE) |
| Agregación condicional | `count(*) FILTER (WHERE ...)` | `SUM(CASE WHEN ... THEN 1 ELSE 0 END)` |
| Pivot | `FILTER` / `crosstab()` | `PIVOT` |
| Primera fila por grupo | `DISTINCT ON (...)` | `ROW_NUMBER()` + `rn = 1` |
| Mediana | `PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY x)` (agregado) | `PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY x) OVER (...)` (ventana) |
| Upsert | `INSERT ... ON CONFLICT` / `MERGE` | `MERGE` |
| Booleano | `BOOLEAN` | `BIT` |
| JSON | `JSONB`, `->`, `->>`, `#>>` | `NVARCHAR` + `JSON_VALUE`, `OPENJSON` |
| Procedimiento | `CREATE PROCEDURE ... LANGUAGE plpgsql` / `CALL` | `CREATE PROCEDURE` / `EXEC` |
| Filas afectadas | `GET DIAGNOSTICS v = ROW_COUNT` | `@@ROWCOUNT` |
| Índice con columnas extra | `INCLUDE (...)` | `INCLUDE (...)` |
| Índice parcial | `WHERE ...` | Índice filtrado `WHERE ...` |
| Plan de ejecución | `EXPLAIN ANALYZE` | Plan de ejecución real (Ctrl+M) / `SET STATISTICS IO ON` |
| Vista materializada | `MATERIALIZED VIEW` | Vista indexada (`WITH SCHEMABINDING`) |
| Particionamiento | `PARTITION BY RANGE` | Partition function + scheme |
