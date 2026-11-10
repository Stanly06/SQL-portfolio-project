from flask import Blueprint, abort, flash, g, jsonify, redirect, render_template, request, url_for

from ..auth import login_required
from ..db import q, q1, tx
from ..utils import audit, now_str, whatsapp_numero

bp = Blueprint("clientes", __name__, url_prefix="/clientes")
CAMPOS = ("nombre", "telefono", "cedula_rnc", "direccion", "notas")


def leer(form):
    d = {c: (form.get(c) or "").strip() for c in CAMPOS}
    if not d["nombre"]:
        raise ValueError("El nombre del cliente es obligatorio.")
    return d


def crear_cliente(d):
    cur = g.db.execute("""INSERT INTO clientes (nombre, telefono, cedula_rnc, direccion, notas, creado_en)
                          VALUES (?,?,?,?,?,?)""",
                       (d["nombre"], d["telefono"], d["cedula_rnc"], d["direccion"], d["notas"], now_str()))
    audit("crear", "cliente", cur.lastrowid, d)
    return cur.lastrowid


@bp.route("/")
@login_required
def lista():
    buscar = (request.args.get("q") or "").strip()
    params, where = [], ""
    if buscar:
        where = "WHERE c.nombre LIKE ? OR c.telefono LIKE ? OR c.cedula_rnc LIKE ?"
        params = [f"%{buscar}%"] * 3
    clientes = q(f"""SELECT c.*,
                            (SELECT COUNT(*) FROM ventas v WHERE v.cliente_id = c.id AND v.estado = 'completada') AS compras,
                            (SELECT COALESCE(SUM(total), 0) FROM ventas v WHERE v.cliente_id = c.id AND v.estado = 'completada') AS total,
                            (SELECT MAX(fecha) FROM ventas v WHERE v.cliente_id = c.id AND v.estado = 'completada') AS ultima,
                            (SELECT COALESCE(SUM(balance), 0) FROM v_pedidos_saldo p
                              WHERE p.cliente_id = c.id AND p.estado IN ('pendiente', 'recibido')) AS balance
                     FROM clientes c {where} ORDER BY c.nombre LIMIT 500""", params)
    return render_template("clientes/lista.html", clientes=clientes, buscar=buscar)


@bp.route("/nuevo", methods=["GET", "POST"])
@login_required
def nuevo():
    d = {}
    if request.method == "POST":
        try:
            d = leer(request.form)
            with tx():
                cid = crear_cliente(d)
            flash("Cliente registrado.", "success")
            return redirect(url_for("clientes.ver", cid=cid))
        except ValueError as e:
            flash(str(e), "danger")
    return render_template("clientes/form.html", c=d)


@bp.route("/<int:cid>")
@login_required
def ver(cid):
    c = q1("SELECT * FROM clientes WHERE id = ?", (cid,))
    if not c:
        abort(404)
    ventas = q("""SELECT v.*, (SELECT SUM(cantidad) FROM venta_detalle d WHERE d.venta_id = v.id) AS unidades
                  FROM ventas v WHERE v.cliente_id = ? ORDER BY v.id DESC""", (cid,))
    productos = q("""SELECT descripcion, SUM(cantidad) AS unidades, SUM(venta_neta) AS total, MAX(dia) AS ultima
                     FROM v_lineas_vendidas WHERE cliente_id = ? GROUP BY descripcion ORDER BY ultima DESC""", (cid,))
    pedidos = q("SELECT * FROM v_pedidos_saldo WHERE cliente_id = ? ORDER BY id DESC", (cid,))
    validas = [v for v in ventas if v["estado"] == "completada"]
    resumen = {"compras": len(validas), "total": sum(v["total"] for v in validas),
               "promedio": (sum(v["total"] for v in validas) // len(validas)) if validas else 0}
    return render_template("clientes/ver.html", c=c, ventas=ventas, productos=productos, pedidos=pedidos,
                           resumen=resumen, wa=whatsapp_numero(c["telefono"]))


@bp.route("/<int:cid>/editar", methods=["GET", "POST"])
@login_required
def editar(cid):
    c = q1("SELECT * FROM clientes WHERE id = ?", (cid,))
    if not c:
        abort(404)
    if request.method == "POST":
        try:
            d = leer(request.form)
            with tx():
                g.db.execute("""UPDATE clientes SET nombre=?, telefono=?, cedula_rnc=?, direccion=?, notas=?
                                WHERE id=?""", (*[d[k] for k in CAMPOS], cid))
                cambios = {k: {"antes": c[k], "despues": v} for k, v in d.items() if (c[k] or "") != v}
                if cambios:
                    audit("modificar", "cliente", cid, cambios)
            flash("Cliente actualizado.", "success")
            return redirect(url_for("clientes.ver", cid=cid))
        except ValueError as e:
            flash(str(e), "danger")
    return render_template("clientes/form.html", c=c)


@bp.route("/api/buscar")
@login_required
def api_buscar():
    texto = (request.args.get("q") or "").strip()
    if not texto:
        return jsonify([])
    like = f"%{texto}%"
    filas = q("""SELECT id, nombre, telefono, cedula_rnc FROM clientes
                 WHERE nombre LIKE ? OR telefono LIKE ? OR cedula_rnc LIKE ? ORDER BY nombre LIMIT 15""",
              (like, like, like))
    return jsonify([dict(f) for f in filas])


@bp.route("/api/crear", methods=["POST"])
@login_required
def api_crear():
    datos = request.get_json(silent=True) or {}
    try:
        d = leer(datos)
        with tx():
            cid = crear_cliente(d)
    except ValueError as e:
        return jsonify({"ok": False, "error": str(e)}), 400
    return jsonify({"ok": True, "cliente": {"id": cid, "nombre": d["nombre"], "telefono": d["telefono"],
                                            "cedula_rnc": d["cedula_rnc"]}})
