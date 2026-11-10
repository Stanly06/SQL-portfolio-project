"""Funciones de apoyo: dinero, fechas, configuración y bitácora."""
import json
import re
from datetime import date, datetime, timedelta
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from zoneinfo import ZoneInfo

from flask import g

from .db import ex, q, q1

TZ = ZoneInfo("America/Santo_Domingo")

METODOS_PAGO = {
    "efectivo": "Efectivo",
    "transferencia": "Transferencia",
    "tarjeta": "Tarjeta",
    "anticipo": "Anticipo de pedido",
}

CATEGORIAS_GASTO = {
    "alquiler": "Alquiler del local",
    "energia": "Energía eléctrica",
    "transporte": "Transporte",
    "publicidad": "Publicidad",
    "empaques": "Materiales y empaques",
    "sueldos": "Sueldos",
    "internet_telefono": "Internet y teléfono",
    "mantenimiento": "Mantenimiento",
    "impuestos": "Impuestos y tasas",
    "otros": "Otros gastos administrativos",
}

ESTADOS_PEDIDO = {
    "pendiente": "Pendiente",
    "recibido": "Recibido",
    "entregado": "Entregado",
    "cancelado": "Cancelado",
}

CONFIG_DEFECTO = {
    "negocio_nombre": "Kary Fashion",
    "negocio_direccion": "Calle Duarte, Guatapanal, Valverde, Mao, República Dominicana",
    "negocio_telefono": "809-502-9189",
    "negocio_instagram": "@kary_fashion26",
    "negocio_tiktok": "@karyfashion26",
    "negocio_rnc": "",
    "factura_mensaje": "¡Gracias por su compra! Cambios dentro de 7 días con su factura y la etiqueta puesta.",
    "factura_proximo_numero": "1",
    "pedido_proximo_numero": "1",
    "pedido_anticipo_minimo": "50",
    "stock_minimo_defecto": "2",
    "descuento_max_empleado": "10",
    "fiscal_activo": "0",
    "fiscal_tipo_defecto": "B02",
    "itbis_tasa": "18",
    "fondo_caja_defecto": "0",
    "respaldo_dias": "30",
    "respaldo_carpeta_externa": "",
}


# ------------------------------------------------------------------ dinero
def to_cents(texto, default=0):
    """'1,250.50' -> 125050.  Acepta números o texto con RD$, comas y espacios."""
    if texto is None:
        return default
    if isinstance(texto, int):
        return texto * 100
    s = str(texto).strip().replace("RD$", "").replace("$", "").replace(",", "").replace(" ", "")
    if s == "":
        return default
    try:
        d = Decimal(s)
    except InvalidOperation:
        raise ValueError(f"Monto inválido: {texto}")
    if not d.is_finite():
        raise ValueError(f"Monto inválido: {texto}")
    return int((d * 100).quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def money(cents, simbolo=True):
    cents = int(cents or 0)
    signo = "-" if cents < 0 else ""
    cents = abs(cents)
    txt = f"{cents // 100:,}.{cents % 100:02d}"
    return f"{signo}RD${txt}" if simbolo else f"{signo}{txt}"


def money_input(cents):
    """Valor para precargar un <input>: 95000 -> '950.00'."""
    cents = int(cents or 0)
    return f"{cents / 100:.2f}"


def to_int(texto, default=0):
    try:
        return int(str(texto).strip())
    except (TypeError, ValueError):
        return default


def pct(parte, total):
    if not total:
        return 0.0
    return round(100.0 * parte / total, 1)


# ------------------------------------------------------------------ fechas
def now():
    return datetime.now(TZ).replace(tzinfo=None, microsecond=0)


def now_str():
    return now().strftime("%Y-%m-%d %H:%M:%S")


def today():
    return now().date()


def parse_date(texto, default=None):
    try:
        return datetime.strptime(str(texto)[:10], "%Y-%m-%d").date()
    except (TypeError, ValueError):
        return default


MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio",
         "agosto", "septiembre", "octubre", "noviembre", "diciembre"]


def fecha_larga(d):
    if isinstance(d, str):
        d = parse_date(d)
    if not d:
        return ""
    return f"{d.day} de {MESES[d.month - 1]} de {d.year}"


def fmt_fecha(texto, con_hora=False):
    if not texto:
        return ""
    texto = str(texto)
    try:
        if len(texto) > 10:
            dt = datetime.strptime(texto[:19], "%Y-%m-%d %H:%M:%S")
            return dt.strftime("%d/%m/%Y %I:%M %p").replace("AM", "a. m.").replace("PM", "p. m.") if con_hora \
                else dt.strftime("%d/%m/%Y")
        return datetime.strptime(texto, "%Y-%m-%d").strftime("%d/%m/%Y")
    except ValueError:
        return texto


