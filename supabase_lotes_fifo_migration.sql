-- ══════════════════════════════════════════════════════════════
-- MIGRACIÓN DE BD: LOTES, CADUCIDAD Y FIFO
-- Ejecutar en Supabase SQL Editor
-- ══════════════════════════════════════════════════════════════

-- 1. Nuevas columnas y tablas
ALTER TABLE inventario_entradas ADD COLUMN IF NOT EXISTS fecha_vencimiento DATE;

CREATE TABLE IF NOT EXISTS inventario_lotes (
  id SERIAL PRIMARY KEY,
  codigo_lote TEXT UNIQUE NOT NULL,
  material_id INTEGER REFERENCES inventario_materiales(id),
  cantidad_inicial NUMERIC(12,2) NOT NULL,
  cantidad_disponible NUMERIC(12,2) NOT NULL,
  fecha_ingreso DATE NOT NULL,
  fecha_vencimiento DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS inventario_traslados_lotes (
  id SERIAL PRIMARY KEY,
  traslado_id INTEGER REFERENCES inventario_traslados(id) ON DELETE CASCADE,
  lote_id INTEGER REFERENCES inventario_lotes(id),
  cantidad NUMERIC(12,2) NOT NULL
);

-- Habilitar RLS
ALTER TABLE inventario_lotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventario_traslados_lotes ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'inventario_lotes_all') THEN
        CREATE POLICY "inventario_lotes_all" ON inventario_lotes FOR ALL USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'inventario_traslados_lotes_all') THEN
        CREATE POLICY "inventario_traslados_lotes_all" ON inventario_traslados_lotes FOR ALL USING (true) WITH CHECK (true);
    END IF;
END $$;

-- 2. Migrar stock legacy a lotes iniciales
DO $$
DECLARE
  v_material RECORD;
  v_stock_total NUMERIC;
BEGIN
  -- Calcular stock consolidado por material (stock inicial + entradas - traslados)
  FOR v_material IN SELECT id FROM inventario_materiales LOOP
    -- Stock inicial
    SELECT COALESCE(SUM(stock_kg), 0) INTO v_stock_total
    FROM inventario_stock_inicial 
    WHERE material_id = v_material.id;
    
    -- Sumar entradas
    v_stock_total := COALESCE(v_stock_total, 0) + COALESCE((
      SELECT SUM(cantidad_kg)
      FROM inventario_entradas
      WHERE material_id = v_material.id
    ), 0);
    
    -- Restar traslados
    v_stock_total := COALESCE(v_stock_total, 0) - COALESCE((
      SELECT SUM(cantidad_kg)
      FROM inventario_traslados
      WHERE material_id = v_material.id
    ), 0);
    
    IF COALESCE(v_stock_total, 0) != 0 THEN
      -- Crear LOTE-INICIAL
      INSERT INTO inventario_lotes (codigo_lote, material_id, cantidad_inicial, cantidad_disponible, fecha_ingreso, fecha_vencimiento)
      VALUES (
        'LOTE-INICIAL-' || v_material.id,
        v_material.id,
        v_stock_total,
        v_stock_total,
        '2000-01-01',
        '2099-12-31'
      ) ON CONFLICT (codigo_lote) DO UPDATE SET 
        cantidad_disponible = EXCLUDED.cantidad_disponible,
        cantidad_inicial = EXCLUDED.cantidad_inicial;
    END IF;
  END LOOP;
END $$;

-- 3. Crear RPC liquidar_explosion_fifo
CREATE OR REPLACE FUNCTION liquidar_explosion_fifo(
  p_ops_data JSONB,
  p_consumos JSONB,
  p_fecha DATE,
  p_semana INT,
  p_mes INT,
  p_anio INT
) RETURNS VOID AS $$
DECLARE
  v_op JSONB;
  v_op_id INT;
  v_op_snapshot JSONB;
  v_ops_lotes TEXT := '';
  
  v_consumo JSONB;
  v_material_id INT;
  v_cantidad_requerida NUMERIC;
  
  v_lote RECORD;
  v_cantidad_descontar NUMERIC;
  v_traslado_id INT;
  v_ultimo_lote_id INT;
