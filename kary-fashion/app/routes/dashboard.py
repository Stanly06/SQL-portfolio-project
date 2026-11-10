from datetime import timedelta

from flask import Blueprint, g, redirect, render_template, url_for

from .. import metricas
from ..auth import login_required
from ..db import q, val
from ..utils import rango_periodo, today

bp = Blueprint("dashboard", __name__)


@bp.route("/")
@login_required
def inicio():
    hoy = today()
    ini_mes, fin_mes, etiqueta_mes, _ = rango_periodo("mes")
    ctx = {
        "hoy": metricas.resumen(hoy, hoy),
        "caja": metricas.caja_del_dia(hoy),
        "por_cobrar": metricas.por_cobrar(),
        "stock_bajo": q("""SELECT id, codigo, nombre, talla, color, stock, stock_minimo FROM productos
                           WHERE activo = 1 AND stock <= stock_minimo ORDER BY stock, nombre LIMIT 12"""),
        "pedidos_proximos": q("""SELECT * FROM v_pedidos_saldo WHERE estado IN ('pendiente', 'recibido')
                                 ORDER BY COALESCE(fecha_entrega, '9999') LIMIT 8"""),
        "mis_ventas_hoy": val("""SELECT COUNT(*) FROM ventas WHERE estado = 'completada'
                                 AND date(fecha) = ? AND usuario_id = ?""", (hoy.isoformat(), g.user["id"])),
        "etiqueta_mes": etiqueta_mes,
    }
    if g.user["rol"] == "admin":
        ctx.update(
            mes=metricas.resumen(ini_mes, hoy),
            inventario=metricas.inventario(),
            top=metricas.mas_vendidos(ini_mes, hoy, 5),
            serie=metricas.serie(hoy - timedelta(days=13), hoy),
        )
    return render_template("inicio.html", **ctx)


@bp.route("/inicio")
def alias():
    return redirect(url_for("dashboard.inicio"))
