import uuid
from pathlib import Path

from flask import (Blueprint, abort, current_app, flash, g, jsonify, redirect, render_template,
                   request, send_from_directory, url_for)

from ..auth import admin_required, es_admin, login_required
from ..db import q, q1, tx, val
from ..utils import audit, config, mover_inventario, now_str, to_cents, to_int

bp = Blueprint("productos", __name__, url_prefix="/productos")

CAMPOS_TEXTO = ("nombre", "modelo", "talla", "color", "descripcion")


def guardar_foto(archivo):
    """Valida que sea una imagen real, la reduce y la guarda como JPG."""
    if not archivo or not archivo.filename:
        return None
    from PIL import Image, ImageOps, UnidentifiedImageError
    try:
        img = Image.open(archivo.stream)
        img = ImageOps.exif_transpose(img)
        img = img.convert("RGB")
    except (UnidentifiedImageError, OSError):
        raise ValueError("El archivo de foto no es una imagen válida (use JPG o PNG).")
    img.thumbnail((900, 900))
    nombre = f"{uuid.uuid4().hex}.jpg"
    img.save(Path(current_app.config["UPLOAD_DIR"]) / nombre, "JPEG", quality=85, optimize=True)
    return nombre


def generar_codigo(categoria_id):
    cat = q1("SELECT prefijo FROM categorias WHERE id = ?", (categoria_id,))
    prefijo = cat["prefijo"] if cat else "PRD"
    n = val("""SELECT MAX(CAST(substr(codigo, length(?) + 2) AS INTEGER)) FROM productos
               WHERE codigo LIKE ? || '-%'""", (prefijo, prefijo), 0) or 0
    while True:
        n += 1
        codigo = f"{prefijo}-{n:04d}"
        if not q1("SELECT 1 FROM productos WHERE codigo = ?", (codigo,)):
            return codigo


def leer_formulario(form):
    datos = {c: (form.get(c) or "").strip() for c in CAMPOS_TEXTO}
    datos["codigo"] = (form.get("codigo") or "").strip().upper()
    datos["categoria_id"] = to_int(form.get("categoria_id"))
    datos["proveedor_id"] = to_int(form.get("proveedor_id")) or None
    datos["costo"] = to_cents(form.get("costo"))
    datos["precio"] = to_cents(form.get("precio"))
    datos["stock_minimo"] = max(to_int(form.get("stock_minimo"), 0), 0)
    errores = []
    if not datos["nombre"]:
        errores.append("El nombre es obligatorio.")
    if not q1("SELECT 1 FROM categorias WHERE id = ?", (datos["categoria_id"],)):
        errores.append("Seleccione una categoría.")
    if datos["costo"] < 0 or datos["precio"] < 0:
        errores.append("Los precios no pueden ser negativos.")
    if datos["precio"] and datos["precio"] < datos["costo"]:
        flash("Atención: el precio de venta es menor que el costo (se venderá con pérdida).", "warning")
    return datos, errores


@bp.route("/")
@login_required
def lista():
    buscar = (request.args.get("q") or "").strip()
    categoria = to_int(request.args.get("categoria"))
    filtro = request.args.get("filtro", "")
    where, params = ["p.activo = ?"], [0 if filtro == "inactivos" else 1]
    if buscar:
        where.append("(p.codigo LIKE ? OR p.nombre LIKE ? OR p.modelo LIKE ? OR p.color LIKE ? OR p.talla = ?)")
        like = f"%{buscar}%"
        params += [like, like, like, like, buscar]
    if categoria:
        where.append("p.categoria_id = ?")
        params.append(categoria)
    if filtro == "bajo":
        where.append("p.stock <= p.stock_minimo")
    elif filtro == "agotado":
        where.append("p.stock = 0")
    productos = q(f"""SELECT p.*, c.nombre AS categoria, p.precio - p.costo AS ganancia,
                             p.stock * p.costo AS valor_costo
                      FROM productos p JOIN categorias c ON c.id = p.categoria_id
                      WHERE {' AND '.join(where)}
                      ORDER BY p.nombre, p.modelo, p.color, p.talla""", params)
    totales = {
        "unidades": sum(p["stock"] for p in productos),
        "valor_costo": sum(p["valor_costo"] for p in productos),
        "valor_venta": sum(p["stock"] * p["precio"] for p in productos),
    }
    return render_template("productos/lista.html", productos=productos, categorias=categorias(),
                           buscar=buscar, categoria=categoria, filtro=filtro, totales=totales)


def categorias():
    return q("SELECT * FROM categorias ORDER BY id")


def proveedores():
    return q("SELECT id, nombre FROM proveedores WHERE activo = 1 ORDER BY nombre")


