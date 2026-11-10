"""Pedidos por encargo: anticipo mínimo (50% por defecto), abonos, estados y entrega."""
from flask import Blueprint, abort, flash, g, redirect, render_template, request, url_for

from ..auth import es_admin, login_required
from ..db import q, q1, tx
from ..utils import (audit, config, now_str, parse_date, siguiente_numero, to_cents, to_int,
                     whatsapp_numero)
from .ventas import registrar_venta

bp = Blueprint("pedidos", __name__, url_prefix="/pedidos")
METODOS = ("efectivo", "transferencia", "tarjeta")


def cargar(pid):
    p = q1("SELECT * FROM v_pedidos_saldo WHERE id = ?", (pid,))
    if not p:
        abort(404)
    return p


@bp.route("/")
@login_required
def lista():
    estado = request.args.get("estado", "activos")
    if estado == "activos":
        filas = q("SELECT * FROM v_pedidos_saldo WHERE estado IN ('pendiente', 'recibido') "
                  "ORDER BY COALESCE(fecha_entrega, '9999'), id")
    elif estado in ("pendiente", "recibido", "entregado", "cancelado"):
        filas = q("SELECT * FROM v_pedidos_saldo WHERE estado = ? ORDER BY id DESC LIMIT 300", (estado,))
    else:
        filas = q("SELECT * FROM v_pedidos_saldo ORDER BY id DESC LIMIT 300")
    activos = q1("""SELECT COUNT(*) AS n, COALESCE(SUM(total), 0) AS total, COALESCE(SUM(abonado), 0) AS abonado,
                           COALESCE(SUM(balance), 0) AS balance
                    FROM v_pedidos_saldo WHERE estado IN ('pendiente', 'recibido')""")
    return render_template("pedidos/lista.html", pedidos=filas, estado=estado, activos=activos,
                           hoy=now_str()[:10])


@bp.route("/nuevo", methods=["GET", "POST"])
@login_required
def nuevo():
    minimo_pct = to_int(config("pedido_anticipo_minimo"), 50)
    clientes = q("SELECT id, nombre, telefono FROM clientes ORDER BY nombre")
    form = request.form
    if request.method == "POST":
        try:
            cliente_id = to_int(form.get("cliente_id"))
            if not q1("SELECT 1 FROM clientes WHERE id = ?", (cliente_id,)):
                raise ValueError("Seleccione el cliente (o regístrelo primero).")
            items = []
            descs, codigos = form.getlist("descripcion"), form.getlist("codigo")
            cants, precios = form.getlist("cantidad"), form.getlist("precio")
            costos = form.getlist("costo") if es_admin() else []
            for i, desc in enumerate(descs):
                desc = desc.strip()
                codigo = (codigos[i] if i < len(codigos) else "").strip()
                if not desc and not codigo:
                    continue
                prod = q1("SELECT * FROM productos WHERE codigo = ?", (codigo,)) if codigo else None
                if codigo and not prod:
                    raise ValueError(f"No existe un producto con el código {codigo}.")
                cantidad = to_int(cants[i] if i < len(cants) else 1, 0)
                precio = to_cents(precios[i] if i < len(precios) else "") or (prod["precio"] if prod else 0)
                costo = to_cents(costos[i]) if i < len(costos) and costos[i].strip() else (prod["costo"] if prod else 0)
                if cantidad <= 0 or precio <= 0:
                    raise ValueError(f"Revise cantidad y precio de «{desc or codigo}».")
                if not desc and prod:
                    desc = " ".join(x for x in (prod["nombre"], prod["color"], prod["talla"] and f"T/{prod['talla']}") if x)
                items.append({"producto_id": prod["id"] if prod else None, "descripcion": desc,
                              "cantidad": cantidad, "precio": precio, "costo": costo})
            if not items:
                raise ValueError("Agregue al menos un artículo al pedido.")
            total = sum(i["cantidad"] * i["precio"] for i in items)
            abono = to_cents(form.get("abono"))
            metodo = form.get("metodo", "efectivo")
            if metodo not in METODOS:
                raise ValueError("Método de pago inválido.")
            minimo = (total * minimo_pct + 99) // 100
            if abono < minimo:
                raise ValueError(f"Política de Kary Fashion: el anticipo mínimo es {minimo_pct}% "
                                 f"(RD${minimo / 100:,.2f} de RD${total / 100:,.2f}).")
            if abono > total:
                raise ValueError("El anticipo no puede ser mayor que el valor del pedido.")
            entrega = parse_date(form.get("fecha_entrega"))
            with tx():
                numero = siguiente_numero("pedido_proximo_numero")
                ahora = now_str()
                cur = g.db.execute("""INSERT INTO pedidos (numero, cliente_id, fecha, fecha_entrega, total, nota,
                                                           usuario_id, actualizado_en)
                                      VALUES (?,?,?,?,?,?,?,?)""",
                                   (numero, cliente_id, ahora, entrega.isoformat() if entrega else None, total,
                                    (form.get("nota") or "").strip() or None, g.user["id"], ahora))
                pid = cur.lastrowid
                for it in items:
                    g.db.execute("""INSERT INTO pedido_detalle (pedido_id, producto_id, descripcion, cantidad,
                                                                precio_unitario, costo_unitario)
                                    VALUES (?,?,?,?,?,?)""",
                                 (pid, it["producto_id"], it["descripcion"], it["cantidad"], it["precio"], it["costo"]))
                g.db.execute("""INSERT INTO pedido_abonos (pedido_id, fecha, tipo, monto, metodo, referencia, usuario_id)
                                VALUES (?,?, 'abono', ?,?,?,?)""",
                             (pid, ahora, abono, metodo, (form.get("referencia") or "").strip() or None, g.user["id"]))
                audit("crear", "pedido", pid, {"numero": numero, "total": total, "anticipo": abono})
            flash(f"Pedido #{numero} registrado con anticipo de RD${abono / 100:,.2f}.", "success")
            return redirect(url_for("pedidos.ver", pid=pid))
        except ValueError as e:
            flash(str(e), "danger")
    return render_template("pedidos/nuevo.html", clientes=clientes, minimo_pct=minimo_pct, form=form,
                           cliente_sel=to_int(request.args.get("cliente")))


