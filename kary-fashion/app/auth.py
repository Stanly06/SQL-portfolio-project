"""Usuarios, contraseñas, permisos y protección CSRF."""
import secrets
import time
from functools import wraps

from flask import (Blueprint, abort, flash, g, redirect, render_template, request,
                   session, url_for)
from werkzeug.security import check_password_hash, generate_password_hash

from .db import ex, q1
from .utils import audit, now_str

bp = Blueprint("auth", __name__)

_intentos = {}          # usuario/ip -> [cantidad, primer_intento]
MAX_INTENTOS = 5
BLOQUEO_SEG = 300


def hash_password(pw):
    return generate_password_hash(pw, method="scrypt")


def validar_clave(pw):
    if len(pw or "") < 6:
        return "La contraseña debe tener al menos 6 caracteres."
    return None


# ------------------------------------------------------------------ decoradores
def login_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        if g.user is None:
            return redirect(url_for("auth.login", next=request.full_path))
        if g.user["debe_cambiar_clave"] and request.endpoint not in ("auth.cambiar_clave", "auth.logout"):
            flash("Por seguridad, cambie su contraseña antes de continuar.", "warning")
            return redirect(url_for("auth.cambiar_clave"))
        return view(*args, **kwargs)
    return wrapped


def admin_required(view):
    @wraps(view)
    @login_required
    def wrapped(*args, **kwargs):
        if g.user["rol"] != "admin":
            abort(403)
        return view(*args, **kwargs)
    return wrapped


def es_admin():
    return g.get("user") is not None and g.user["rol"] == "admin"


# ------------------------------------------------------------------ CSRF
def csrf_token():
    if "_csrf" not in session:
        session["_csrf"] = secrets.token_urlsafe(32)
    return session["_csrf"]


def verificar_csrf():
    if request.method in ("POST", "PUT", "DELETE"):
        enviado = request.form.get("_csrf") or request.headers.get("X-CSRF-Token")
        if not enviado or not secrets.compare_digest(enviado, session.get("_csrf", "")):
            abort(400, "Formulario vencido o inválido. Recargue la página e intente de nuevo.")


def cargar_usuario():
    uid = session.get("uid")
    g.user = None
    if uid:
        u = q1("SELECT * FROM usuarios WHERE id = ? AND activo = 1", (uid,))
        if u is None:
            session.clear()
        else:
            g.user = u


# ------------------------------------------------------------------ vistas
@bp.route("/login", methods=["GET", "POST"])
def login():
    if g.user:
        return redirect(url_for("dashboard.inicio"))
    if request.method == "POST":
        usuario = request.form.get("usuario", "").strip()
        clave = request.form.get("clave", "")
        llave = f"{usuario.lower()}|{request.remote_addr}"
        n, t0 = _intentos.get(llave, (0, time.time()))
        if n >= MAX_INTENTOS and time.time() - t0 < BLOQUEO_SEG:
            flash("Demasiados intentos fallidos. Espere 5 minutos e intente de nuevo.", "danger")
            return render_template("login.html"), 429
        u = q1("SELECT * FROM usuarios WHERE usuario = ? AND activo = 1", (usuario,))
        if u and check_password_hash(u["password_hash"], clave):
            _intentos.pop(llave, None)
            session.clear()
            session.permanent = True
            session["uid"] = u["id"]
            ex("UPDATE usuarios SET ultimo_acceso = ? WHERE id = ?", (now_str(), u["id"]))
            audit("login", "usuario", u["id"], usuario_id=u["id"])
            destino = request.args.get("next") or ""
            if not destino.startswith("/") or destino.startswith("//"):
                destino = url_for("dashboard.inicio")
            return redirect(destino)
        if time.time() - t0 >= BLOQUEO_SEG:
            n, t0 = 0, time.time()
        _intentos[llave] = (n + 1, t0)
        flash("Usuario o contraseña incorrectos.", "danger")
    return render_template("login.html")


@bp.route("/logout", methods=["POST"])
def logout():
    session.clear()
    flash("Sesión cerrada.", "info")
    return redirect(url_for("auth.login"))


@bp.route("/cambiar-clave", methods=["GET", "POST"])
@login_required
def cambiar_clave():
    if request.method == "POST":
        actual = request.form.get("actual", "")
        nueva = request.form.get("nueva", "")
        confirmar = request.form.get("confirmar", "")
        if not check_password_hash(g.user["password_hash"], actual):
            flash("La contraseña actual no es correcta.", "danger")
        elif nueva != confirmar:
            flash("La nueva contraseña y la confirmación no coinciden.", "danger")
        elif err := validar_clave(nueva):
            flash(err, "danger")
        elif nueva == actual:
            flash("La nueva contraseña debe ser diferente a la actual.", "danger")
        else:
            ex("UPDATE usuarios SET password_hash = ?, debe_cambiar_clave = 0 WHERE id = ?",
               (hash_password(nueva), g.user["id"]))
            audit("cambiar_clave", "usuario", g.user["id"])
            flash("Contraseña actualizada.", "success")
            return redirect(url_for("dashboard.inicio"))
    return render_template("cambiar_clave.html")
