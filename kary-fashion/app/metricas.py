"""Consultas de negocio reutilizadas por el inicio, la caja y los reportes.
Todas reciben fechas (date) inclusivas y devuelven montos en centavos."""
from datetime import timedelta

from .db import q, q1, val
from .utils import MESES, config, to_int


def _r(d1, d2):
    return (d1.isoformat(), d2.isoformat())


def resumen(d1, d2):
    """Ventas, costo, ganancias y gastos del período."""
    v = q1("""SELECT COUNT(*) AS facturas,
                     COALESCE(SUM(subtotal), 0)  AS venta_bruta,
                     COALESCE(SUM(descuento), 0) AS descuentos,
                     COALESCE(SUM(total), 0)     AS ventas
              FROM ventas
              WHERE estado = 'completada' AND date(fecha) BETWEEN ? AND ?""", _r(d1, d2))
    lineas = q1("""SELECT COALESCE(SUM(cantidad), 0)      AS unidades,
                          COALESCE(SUM(costo_total), 0)   AS costo_vendido,
                          COALESCE(SUM(ganancia_bruta), 0) AS ganancia_bruta
                   FROM v_lineas_vendidas WHERE dia BETWEEN ? AND ?""", _r(d1, d2))
    gastos = val("SELECT SUM(monto) FROM gastos WHERE fecha BETWEEN ? AND ?", _r(d1, d2))
    compras = q1("""SELECT COUNT(*) AS cantidad, COALESCE(SUM(subtotal), 0) AS mercancia,
                           COALESCE(SUM(transporte + otros_costos), 0) AS adicionales,
                           COALESCE(SUM(total), 0) AS total
                    FROM compras WHERE date(fecha) BETWEEN ? AND ?""", _r(d1, d2))
    anuladas = val("SELECT COUNT(*) FROM ventas WHERE estado = 'anulada' AND date(fecha) BETWEEN ? AND ?",
                   _r(d1, d2))
    ventas = v["ventas"]
    gb = lineas["ganancia_bruta"]
    return {
        "facturas": v["facturas"],
        "venta_bruta": v["venta_bruta"],
        "descuentos": v["descuentos"],
        "ventas": ventas,
        "unidades": lineas["unidades"],
        "costo_vendido": lineas["costo_vendido"],
        "ganancia_bruta": gb,
        "margen_bruto": round(100.0 * gb / ventas, 1) if ventas else 0.0,
        "gastos": gastos,
        "ganancia_neta": gb - gastos,
        "margen_neto": round(100.0 * (gb - gastos) / ventas, 1) if ventas else 0.0,
        "ticket_promedio": ventas // v["facturas"] if v["facturas"] else 0,
        "compras": compras["total"],
        "compras_mercancia": compras["mercancia"],
        "compras_adicionales": compras["adicionales"],
        "compras_cantidad": compras["cantidad"],
        "anuladas": anuladas,
    }


def inventario():
    r = q1("""SELECT COUNT(*) AS productos, COALESCE(SUM(stock), 0) AS unidades,
                     COALESCE(SUM(valor_costo), 0) AS valor_costo,
                     COALESCE(SUM(valor_venta), 0) AS valor_venta,
                     COALESCE(SUM(ganancia_potencial), 0) AS ganancia_potencial,
                     COALESCE(SUM(stock_bajo), 0) AS bajos,
                     COALESCE(SUM(stock = 0), 0) AS agotados
              FROM v_inventario_valor""")
    return dict(r)


def inventario_por_categoria():
    return q("""SELECT categoria, COUNT(*) AS productos, SUM(stock) AS unidades,
                       SUM(valor_costo) AS valor_costo, SUM(valor_venta) AS valor_venta
                FROM v_inventario_valor GROUP BY categoria ORDER BY valor_costo DESC""")


def por_cobrar():
    r = q1("""SELECT COUNT(*) AS pedidos, COALESCE(SUM(balance), 0) AS balance,
                     COALESCE(SUM(abonado), 0) AS abonado
              FROM v_pedidos_saldo WHERE estado IN ('pendiente', 'recibido')""")
    return dict(r)


def mas_vendidos(d1, d2, limite=10):
    return q("""SELECT producto_id, codigo, descripcion, categoria,
                       SUM(cantidad) AS unidades, SUM(venta_neta) AS ventas,
                       SUM(ganancia_bruta) AS ganancia
                FROM v_lineas_vendidas WHERE dia BETWEEN ? AND ?
                GROUP BY COALESCE(producto_id, descripcion)
                ORDER BY unidades DESC, ventas DESC LIMIT ?""", (*_r(d1, d2), limite))


def poca_salida(d1, d2, limite=15):
    """Productos con existencia que se vendieron poco o nada en el período."""
    return q("""SELECT p.id, p.codigo, p.nombre, p.talla, p.color, p.stock, p.costo,
                       p.stock * p.costo AS valor_costo,
                       COALESCE(s.unidades, 0) AS unidades,
                       (SELECT MAX(date(v.fecha)) FROM venta_detalle d JOIN ventas v ON v.id = d.venta_id
                         WHERE d.producto_id = p.id AND v.estado = 'completada') AS ultima_venta,
                       date(p.creado_en) AS creado
                FROM productos p
                LEFT JOIN (SELECT producto_id, SUM(cantidad) AS unidades FROM v_lineas_vendidas
                           WHERE dia BETWEEN ? AND ? GROUP BY producto_id) s ON s.producto_id = p.id
                WHERE p.activo = 1 AND p.stock > 0 AND date(p.creado_en) <= ?
                ORDER BY COALESCE(s.unidades, 0) ASC, valor_costo DESC
                LIMIT ?""", (*_r(d1, d2), d1.isoformat(), limite))


