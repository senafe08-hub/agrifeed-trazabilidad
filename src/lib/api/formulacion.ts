// ══════════════════════════════════════════════════════════════
// API: FORMULACIÓN
// Funciones para fórmulas, asignaciones OP↔Fórmula, 
// explosión de materiales y liquidación de inventario.
// ══════════════════════════════════════════════════════════════

import supabase from '../supabase';
import { registrarAuditoria } from '../supabase';
import { clearInventarioCache } from './inventario';

export interface FormulaHeader {
  id?: number;
  nombre: string;
  alimento_sap: number | null;
  cliente_sap: number | null;
  observaciones: string;
  sacos_por_bache: number;
  estado: 'activa' | 'inactiva';
  categoria: string;
  created_at?: string;
  updated_at?: string;
  maestro_alimentos?: { descripcion: string } | null;
  maestro_clientes?: { nombre: string } | null;
  formula_detalle?: FormulaDetalle[];
}

export interface FormulaDetalle {
  id?: number;
  formula_id?: number;
  material_id: number;
  cantidad_base: number;
  unidad: string;
  referencia: string;
  observaciones: string;
  inventario_materiales?: { id: number; codigo: number; nombre: string } | null;
}

export async function fetchFormulas(): Promise<FormulaHeader[]> {
  const { data, error } = await supabase.from('formulas').select('*').order('nombre');
  if (error) throw error;
  return data || [];
}

export async function fetchFormulaConDetalle(formulaId: number): Promise<{ header: FormulaHeader; detalle: FormulaDetalle[] }> {
  const { data: header, error: e1 } = await supabase.from('formulas').select('*').eq('id', formulaId).single();
  if (e1) throw e1;
  const { data: detalle, error: e2 } = await supabase.from('formula_detalle').select('*, inventario_materiales(id, codigo, nombre)').eq('formula_id', formulaId).order('id');
  if (e2) throw e2;
  return { header, detalle: detalle || [] };
}

export async function createFormula(
  header: Omit<FormulaHeader, 'id' | 'updated_at' | 'maestro_alimentos' | 'maestro_clientes' | 'formula_detalle'>,
  detalles: Omit<FormulaDetalle, 'id' | 'formula_id' | 'inventario_materiales'>[]
) {
  const { data: newFormula, error: e1 } = await supabase.from('formulas').insert([{
    nombre: header.nombre, alimento_sap: header.alimento_sap, cliente_sap: header.cliente_sap,
    observaciones: header.observaciones || '', sacos_por_bache: header.sacos_por_bache, categoria: header.categoria || '', estado: header.estado || 'activa', created_at: header.created_at
  }]).select('id').single();
  if (e1) throw e1;
  const formulaId = newFormula.id;
  if (detalles.length > 0) {
    const rows = detalles.map(d => ({ formula_id: formulaId, material_id: d.material_id, cantidad_base: d.cantidad_base, unidad: d.unidad || 'KG', referencia: d.referencia || '', observaciones: d.observaciones || '' }));
    const { error: e2 } = await supabase.from('formula_detalle').insert(rows);
    if (e2) throw e2;
  }
  await registrarAuditoria('CREATE', 'Formulación', `Fórmula "${header.nombre}" creada con ${detalles.length} ingredientes`);
  return formulaId;
}

export async function updateFormula(
  formulaId: number,
  header: Partial<Omit<FormulaHeader, 'id' | 'updated_at' | 'maestro_alimentos' | 'maestro_clientes' | 'formula_detalle'>>,
  detalles: Omit<FormulaDetalle, 'id' | 'formula_id' | 'inventario_materiales'>[]
) {
  const { error: e1 } = await supabase.from('formulas').update({
    nombre: header.nombre, alimento_sap: header.alimento_sap, cliente_sap: header.cliente_sap,
    observaciones: header.observaciones, sacos_por_bache: header.sacos_por_bache, categoria: header.categoria, estado: header.estado, created_at: header.created_at
  }).eq('id', formulaId);
  if (e1) throw e1;
  const { error: e2 } = await supabase.from('formula_detalle').delete().eq('formula_id', formulaId);
  if (e2) throw e2;
  if (detalles.length > 0) {
    const rows = detalles.map(d => ({ formula_id: formulaId, material_id: d.material_id, cantidad_base: d.cantidad_base, unidad: d.unidad || 'KG', referencia: d.referencia || '', observaciones: d.observaciones || '' }));
    const { error: e3 } = await supabase.from('formula_detalle').insert(rows);
    if (e3) throw e3;
  }
  await registrarAuditoria('UPDATE', 'Formulación', `Fórmula ID ${formulaId} actualizada (${detalles.length} ingredientes)`);
}

