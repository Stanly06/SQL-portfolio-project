"""Reportes de ventas y resultados, con comparación de períodos y exportación a Excel/PDF."""
from io import BytesIO

from flask import Blueprint, Response, render_template, request

from .. import metricas
from ..auth import admin_required
from ..db import q
from ..pdf import reporte_pdf
from ..utils import CATEGORIAS_GASTO, METODOS_PAGO, money, periodo_anterior, rango_periodo

bp = Blueprint("reportes", __name__, url_prefix="/reportes")

COMPARABLES = [
    ("ventas", "Ventas netas"), ("facturas", "Facturas"), ("unidades", "Unidades vendidas"),
    ("costo_vendido", "Costo de lo vendido"), ("ganancia_bruta", "Ganancia bruta"),
    ("gastos", "Gastos"), ("ganancia_neta", "Ganancia neta"), ("descuentos", "Descuentos"),
    ("ticket_promedio", "Ticket promedio"), ("compras", "Invertido en mercancía"),
]
NO_MONEDA = {"facturas", "unidades"}


def datos_reporte():
    periodo = request.args.get("periodo", "mes")
    d1, d2, etiqueta, agrup = rango_periodo(periodo, request.args.get("desde"), request.args.get("hasta"))
    a1, a2 = periodo_anterior(d1, d2, periodo)
    actual, anterior = metricas.resumen(d1, d2), metricas.resumen(a1, a2)
    comparacion = []
    for k, nombre in COMPARABLES:
        va, vb = actual[k], anterior[k]
        var = round(100.0 * (va - vb) / abs(vb), 1) if vb else None
        comparacion.append({"clave": k, "nombre": nombre, "actual": va, "anterior": vb, "variacion": var,
                            "moneda": k not in NO_MONEDA})
    return {
        "periodo": periodo, "d1": d1, "d2": d2, "etiqueta": etiqueta, "a1": a1, "a2": a2,
        "r": actual, "comparacion": comparacion,
        "serie": metricas.serie(d1, d2, agrup),
        "top": metricas.mas_vendidos(d1, d2, 15),
        "lentos": metricas.poca_salida(d1, d2, 15),
        "categorias": metricas.por_categoria(d1, d2),
        "metodos": metricas.por_metodo(d1, d2),
        "gastos": metricas.gastos_por_categoria(d1, d2),
        "inv": metricas.inventario(),
        "inv_cat": metricas.inventario_por_categoria(),
        "cobrar": metricas.por_cobrar(),
    }


@bp.route("/")
@admin_required
def index():
    return render_template("reportes/index.html", **datos_reporte())


def _nombre_archivo(d, ext):
    return f"Reporte-KaryFashion-{d['d1'].isoformat()}_{d['d2'].isoformat()}.{ext}"