BEGIN

  -- 1. Marcar OPs como LIQUIDADAS
  FOR v_op IN SELECT * FROM jsonb_array_elements(p_ops_data) LOOP
    v_op_id := (v_op->>'id')::INT;
    v_op_snapshot := v_op->'snapshot';
    
    UPDATE programacion
    SET estado_formulacion = 'LIQUIDADA', formula_snapshot = v_op_snapshot
    WHERE id = v_op_id;
    
    v_ops_lotes := v_ops_lotes || COALESCE(v_op_snapshot->>'lote', v_op->>'id') || ', ';
  END LOOP;
  
  v_ops_lotes := RTRIM(v_ops_lotes, ', ');

  -- 2. Procesar consumos FIFO
  FOR v_consumo IN SELECT * FROM jsonb_array_elements(p_consumos) LOOP
    v_material_id := (v_consumo->>'material_id')::INT;
    v_cantidad_requerida := (v_consumo->>'cantidad')::NUMERIC;
    
    IF v_cantidad_requerida <= 0 THEN
      CONTINUE;
    END IF;
    
    -- Insertar traslado
    INSERT INTO inventario_traslados (
      fecha, cliente_op, material_id, cantidad_kg, semana, mes, anio, observaciones
    ) VALUES (
      p_fecha, 'OP(s): ' || SUBSTRING(v_ops_lotes, 1, 40), v_material_id, v_cantidad_requerida, p_semana, p_mes, p_anio, 'Liquidacion automatica de Formulacion (FIFO)'
    ) RETURNING id INTO v_traslado_id;

    -- Descuento FIFO
    v_ultimo_lote_id := null;
    
    FOR v_lote IN 
      SELECT id, cantidad_disponible 
      FROM inventario_lotes 
      WHERE material_id = v_material_id AND cantidad_disponible > 0 
      ORDER BY fecha_vencimiento ASC NULLS LAST, fecha_ingreso ASC, id ASC 
    LOOP
      v_ultimo_lote_id := v_lote.id;
      
      IF v_cantidad_requerida <= 0 THEN
        EXIT;
      END IF;
      
      IF v_lote.cantidad_disponible >= v_cantidad_requerida THEN
        v_cantidad_descontar := v_cantidad_requerida;
        v_cantidad_requerida := 0;
      ELSE
        v_cantidad_descontar := v_lote.cantidad_disponible;
        v_cantidad_requerida := v_cantidad_requerida - v_cantidad_descontar;
      END IF;
      
      UPDATE inventario_lotes 
      SET cantidad_disponible = cantidad_disponible - v_cantidad_descontar 
      WHERE id = v_lote.id;
      
      INSERT INTO inventario_traslados_lotes (traslado_id, lote_id, cantidad) 
      VALUES (v_traslado_id, v_lote.id, v_cantidad_descontar);
      
    END LOOP;
    
    -- Si no hubo suficiente inventario en lotes
    IF v_cantidad_requerida > 0 THEN
      IF v_ultimo_lote_id IS NULL THEN
        SELECT id INTO v_ultimo_lote_id FROM inventario_lotes WHERE material_id = v_material_id ORDER BY fecha_ingreso DESC LIMIT 1;
        
        IF v_ultimo_lote_id IS NULL THEN
          INSERT INTO inventario_lotes (codigo_lote, material_id, cantidad_inicial, cantidad_disponible, fecha_ingreso)
          VALUES ('LOTE-SOBREGIRO-' || v_material_id || '-' || to_char(now(), 'YYYYMMDD'), v_material_id, 0, 0, p_fecha)
          RETURNING id INTO v_ultimo_lote_id;
        END IF;
      END IF;
      
      UPDATE inventario_lotes 
      SET cantidad_disponible = cantidad_disponible - v_cantidad_requerida 
      WHERE id = v_ultimo_lote_id;
      
      INSERT INTO inventario_traslados_lotes (traslado_id, lote_id, cantidad) 
      VALUES (v_traslado_id, v_ultimo_lote_id, v_cantidad_requerida);
    END IF;

  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- 4. Exponer tablas a realtime si hace falta
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE inventario_lotes;
EXCEPTION WHEN duplicate_object THEN
  -- do nothing
END $$;
