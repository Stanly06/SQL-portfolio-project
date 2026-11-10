"""Cuadre y cierre de caja diario."""
from flask import Blueprint, abort, flash, g, redirect, render_template, request, url_for

from .. import metricas
from ..auth import es_admin, login_required
from ..backups import crear_respaldo
from ..db import q, q1, tx
from ..utils import audit, now_str, parse_date, to_cents, today

bp = Blueprint("caja", __name__, url_prefix="/caja")


@bp.route("/")
@login_required
def hoy():
    dia = parse_date(request.args.get("dia"), today())
    if dia != today() and not es_admin():
        dia = today()
    c = metricas.caja_del_dia(dia)
    cierres = q("""SELECT cc.*, u.nombre AS usuario FROM cierres_caja cc LEFT JOIN usuarios u ON u.id = cc.usuario_id
                   ORDER BY cc.fecha DESC LIMIT 31""") if es_admin() else []
    return render_template("caja/hoy.html", c=c, dia=dia, es_hoy=(dia == today()), cierres=cierres)


@bp.route("/cerrar", methods=["POST"])
@login_required
def cerrar():
    dia = parse_date(request.form.get("dia"), today())
    if dia != today() and not es_admin():
        abort(403)
    if q1("SELECT 1 FROM cierres_caja WHERE fecha = ?", (dia.isoformat(),)):
        flash("Ese día ya tiene cierre de caja.", "warning")
        return redirect(url_for("caja.hoy", dia=dia.isoformat()))
    try:
        fondo = to_cents(request.form.get("fondo_inicial"))
        contado = to_cents(request.form.get("efectivo_contado"))
        if request.form.get("efectivo_contado", "").strip() == "":
            raise ValueError("Cuente el efectivo de la caja y escriba el monto.")
    except ValueError as e:
        flash(str(e), "danger")
        return redirect(url_for("caja.hoy", dia=dia.isoformat()))
    c = metricas.caja_del_dia(dia)
    esperado = fondo + c["efectivo_ventas"] + c["efectivo_abonos"] - c["efectivo_salidas"]
    with tx():
        cur = g.db.execute(
            """INSERT INTO cierres_caja (fecha, fondo_inicial, efectivo_ventas, efectivo_abonos, efectivo_salidas,
                                         efectivo_esperado, efectivo_contado, diferencia, transferencias, tarjetas,
                                         total_ingresos, cantidad_ventas, nota, usuario_id, creado_en)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (dia.isoformat(), fondo, c["efectivo_ventas"], c["efectivo_abonos"], c["efectivo_salidas"], esperado,
             contado, contado - esperado, c["transferencias"], c["tarjetas"], c["total_ingresos"],
             c["ventas"]["n"], (request.form.get("nota") or "").strip() or None, g.user["id"], now_str()))
        audit("cerrar_caja", "caja", cur.lastrowid, {"fecha": dia.isoformat(), "esperado": esperado,
                                                     "contado": contado, "diferencia": contado - esperado})
    try:
        crear_respaldo("cierre")
    except Exception:
        pass
    dif = contado - esperado
    if dif == 0:
        flash("Caja cerrada. ¡Cuadre perfecto!", "success")
    else:
        flash(f"Caja cerrada con {'sobrante' if dif > 0 else 'faltante'} de RD${abs(dif) / 100:,.2f}.", "warning")
    return redirect(url_for("caja.hoy", dia=dia.isoformat()))


@bp.route("/cierre/<int:cid>/imprimir")
@login_required
def imprimir(cid):
    cc = q1("SELECT cc.*, u.nombre AS usuario FROM cierres_caja cc LEFT JOIN usuarios u ON u.id = cc.usuario_id "
            "WHERE cc.id = ?", (cid,))
    if not cc:
        abort(404)
    if not es_admin() and cc["fecha"] != today().isoformat():
        abort(403)
    c = metricas.caja_del_dia(parse_date(cc["fecha"]))
    return render_template("caja/imprimir.html", cc=cc, c=c)