@bp.route("/<int:pid>")
@login_required
def ver(pid):
    p = cargar(pid)
    detalle = q("""SELECT d.*, pr.codigo, pr.stock FROM pedido_detalle d
                   LEFT JOIN productos pr ON pr.id = d.producto_id WHERE d.pedido_id = ?""", (pid,))
    abonos = q("""SELECT a.*, u.nombre AS usuario FROM pedido_abonos a LEFT JOIN usuarios u ON u.id = a.usuario_id
                  WHERE a.pedido_id = ? ORDER BY a.id""", (pid,))
    venta = q1("SELECT id, numero FROM ventas WHERE id = ?", (p["venta_id"],)) if p["venta_id"] else None
    return render_template("pedidos/ver.html", p=p, detalle=detalle, abonos=abonos, venta=venta,
                           wa=whatsapp_numero(p["telefono"]), negocio_tel=config("negocio_telefono"))


@bp.route("/<int:pid>/abono", methods=["POST"])
@login_required
def abono(pid):
    p = cargar(pid)
    try:
        if p["estado"] not in ("pendiente", "recibido"):
            raise ValueError("Solo se pueden registrar abonos a pedidos activos.")
        monto = to_cents(request.form.get("monto"))
        metodo = request.form.get("metodo", "efectivo")
        if metodo not in METODOS or monto <= 0:
            raise ValueError("Indique un monto válido.")
        if monto > p["balance"]:
            raise ValueError(f"El abono supera el balance pendiente (RD${p['balance'] / 100:,.2f}).")
        with tx():
            g.db.execute("""INSERT INTO pedido_abonos (pedido_id, fecha, tipo, monto, metodo, referencia, usuario_id)
                            VALUES (?,?, 'abono', ?,?,?,?)""",
                         (pid, now_str(), monto, metodo, (request.form.get("referencia") or "").strip() or None,
                          g.user["id"]))
            g.db.execute("UPDATE pedidos SET actualizado_en = ? WHERE id = ?", (now_str(), pid))
            audit("abono", "pedido", pid, {"monto": monto, "metodo": metodo})
        flash(f"Abono de RD${monto / 100:,.2f} registrado.", "success")
    except ValueError as e:
        flash(str(e), "danger")
    return redirect(url_for("pedidos.ver", pid=pid))


