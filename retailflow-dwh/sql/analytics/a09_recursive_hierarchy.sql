-- =====================================================================
-- a09 · CTEs recursivos: jerarquías y series
-- Pregunta: ¿Cuánto vende cada nodo del árbol de categorías incluyendo
-- TODAS sus subcategorías? (p.ej. "Electrónica" = Celulares + Computadoras + ...)
-- =====================================================================

-- 1) Árbol visual con indentación
WITH RECURSIVE tree AS (
    SELECT category_id, category_name, parent_category_id, 0 AS depth,
           ARRAY[category_id] AS path
    FROM dw.dim_category WHERE parent_category_id IS NULL
    UNION ALL
    SELECT c.category_id, c.category_name, c.parent_category_id, t.depth + 1,
           t.path || c.category_id
    FROM dw.dim_category c
    JOIN tree t ON c.parent_category_id = t.category_id
)
SELECT repeat('    ', depth) || category_name AS category_tree, depth, path
FROM tree
ORDER BY path;

-- 2) Ingresos "roll-up" por toda la jerarquía:
--    Para cada categoría generamos pares (ancestro, descendiente) y sumamos.
WITH RECURSIVE ancestors AS (
    SELECT category_id AS ancestor_id, category_id AS descendant_id
    FROM dw.dim_category
    UNION ALL
    SELECT a.ancestor_id, c.category_id
    FROM ancestors a
    JOIN dw.dim_category c ON c.parent_category_id = a.descendant_id
),
direct_revenue AS (
    SELECT p.category_id, sum(f.net_amount) AS revenue
    FROM dw.fact_sales f
    JOIN dw.dim_product p ON p.product_sk = f.product_sk
    WHERE f.is_revenue
    GROUP BY p.category_id
)
SELECT c.category_path,
       COALESCE(dr_self.revenue, 0)       AS direct_revenue,
       sum(COALESCE(dr.revenue, 0))       AS total_revenue_incl_children
FROM ancestors a
JOIN dw.dim_category c         ON c.category_id = a.ancestor_id
LEFT JOIN direct_revenue dr     ON dr.category_id = a.descendant_id
LEFT JOIN direct_revenue dr_self ON dr_self.category_id = a.ancestor_id
GROUP BY c.category_path, dr_self.revenue
ORDER BY c.category_path;

-- 3) Recursión para "explotar" filas: 1 fila por unidad vendida
--    (ejercicio típico: orden con quantity=3 -> 3 filas)
WITH RECURSIVE units AS (
    SELECT order_id, line_no, quantity, 1 AS unit_no
    FROM dw.fact_sales WHERE order_id = 'O0000001'
    UNION ALL
    SELECT order_id, line_no, quantity, unit_no + 1
    FROM units WHERE unit_no < quantity
)
SELECT * FROM units ORDER BY line_no, unit_no;
-- En PostgreSQL lo idiomático es: CROSS JOIN LATERAL generate_series(1, quantity)