@bp.route("/excel")
@admin_required
def excel():
    from openpyxl import Workbook
    from openpyxl.styles import Alignment, Font, PatternFill
    from openpyxl.utils import get_column_letter

    d = datos_reporte()
    wb = Workbook()
    rosa = PatternFill("solid", fgColor="F8D7E8")
    negrita = Font(bold=True)
    fmt = '"RD$"#,##0.00'

    def hoja(ws, titulo, cab, filas, moneda_cols=()):
        ws.append([f"Kary Fashion - {titulo}"])
        ws["A1"].font = Font(bold=True, size=14, color="C2006F")
        ws.append([f"Período: {d['etiqueta']} ({d['d1'].strftime('%d/%m/%Y')} - {d['d2'].strftime('%d/%m/%Y')})"])
        ws.append([])
        ws.append(cab)
        for c in ws[4]:
            c.font, c.fill = negrita, rosa
        for f in filas:
            ws.append(list(f))
        for col in moneda_cols:
            for fila in ws.iter_rows(min_row=5, min_col=col, max_col=col):
                for c in fila:
                    if isinstance(c.value, (int, float)):
                        c.value = c.value / 100
                        c.number_format = fmt
        for i, _ in enumerate(cab, 1):
            ws.column_dimensions[get_column_letter(i)].width = 16 if i > 1 else 34
        ws.freeze_panes = "A5"

    ws = wb.active
    ws.title = "Resumen"
    filas = [(c["nombre"], c["actual"], c["anterior"],
              (c["variacion"] / 100) if c["variacion"] is not None else None) for c in d["comparacion"]]
    hoja(ws, "Resumen de resultados", ["Indicador", "Este período", "Período anterior", "Variación"], filas)
    for row in ws.iter_rows(min_row=5):
        clave = d["comparacion"][row[0].row - 5]["clave"] if row[0].row - 5 < len(d["comparacion"]) else None
        if clave and clave not in NO_MONEDA:
            for c in row[1:3]:
                c.value = (c.value or 0) / 100
                c.number_format = fmt
        row[3].number_format = "0.0%"
    extra = [("Valor del inventario al costo", d["inv"]["valor_costo"]),
             ("Valor del inventario a precio de venta", d["inv"]["valor_venta"]),
             ("Pendiente por cobrar en pedidos", d["cobrar"]["balance"])]
    ws.append([])
    for nombre, v in extra:
        ws.append([nombre, v / 100])
        ws.cell(ws.max_row, 2).number_format = fmt

    ventas = q("""SELECT v.numero, v.fecha, COALESCE(v.cliente_nombre, 'Cliente general'), u.nombre, v.subtotal,
                         v.descuento, v.total,
                         (SELECT SUM(cantidad * costo_unitario) FROM venta_detalle WHERE venta_id = v.id),
                         v.total - (SELECT SUM(cantidad * costo_unitario) FROM venta_detalle WHERE venta_id = v.id),
                         (SELECT GROUP_CONCAT(metodo, ' + ') FROM venta_pagos WHERE venta_id = v.id),
                         v.ncf, v.estado
                  FROM ventas v JOIN usuarios u ON u.id = v.usuario_id
                  WHERE date(v.fecha) BETWEEN ? AND ? ORDER BY v.numero""",
               (d["d1"].isoformat(), d["d2"].isoformat()))
    hoja(wb.create_sheet("Ventas"), "Ventas", ["Factura", "Fecha", "Cliente", "Vendedor", "Subtotal", "Descuento",
                                               "Total", "Costo", "Ganancia", "Pago", "NCF", "Estado"],
         [tuple(r) for r in ventas], moneda_cols=(5, 6, 7, 8, 9))
    lineas = q("""SELECT fecha, numero, codigo, descripcion, categoria, cantidad, precio_unitario, descuento,
                         venta_neta, costo_total, ganancia_bruta
                  FROM v_lineas_vendidas WHERE dia BETWEEN ? AND ? ORDER BY fecha""",
               (d["d1"].isoformat(), d["d2"].isoformat()))
    hoja(wb.create_sheet("Detalle vendido"), "Artículos vendidos",
         ["Fecha", "Factura", "Código", "Artículo", "Categoría", "Cant.", "Precio", "Descuento", "Venta",
          "Costo", "Ganancia"], [tuple(r) for r in lineas], moneda_cols=(7, 8, 9, 10, 11))
    hoja(wb.create_sheet("Más vendidos"), "Productos más vendidos",
         ["Artículo", "Código", "Categoría", "Unidades", "Ventas", "Ganancia"],
         [(r["descripcion"], r["codigo"], r["categoria"], r["unidades"], r["ventas"], r["ganancia"]) for r in d["top"]],
         moneda_cols=(5, 6))
    hoja(wb.create_sheet("Poca salida"), "Productos con poca salida",
         ["Artículo", "Código", "Existencia", "Vendidas", "Valor al costo", "Última venta"],
         [(f"{r['nombre']} {r['color'] or ''} {r['talla'] or ''}".strip(), r["codigo"], r["stock"], r["unidades"],
           r["valor_costo"], r["ultima_venta"] or "Nunca") for r in d["lentos"]], moneda_cols=(5,))
    gastos = q("SELECT fecha, categoria, descripcion, metodo_pago, monto FROM gastos WHERE fecha BETWEEN ? AND ? ORDER BY fecha",
               (d["d1"].isoformat(), d["d2"].isoformat()))
    hoja(wb.create_sheet("Gastos"), "Gastos",
         ["Fecha", "Categoría", "Descripción", "Pago", "Monto"],
         [(r[0], CATEGORIAS_GASTO.get(r[1], r[1]), r[2], r[3], r[4]) for r in gastos], moneda_cols=(5,))
    inv = q("SELECT codigo, nombre, categoria, talla, color, stock, costo, precio, valor_costo, valor_venta FROM v_inventario_valor ORDER BY categoria, nombre")
    hoja(wb.create_sheet("Inventario"), "Inventario actual",
         ["Código", "Producto", "Categoría", "Talla", "Color", "Existencia", "Costo", "Precio", "Valor costo",
          "Valor venta"], [tuple(r) for r in inv], moneda_cols=(7, 8, 9, 10))
    for w in wb.worksheets:
        w["A1"].alignment = Alignment(horizontal="left")
    buf = BytesIO()
    wb.save(buf)
    return Response(buf.getvalue(),
                    mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    headers={"Content-Disposition": f'attachment; filename="{_nombre_archivo(d, "xlsx")}"'})