def por_categoria(d1, d2):
    return q("""SELECT categoria, SUM(cantidad) AS unidades, SUM(venta_neta) AS ventas,
                       SUM(costo_total) AS costo, SUM(ganancia_bruta) AS ganancia
                FROM v_lineas_vendidas WHERE dia BETWEEN ? AND ?
                GROUP BY categoria ORDER BY ventas DESC""", _r(d1, d2))


def por_metodo(d1, d2):
    return q("""SELECT vp.metodo, COUNT(DISTINCT v.id) AS facturas, SUM(vp.monto) AS monto
                FROM ventas v JOIN venta_pagos vp ON vp.venta_id = v.id
                WHERE v.estado = 'completada' AND date(v.fecha) BETWEEN ? AND ?
                GROUP BY vp.metodo ORDER BY monto DESC""", _r(d1, d2))


def gastos_por_categoria(d1, d2):
    return q("""SELECT categoria, COUNT(*) AS cantidad, SUM(monto) AS monto
                FROM gastos WHERE fecha BETWEEN ? AND ?
                GROUP BY categoria ORDER BY monto DESC""", _r(d1, d2))


def serie(d1, d2, agrupacion="dia"):
    """Serie para gráfico: ventas y ganancia por día o por mes (incluye períodos en cero)."""
    if agrupacion == "mes":
        filas = {r["k"]: r for r in q("""
            SELECT strftime('%Y-%m', dia) AS k, SUM(venta_neta) AS ventas, SUM(ganancia_bruta) AS ganancia
            FROM v_lineas_vendidas WHERE dia BETWEEN ? AND ? GROUP BY k""", _r(d1, d2))}
        puntos, y, m = [], d1.year, d1.month
        while (y, m) <= (d2.year, d2.month):
            k = f"{y:04d}-{m:02d}"
            r = filas.get(k)
            puntos.append({"etiqueta": MESES[m - 1][:3].capitalize(), "clave": k,
                           "ventas": r["ventas"] if r else 0, "ganancia": r["ganancia"] if r else 0})
            m += 1
            if m == 13:
                y, m = y + 1, 1
        return puntos
    filas = {r["dia"]: r for r in q("""
        SELECT dia, SUM(venta_neta) AS ventas, SUM(ganancia_bruta) AS ganancia
        FROM v_lineas_vendidas WHERE dia BETWEEN ? AND ? GROUP BY dia""", _r(d1, d2))}
    puntos, d = [], d1
    while d <= d2:
        r = filas.get(d.isoformat())
        puntos.append({"etiqueta": d.strftime("%d/%m"), "clave": d.isoformat(),
                       "ventas": r["ventas"] if r else 0, "ganancia": r["ganancia"] if r else 0})
        d += timedelta(days=1)
    return puntos


def caja_del_dia(dia):
    """Dinero recibido el día por método + salidas de efectivo."""
    dia_s = dia.isoformat()
    filas = q("""SELECT origen, metodo, SUM(monto * signo) AS neto, SUM(monto) AS bruto, COUNT(*) AS n
                 FROM v_movimientos_caja WHERE dia = ? GROUP BY origen, metodo""", (dia_s,))
    res = {
        "efectivo_ventas": 0, "efectivo_abonos": 0, "efectivo_salidas": 0,
        "transferencias": 0, "tarjetas": 0,
        "abonos_total": 0, "devoluciones": 0, "gastos_caja": 0,
    }
    for r in filas:
        o, m = r["origen"], r["metodo"]
        if o == "venta":
            if m == "efectivo":
                res["efectivo_ventas"] += r["neto"]
        elif o == "pedido_abono":
            res["abonos_total"] += r["neto"]
            if m == "efectivo":
                res["efectivo_abonos"] += r["neto"]
        elif o == "pedido_devolucion":
            res["devoluciones"] += r["bruto"]
            if m == "efectivo":
                res["efectivo_salidas"] += r["bruto"]
        elif o == "gasto":
            res["gastos_caja"] += r["bruto"]
            if m == "efectivo":
                res["efectivo_salidas"] += r["bruto"]
        if o in ("venta", "pedido_abono", "pedido_devolucion"):
            if m == "transferencia":
                res["transferencias"] += r["neto"]
            elif m == "tarjeta":
                res["tarjetas"] += r["neto"]
    res["ventas"] = q1("""SELECT COUNT(*) AS n, COALESCE(SUM(total), 0) AS total FROM ventas
                          WHERE estado = 'completada' AND date(fecha) = ?""", (dia_s,))
    cierre = q1("SELECT * FROM cierres_caja WHERE fecha = ?", (dia_s,))
    res["cierre"] = cierre
    res["fondo_inicial"] = cierre["fondo_inicial"] if cierre else to_int(config("fondo_caja_defecto"), 0)
    res["efectivo_esperado"] = (res["fondo_inicial"] + res["efectivo_ventas"] + res["efectivo_abonos"]
                                - res["efectivo_salidas"])
    res["total_ingresos"] = (res["efectivo_ventas"] + res["efectivo_abonos"]
                             + res["transferencias"] + res["tarjetas"])
    res["movimientos"] = q("SELECT * FROM v_movimientos_caja WHERE dia = ? ORDER BY fecha", (dia_s,))
    return res
