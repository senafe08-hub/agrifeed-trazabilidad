-- ══════════════════════════════════════════════════════════════════════
-- MIGRACIÓN MRP — Agrifeed Trazabilidad
-- Módulo de Ventas, Inventario PT, Propuestas de OP, Reprocesos, Préstamos
-- Fecha: 2026-04-19
-- ══════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────
-- 1. CATÁLOGO DE CASAS FORMULADORAS
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS casas_formuladoras (
  id SERIAL PRIMARY KEY,
  nombre TEXT NOT NULL UNIQUE,
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO casas_formuladoras (nombre) VALUES 
  ('PREMEX'), ('NUTREXCOL'), ('PROVIMI'), ('NUTRIPORK')
ON CONFLICT (nombre) DO NOTHING;

-- ─────────────────────────────────────────
-- 2. SOLICITUDES DE VENTAS
-- Registra los pedidos diarios de clientes
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ventas_solicitudes (
  id SERIAL PRIMARY KEY,
  fecha DATE NOT NULL,
  semana INT NOT NULL,
  dia_semana TEXT NOT NULL,
  cliente_id INT NOT NULL,                -- → maestro_clientes.codigo_sap
  codigo_sap INT NOT NULL,                -- → maestro_alimentos.codigo_sap
  casa_formuladora_id INT NOT NULL REFERENCES casas_formuladoras(id),
  presentacion TEXT DEFAULT 'BULTOS',
  cantidad INT NOT NULL CHECK (cantidad > 0),
  observaciones TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vs_semana ON ventas_solicitudes(semana);
CREATE INDEX IF NOT EXISTS idx_vs_fecha ON ventas_solicitudes(fecha);
CREATE INDEX IF NOT EXISTS idx_vs_cliente ON ventas_solicitudes(cliente_id);

-- ─────────────────────────────────────────
-- 3. INVENTARIO DE PRODUCTO TERMINADO
-- Stock semanal por grupo + referencia
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS inventario_pt (
  id SERIAL PRIMARY KEY,
  grupo TEXT NOT NULL,                    -- 'VILTAGRO SAS', 'CERDOS VARIOS PREMEX', etc.
  codigo_sap INT NOT NULL,                -- → maestro_alimentos.codigo_sap
  semana INT NOT NULL,
  anio INT NOT NULL,
  inventario_inicial INT DEFAULT 0,
  lote TEXT,
  observaciones TEXT,
  updated_by TEXT,
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(grupo, codigo_sap, semana, anio)
);

CREATE INDEX IF NOT EXISTS idx_ipt_grupo_sem ON inventario_pt(grupo, semana, anio);

-- ─────────────────────────────────────────
-- 4. REPROCESOS DE PRODUCTO TERMINADO
-- Bultos que se descartan del inventario
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reprocesos_pt (
  id SERIAL PRIMARY KEY,
  grupo TEXT NOT NULL,
  codigo_sap INT NOT NULL,
  cantidad INT NOT NULL CHECK (cantidad > 0),
  motivo TEXT NOT NULL,
  fecha DATE NOT NULL DEFAULT CURRENT_DATE,
  semana INT NOT NULL,
  anio INT NOT NULL,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rpt_grupo_sem ON reprocesos_pt(grupo, semana, anio);

-- ─────────────────────────────────────────
-- 5. PRÉSTAMOS DE INVENTARIO ENTRE BODEGAS
-- Préstamos entre grupos con compensación
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS prestamos_inventario (
  id SERIAL PRIMARY KEY,
  fecha DATE NOT NULL DEFAULT CURRENT_DATE,
  grupo_origen TEXT NOT NULL,             -- De quién se tomó
  grupo_destino TEXT NOT NULL,            -- A quién se le dio
  codigo_sap INT NOT NULL,
  cantidad INT NOT NULL CHECK (cantidad > 0),
  op_compensacion INT,                    -- Lote de la OP que compensará
  estado TEXT DEFAULT 'PENDIENTE' CHECK (estado IN ('PENDIENTE','COMPENSADO','PARCIAL')),
  cantidad_compensada INT DEFAULT 0,
  motivo TEXT,
  created_by TEXT,
  compensado_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_prest_estado ON prestamos_inventario(estado);
CREATE INDEX IF NOT EXISTS idx_prest_op ON prestamos_inventario(op_compensacion);

-- ─────────────────────────────────────────
-- 6. PROPUESTAS DE OP (Flujo de aprobación)
-- Ventas propone → Producción aprueba
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS propuestas_op (
  id SERIAL PRIMARY KEY,
  semana INT NOT NULL,
  anio INT NOT NULL,
  codigo_sap INT NOT NULL,
  cliente_id INT,
  grupo TEXT,
  casa_formuladora_id INT REFERENCES casas_formuladoras(id),
  formula_id INT,
  -- Datos del cálculo MRP (trazabilidad del por qué)
  demanda_actual INT DEFAULT 0,
  demanda_proxima INT DEFAULT 0,
  inventario_fisico INT DEFAULT 0,
  op_pendientes INT DEFAULT 0,
  reproceso INT DEFAULT 0,
  prestamos_pendientes INT DEFAULT 0,
  necesidad_neta INT NOT NULL,
  -- Conversión a baches
  sacos_por_bache INT NOT NULL,
  baches_propuestos INT NOT NULL,
  bultos_resultantes INT NOT NULL,
  -- Flujo de aprobación
  estado TEXT DEFAULT 'PROPUESTA' CHECK (estado IN (
    'PROPUESTA','ACEPTADA','RECHAZADA','AJUSTADA','PROGRAMADA'
  )),
  op_generada_id INT,                     -- FK a programacion.id cuando se crea
  lote_generado INT,                      -- Lote asignado a la OP creada
  motivo_rechazo TEXT,
  created_by TEXT,
  reviewed_by TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  reviewed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_prop_estado ON propuestas_op(estado);
CREATE INDEX IF NOT EXISTS idx_prop_semana ON propuestas_op(semana, anio);

-- ─────────────────────────────────────────
-- 7. COLUMNAS NUEVAS EN TABLAS EXISTENTES
-- ─────────────────────────────────────────

-- Clasificación de clientes para bodegas de PT
ALTER TABLE maestro_clientes ADD COLUMN IF NOT EXISTS tipo_inventario TEXT DEFAULT 'VARIOS';
ALTER TABLE maestro_clientes ADD COLUMN IF NOT EXISTS grupo_inventario TEXT;

-- ─────────────────────────────────────────
-- 8. HABILITAR RLS (Row Level Security)
-- ─────────────────────────────────────────
ALTER TABLE casas_formuladoras ENABLE ROW LEVEL SECURITY;
ALTER TABLE ventas_solicitudes ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventario_pt ENABLE ROW LEVEL SECURITY;
ALTER TABLE reprocesos_pt ENABLE ROW LEVEL SECURITY;
ALTER TABLE prestamos_inventario ENABLE ROW LEVEL SECURITY;
ALTER TABLE propuestas_op ENABLE ROW LEVEL SECURITY;

-- Políticas permisivas (igual que las tablas existentes)
CREATE POLICY "Acceso completo casas_formuladoras" ON casas_formuladoras FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Acceso completo ventas_solicitudes" ON ventas_solicitudes FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Acceso completo inventario_pt" ON inventario_pt FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Acceso completo reprocesos_pt" ON reprocesos_pt FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Acceso completo prestamos_inventario" ON prestamos_inventario FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Acceso completo propuestas_op" ON propuestas_op FOR ALL USING (true) WITH CHECK (true);

-- ══════════════════════════════════════════════════════════════════════
-- FIN DE MIGRACIÓN
-- ══════════════════════════════════════════════════════════════════════