@bp.route("/pdf")
@admin_required
def pdf():
    d = datos_reporte()
    r = d["r"]
    titulo = f"Reporte de resultados - {d['etiqueta']} ({d['d1'].strftime('%d/%m/%Y')} al {d['d2'].strftime('%d/%m/%Y')})"

    def fmt(c, v):
        return str(v) if c["clave"] in NO_MONEDA else money(v)

    secciones = [
        ("Resumen y comparación con el período anterior", ["Indicador", "Este período", "Anterior", "Variación"],
         [(c["nombre"], fmt(c, c["actual"]), fmt(c, c["anterior"]),
           f"{c['variacion']:+.1f}%" if c["variacion"] is not None else "-") for c in d["comparacion"]],
         [70, 42, 42, 32], ["L", "R", "R", "R"]),
        ("Inventario y cuentas por cobrar", ["Concepto", "Monto"],
         [("Unidades en inventario", str(d["inv"]["unidades"])),
          ("Valor del inventario al costo", money(d["inv"]["valor_costo"])),
          ("Valor del inventario a precio de venta", money(d["inv"]["valor_venta"])),
          ("Ganancia potencial del inventario", money(d["inv"]["ganancia_potencial"])),
          ("Pendiente por cobrar en pedidos", money(d["cobrar"]["balance"]))],
         [120, 50], ["L", "R"]),
        ("Ventas por categoría", ["Categoría", "Unidades", "Ventas", "Costo", "Ganancia"],
         [(x["categoria"], str(x["unidades"]), money(x["ventas"]), money(x["costo"]), money(x["ganancia"]))
          for x in d["categorias"]], [50, 25, 37, 37, 37], ["L", "R", "R", "R", "R"]),
        ("Productos más vendidos", ["Artículo", "Unid.", "Ventas", "Ganancia"],
         [(x["descripcion"], str(x["unidades"]), money(x["ventas"]), money(x["ganancia"])) for x in d["top"]],
         [100, 20, 35, 35], ["L", "R", "R", "R"]),
        ("Productos con poca salida", ["Artículo", "Exist.", "Vendidas", "Valor costo", "Última venta"],
         [(f"{x['codigo']} {x['nombre']} {x['color'] or ''} {x['talla'] or ''}", str(x["stock"]), str(x["unidades"]),
           money(x["valor_costo"]), x["ultima_venta"] or "Nunca") for x in d["lentos"]],
         [88, 18, 20, 32, 28], ["L", "R", "R", "R", "R"]),
        ("Cobros por método de pago", ["Método", "Facturas", "Monto"],
         [(METODOS_PAGO.get(x["metodo"], x["metodo"]), str(x["facturas"]), money(x["monto"])) for x in d["metodos"]],
         [90, 40, 50], ["L", "R", "R"]),
        ("Gastos por categoría", ["Categoría", "Cantidad", "Monto"],
         [(CATEGORIAS_GASTO.get(x["categoria"], x["categoria"]), str(x["cantidad"]), money(x["monto"]))
          for x in d["gastos"]], [90, 40, 50], ["L", "R", "R"]),
    ]
    data = reporte_pdf(titulo, secciones)
    return Response(data, mimetype="application/pdf",
                    headers={"Content-Disposition": f'attachment; filename="{_nombre_archivo(d, "pdf")}"'})