export async function toggleFormulaEstado(formulaId: number, nuevoEstado: 'activa' | 'inactiva') {
  const { error } = await supabase.from('formulas').update({ estado: nuevoEstado }).eq('id', formulaId);
  if (error) throw error;
  await registrarAuditoria('UPDATE', 'Formulación', `Fórmula ID ${formulaId} -> ${nuevoEstado}`);
}

export async function deleteFormula(formulaId: number) {
  const { error: e1 } = await supabase.from('formula_detalle').delete().eq('formula_id', formulaId);
  if (e1) throw e1;
  const { error: e2 } = await supabase.from('formulas').delete().eq('id', formulaId);
  if (e2) throw e2;
  await registrarAuditoria('DELETE', 'Formulación', `Fórmula ID ${formulaId} eliminada`);
}

export async function assignFormulaToOP(opId: number, formulaId: number | null) {
  const { error } = await supabase.from('programacion').update({ formula_id: formulaId }).eq('id', opId);
  if (error) throw error;
  await registrarAuditoria('UPDATE', 'Formulación', `OP ID ${opId} -> Fórmula ${formulaId ?? 'ninguna'}`);
}

export async function fetchOPsConFormula() {
  const { data, error } = await supabase.from('programacion')
    .select('*, maestro_alimentos(descripcion), maestro_clientes(nombre), formulas(id, nombre, estado)')
    .order('lote', { ascending: false }).limit(5000);
  if (error) throw error;
  return data || [];
}

export async function fetchOPsPorLotes(lotes: (string | number)[]) {
  if (!lotes || lotes.length === 0) return [];
  const { data, error } = await supabase.from('programacion')
    .select('*, maestro_alimentos(descripcion), maestro_clientes(nombre), formulas(id, nombre, estado, sacos_por_bache)')
    .in('lote', lotes);
  if (error) throw error;
  return data || [];
}

export async function fetchFormulasDetalleBatch(formulaIds: number[]): Promise<Record<number, FormulaDetalle[]>> {
  if (!formulaIds || formulaIds.length === 0) return {};
  const { data: detalles, error } = await supabase.from('formula_detalle')
    .select('*, inventario_materiales(id, codigo, nombre)')
    .in('formula_id', formulaIds);
  if (error) throw error;
  
  const map: Record<number, FormulaDetalle[]> = {};
  for (const det of (detalles || [])) {
    if (!map[det.formula_id!]) map[det.formula_id!] = [];
    map[det.formula_id!].push(det);
  }
  return map;
}

