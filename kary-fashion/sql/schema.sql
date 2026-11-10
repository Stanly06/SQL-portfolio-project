-- =====================================================================
--  KARY FASHION — Sistema de Ventas e Inventario
--  Esquema de base de datos (SQLite 3.35+)
--
--  Convenciones:
--    * Todos los montos se guardan en CENTAVOS (INTEGER) para evitar
--      errores de redondeo:  RD$950.00  ->  95000
--    * Fechas en texto ISO-8601 hora local de RD: 'YYYY-MM-DD HH:MM:SS'
--    * Nada se borra físicamente en ventas/inventario: se anula y queda
--      registrado en el historial (movimientos_inventario / auditoria).
-- =====================================================================

PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------------
-- 1. SEGURIDAD Y CONFIGURACIÓN
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS usuarios (
    id                 INTEGER PRIMARY KEY,
    usuario            TEXT    NOT NULL UNIQUE COLLATE NOCASE,
    nombre             TEXT    NOT NULL,
    password_hash      TEXT    NOT NULL,
    rol                TEXT    NOT NULL CHECK (rol IN ('admin', 'empleado')),
    activo             INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0, 1)),
    debe_cambiar_clave INTEGER NOT NULL DEFAULT 0 CHECK (debe_cambiar_clave IN (0, 1)),
    ultimo_acceso      TEXT,
    creado_en          TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS configuracion (
    clave TEXT PRIMARY KEY,
    valor TEXT
);

-- Bitácora: quién hizo qué y cuándo (ventas, anulaciones, cambios, etc.)
CREATE TABLE IF NOT EXISTS auditoria (
    id         INTEGER PRIMARY KEY,
    fecha      TEXT    NOT NULL,
    usuario_id INTEGER REFERENCES usuarios (id),
    accion     TEXT    NOT NULL,          -- crear, modificar, anular, eliminar, login...
    entidad    TEXT    NOT NULL,          -- producto, venta, gasto...
    entidad_id INTEGER,
    detalle    TEXT                       -- JSON con los valores antes/después
);
CREATE INDEX IF NOT EXISTS ix_auditoria_fecha ON auditoria (fecha);
CREATE INDEX IF NOT EXISTS ix_auditoria_entidad ON auditoria (entidad, entidad_id);

-- ---------------------------------------------------------------------
-- 2. CATÁLOGO E INVENTARIO
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS categorias (
    id      INTEGER PRIMARY KEY,
    nombre  TEXT NOT NULL UNIQUE COLLATE NOCASE,
    prefijo TEXT NOT NULL UNIQUE           -- usado para generar códigos: ROP-0001
);

