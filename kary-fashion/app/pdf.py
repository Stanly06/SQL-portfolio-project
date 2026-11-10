"""Generación de PDF: factura (formato ticket 80 mm, ideal para WhatsApp e impresora térmica)
y reporte de resultados."""
from pathlib import Path

from fpdf import FPDF

from .utils import METODOS_PAGO, fmt_fecha, money

LOGO = Path(__file__).resolve().parent / "static" / "img" / "logo-factura.jpg"
ROSA = (214, 0, 120)
DORADO = (176, 132, 30)
GRIS = (90, 90, 90)


def t(texto):
    """fpdf con fuentes básicas usa latin-1: reemplaza lo que no se pueda representar."""
    return str(texto or "").replace("—", "-").replace("–", "-").replace("•", "-") \
        .encode("latin-1", "replace").decode("latin-1")


def _factura(v, lineas, pagos, cfg, alto):
    ancho = 80
    pdf = FPDF(unit="mm", format=(ancho, alto))
    pdf.set_margins(5, 5, 5)
    pdf.set_auto_page_break(False)
    pdf.add_page()
    w = ancho - 10
    if LOGO.exists():
        pdf.image(str(LOGO), x=(ancho - 30) / 2, y=4, w=30)
        pdf.set_y(36)
    pdf.set_font("Helvetica", "B", 14)
    pdf.set_text_color(*ROSA)
    pdf.cell(w, 6, t(cfg["negocio_nombre"]), align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.set_text_color(*GRIS)
    pdf.set_font("Helvetica", "", 7.5)
    for linea in (cfg["negocio_direccion"], f"Tel./WhatsApp: {cfg['negocio_telefono']}",
                  f"Instagram: {cfg['negocio_instagram']}   TikTok: {cfg['negocio_tiktok']}"):
        pdf.multi_cell(w, 3.6, t(linea), align="C", new_x="LMARGIN", new_y="NEXT")
    if cfg.get("negocio_rnc"):
        pdf.cell(w, 3.6, t(f"RNC: {cfg['negocio_rnc']}"), align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(1.5)
    _raya(pdf, w)

    pdf.set_text_color(0, 0, 0)
    pdf.set_font("Helvetica", "B", 10)
    titulo = "FACTURA"
    if v["tipo_ncf"] in ("B01", "E31"):
        titulo = "FACTURA DE CRÉDITO FISCAL"
    elif v["tipo_ncf"]:
        titulo = "FACTURA DE CONSUMO"
    pdf.cell(w, 5, t(titulo), align="C", new_x="LMARGIN", new_y="NEXT")
    if v["estado"] == "anulada":
        pdf.set_text_color(200, 0, 0)
        pdf.cell(w, 5, "*** ANULADA ***", align="C", new_x="LMARGIN", new_y="NEXT")
        pdf.set_text_color(0, 0, 0)
    pdf.set_font("Helvetica", "", 8)
    _par(pdf, w, "Factura No.:", f"{v['numero']:06d}", negrita=True)
    if v["ncf"]:
        _par(pdf, w, "NCF:", v["ncf"], negrita=True)
    _par(pdf, w, "Fecha:", fmt_fecha(v["fecha"], True))
    _par(pdf, w, "Cliente:", v["cliente_nombre"] or "Cliente general")
    if v["cliente_rnc"]:
        _par(pdf, w, "RNC/Cédula:", v["cliente_rnc"])
    _par(pdf, w, "Atendido por:", v["vendedor"])
    if v["pedido_numero"]:
        _par(pdf, w, "Pedido:", f"#{v['pedido_numero']}")
    pdf.ln(1)
    _raya(pdf, w)

    pdf.set_font("Helvetica", "B", 7.5)
    pdf.cell(8, 4, "Cant", new_x="RIGHT")
    pdf.cell(w - 8 - 30, 4, t("Descripción"))
    pdf.cell(15, 4, "Precio", align="R")
    pdf.cell(15, 4, "Importe", align="R", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "", 7.5)
    for l in lineas:
        y0 = pdf.get_y()
        pdf.set_x(5 + 8)
        pdf.multi_cell(w - 8 - 30, 3.6, t(l["descripcion"] + (f"  [{l['codigo']}]" if l["codigo"] else "")),
                       new_x="LMARGIN", new_y="NEXT")
        y1 = pdf.get_y()
        pdf.set_xy(5, y0)
        pdf.cell(8, 3.6, str(l["cantidad"]))
        pdf.set_xy(5 + w - 30, y0)
        pdf.cell(15, 3.6, money(l["precio_unitario"], False), align="R")
        pdf.cell(15, 3.6, money(l["cantidad"] * l["precio_unitario"], False), align="R")
        pdf.set_y(y1)
        if l["descuento"]:
            pdf.set_text_color(*GRIS)
            pdf.set_x(5 + 8)
            pdf.cell(w - 8 - 15, 3.4, "Descuento")
            pdf.cell(15, 3.4, "-" + money(l["descuento"], False), align="R", new_x="LMARGIN", new_y="NEXT")
            pdf.set_text_color(0, 0, 0)
        pdf.ln(0.6)
    _raya(pdf, w)

    pdf.set_font("Helvetica", "", 8.5)
    _par(pdf, w, "Subtotal:", money(v["subtotal"]))
    if v["descuento"]:
        _par(pdf, w, "Descuentos:", "-" + money(v["descuento"]))
    if v["ncf"] and v["itbis"]:
        _par(pdf, w, "Base imponible:", money(v["total"] - v["itbis"]))
        _par(pdf, w, f"ITBIS ({cfg.get('itbis_tasa', '18')}%) incluido:", money(v["itbis"]))
    pdf.set_font("Helvetica", "B", 12)
    pdf.set_text_color(*ROSA)
    _par(pdf, w, "TOTAL:", money(v["total"]), alto=7)
    pdf.set_text_color(0, 0, 0)
    pdf.set_font("Helvetica", "", 8)
    pdf.ln(0.5)
    pdf.set_font("Helvetica", "B", 8)
    pdf.cell(w, 4, t("Forma de pago"), new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "", 8)
    for p in pagos:
        etiqueta = METODOS_PAGO.get(p["metodo"], p["metodo"])
        if p["referencia"]:
            etiqueta += f" (Ref. {p['referencia']})"
        _par(pdf, w, etiqueta, money(p["monto"]))
    if v["efectivo_recibido"]:
        _par(pdf, w, "Efectivo recibido:", money(v["efectivo_recibido"]))
        _par(pdf, w, "Cambio:", money(v["cambio"]))
    pdf.ln(1)
    _raya(pdf, w)
    pdf.set_font("Helvetica", "I", 7.5)
    pdf.set_text_color(*GRIS)
    if cfg.get("factura_mensaje"):
        pdf.multi_cell(w, 3.6, t(cfg["factura_mensaje"]), align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "B", 8)
    pdf.set_text_color(*DORADO)
    pdf.cell(w, 5, t("Síguenos: " + cfg["negocio_instagram"]), align="C", new_x="LMARGIN", new_y="NEXT")
    return pdf


def factura_pdf(v, lineas, pagos, cfg):
    borrador = _factura(v, lineas, pagos, cfg, 2000)
    alto = max(borrador.get_y() + 8, 120)
    return bytes(_factura(v, lineas, pagos, cfg, alto).output())


def _raya(pdf, w):
    pdf.set_draw_color(200, 200, 200)
    y = pdf.get_y()
    pdf.dashed_line(pdf.l_margin, y, pdf.l_margin + w, y, 1, 0.8)
    pdf.ln(1.5)


def _par(pdf, w, izq, der, negrita=False, alto=4):
    estilo = pdf.font_style
    if negrita:
        pdf.set_font(style="B")
    pdf.cell(w * 0.55, alto, t(izq))
    pdf.cell(w * 0.45, alto, t(der), align="R", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font(style=estilo)


# ---------------------------------------------------------------------- reporte
class _Reporte(FPDF):
    titulo = ""

    def header(self):
        if LOGO.exists():
            self.image(str(LOGO), x=10, y=8, w=18)
        self.set_xy(32, 10)
        self.set_font("Helvetica", "B", 15)
        self.set_text_color(*ROSA)
        self.cell(0, 7, "Kary Fashion", new_x="LMARGIN", new_y="NEXT")
        self.set_x(32)
        self.set_font("Helvetica", "", 10)
        self.set_text_color(*GRIS)
        self.cell(0, 5, t(self.titulo), new_x="LMARGIN", new_y="NEXT")
        self.set_y(30)
        self.set_text_color(0, 0, 0)

    def footer(self):
        self.set_y(-12)
        self.set_font("Helvetica", "I", 8)
        self.set_text_color(*GRIS)
        self.cell(0, 5, t(f"Página {self.page_no()}"), align="C")


def reporte_pdf(titulo, secciones):
    """secciones: lista de (subtitulo, encabezados, filas, anchos, alineaciones)."""
    pdf = _Reporte(format="Letter")
    pdf.titulo = titulo
    pdf.set_auto_page_break(True, 15)
    pdf.add_page()
    for sub, cab, filas, anchos, alin in secciones:
        if pdf.get_y() > 230:
            pdf.add_page()
        pdf.set_font("Helvetica", "B", 11)
        pdf.set_text_color(*ROSA)
        pdf.cell(0, 8, t(sub), new_x="LMARGIN", new_y="NEXT")
        pdf.set_text_color(0, 0, 0)
        pdf.set_font("Helvetica", "B", 8.5)
        pdf.set_fill_color(248, 228, 238)
        for c, a, al in zip(cab, anchos, alin):
            pdf.cell(a, 6, t(c), border=0, align=al, fill=True)
        pdf.ln()
        pdf.set_font("Helvetica", "", 8.5)
        for i, fila in enumerate(filas):
            if i % 2:
                pdf.set_fill_color(250, 246, 240)
            for c, a, al in zip(fila, anchos, alin):
                txt = t(c)
                while pdf.get_string_width(txt) > a - 1 and len(txt) > 3:
                    txt = txt[:-2]
                pdf.cell(a, 5.5, txt, align=al, fill=bool(i % 2))
            pdf.ln()
        if not filas:
            pdf.set_font("Helvetica", "I", 8.5)
            pdf.cell(0, 6, "Sin datos en este período.", new_x="LMARGIN", new_y="NEXT")
        pdf.ln(3)
    return bytes(pdf.output())
