"""Acceso a la base de datos SQLite (SQL directo, sin ORM)."""
import sqlite3
from contextlib import contextmanager
from pathlib import Path

from flask import current_app, g

SQL_DIR = Path(__file__).resolve().parent.parent / "sql"


def connect(path):
    con = sqlite3.connect(path, timeout=15, isolation_level=None)  # autocommit; transacciones explícitas
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA foreign_keys = ON")
    con.execute("PRAGMA journal_mode = WAL")
    con.execute("PRAGMA busy_timeout = 15000")
    return con


def get_db():
    if "db" not in g:
        g.db = connect(current_app.config["DATABASE"])
    return g.db


def close_db(_exc=None):
    con = g.pop("db", None)
    if con is not None:
        con.close()


def q(sql, params=()):
    return get_db().execute(sql, params).fetchall()


def q1(sql, params=()):
    return get_db().execute(sql, params).fetchone()


def val(sql, params=(), default=0):
    row = get_db().execute(sql, params).fetchone()
    if row is None or row[0] is None:
        return default
    return row[0]


def ex(sql, params=()):
    return get_db().execute(sql, params)


@contextmanager
def tx():
    """Transacción atómica: o se guarda todo o no se guarda nada."""
    con = get_db()
    con.execute("BEGIN IMMEDIATE")
    try:
        yield con
    except BaseException:
        con.execute("ROLLBACK")
        raise
    else:
        con.execute("COMMIT")


def init_schema(con):
    con.executescript((SQL_DIR / "schema.sql").read_text(encoding="utf-8"))
    con.executescript((SQL_DIR / "views.sql").read_text(encoding="utf-8"))