@bp.route("/nuevo", methods=["GET", "POST"])
@admin_required
def nuevo():
    p = {"stock_minimo": to_int(config("stock_minimo_defecto"), 2), "costo": 0, "precio": 0, "stock": 0}
    if (copiar := to_int(request.args.get("copiar"))) and (orig := q1("SELECT * FROM productos WHERE id = ?", (copiar,))):
        p = dict(orig)
        p.update(id=None, codigo="", talla="", stock=0)
        flash("Copiando datos de otro producto: cambie la talla o el color y guarde.", "info")
    if request.method == "POST":
        try:
            datos, errores = leer_formulario(request.form)
            stock_inicial = max(to_int(request.form.get("stock_inicial"), 0), 0)
            if datos["codigo"] and q1("SELECT 1 FROM productos WHERE codigo = ?", (datos["codigo"],)):
                errores.append(f"Ya existe un producto con el código {datos['codigo']}.")
            if errores:
                for e in errores:
                    flash(e, "danger")
                p = {**p, **datos, "stock": stock_inicial}
                return render_template("productos/form.html", p=p, categorias=categorias(),
                                       proveedores=proveedores()), 400
            foto = guardar_foto(request.files.get("foto")) or (p.get("foto") if copiar else None)
            with tx():
                if not datos["codigo"]:
                    datos["codigo"] = generar_codigo(datos["categoria_id"])
                ahora = now_str()
                cur = g.db.execute(
                    """INSERT INTO productos (codigo, nombre, categoria_id, modelo, talla, color, descripcion, foto,
                                             costo, precio, stock, stock_minimo, proveedor_id, creado_en, actualizado_en)
                       VALUES (?,?,?,?,?,?,?,?,?,?,0,?,?,?,?)""",
                    (datos["codigo"], datos["nombre"], datos["categoria_id"], datos["modelo"], datos["talla"],
                     datos["color"], datos["descripcion"], foto, datos["costo"], datos["precio"],
                     datos["stock_minimo"], datos["proveedor_id"], ahora, ahora))
                pid = cur.lastrowid
                if stock_inicial:
                    mover_inventario(pid, stock_inicial, "inicial", nota="Existencia inicial")
                audit("crear", "producto", pid, {**datos, "stock_inicial": stock_inicial})
            flash(f"Producto {datos['codigo']} registrado.", "success")
            if request.form.get("otra_talla"):
                return redirect(url_for("productos.nuevo", copiar=pid))
            return redirect(url_for("productos.ver", pid=pid))
        except ValueError as e:
            flash(str(e), "danger")
    return render_template("productos/form.html", p=p, categorias=categorias(), proveedores=proveedores())


@bp.route("/<int:pid>")
@login_required
def ver(pid):
    p = q1("""SELECT p.*, c.nombre AS categoria, pr.nombre AS proveedor
              FROM productos p JOIN categorias c ON c.id = p.categoria_id
              LEFT JOIN proveedores pr ON pr.id = p.proveedor_id WHERE p.id = ?""", (pid,))
    if not p:
        abort(404)
    movimientos = q("""SELECT m.*, u.nombre AS usuario FROM movimientos_inventario m
                       LEFT JOIN usuarios u ON u.id = m.usuario_id
                       WHERE m.producto_id = ? ORDER BY m.id DESC LIMIT 100""", (pid,))
    precios = q("SELECT * FROM historial_precios WHERE producto_id = ? ORDER BY id DESC", (pid,)) if es_admin() else []
    ventas = q1("""SELECT COALESCE(SUM(cantidad), 0) AS unidades, COALESCE(SUM(venta_neta), 0) AS ventas,
                          COALESCE(SUM(ganancia_bruta), 0) AS ganancia, MAX(dia) AS ultima
                   FROM v_lineas_vendidas WHERE producto_id = ?""", (pid,))
    variantes = q("""SELECT id, codigo, talla, color, stock FROM productos
                     WHERE activo = 1 AND id <> ? AND nombre = ? AND COALESCE(modelo, '') = COALESCE(?, '')
                     ORDER BY color, talla""", (pid, p["nombre"], p["modelo"]))
    return render_template("productos/ver.html", p=p, movimientos=movimientos, precios=precios,
                           ventas=ventas, variantes=variantes)