@bp.route("/<int:pid>/estado", methods=["POST"])
@login_required
def estado(pid):
    p = cargar(pid)
    nuevo = request.form.get("estado")
    if p["estado"] == "pendiente" and nuevo == "recibido":
        with tx():
            g.db.execute("UPDATE pedidos SET estado = 'recibido', actualizado_en = ? WHERE id = ?", (now_str(), pid))
            audit("cambiar_estado", "pedido", pid, {"de": p["estado"], "a": nuevo})
        flash("Pedido marcado como RECIBIDO en tienda. Ya puede avisarle a la clienta.", "success")
    elif p["estado"] == "recibido" and nuevo == "pendiente":
        with tx():
            g.db.execute("UPDATE pedidos SET estado = 'pendiente', actualizado_en = ? WHERE id = ?", (now_str(), pid))
            audit("cambiar_estado", "pedido", pid, {"de": p["estado"], "a": nuevo})
        flash("Pedido devuelto a PENDIENTE.", "info")
    else:
        flash("Cambio de estado no permitido.", "danger")
    return redirect(url_for("pedidos.ver", pid=pid))


@bp.route("/<int:pid>/entregar", methods=["POST"])
@login_required
def entregar(pid):
    """Al entregar se cobra el balance completo y se genera la factura (no hay ventas a crédito)."""
    p = cargar(pid)
    try:
        if p["estado"] not in ("pendiente", "recibido"):
            raise ValueError("Este pedido no se puede entregar.")
        detalle = q("SELECT * FROM pedido_detalle WHERE pedido_id = ?", (pid,))
        items = [{"producto_id": d["producto_id"], "descripcion": d["descripcion"], "cantidad": d["cantidad"],
                  "precio_unitario": d["precio_unitario"],
                  "costo_unitario": None if d["producto_id"] else d["costo_unitario"]} for d in detalle]
        f = request.form
        pagos = {m: {"monto": to_cents(f.get(f"{m}_monto")), "referencia": f.get(f"{m}_referencia")}
                 for m in ("transferencia", "tarjeta")}
        recibido = f.get("efectivo_recibido")
        with tx():
            vid = registrar_venta(items, pagos, cliente_id=p["cliente_id"], pedido_id=pid, anticipo=p["abonado"],
                                  efectivo_recibido=to_cents(recibido) if (recibido or "").strip() else None,
                                  nota=f"Entrega de pedido #{p['numero']}")
            g.db.execute("UPDATE pedidos SET estado = 'entregado', venta_id = ?, actualizado_en = ? WHERE id = ?",
                         (vid, now_str(), pid))
            audit("entregar", "pedido", pid, {"venta_id": vid})
        flash("Pedido entregado y facturado.", "success")
        return redirect(url_for("ventas.ver", vid=vid))
    except ValueError as e:
        flash(str(e), "danger")
    except Exception as e:
        if "CHECK constraint" in str(e):
            flash("No hay existencia suficiente de un artículo del pedido. Registre primero la compra/entrada.", "danger")
        else:
            raise
    return redirect(url_for("pedidos.ver", pid=pid))


@bp.route("/<int:pid>/cancelar", methods=["POST"])
@login_required
def cancelar(pid):
    p = cargar(pid)
    try:
        if p["estado"] not in ("pendiente", "recibido"):
            raise ValueError("Este pedido ya no se puede cancelar.")
        motivo = (request.form.get("motivo") or "").strip()
        if not motivo:
            raise ValueError("Escriba el motivo de la cancelación.")
        devolver = to_cents(request.form.get("devolver"))
        metodo = request.form.get("metodo", "efectivo")
        if devolver < 0 or devolver > p["abonado"]:
            raise ValueError("El monto a devolver no puede ser mayor que lo abonado.")
        if devolver and not es_admin():
            raise ValueError("Solo la administradora puede autorizar devoluciones de dinero.")
        with tx():
            if devolver:
                g.db.execute("""INSERT INTO pedido_abonos (pedido_id, fecha, tipo, monto, metodo, referencia, usuario_id)
                                VALUES (?,?, 'devolucion', ?,?,?,?)""",
                             (pid, now_str(), devolver, metodo if metodo in METODOS else "efectivo", motivo, g.user["id"]))
            g.db.execute("UPDATE pedidos SET estado = 'cancelado', nota = COALESCE(nota || ' | ', '') || ?, "
                         "actualizado_en = ? WHERE id = ?", (f"Cancelado: {motivo}", now_str(), pid))
            audit("cancelar", "pedido", pid, {"motivo": motivo, "devuelto": devolver, "abonado": p["abonado"]})
        flash("Pedido cancelado." + (f" Se devolvieron RD${devolver / 100:,.2f}." if devolver else
                                     " El anticipo queda retenido."), "success")
    except ValueError as e:
        flash(str(e), "danger")
    return redirect(url_for("pedidos.ver", pid=pid))
