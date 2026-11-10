from flask import Blueprint, abort, flash, g, redirect, render_template, request, url_for

from ..auth import admin_required
from ..db import q, q1, tx
from ..utils import audit, now_str, whatsapp_numero

bp = Blueprint("proveedores", __name__, url_prefix="/proveedores")
CAMPOS = ("nombre", "contacto", "telefono", "whatsapp", "email", "rnc", "direccion", "notas")


def leer(form):
    d = {c: (form.get(c) or "").strip() for c in CAMPOS}
    if not d["nombre"]:
        raise ValueError("El nombre del proveedor es obligatorio.")
    return d


@bp.route("/")
@admin_required
def lista():
    provs = q("""SELECT p.*, COUNT(c.id) AS compras, COALESCE(SUM(c.total), 0) AS total, MAX(c.fecha) AS ultima
                 FROM proveedores p LEFT JOIN compras c ON c.proveedor_id = p.id
                 GROUP BY p.id ORDER BY p.activo DESC, p.nombre""")
    return render_template("proveedores/lista.html", proveedores=provs)


@bp.route("/nuevo", methods=["GET", "POST"])
@admin_required
def nuevo():
    d = {}
    if request.method == "POST":
        try:
            d = leer(request.form)
            with tx():
                cur = g.db.execute(f"""INSERT INTO proveedores ({', '.join(CAMPOS)}, creado_en)
                                       VALUES ({', '.join('?' * len(CAMPOS))}, ?)""",
                                   (*[d[c] for c in CAMPOS], now_str()))
                audit("crear", "proveedor", cur.lastrowid, d)
            flash("Proveedor registrado.", "success")
            return redirect(url_for("proveedores.ver", pid=cur.lastrowid))
        except ValueError as e:
            flash(str(e), "danger")
    return render_template("proveedores/form.html", p=d)


@bp.route("/<int:pid>")
@admin_required
def ver(pid):
    p = q1("SELECT * FROM proveedores WHERE id = ?", (pid,))
    if not p:
        abort(404)
    compras = q("""SELECT c.*, (SELECT SUM(cantidad) FROM compra_detalle d WHERE d.compra_id = c.id) AS unidades
                   FROM compras c WHERE c.proveedor_id = ? ORDER BY c.fecha DESC""", (pid,))
    productos = q("""SELECT pr.id, pr.codigo, pr.nombre, pr.talla, pr.color, SUM(d.cantidad) AS unidades,
                            MAX(c.fecha) AS ultima, MIN(d.costo_unitario) AS costo_min, MAX(d.costo_unitario) AS costo_max
                     FROM compra_detalle d JOIN compras c ON c.id = d.compra_id JOIN productos pr ON pr.id = d.producto_id
                     WHERE c.proveedor_id = ? GROUP BY pr.id ORDER BY ultima DESC""", (pid,))
    total = sum(c["total"] for c in compras)
    return render_template("proveedores/ver.html", p=p, compras=compras, productos=productos, total=total,
                           wa=whatsapp_numero(p["whatsapp"] or p["telefono"]))


@bp.route("/<int:pid>/editar", methods=["GET", "POST"])
@admin_required
def editar(pid):
    p = q1("SELECT * FROM proveedores WHERE id = ?", (pid,))
    if not p:
        abort(404)
    if request.method == "POST":
        try:
            d = leer(request.form)
            activo = 1 if request.form.get("activo") else 0
            with tx():
                g.db.execute(f"UPDATE proveedores SET {', '.join(c + ' = ?' for c in CAMPOS)}, activo = ? WHERE id = ?",
                             (*[d[c] for c in CAMPOS], activo, pid))
                audit("modificar", "proveedor", pid, {k: v for k, v in d.items() if (p[k] or "") != v})
            flash("Proveedor actualizado.", "success")
            return redirect(url_for("proveedores.ver", pid=pid))
        except ValueError as e:
            flash(str(e), "danger")
    return render_template("proveedores/form.html", p=p)
