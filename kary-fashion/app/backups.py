"""Copias de seguridad automáticas de la base de datos y las fotos."""
import shutil
import sqlite3
import threading
import zipfile
from pathlib import Path

from flask import current_app

from .utils import config, now, to_int

_lock = threading.Lock()
_ultimo_dia = {"valor": None}


def carpeta_respaldos():
    p = Path(current_app.config["DATA_DIR"]) / "respaldos"
    p.mkdir(parents=True, exist_ok=True)
    return p


def crear_respaldo(motivo="manual"):
    """Copia consistente (API de backup de SQLite) + fotos, comprimida en .zip."""
    with _lock:
        destino_dir = carpeta_respaldos()
        marca = now().strftime("%Y%m%d-%H%M%S")
        tmp_db = destino_dir / f"kary-{marca}.db"
        src = sqlite3.connect(current_app.config["DATABASE"])
        dst = sqlite3.connect(tmp_db)
        try:
            src.backup(dst)
        finally:
            dst.close()
            src.close()
        zip_path = destino_dir / f"respaldo-{marca}-{motivo}.zip"
        with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as z:
            z.write(tmp_db, "kary.db")
            fotos = Path(current_app.config["UPLOAD_DIR"])
            if fotos.exists():
                for f in fotos.rglob("*"):
                    if f.is_file():
                        z.write(f, f"fotos/{f.relative_to(fotos)}")
        tmp_db.unlink(missing_ok=True)

        # Copia adicional a otra carpeta (USB, Google Drive, OneDrive, Dropbox...)
        externa = (config("respaldo_carpeta_externa") or "").strip()
        if externa:
            try:
                ext = Path(externa)
                ext.mkdir(parents=True, exist_ok=True)
                shutil.copy2(zip_path, ext / zip_path.name)
                limpiar(ext)
            except OSError as e:
                current_app.logger.warning("No se pudo copiar respaldo a %s: %s", externa, e)
        limpiar(destino_dir)
        return zip_path


def limpiar(carpeta):
    dias = max(to_int(config("respaldo_dias"), 30), 3)
    archivos = sorted(Path(carpeta).glob("respaldo-*.zip"))
    limite = (now().date().toordinal() - dias)
    for f in archivos:
        try:
            fecha = f.name.split("-")[1]
            d = now().strptime(fecha, "%Y%m%d").date()
        except (IndexError, ValueError):
            continue
        if d.toordinal() < limite:
            f.unlink(missing_ok=True)


def respaldo_diario_si_hace_falta():
    """Se llama en cada petición; hace como máximo un respaldo automático por día."""
    hoy = now().strftime("%Y%m%d")
    if _ultimo_dia["valor"] == hoy:
        return
    if not any(carpeta_respaldos().glob(f"respaldo-{hoy}-*.zip")):
        crear_respaldo("auto")
    _ultimo_dia["valor"] = hoy


def listar():
    return sorted(carpeta_respaldos().glob("respaldo-*.zip"), reverse=True)