CREATE TABLE IF NOT EXISTS proveedores (
    id        INTEGER PRIMARY KEY,
    nombre    TEXT NOT NULL,
    contacto  TEXT,
    telefono  TEXT,
    whatsapp  TEXT,
    email     TEXT,
    rnc       TEXT,
    direccion TEXT,
    notas     TEXT,
    activo    INTEGER NOT NULL DEFAULT 1,
    creado_en TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS productos (
    id             INTEGER PRIMARY KEY,
    codigo         TEXT    NOT NULL UNIQUE COLLATE NOCASE,
    nombre         TEXT    NOT NULL,
    categoria_id   INTEGER NOT NULL REFERENCES categorias (id),
    modelo         TEXT,
    talla          TEXT,
    color          TEXT,
    descripcion    TEXT,
    foto           TEXT,
    costo          INTEGER NOT NULL DEFAULT 0 CHECK (costo >= 0),   -- costo promedio por unidad (incluye transporte prorrateado)
    precio         INTEGER NOT NULL DEFAULT 0 CHECK (precio >= 0),  -- precio de venta
    stock          INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),   -- la BD impide vender lo que no hay
    stock_minimo   INTEGER NOT NULL DEFAULT 2 CHECK (stock_minimo >= 0),
    proveedor_id   INTEGER REFERENCES proveedores (id),
    activo         INTEGER NOT NULL DEFAULT 1,
    creado_en      TEXT    NOT NULL,
    actualizado_en TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_productos_categoria ON productos (categoria_id);
CREATE INDEX IF NOT EXISTS ix_productos_nombre ON productos (nombre COLLATE NOCASE);

-- Kardex: cada entrada/salida de mercancía queda registrada.
CREATE TABLE IF NOT EXISTS movimientos_inventario (
    id             INTEGER PRIMARY KEY,
    producto_id    INTEGER NOT NULL REFERENCES productos (id),
    fecha          TEXT    NOT NULL,
    tipo           TEXT    NOT NULL CHECK (tipo IN ('inicial', 'compra', 'venta', 'anulacion', 'ajuste')),
    cantidad       INTEGER NOT NULL CHECK (cantidad <> 0),   -- + entra / - sale
    stock_antes    INTEGER NOT NULL,
    stock_despues  INTEGER NOT NULL CHECK (stock_despues >= 0),
    costo_unitario INTEGER,
    referencia     TEXT,                                      -- 'venta:15', 'compra:3'...
    nota           TEXT,
    usuario_id     INTEGER REFERENCES usuarios (id),
    CHECK (stock_despues = stock_antes + cantidad)
);
CREATE INDEX IF NOT EXISTS ix_mov_producto ON movimientos_inventario (producto_id, fecha);

-- El stock del producto SOLO cambia a través de un movimiento (fuente única de verdad).
CREATE TRIGGER IF NOT EXISTS trg_movimiento_actualiza_stock
AFTER INSERT ON movimientos_inventario
BEGIN
    UPDATE productos
       SET stock = stock + NEW.cantidad,
           actualizado_en = NEW.fecha
     WHERE id = NEW.producto_id;
END;

-- Historial automático de cambios de costo y precio.
CREATE TABLE IF NOT EXISTS historial_precios (
    id              INTEGER PRIMARY KEY,
    producto_id     INTEGER NOT NULL REFERENCES productos (id),
    fecha           TEXT    NOT NULL,
    costo_anterior  INTEGER,
    costo_nuevo     INTEGER,
    precio_anterior INTEGER,
    precio_nuevo    INTEGER
);

CREATE TRIGGER IF NOT EXISTS trg_historial_precios
AFTER UPDATE OF costo, precio ON productos
WHEN OLD.costo <> NEW.costo OR OLD.precio <> NEW.precio
BEGIN
    INSERT INTO historial_precios (producto_id, fecha, costo_anterior, costo_nuevo, precio_anterior, precio_nuevo)
    VALUES (NEW.id, NEW.actualizado_en, OLD.costo, NEW.costo, OLD.precio, NEW.precio);
END;

-- ---------------------------------------------------------------------
-- 3. COMPRAS DE MERCANCÍA
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS compras (
    id                INTEGER PRIMARY KEY,
    proveedor_id      INTEGER REFERENCES proveedores (id),
    fecha             TEXT    NOT NULL,
    factura_proveedor TEXT,
    subtotal          INTEGER NOT NULL CHECK (subtotal >= 0),   -- valor de la mercancía
    transporte        INTEGER NOT NULL DEFAULT 0 CHECK (transporte >= 0),
    otros_costos      INTEGER NOT NULL DEFAULT 0 CHECK (otros_costos >= 0),
    total             INTEGER NOT NULL,
    nota              TEXT,
    usuario_id        INTEGER REFERENCES usuarios (id),
    creado_en         TEXT    NOT NULL,
    CHECK (total = subtotal + transporte + otros_costos)
);
CREATE INDEX IF NOT EXISTS ix_compras_fecha ON compras (fecha);

CREATE TABLE IF NOT EXISTS compra_detalle (
    id                  INTEGER PRIMARY KEY,
    compra_id           INTEGER NOT NULL REFERENCES compras (id),
    producto_id         INTEGER NOT NULL REFERENCES productos (id),
    cantidad            INTEGER NOT NULL CHECK (cantidad > 0),
    costo_unitario      INTEGER NOT NULL CHECK (costo_unitario >= 0),  -- lo que cobró el proveedor
    costo_extra_unidad  INTEGER NOT NULL DEFAULT 0,                    -- transporte/otros prorrateado
    costo_real_unitario INTEGER NOT NULL                                -- costo_unitario + costo_extra_unidad
);

-- ---------------------------------------------------------------------
-- 4. CLIENTES, VENTAS Y FACTURACIÓN
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS clientes (
    id         INTEGER PRIMARY KEY,
    nombre     TEXT NOT NULL,
    telefono   TEXT,
    cedula_rnc TEXT,
    direccion  TEXT,
    notas      TEXT,
    creado_en  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_clientes_nombre ON clientes (nombre COLLATE NOCASE);

-- Secuencias de comprobantes fiscales (NCF) de la DGII. Opcional.
CREATE TABLE IF NOT EXISTS comprobantes_fiscales (
    tipo         TEXT PRIMARY KEY,           -- B01, B02, E31, E32...
    descripcion  TEXT    NOT NULL,
    proximo      INTEGER NOT NULL DEFAULT 1, -- siguiente secuencia a usar
    hasta        INTEGER NOT NULL DEFAULT 0, -- última secuencia autorizada
    vence        TEXT,                       -- fecha de vencimiento autorizada
    activo       INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS ventas (
    id                INTEGER PRIMARY KEY,
    numero            INTEGER NOT NULL UNIQUE,      -- consecutivo de factura
    fecha             TEXT    NOT NULL,
    cliente_id        INTEGER REFERENCES clientes (id),
    cliente_nombre    TEXT,                         -- copia al momento de la venta
    usuario_id        INTEGER NOT NULL REFERENCES usuarios (id),
    subtotal          INTEGER NOT NULL CHECK (subtotal >= 0),   -- suma de precio x cantidad
    descuento         INTEGER NOT NULL DEFAULT 0 CHECK (descuento >= 0),
    total             INTEGER NOT NULL CHECK (total >= 0),
    itbis             INTEGER NOT NULL DEFAULT 0,               -- ITBIS incluido en el total (informativo)
    ncf               TEXT UNIQUE,
    tipo_ncf          TEXT,
    efectivo_recibido INTEGER NOT NULL DEFAULT 0,
    cambio            INTEGER NOT NULL DEFAULT 0,
    estado            TEXT    NOT NULL DEFAULT 'completada' CHECK (estado IN ('completada', 'anulada')),
    pedido_id         INTEGER REFERENCES pedidos (id),
    nota              TEXT,
    anulada_por       INTEGER REFERENCES usuarios (id),
    anulada_en        TEXT,
    motivo_anulacion  TEXT,
    CHECK (total = subtotal - descuento)
);
CREATE INDEX IF NOT EXISTS ix_ventas_fecha ON ventas (fecha);
CREATE INDEX IF NOT EXISTS ix_ventas_cliente ON ventas (cliente_id);

CREATE TABLE IF NOT EXISTS venta_detalle (
    id              INTEGER PRIMARY KEY,
    venta_id        INTEGER NOT NULL REFERENCES ventas (id),
    producto_id     INTEGER REFERENCES productos (id),   -- NULL en artículos por encargo sin ficha
    codigo          TEXT,
    descripcion     TEXT    NOT NULL,
    cantidad        INTEGER NOT NULL CHECK (cantidad > 0),
    precio_unitario INTEGER NOT NULL CHECK (precio_unitario >= 0),
    costo_unitario  INTEGER NOT NULL DEFAULT 0,          -- costo al momento de vender (foto del costo)
    descuento       INTEGER NOT NULL DEFAULT 0 CHECK (descuento >= 0),  -- incluye la parte prorrateada del descuento general
    total           INTEGER NOT NULL,
    CHECK (total = cantidad * precio_unitario - descuento)
);
CREATE INDEX IF NOT EXISTS ix_vd_venta ON venta_detalle (venta_id);
CREATE INDEX IF NOT EXISTS ix_vd_producto ON venta_detalle (producto_id);

-- Un registro por método: varios registros = pago combinado.
CREATE TABLE IF NOT EXISTS venta_pagos (
    id         INTEGER PRIMARY KEY,
    venta_id   INTEGER NOT NULL REFERENCES ventas (id),
    metodo     TEXT    NOT NULL CHECK (metodo IN ('efectivo', 'transferencia', 'tarjeta', 'anticipo')),
    monto      INTEGER NOT NULL CHECK (monto > 0),
    referencia TEXT
);
CREATE INDEX IF NOT EXISTS ix_vp_venta ON venta_pagos (venta_id);

-- ---------------------------------------------------------------------
-- 5. PEDIDOS POR ENCARGO CON ABONOS (anticipo mínimo 50%)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pedidos (
    id             INTEGER PRIMARY KEY,
    numero         INTEGER NOT NULL UNIQUE,
    cliente_id     INTEGER NOT NULL REFERENCES clientes (id),
    fecha          TEXT    NOT NULL,
    fecha_entrega  TEXT,
    total          INTEGER NOT NULL CHECK (total > 0),
    estado         TEXT    NOT NULL DEFAULT 'pendiente'
                   CHECK (estado IN ('pendiente', 'recibido', 'entregado', 'cancelado')),
    nota           TEXT,
    venta_id       INTEGER REFERENCES ventas (id),
    usuario_id     INTEGER REFERENCES usuarios (id),
    actualizado_en TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_pedidos_estado ON pedidos (estado);

CREATE TABLE IF NOT EXISTS pedido_detalle (
    id              INTEGER PRIMARY KEY,
    pedido_id       INTEGER NOT NULL REFERENCES pedidos (id),
    producto_id     INTEGER REFERENCES productos (id),
    descripcion     TEXT    NOT NULL,
    cantidad        INTEGER NOT NULL CHECK (cantidad > 0),
    precio_unitario INTEGER NOT NULL CHECK (precio_unitario >= 0),
    costo_unitario  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS pedido_abonos (
    id         INTEGER PRIMARY KEY,
    pedido_id  INTEGER NOT NULL REFERENCES pedidos (id),
    fecha      TEXT    NOT NULL,
    tipo       TEXT    NOT NULL DEFAULT 'abono' CHECK (tipo IN ('abono', 'devolucion')),
    monto      INTEGER NOT NULL CHECK (monto > 0),
    metodo     TEXT    NOT NULL CHECK (metodo IN ('efectivo', 'transferencia', 'tarjeta')),
    referencia TEXT,
    usuario_id INTEGER REFERENCES usuarios (id)
);
CREATE INDEX IF NOT EXISTS ix_abonos_pedido ON pedido_abonos (pedido_id);
CREATE INDEX IF NOT EXISTS ix_abonos_fecha ON pedido_abonos (fecha);

-- ---------------------------------------------------------------------
-- 6. GASTOS Y CIERRES DE CAJA
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS gastos (
    id          INTEGER PRIMARY KEY,
    fecha       TEXT    NOT NULL,          -- YYYY-MM-DD
    categoria   TEXT    NOT NULL CHECK (categoria IN
                ('alquiler', 'energia', 'transporte', 'publicidad', 'empaques',
                 'sueldos', 'internet_telefono', 'mantenimiento', 'impuestos', 'otros')),
    descripcion TEXT    NOT NULL,
    monto       INTEGER NOT NULL CHECK (monto > 0),
    metodo_pago TEXT    NOT NULL DEFAULT 'efectivo' CHECK (metodo_pago IN ('efectivo', 'transferencia', 'tarjeta')),
    pagado_de_caja INTEGER NOT NULL DEFAULT 0,  -- 1 = salió del efectivo de la caja del día
    usuario_id  INTEGER REFERENCES usuarios (id),
    creado_en   TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_gastos_fecha ON gastos (fecha);

CREATE TABLE IF NOT EXISTS cierres_caja (
    id                INTEGER PRIMARY KEY,
    fecha             TEXT    NOT NULL UNIQUE,   -- YYYY-MM-DD
    fondo_inicial     INTEGER NOT NULL DEFAULT 0,
    efectivo_ventas   INTEGER NOT NULL DEFAULT 0,
    efectivo_abonos   INTEGER NOT NULL DEFAULT 0,
    efectivo_salidas  INTEGER NOT NULL DEFAULT 0,  -- gastos pagados de caja + devoluciones
    efectivo_esperado INTEGER NOT NULL,
    efectivo_contado  INTEGER NOT NULL,
    diferencia        INTEGER NOT NULL,
    transferencias    INTEGER NOT NULL DEFAULT 0,
    tarjetas          INTEGER NOT NULL DEFAULT 0,
    total_ingresos    INTEGER NOT NULL DEFAULT 0,
    cantidad_ventas   INTEGER NOT NULL DEFAULT 0,
    nota              TEXT,
    usuario_id        INTEGER REFERENCES usuarios (id),
    creado_en         TEXT    NOT NULL,
    CHECK (diferencia = efectivo_contado - efectivo_esperado)
);
