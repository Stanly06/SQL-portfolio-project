"""Kary Fashion — Sistema de Ventas e Inventario."""
import os
import secrets
from datetime import timedelta
from pathlib import Path

from flask import Flask, g, render_template, request

from . import auth, backups, db
from .utils import (CATEGORIAS_GASTO, ESTADOS_PEDIDO, METODOS_PAGO, fmt_fecha, money,
                    money_input, now_str, pct)

CATEGORIAS_INICIALES = [("Ropa", "ROP"), ("Calzados", "CAL"), ("Perfumes", "PER"), ("Accesorios", "ACC")]
COMPROBANTES_INICIALES = [
    ("B02", "Factura de Consumo"),
    ("B01", "Factura de Crédito Fiscal"),
]


def create_app(test_config=None):
    base = Path(__file__).resolve().parent.parent
    data_dir = Path(os.environ.get("KARY_DATA_DIR", base / "datos"))
    app = Flask(__name__)
    app.config.update(
        DATA_DIR=str(data_dir),
        DATABASE=str(data_dir / "kary.db"),
        UPLOAD_DIR=str(data_dir / "fotos"),
        MAX_CONTENT_LENGTH=8 * 1024 * 1024,
        PERMANENT_SESSION_LIFETIME=timedelta(hours=12),
        SESSION_COOKIE_HTTPONLY=True,
        SESSION_COOKIE_SAMESITE="Lax",
        AUTO_BACKUP=True,
    )
    if test_config:
        app.config.update(test_config)
        data_dir = Path(app.config["DATA_DIR"])
    data_dir.mkdir(parents=True, exist_ok=True)
    Path(app.config["UPLOAD_DIR"]).mkdir(parents=True, exist_ok=True)

    # Clave secreta propia de cada instalación (se genera la primera vez)
    if not app.config.get("SECRET_KEY"):
        key_file = data_dir / "clave_secreta.txt"
        if not key_file.exists():
            key_file.write_text(secrets.token_hex(32))
        app.config["SECRET_KEY"] = key_file.read_text().strip()
    if os.environ.get("KARY_HTTPS") == "1":
        app.config["SESSION_COOKIE_SECURE"] = True

    with app.app_context():
        inicializar_bd(app)

    app.teardown_appcontext(db.close_db)

    @app.before_request
    def antes():
        auth.cargar_usuario()
        auth.verificar_csrf()
        if app.config["AUTO_BACKUP"] and g.user is not None:
            try:
                backups.respaldo_diario_si_hace_falta()
            except Exception as e:  # un fallo de respaldo nunca debe detener la tienda
                app.logger.error("Respaldo automático falló: %s", e)

    @app.after_request
    def cabeceras(resp):
        resp.headers.setdefault("X-Content-Type-Options", "nosniff")
        resp.headers.setdefault("X-Frame-Options", "SAMEORIGIN")
        resp.headers.setdefault("Referrer-Policy", "same-origin")
        return resp

    # Filtros y variables para las plantillas
    app.jinja_env.filters["rd"] = money
    app.jinja_env.filters["num"] = lambda c: money(c, simbolo=False)
    app.jinja_env.filters["input"] = money_input
    app.jinja_env.filters["fecha"] = fmt_fecha
    app.jinja_env.filters["fechahora"] = lambda t: fmt_fecha(t, True)
    app.jinja_env.filters["metodo"] = lambda m: METODOS_PAGO.get(m, m)
    app.jinja_env.filters["estado_pedido"] = lambda e: ESTADOS_PEDIDO.get(e, e)
    app.jinja_env.filters["cat_gasto"] = lambda c: CATEGORIAS_GASTO.get(c, c)
    app.jinja_env.globals.update(
        csrf_token=auth.csrf_token, es_admin=auth.es_admin, pct=pct,
        METODOS_PAGO=METODOS_PAGO, CATEGORIAS_GASTO=CATEGORIAS_GASTO, ESTADOS_PEDIDO=ESTADOS_PEDIDO,
    )

    @app.context_processor
    def globales():
        if g.get("user") is None:
            return {}
        from .db import val
        from .utils import config
        return {
            "alertas_stock": val("SELECT COUNT(*) FROM productos WHERE activo = 1 AND stock <= stock_minimo"),
            "negocio": config("negocio_nombre"),
        }

    from .routes import (admin, caja, clientes, compras, dashboard, gastos, pedidos, productos,
                         proveedores, reportes, ventas)
    app.register_blueprint(auth.bp)
    for m in (dashboard, productos, ventas, clientes, pedidos, proveedores, compras, gastos, caja,
              reportes, admin):
        app.register_blueprint(m.bp)

    @app.errorhandler(403)
    def prohibido(e):
        return render_template("error.html", codigo=403,
                               mensaje="Esta sección es solo para administradores."), 403

    @app.errorhandler(404)
    def no_encontrado(e):
        return render_template("error.html", codigo=404, mensaje="La página no existe."), 404

    @app.errorhandler(400)
    def mala_peticion(e):
        if request.is_json or request.headers.get("X-CSRF-Token"):
            return {"ok": False, "error": e.description}, 400
        return render_template("error.html", codigo=400, mensaje=e.description), 400

    @app.errorhandler(413)
    def muy_grande(e):
        return render_template("error.html", codigo=413, mensaje="El archivo es demasiado grande (máx. 8 MB)."), 413

    @app.cli.command("crear-admin")
    def crear_admin_cmd():
        """Crea o restablece un usuario administrador."""
        import getpass
        usuario = input("Usuario administrador: ").strip()
        clave = getpass.getpass("Contraseña: ")
        if err := auth.validar_clave(clave):
            print(err)
            return
        with app.app_context():
            con = db.get_db()
            con.execute("""INSERT INTO usuarios (usuario, nombre, password_hash, rol, creado_en)
                           VALUES (?, ?, ?, 'admin', ?)
                           ON CONFLICT(usuario) DO UPDATE SET password_hash = excluded.password_hash,
                                                              rol = 'admin', activo = 1""",
                        (usuario, usuario.capitalize(), auth.hash_password(clave), now_str()))
        print("Listo.")

    return app


def inicializar_bd(app):
    con = db.connect(app.config["DATABASE"])
    try:
        db.init_schema(con)
        if con.execute("SELECT COUNT(*) FROM categorias").fetchone()[0] == 0:
            con.executemany("INSERT INTO categorias (nombre, prefijo) VALUES (?, ?)", CATEGORIAS_INICIALES)
        if con.execute("SELECT COUNT(*) FROM comprobantes_fiscales").fetchone()[0] == 0:
            con.executemany("INSERT INTO comprobantes_fiscales (tipo, descripcion, activo) VALUES (?, ?, 0)",
                            COMPROBANTES_INICIALES)
        if con.execute("SELECT COUNT(*) FROM usuarios").fetchone()[0] == 0:
            clave_inicial = os.environ.get("KARY_ADMIN_PASSWORD", "kary2026")
            con.execute("""INSERT INTO usuarios (usuario, nombre, password_hash, rol, debe_cambiar_clave, creado_en)
                           VALUES ('admin', 'Administradora', ?, 'admin', 1, ?)""",
                        (auth.hash_password(clave_inicial), now_str()))
    finally:
        con.close()
