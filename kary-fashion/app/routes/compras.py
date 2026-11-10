"""Compras de mercancía: actualizan el inventario y el costo promedio de cada producto.
El transporte y otros costos de la compra se reparten entre los artículos (costo real)."""
from datetime import timedelta

from flask import Blueprint, abort, flash, g, redirect, render_template, request, url_for

from ..auth import admin_required
from ..db import q, q1, tx
from ..utils import audit, mover_inventario, now_str, parse_date, to_cents, to_int, today

bp = Blueprint("compras", __name__, url_prefix="/compras")


def prorratear(lineas, extra):
    """Reparte 'extra' (transporte + otros) proporcionalmente al valor de cada línea."""
    base = sum(l["cantidad"] * l["costo"] for l in lineas)
    unidades = sum(l["cantidad"] for l in lineas)
    for l in lineas:
        if extra <= 0:
            l["extra_unidad"] = 0
        elif base > 0:
            l["extra_unidad"] = round(extra * l["costo"] / base)          # (extra * valor_linea / base) / cantidad
        else:
            l["extra_unidad"] = round(extra / unidades)
        l["costo_real"] = l["costo"] + l["extra_unidad"]
    return lineas


def registrar_compra(proveedor_id, fecha, factura, transporte, otros, lineas, nota):
    lineas = prorratear(lineas, transporte + otros)
    subtotal = sum(l["cantidad"] * l["costo"] for l in lineas)
    ahora = now_str()
    fecha_txt = f"{fecha.isoformat()} {ahora[11:]}"
    cur = g.db.execute("""INSERT INTO compras (proveedor_id, fecha, factura_proveedor, subtotal, transporte,
                                               otros_costos, total, nota, usuario_id, creado_en)
                          VALUES (?,?,?,?,?,?,?,?,?,?)""",
                       (proveedor_id, fecha_txt, factura, subtotal, transporte, otros,
                        subtotal + transporte + otros, nota, g.user["id"], ahora))
    cid = cur.lastrowid
    for l in lineas:
        p = q1("SELECT stock, costo, precio, proveedor_id FROM productos WHERE id = ?", (l["producto_id"],))
        # Costo promedio ponderado: mezcla lo que había con lo que entra
        nuevo_costo = round((p["stock"] * p["costo"] + l["cantidad"] * l["costo_real"]) / (p["stock"] + l["cantidad"]))
        nuevo_precio = l["precio"] if l.get("precio") else p["precio"]
        g.db.execute("""UPDATE productos SET costo = ?, precio = ?, proveedor_id = COALESCE(proveedor_id, ?),
                               actualizado_en = ? WHERE id = ?""",
                     (nuevo_costo, nuevo_precio, proveedor_id, ahora, l["producto_id"]))
        g.db.execute("""INSERT INTO compra_detalle (compra_id, producto_id, cantidad, costo_unitario,
                                                    costo_extra_unidad, costo_real_unitario)
                        VALUES (?,?,?,?,?,?)""",
                     (cid, l["producto_id"], l["cantidad"], l["costo"], l["extra_unidad"], l["costo_real"]))
        mover_inventario(l["producto_id"], l["cantidad"], "compra", referencia=f"compra:{cid}",
                         nota=f"Compra #{cid}" + (f" - Fact. {factura}" if factura else ""),
                         costo_unitario=l["costo_real"])
    audit("crear", "compra", cid, {"total": subtotal + transporte + otros, "lineas": len(lineas)})
    return cid


@bp.route("/")
@admin_required
def lista():
    hoy = today()
    d1 = parse_date(request.args.get("desde"), hoy - timedelta(days=90))
    d2 = parse_date(request.args.get("hasta"), hoy)
    compras = q("""SELECT c.*, p.nombre AS proveedor,
                          (SELECT SUM(cantidad) FROM compra_detalle d WHERE d.compra_id = c.id) AS unidades
                   FROM compras c LEFT JOIN proveedores p ON p.id = c.proveedor_id
                   WHERE date(c.fecha) BETWEEN ? AND ? ORDER BY c.fecha DESC, c.id DESC""",
                (d1.isoformat(), d2.isoformat()))
    tot = {k: sum(c[k] for c in compras) for k in ("subtotal", "transporte", "otros_costos", "total")}
    return render_template("compras/lista.html", compras=compras, d1=d1, d2=d2, tot=tot)


@bp.route("/nueva", methods=["GET", "POST"])
@admin_required
def nueva():
    proveedores = q("SELECT id, nombre FROM proveedores WHERE activo = 1 ORDER BY nombre")
    precarga = []
    if (pid := to_int(request.args.get("producto"))):
        pr = q1("SELECT id, codigo, nombre, talla, color, costo, precio, stock FROM productos WHERE id = ?", (pid,))
        if pr:
            precarga.append(dict(pr))
    if request.method == "POST":
        f = request.form
        try:
            lineas = []
            for pid_, cant, costo, precio in zip(f.getlist("producto_id"), f.getlist("cantidad"),
                                                 f.getlist("costo"), f.getlist("precio")):
                pid_ = to_int(pid_)
                if not pid_:
                    continue
                if not q1("SELECT 1 FROM productos WHERE id = ?", (pid_,)):
                    raise ValueError("Uno de los productos no existe.")
                cantidad = to_int(cant, 0)
                if cantidad <= 0:
                    raise ValueError("Las cantidades deben ser mayores que cero.")
                lineas.append({"producto_id": pid_, "cantidad": cantidad, "costo": to_cents(costo),
                               "precio": to_cents(precio)})
            if not lineas:
                raise ValueError("Agregue al menos un producto a la compra.")
            transporte, otros = to_cents(f.get("transporte")), to_cents(f.get("otros_costos"))
            if transporte < 0 or otros < 0 or any(l["costo"] < 0 for l in lineas):
                raise ValueError("Los montos no pueden ser negativos.")
            proveedor_id = to_int(f.get("proveedor_id")) or None
            fecha = parse_date(f.get("fecha"), today())
            with tx():
                cid = registrar_compra(proveedor_id, fecha, (f.get("factura_proveedor") or "").strip() or None,
                                       transporte, otros, lineas, (f.get("nota") or "").strip() or None)
            flash("Compra registrada. El inventario y los costos se actualizaron.", "success")
            return redirect(url_for("compras.ver", cid=cid))
        except ValueError as e:
            flash(str(e), "danger")
    return render_template("compras/nueva.html", proveedores=proveedores, precarga=precarga,
                           hoy=today().isoformat())


@bp.route("/<int:cid>")
@admin_required
def ver(cid):
    c = q1("""SELECT c.*, p.nombre AS proveedor, u.nombre AS usuario FROM compras c
              LEFT JOIN proveedores p ON p.id = c.proveedor_id LEFT JOIN usuarios u ON u.id = c.usuario_id
              WHERE c.id = ?""", (cid,))
    if not c:
        abort(404)
    detalle = q("""SELECT d.*, p.codigo, p.nombre, p.talla, p.color, p.precio
                   FROM compra_detalle d JOIN productos p ON p.id = d.producto_id WHERE d.compra_id = ?""", (cid,))
    return render_template("compras/ver.html", c=c, detalle=detalle)
