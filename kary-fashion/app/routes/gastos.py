from flask import Blueprint, abort, flash, g, redirect, render_template, request, url_for

from ..auth import admin_required
from ..db import q, q1, tx
from ..utils import CATEGORIAS_GASTO, audit, now_str, parse_date, rango_periodo, to_cents, today

bp = Blueprint("gastos", __name__, url_prefix="/gastos")


@bp.route("/", methods=["GET", "POST"])
@admin_required
def lista():
    if request.method == "POST":
        f = request.form
        try:
            categoria = f.get("categoria")
            if categoria not in CATEGORIAS_GASTO:
                raise ValueError("Seleccione la categoría del gasto.")
            descripcion = (f.get("descripcion") or "").strip() or CATEGORIAS_GASTO[categoria]
            monto = to_cents(f.get("monto"))
            if monto <= 0:
                raise ValueError("Indique el monto del gasto.")
            metodo = f.get("metodo_pago", "efectivo")
            if metodo not in ("efectivo", "transferencia", "tarjeta"):
                raise ValueError("Método de pago inválido.")
            fecha = parse_date(f.get("fecha"), today())
            de_caja = 1 if f.get("pagado_de_caja") and metodo == "efectivo" else 0
            with tx():
                cur = g.db.execute("""INSERT INTO gastos (fecha, categoria, descripcion, monto, metodo_pago,
                                                          pagado_de_caja, usuario_id, creado_en)
                                      VALUES (?,?,?,?,?,?,?,?)""",
                                   (fecha.isoformat(), categoria, descripcion, monto, metodo, de_caja,
                                    g.user["id"], now_str()))
                audit("crear", "gasto", cur.lastrowid, {"monto": monto, "categoria": categoria, "descripcion": descripcion})
            flash("Gasto registrado.", "success")
            return redirect(url_for("gastos.lista", periodo=request.args.get("periodo", "mes")))
        except ValueError as e:
            flash(str(e), "danger")
    periodo = request.args.get("periodo", "mes")
    d1, d2, etiqueta, _ = rango_periodo(periodo, request.args.get("desde"), request.args.get("hasta"))
    gastos = q("""SELECT ga.*, u.nombre AS usuario FROM gastos ga LEFT JOIN usuarios u ON u.id = ga.usuario_id
                  WHERE ga.fecha BETWEEN ? AND ? ORDER BY ga.fecha DESC, ga.id DESC""",
               (d1.isoformat(), d2.isoformat()))
    por_cat = {}
    for x in gastos:
        por_cat[x["categoria"]] = por_cat.get(x["categoria"], 0) + x["monto"]
    return render_template("gastos/lista.html", gastos=gastos, periodo=periodo, etiqueta=etiqueta, d1=d1, d2=d2,
                           total=sum(x["monto"] for x in gastos),
                           por_cat=sorted(por_cat.items(), key=lambda kv: -kv[1]), hoy=today().isoformat())


@bp.route("/<int:gid>/eliminar", methods=["POST"])
@admin_required
def eliminar(gid):
    x = q1("SELECT * FROM gastos WHERE id = ?", (gid,))
    if not x:
        abort(404)
    if q1("SELECT 1 FROM cierres_caja WHERE fecha = ?", (x["fecha"],)) and x["pagado_de_caja"]:
        flash("Ese día ya tiene cierre de caja; el gasto salió de caja y no se puede eliminar.", "danger")
        return redirect(url_for("gastos.lista"))
    with tx():
        g.db.execute("DELETE FROM gastos WHERE id = ?", (gid,))
        audit("eliminar", "gasto", gid, dict(x))
    flash("Gasto eliminado (queda constancia en el historial).", "success")
    return redirect(url_for("gastos.lista"))