export async function fetchOPsParaExplosion(fechaDesde: string, fechaHasta: string, clienteSap?: number) {
  let query = supabase.from('programacion')
    .select('*, maestro_alimentos(descripcion), maestro_clientes(nombre), formulas(id, nombre, sacos_por_bache, estado)')
    .gte('fecha', fechaDesde).lte('fecha', fechaHasta);
  if (clienteSap) query = query.eq('cliente_id', clienteSap);
  query = query.order('lote');
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function liquidarExplosionInventario(
  opsData: { id: number, snapshot: { lote?: number; baches_usados?: number; detalles?: { material_id: number; cantidad_base: number; }[] } }[],
  consumos: { material_id: number, cantidad: number }[]
) {
  const getSemana = (d: Date) => Math.ceil(d.getDate() / 7);
  const now = new Date();

  // Llamada al RPC para manejar toda la transacción de forma atómica (FIFO + Lotes)
  const { error } = await supabase.rpc('liquidar_explosion_fifo', {
    p_ops_data: opsData,
    p_consumos: consumos,
    p_fecha: now.toISOString().split('T')[0],
    p_semana: getSemana(now),
    p_mes: now.getMonth() + 1,
    p_anio: now.getFullYear()
  });

  if (error) {
    console.warn("Fallo en RPC 'liquidar_explosion_fifo' (posiblemente la BD no esté actualizada). Usando fallback manual:", error.message);
    
    if (consumos.length > 0) {
      const opsLotes = String(opsData.map(o => o.snapshot.lote || o.id).join(', '));
      const traslados = consumos.map(c => ({
        fecha: now.toISOString().split('T')[0],
        cliente_op: `OP(s): ${opsLotes.substring(0, 40)}`,
        material_id: c.material_id,
        cantidad_kg: c.cantidad,
        semana: getSemana(now),
        mes: now.getMonth() + 1,
        anio: now.getFullYear(),
        observaciones: `Liquidacion automatica de Formulacion`
      }));

      if (traslados.length > 0) {
        const { error: insErr } = await supabase.from('inventario_traslados').insert(traslados);
        if (insErr) throw new Error('Falló el descuento en BD: ' + insErr.message);
      }
    }

    for (const op of opsData) {
      const { error: opErr } = await supabase.from('programacion').update({ estado_formulacion: 'LIQUIDADA', formula_snapshot: op.snapshot }).eq('id', op.id);
      if (opErr) throw new Error('Falló al cambiar el estado de la OP: ' + opErr.message);
    }
  }

  clearInventarioCache();
  await registrarAuditoria('CREATE', 'Formulación', `Liquidación de ${opsData.length} OPs con descuento de inventario`);
}

export async function reversarLiquidacionExplosion(opId: number) {
  const { data: op, error: opError } = await supabase.from('programacion').select('lote, formula_snapshot').eq('id', opId).single();
  if (opError) throw opError;
  if (!op || !op.formula_snapshot) throw new Error('La OP no tiene un comprobante histórico de liquidación válido para reversar.');

  const snap = op.formula_snapshot as { lote?: number; baches_usados?: number; detalles?: { material_id: number; cantidad_base: number; }[] };
  const baches = snap.baches_usados || 0;
  const detalles = snap.detalles || [];

  if (baches > 0 && detalles.length > 0) {
    const today = new Date().toISOString().split('T')[0];
    const entradas = detalles.map((d: { material_id: number; cantidad_base: number }) => ({
      fecha: today,
      material_id: d.material_id,
      cantidad_kg: d.cantidad_base * baches,
      observaciones: `REVERSO AUTOMÁTICO DE LIQUIDACIÓN - OP: ${snap.lote || opId}`
    })).filter((e: { cantidad_kg: number; material_id: number }) => e.cantidad_kg > 0 && e.material_id);

    if (entradas.length > 0) {
      const { error: insError } = await supabase.from('inventario_entradas').insert(entradas);
      if (insError) throw new Error('Error devolviendo el material al inventario: ' + insError.message);
      
      // Restablecer inventario en el lote correspondiente (nuevo o existente del día)
      for (const ent of entradas) {
        const codigoLote = `LOTE-${ent.material_id}-${today.replace(/-/g, '')}`;
        const { data: existingLot } = await supabase.from('inventario_lotes').select('*').eq('codigo_lote', codigoLote).single();
        if (existingLot) {
          await supabase.from('inventario_lotes').update({
            cantidad_inicial: Number(existingLot.cantidad_inicial) + Number(ent.cantidad_kg),
            cantidad_disponible: Number(existingLot.cantidad_disponible) + Number(ent.cantidad_kg),
          }).eq('id', existingLot.id);
        } else {
          await supabase.from('inventario_lotes').insert([{
            codigo_lote: codigoLote,
            material_id: ent.material_id,
            cantidad_inicial: ent.cantidad_kg,
            cantidad_disponible: ent.cantidad_kg,
            fecha_ingreso: today
          }]);
        }
      }
    }
  }

  const { error: updError } = await supabase.from('programacion')
    .update({ estado_formulacion: 'PENDIENTE', formula_snapshot: null })
    .eq('id', opId);
  
  if (updError) throw new Error('Error destrabando el estado de la OP: ' + updError.message);

  clearInventarioCache();
  await registrarAuditoria('UPDATE', 'Formulación', `Reverso de liquidación ejecutado para OP: ${snap.lote || opId}`);
}
