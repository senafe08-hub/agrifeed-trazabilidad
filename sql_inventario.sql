-- ═══════════════════════════════════════════════════════════
-- INVENTARIO DE MATERIA PRIMA — Tablas Supabase
-- ═══════════════════════════════════════════════════════════

-- 1. Catálogo de materiales de inventario (equivale a CÓDIGOS SAP del Excel)
CREATE TABLE IF NOT EXISTS inventario_materiales (
  id SERIAL PRIMARY KEY,
  codigo INTEGER UNIQUE NOT NULL,
  nombre TEXT NOT NULL,
  peso_kg NUMERIC(10,2),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Entradas de materia prima (recepciones a bodega)
CREATE TABLE IF NOT EXISTS inventario_entradas (
  id SERIAL PRIMARY KEY,
  fecha DATE NOT NULL DEFAULT CURRENT_DATE,
  material_id INTEGER REFERENCES inventario_materiales(id) ON DELETE CASCADE,
  cantidad_kg NUMERIC(12,2) NOT NULL,
  observaciones TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Traslados / Consumos de MP (salidas para producción)
CREATE TABLE IF NOT EXISTS inventario_traslados (
  id SERIAL PRIMARY KEY,
  fecha DATE NOT NULL DEFAULT CURRENT_DATE,
  cliente_op TEXT NOT NULL,
  material_id INTEGER REFERENCES inventario_materiales(id) ON DELETE CASCADE,
  cantidad_kg NUMERIC(12,2) NOT NULL,
  semana INTEGER NOT NULL CHECK (semana BETWEEN 1 AND 5),
  mes INTEGER NOT NULL CHECK (mes BETWEEN 1 AND 12),
  anio INTEGER NOT NULL,
  observaciones TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Stock inicial mensual (inventario físico de inicio de mes)
CREATE TABLE IF NOT EXISTS inventario_stock_inicial (
  id SERIAL PRIMARY KEY,
  material_id INTEGER REFERENCES inventario_materiales(id) ON DELETE CASCADE,
  mes INTEGER NOT NULL CHECK (mes BETWEEN 1 AND 12),
  anio INTEGER NOT NULL,
  stock_kg NUMERIC(12,2) NOT NULL DEFAULT 0,
  consumo_estimado_mes NUMERIC(12,2) DEFAULT 0,
  UNIQUE(material_id, mes, anio)
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_inv_entradas_material ON inventario_entradas(material_id);
CREATE INDEX IF NOT EXISTS idx_inv_entradas_fecha ON inventario_entradas(fecha);
CREATE INDEX IF NOT EXISTS idx_inv_traslados_material ON inventario_traslados(material_id);
CREATE INDEX IF NOT EXISTS idx_inv_traslados_mes_anio ON inventario_traslados(mes, anio);
CREATE INDEX IF NOT EXISTS idx_inv_stock_mes_anio ON inventario_stock_inicial(mes, anio);

-- RLS policies (public access - same as other tables)
ALTER TABLE inventario_materiales ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventario_entradas ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventario_traslados ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventario_stock_inicial ENABLE ROW LEVEL SECURITY;

CREATE POLICY "inventario_materiales_all" ON inventario_materiales FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "inventario_entradas_all" ON inventario_entradas FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "inventario_traslados_all" ON inventario_traslados FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "inventario_stock_inicial_all" ON inventario_stock_inicial FOR ALL USING (true) WITH CHECK (true);
