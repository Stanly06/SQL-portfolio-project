from datetime import timedelta

from flask import (Blueprint, Response, abort, flash, g, jsonify, redirect, render_template, request,
                   url_for)

from ..auth import admin_required, es_admin, login_required
from ..db import q, q1, tx
from ..pdf import factura_pdf
from ..utils import (audit, config, config_all, mover_inventario, now_str, parse_date, siguiente_numero,
                     to_cents, to_int, today, whatsapp_numero)

bp = Blueprint("ventas", __name__, url_prefix="/ventas")


class VentaError(ValueError):
    pass


# =====================================================================
#  Lógica de negocio de una venta (usada por el punto de venta y por la
#  entrega de pedidos). Todo ocurre dentro de UNA transacción.
# =====================================================================
def registrar_venta(items, pagos, descuento_general=0, cliente_id=None, efectivo_recibido=None,
                    tipo_ncf=None, nota=None, pedido_id=None, anticipo=0):
    if not items:
        raise VentaError("Agregue al menos un artículo.")
    if descuento_general < 0:
        raise VentaError("El descuento no puede ser negativo.")

    # 1) Armar las líneas con precio y costo tomados de la base de datos
    lineas = []
    for it in items:
        cantidad = to_int(it.get("cantidad"), 0)
        if cantidad <= 0:
            raise VentaError("Las cantidades deben ser mayores que cero.")
        pid = to_int(it.get("producto_id")) or None
        if pid:
            p = q1("SELECT * FROM productos WHERE id = ? AND activo = 1", (pid,))
            if not p:
                raise VentaError("Uno de los productos ya no está disponible.")
            if p["stock"] < cantidad:
                raise VentaError(f"Solo quedan {p['stock']} unidad(es) de «{p['nombre']}».")
            precio = p["precio"] if it.get("precio_unitario") is None else int(it["precio_unitario"])
            costo = p["costo"] if it.get("costo_unitario") is None else int(it["costo_unitario"])
            desc = " ".join(x for x in (p["nombre"], p["modelo"], p["color"],
                                        f"T/{p['talla']}" if p["talla"] else "") if x)
            codigo = p["codigo"]
        else:
            if pedido_id is None:
                raise VentaError("Artículo inválido.")
            precio, costo = int(it["precio_unitario"]), int(it.get("costo_unitario") or 0)
            desc, codigo = it["descripcion"], None
        bruto = cantidad * precio
        d_linea = max(int(it.get("descuento") or 0), 0)
        if d_linea > bruto:
            raise VentaError(f"El descuento de «{desc}» es mayor que su valor.")
        lineas.append({"producto_id": pid, "codigo": codigo, "descripcion": desc, "cantidad": cantidad,
                       "precio_unitario": precio, "costo_unitario": costo, "descuento": d_linea, "bruto": bruto})

    subtotal = sum(l["bruto"] for l in lineas)
    desc_lineas = sum(l["descuento"] for l in lineas)
    if descuento_general > subtotal - desc_lineas:
        raise VentaError("El descuento es mayor que el total de la venta.")
    descuento_total = desc_lineas + descuento_general

    # Límite de descuento para empleados
    if not es_admin() and subtotal:
        maximo = to_int(config("descuento_max_empleado"), 10)
        if descuento_total * 100 > subtotal * maximo:
            raise VentaError(f"Los empleados pueden dar hasta {maximo}% de descuento. Pida autorización a la administradora.")

    # 2) Repartir el descuento general entre las líneas (para que la ganancia por producto sea real)
    if descuento_general:
        base = subtotal - desc_lineas
        repartido = 0
        for l in lineas:
            parte = descuento_general * (l["bruto"] - l["descuento"]) // base if base else 0
            l["descuento"] += parte
            repartido += parte
        resto = descuento_general - repartido
        for l in sorted(lineas, key=lambda x: x["bruto"] - x["descuento"], reverse=True):
            if resto <= 0:
                break
            margen = l["bruto"] - l["descuento"]
            usar = min(resto, margen)
            l["descuento"] += usar
            resto -= usar
    for l in lineas:
        l["total"] = l["bruto"] - l["descuento"]
    total = subtotal - descuento_total

    # 3) Pagos (no se permiten ventas a crédito: lo pagado debe cubrir el total)
    registro_pagos = []
    if anticipo:
        registro_pagos.append({"metodo": "anticipo", "monto": min(anticipo, total), "referencia": None})
    otros = 0
    for metodo in ("transferencia", "tarjeta"):
        monto = int((pagos.get(metodo) or {}).get("monto") or 0)
        if monto < 0:
            raise VentaError("Montos de pago inválidos.")
        if monto:
            registro_pagos.append({"metodo": metodo, "monto": monto,
                                   "referencia": ((pagos.get(metodo) or {}).get("referencia") or "").strip()[:60] or None})
            otros += monto
    cubierto = sum(p["monto"] for p in registro_pagos)
    if cubierto > total:
        raise VentaError("Los pagos con transferencia/tarjeta superan el total. Revise los montos.")
    efectivo = total - cubierto
    recibido = efectivo if efectivo_recibido is None else int(efectivo_recibido)
    if efectivo > 0:
        if recibido < efectivo:
            raise VentaError(f"Falta dinero: el efectivo recibido no cubre el total. "
                             f"Faltan RD${(efectivo - recibido) / 100:,.2f}.")
        registro_pagos.append({"metodo": "efectivo", "monto": efectivo, "referencia": None})
    else:
        recibido = 0
    cambio = recibido - efectivo if efectivo > 0 else 0

    # 4) Comprobante fiscal (opcional)
    ncf = None
    cliente = q1("SELECT * FROM clientes WHERE id = ?", (cliente_id,)) if cliente_id else None
    if cliente_id and not cliente:
        raise VentaError("El cliente seleccionado no existe.")
    if config("fiscal_activo") == "1":
        tipo_ncf = tipo_ncf or config("fiscal_tipo_defecto")
        comp = q1("SELECT * FROM comprobantes_fiscales WHERE tipo = ? AND activo = 1", (tipo_ncf,))
        if not comp:
            raise VentaError(f"El comprobante {tipo_ncf} no está configurado o activo.")
        if comp["proximo"] > comp["hasta"]:
            raise VentaError(f"Se agotó la secuencia de comprobantes {tipo_ncf}. Solicite más a la DGII.")
        if comp["vence"] and comp["vence"] < today().isoformat():
            raise VentaError(f"La secuencia de comprobantes {tipo_ncf} está vencida.")
        if tipo_ncf in ("B01", "E31") and not (cliente and cliente["cedula_rnc"]):
            raise VentaError("La factura de crédito fiscal requiere un cliente con RNC/cédula.")
        ncf = f"{tipo_ncf}{comp['proximo']:0{11 - len(tipo_ncf) if tipo_ncf.startswith('B') else 13 - len(tipo_ncf)}d}"
        g.db.execute("UPDATE comprobantes_fiscales SET proximo = proximo + 1 WHERE tipo = ?", (tipo_ncf,))
    else:
        tipo_ncf = None
    tasa = to_int(config("itbis_tasa"), 18)
    itbis = total - round(total * 100 / (100 + tasa)) if tasa else 0

    # 5) Guardar
    numero = siguiente_numero("factura_proximo_numero")
    while q1("SELECT 1 FROM ventas WHERE numero = ?", (numero,)):
        numero = siguiente_numero("factura_proximo_numero")
    cur = g.db.execute(
        """INSERT INTO ventas (numero, fecha, cliente_id, cliente_nombre, usuario_id, subtotal, descuento, total,
                               itbis, ncf, tipo_ncf, efectivo_recibido, cambio, pedido_id, nota)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        (numero, now_str(), cliente_id, cliente["nombre"] if cliente else None, g.user["id"], subtotal,
         descuento_total, total, itbis, ncf, tipo_ncf, recibido, cambio, pedido_id, (nota or "").strip() or None))
    vid = cur.lastrowid
    for l in lineas:
        g.db.execute("""INSERT INTO venta_detalle (venta_id, producto_id, codigo, descripcion, cantidad,
                                                   precio_unitario, costo_unitario, descuento, total)
                        VALUES (?,?,?,?,?,?,?,?,?)""",
                     (vid, l["producto_id"], l["codigo"], l["descripcion"], l["cantidad"], l["precio_unitario"],
                      l["costo_unitario"], l["descuento"], l["total"]))
        if l["producto_id"]:
            mover_inventario(l["producto_id"], -l["cantidad"], "venta", referencia=f"venta:{vid}",
                             nota=f"Factura #{numero}", costo_unitario=l["costo_unitario"])
    for p in registro_pagos:
        g.db.execute("INSERT INTO venta_pagos (venta_id, metodo, monto, referencia) VALUES (?,?,?,?)",
                     (vid, p["metodo"], p["monto"], p["referencia"]))
    audit("crear", "venta", vid, {"numero": numero, "total": total, "pagos": registro_pagos})
    return vid


def anular_venta(vid, motivo):
    v = q1("SELECT * FROM ventas WHERE id = ?", (vid,))
    if not v:
        abort(404)
    if v["estado"] == "anulada":
        raise VentaError("Esta factura ya estaba anulada.")
    g.db.execute("""UPDATE ventas SET estado = 'anulada', anulada_por = ?, anulada_en = ?, motivo_anulacion = ?
                    WHERE id = ?""", (g.user["id"], now_str(), motivo, vid))
    for d in q("SELECT * FROM venta_detalle WHERE venta_id = ? AND producto_id IS NOT NULL", (vid,)):
        mover_inventario(d["producto_id"], d["cantidad"], "anulacion", referencia=f"venta:{vid}",
                         nota=f"Anulación factura #{v['numero']}", costo_unitario=d["costo_unitario"])
    if v["pedido_id"]:
        g.db.execute("UPDATE pedidos SET estado = 'recibido', venta_id = NULL, actualizado_en = ? WHERE id = ?",
                     (now_str(), v["pedido_id"]))
    audit("anular", "venta", vid, {"numero": v["numero"], "total": v["total"], "motivo": motivo})


def cargar_factura(vid):
    v = q1("""SELECT v.*, u.nombre AS vendedor, c.telefono AS cliente_telefono, c.cedula_rnc AS cliente_rnc,
                     ua.nombre AS anulada_por_nombre, pe.numero AS pedido_numero
              FROM ventas v JOIN usuarios u ON u.id = v.usuario_id
              LEFT JOIN clientes c ON c.id = v.cliente_id
              LEFT JOIN usuarios ua ON ua.id = v.anulada_por
              LEFT JOIN pedidos pe ON pe.id = v.pedido_id
              WHERE v.id = ?""", (vid,))
    if not v:
        abort(404)
    lineas = q("SELECT * FROM venta_detalle WHERE venta_id = ? ORDER BY id", (vid,))
    pagos = q("SELECT * FROM venta_pagos WHERE venta_id = ? ORDER BY id", (vid,))
    return v, lineas, pagos


# =====================================================================
#  Vistas
# =====================================================================
@bp.route("/nueva")
@login_required
def nueva():
    comprobantes = q("SELECT * FROM comprobantes_fiscales WHERE activo = 1 ORDER BY tipo") \
        if config("fiscal_activo") == "1" else []
    return render_template("ventas/pos.html", comprobantes=comprobantes,
                           fiscal_defecto=config("fiscal_tipo_defecto"),
                           desc_max=to_int(config("descuento_max_empleado"), 10))


@bp.route("/api/registrar", methods=["POST"])
@login_required
def api_registrar():
    datos = request.get_json(silent=True) or {}
    try:
        items = [{"producto_id": it.get("producto_id"), "cantidad": it.get("cantidad"),
                  "descuento": to_cents(it.get("descuento"))} for it in datos.get("items", [])]
        pagos = {m: {"monto": to_cents((datos.get("pagos", {}).get(m) or {}).get("monto")),
                     "referencia": (datos.get("pagos", {}).get(m) or {}).get("referencia")}
                 for m in ("transferencia", "tarjeta")}
        recibido = datos.get("efectivo_recibido")
        with tx():
            vid = registrar_venta(
                items, pagos,
                descuento_general=to_cents(datos.get("descuento_general")),
                cliente_id=to_int(datos.get("cliente_id")) or None,
                efectivo_recibido=None if recibido in (None, "") else to_cents(recibido),
                tipo_ncf=datos.get("tipo_ncf") or None,
                nota=datos.get("nota"))
    except ValueError as e:
        return jsonify({"ok": False, "error": str(e)}), 400
    except Exception as e:  # p. ej. otra caja vendió la última unidad al mismo tiempo
        if "CHECK constraint" in str(e):
            return jsonify({"ok": False, "error": "La existencia cambió mientras vendía. Revise el carrito."}), 409
        raise
    return jsonify({"ok": True, "venta_id": vid, "url": url_for("ventas.ver", vid=vid)})


@bp.route("/")
@login_required
def lista():
    hoy = today()
    d1 = parse_date(request.args.get("desde"), hoy - timedelta(days=6))
    d2 = parse_date(request.args.get("hasta"), hoy)
    estado = request.args.get("estado", "")
    buscar = (request.args.get("q") or "").strip()
    where, params = ["date(v.fecha) BETWEEN ? AND ?"], [d1.isoformat(), d2.isoformat()]
    if estado in ("completada", "anulada"):
        where.append("v.estado = ?")
        params.append(estado)
    if buscar:
        where.append("(CAST(v.numero AS TEXT) = ? OR v.cliente_nombre LIKE ? OR v.ncf = ?)")
        params += [buscar.lstrip("#"), f"%{buscar}%", buscar.upper()]
    ventas = q(f"""SELECT v.*, u.nombre AS vendedor,
                          (SELECT SUM(cantidad) FROM venta_detalle d WHERE d.venta_id = v.id) AS unidades,
                          (SELECT GROUP_CONCAT(metodo, ', ') FROM venta_pagos p WHERE p.venta_id = v.id) AS metodos,
                          (SELECT SUM(cantidad * costo_unitario) FROM venta_detalle d WHERE d.venta_id = v.id) AS costo
                   FROM ventas v JOIN usuarios u ON u.id = v.usuario_id
                   WHERE {' AND '.join(where)} ORDER BY v.id DESC LIMIT 500""", params)
    validas = [v for v in ventas if v["estado"] == "completada"]
    totales = {"n": len(validas), "total": sum(v["total"] for v in validas),
               "descuento": sum(v["descuento"] for v in validas),
               "ganancia": sum(v["total"] - (v["costo"] or 0) for v in validas)}
    return render_template("ventas/lista.html", ventas=ventas, d1=d1, d2=d2, estado=estado, buscar=buscar,
                           totales=totales)


@bp.route("/<int:vid>")
@login_required
def ver(vid):
    v, lineas, pagos = cargar_factura(vid)
    cfg = config_all()
    tel = whatsapp_numero(v["cliente_telefono"]) if v["cliente_telefono"] else ""
    return render_template("ventas/factura.html", v=v, lineas=lineas, pagos=pagos, cfg=cfg, wa_tel=tel,
                           formato=request.args.get("formato", "ticket"))


@bp.route("/<int:vid>/pdf")
@login_required
def pdf(vid):
    v, lineas, pagos = cargar_factura(vid)
    data = factura_pdf(v, lineas, pagos, config_all())
    disp = "attachment" if request.args.get("descargar") else "inline"
    return Response(data, mimetype="application/pdf",
                    headers={"Content-Disposition": f'{disp}; filename="Factura-KaryFashion-{v["numero"]:06d}.pdf"'})


@bp.route("/<int:vid>/anular", methods=["POST"])
@admin_required
def anular(vid):
    motivo = (request.form.get("motivo") or "").strip()
    if not motivo:
        flash("Debe indicar el motivo de la anulación.", "danger")
        return redirect(url_for("ventas.ver", vid=vid))
    try:
        with tx():
            anular_venta(vid, motivo)
        flash("Factura anulada. La mercancía volvió al inventario.", "success")
    except ValueError as e:
        flash(str(e), "danger")
    return redirect(url_for("ventas.ver", vid=vid))