def rango_periodo(periodo, desde=None, hasta=None, ref=None):
    """Devuelve (inicio, fin, etiqueta, agrupacion) del período pedido. fin es inclusivo."""
    hoy = ref or today()
    if periodo == "hoy":
        return hoy, hoy, "Hoy", "dia"
    if periodo == "ayer":
        d = hoy - timedelta(days=1)
        return d, d, "Ayer", "dia"
    if periodo == "semana":
        ini = hoy - timedelta(days=hoy.weekday())
        return ini, ini + timedelta(days=6), "Esta semana", "dia"
    if periodo == "mes":
        ini = hoy.replace(day=1)
        fin = (ini + timedelta(days=32)).replace(day=1) - timedelta(days=1)
        return ini, fin, f"{MESES[hoy.month - 1].capitalize()} {hoy.year}", "dia"
    if periodo == "mes_anterior":
        fin = hoy.replace(day=1) - timedelta(days=1)
        ini = fin.replace(day=1)
        return ini, fin, f"{MESES[ini.month - 1].capitalize()} {ini.year}", "dia"
    if periodo == "anio":
        return date(hoy.year, 1, 1), date(hoy.year, 12, 31), f"Año {hoy.year}", "mes"
    # rango personalizado
    d1 = parse_date(desde, hoy.replace(day=1))
    d2 = parse_date(hasta, hoy)
    if d2 < d1:
        d1, d2 = d2, d1
    agrup = "mes" if (d2 - d1).days > 62 else "dia"
    return d1, d2, f"{d1.strftime('%d/%m/%Y')} al {d2.strftime('%d/%m/%Y')}", agrup


def periodo_anterior(ini, fin, periodo):
    """Período equivalente anterior para comparar."""
    if periodo in ("mes", "mes_anterior"):
        pfin = ini - timedelta(days=1)
        return pfin.replace(day=1), pfin
    if periodo == "anio":
        return date(ini.year - 1, 1, 1), date(ini.year - 1, 12, 31)
    dias = (fin - ini).days + 1
    return ini - timedelta(days=dias), ini - timedelta(days=1)


# ------------------------------------------------------------------ teléfonos
def solo_digitos(tel):
    return re.sub(r"\D", "", tel or "")


def whatsapp_numero(tel):
    """809-502-9189 -> 18095029189 (formato internacional para wa.me)."""
    d = solo_digitos(tel)
    if len(d) == 10:
        d = "1" + d
    return d


# ------------------------------------------------------------------ configuración
def config_all():
    datos = dict(CONFIG_DEFECTO)
    for r in q("SELECT clave, valor FROM configuracion"):
        datos[r["clave"]] = r["valor"]
    return datos


def config(clave):
    r = q1("SELECT valor FROM configuracion WHERE clave = ?", (clave,))
    return r["valor"] if r else CONFIG_DEFECTO.get(clave)


def set_config(clave, valor):
    ex("INSERT INTO configuracion (clave, valor) VALUES (?, ?) "
       "ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor", (clave, str(valor)))


def siguiente_numero(clave):
    """Consecutivo atómico (debe llamarse dentro de una transacción)."""
    n = to_int(config(clave), 1)
    set_config(clave, n + 1)
    return n


# ------------------------------------------------------------------ bitácora
def audit(accion, entidad, entidad_id=None, detalle=None, usuario_id=None):
    if usuario_id is None:
        u = g.get("user")
        usuario_id = u["id"] if u else None
    ex("INSERT INTO auditoria (fecha, usuario_id, accion, entidad, entidad_id, detalle) VALUES (?,?,?,?,?,?)",
       (now_str(), usuario_id, accion, entidad, entidad_id,
        json.dumps(detalle, ensure_ascii=False, default=str) if detalle is not None else None))


def mover_inventario(producto_id, cantidad, tipo, referencia=None, nota=None, costo_unitario=None):
    """Registra un movimiento de kardex. El trigger actualiza el stock.
    Si el stock quedaría negativo, la BD rechaza la operación."""
    p = q1("SELECT stock, costo, nombre FROM productos WHERE id = ?", (producto_id,))
    if p is None:
        raise ValueError("Producto no existe")
    despues = p["stock"] + cantidad
    if despues < 0:
        raise ValueError(f"No hay suficiente existencia de «{p['nombre']}» (quedan {p['stock']}).")
    u = g.get("user")
    ex("""INSERT INTO movimientos_inventario
          (producto_id, fecha, tipo, cantidad, stock_antes, stock_despues, costo_unitario, referencia, nota, usuario_id)
          VALUES (?,?,?,?,?,?,?,?,?,?)""",
       (producto_id, now_str(), tipo, cantidad, p["stock"], despues,
        p["costo"] if costo_unitario is None else costo_unitario, referencia, nota, u["id"] if u else None))
    return despues