@bp.route("/<int:pid>/editar", methods=["GET", "POST"])
@admin_required
def editar(pid):
    p = q1("SELECT * FROM productos WHERE id = ?", (pid,))
    if not p:
        abort(404)
    if request.method == "POST":
        try:
            datos, errores = leer_formulario(request.form)
            if not datos["codigo"]:
                datos["codigo"] = p["codigo"]
            if q1("SELECT 1 FROM productos WHERE codigo = ? AND id <> ?", (datos["codigo"], pid)):
                errores.append(f"Ya existe otro producto con el código {datos['codigo']}.")
            if errores:
                for e in errores:
                    flash(e, "danger")
                return render_template("productos/form.html", p={**dict(p), **datos}, categorias=categorias(),
                                       proveedores=proveedores()), 400
            foto = guardar_foto(request.files.get("foto"))
            if request.form.get("quitar_foto"):
                foto = ""
            cambios = {k: {"antes": p[k], "despues": v} for k, v in datos.items() if p[k] != v}
            with tx():
                g.db.execute(
                    """UPDATE productos SET codigo=?, nombre=?, categoria_id=?, modelo=?, talla=?, color=?,
                              descripcion=?, costo=?, precio=?, stock_minimo=?, proveedor_id=?,
                              foto = CASE WHEN ? = '~' THEN foto ELSE NULLIF(?, '') END,
                              actualizado_en=? WHERE id=?""",
                    (datos["codigo"], datos["nombre"], datos["categoria_id"], datos["modelo"], datos["talla"],
                     datos["color"], datos["descripcion"], datos["costo"], datos["precio"], datos["stock_minimo"],
                     datos["proveedor_id"], "~" if foto is None else foto, "~" if foto is None else foto,
                     now_str(), pid))
                if foto is not None:
                    cambios["foto"] = "cambiada" if foto else "eliminada"
                if cambios:
                    audit("modificar", "producto", pid, cambios)
            flash("Cambios guardados.", "success")
            return redirect(url_for("productos.ver", pid=pid))
        except ValueError as e:
            flash(str(e), "danger")
    return render_template("productos/form.html", p=p, categorias=categorias(), proveedores=proveedores())


@bp.route("/<int:pid>/ajuste", methods=["POST"])
@admin_required
def ajuste(pid):
    p = q1("SELECT * FROM productos WHERE id = ?", (pid,))
    if not p:
        abort(404)
    nuevo_stock = to_int(request.form.get("nuevo_stock"), -1)
    motivo = (request.form.get("motivo") or "").strip()
    if nuevo_stock < 0:
        flash("Indique la cantidad real que hay en tienda (0 o más).", "danger")
    elif not motivo:
        flash("Escriba el motivo del ajuste (conteo físico, dañado, regalo, etc.).", "danger")
    elif nuevo_stock == p["stock"]:
        flash("La existencia ya es esa; no se hizo ningún cambio.", "info")
    else:
        with tx():
            mover_inventario(pid, nuevo_stock - p["stock"], "ajuste", nota=motivo)
            audit("ajuste_inventario", "producto", pid,
                  {"antes": p["stock"], "despues": nuevo_stock, "motivo": motivo})
        flash(f"Existencia ajustada de {p['stock']} a {nuevo_stock}.", "success")
    return redirect(url_for("productos.ver", pid=pid))


@bp.route("/<int:pid>/estado", methods=["POST"])
@admin_required
def cambiar_estado(pid):
    p = q1("SELECT activo, codigo FROM productos WHERE id = ?", (pid,))
    if not p:
        abort(404)
    nuevo = 0 if p["activo"] else 1
    with tx():
        g.db.execute("UPDATE productos SET activo = ?, actualizado_en = ? WHERE id = ?", (nuevo, now_str(), pid))
        audit("activar" if nuevo else "desactivar", "producto", pid, {"codigo": p["codigo"]})
    flash("Producto reactivado." if nuevo else "Producto desactivado (ya no aparece en ventas).", "success")
    return redirect(url_for("productos.ver", pid=pid))


@bp.route("/foto/<path:nombre>")
@login_required
def foto(nombre):
    return send_from_directory(current_app.config["UPLOAD_DIR"], nombre, max_age=86400)


@bp.route("/api/buscar")
@login_required
def api_buscar():
    texto = (request.args.get("q") or "").strip()
    todos = request.args.get("todos") == "1"   # en compras se pueden elegir productos sin existencia
    if not texto:
        return jsonify([])
    like = f"%{texto}%"
    filas = q(f"""SELECT p.id, p.codigo, p.nombre, p.modelo, p.talla, p.color, p.precio, p.costo, p.stock,
                         p.foto, c.nombre AS categoria
                  FROM productos p JOIN categorias c ON c.id = p.categoria_id
                  WHERE p.activo = 1 {'' if todos else 'AND p.stock > 0'}
                    AND (p.codigo = ? COLLATE NOCASE OR p.codigo LIKE ? OR p.nombre LIKE ? OR p.modelo LIKE ?
                         OR p.color LIKE ?)
                  ORDER BY (p.codigo = ? COLLATE NOCASE) DESC, p.nombre LIMIT 20""",
              (texto, like, like, like, like, texto))
    admin = es_admin()
    res = []
    for f in filas:
        d = dict(f)
        if not admin:
            d.pop("costo")
        d["foto_url"] = url_for("productos.foto", nombre=d["foto"]) if d["foto"] else None
        res.append(d)
    return jsonify(res)
