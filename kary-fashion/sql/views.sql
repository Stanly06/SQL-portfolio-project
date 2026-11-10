-- =====================================================================
--  KARY FASHION — Vistas de negocio
--  Se recrean en cada arranque (DROP + CREATE) para poder evolucionarlas.
-- =====================================================================

-- Cada línea vendida (solo ventas válidas) con su costo y ganancia.
DROP VIEW IF EXISTS v_lineas_vendidas;
CREATE VIEW v_lineas_vendidas AS
SELECT  v.id                                   AS venta_id,
        v.numero,
        v.fecha,
        date(v.fecha)                          AS dia,
        v.usuario_id,
        v.cliente_id,
        d.producto_id,
        COALESCE(p.codigo, d.codigo)           AS codigo,
        d.descripcion,
        COALESCE(c.nombre, 'Encargo')          AS categoria,
        d.cantidad,
        d.precio_unitario,
        d.costo_unitario,
        d.cantidad * d.precio_unitario         AS venta_bruta,
        d.descuento,
        d.total                                AS venta_neta,
        d.cantidad * d.costo_unitario          AS costo_total,
        d.total - d.cantidad * d.costo_unitario AS ganancia_bruta
FROM    ventas v
JOIN    venta_detalle d ON d.venta_id = v.id
LEFT JOIN productos  p  ON p.id = d.producto_id
LEFT JOIN categorias c  ON c.id = p.categoria_id
WHERE   v.estado = 'completada';

-- Valor del inventario actual al costo y al precio de venta.
DROP VIEW IF EXISTS v_inventario_valor;
CREATE VIEW v_inventario_valor AS
SELECT  p.id, p.codigo, p.nombre, c.nombre AS categoria, p.talla, p.color, p.modelo,
        p.stock, p.stock_minimo, p.costo, p.precio,
        p.precio - p.costo                 AS ganancia_unitaria,
        CASE WHEN p.precio > 0
             THEN ROUND(100.0 * (p.precio - p.costo) / p.precio, 1) END AS margen_pct,
        p.stock * p.costo                  AS valor_costo,
        p.stock * p.precio                 AS valor_venta,
        p.stock * (p.precio - p.costo)     AS ganancia_potencial,
        (p.stock <= p.stock_minimo)        AS stock_bajo
FROM    productos p
JOIN    categorias c ON c.id = p.categoria_id
WHERE   p.activo = 1;

-- Saldo de cada pedido: total - abonos + devoluciones.
DROP VIEW IF EXISTS v_pedidos_saldo;
CREATE VIEW v_pedidos_saldo AS
SELECT  pe.*,
        cl.nombre   AS cliente,
        cl.telefono AS telefono,
        COALESCE(SUM(CASE a.tipo WHEN 'abono' THEN a.monto ELSE -a.monto END), 0) AS abonado,
        pe.total - COALESCE(SUM(CASE a.tipo WHEN 'abono' THEN a.monto ELSE -a.monto END), 0) AS balance
FROM    pedidos pe
JOIN    clientes cl ON cl.id = pe.cliente_id
LEFT JOIN pedido_abonos a ON a.pedido_id = pe.id
GROUP BY pe.id;

-- Todos los movimientos de dinero en un solo lugar (base del cierre de caja).
--   signo +1 = entra dinero, -1 = sale dinero
DROP VIEW IF EXISTS v_movimientos_caja;
CREATE VIEW v_movimientos_caja AS
SELECT  date(v.fecha) AS dia, v.fecha, 'venta' AS origen, v.id AS origen_id,
        'Factura #' || v.numero AS concepto, vp.metodo, vp.monto, 1 AS signo
FROM    ventas v JOIN venta_pagos vp ON vp.venta_id = v.id
WHERE   v.estado = 'completada' AND vp.metodo <> 'anticipo'
UNION ALL
SELECT  date(a.fecha), a.fecha, 'pedido_' || a.tipo, a.pedido_id,
        CASE a.tipo WHEN 'abono' THEN 'Abono pedido #' ELSE 'Devolución pedido #' END || pe.numero,
        a.metodo, a.monto, CASE a.tipo WHEN 'abono' THEN 1 ELSE -1 END
FROM    pedido_abonos a JOIN pedidos pe ON pe.id = a.pedido_id
UNION ALL
SELECT  g.fecha, g.creado_en, 'gasto', g.id, 'Gasto: ' || g.descripcion,
        g.metodo_pago, g.monto, -1
FROM    gastos g
WHERE   g.pagado_de_caja = 1;

-- Ventas por día (para gráficos y comparaciones).
DROP VIEW IF EXISTS v_ventas_diarias;
CREATE VIEW v_ventas_diarias AS
SELECT  date(fecha)        AS dia,
        COUNT(*)           AS facturas,
        SUM(subtotal)      AS venta_bruta,
        SUM(descuento)     AS descuentos,
        SUM(total)         AS venta_neta
FROM    ventas
WHERE   estado = 'completada'
GROUP BY date(fecha);
