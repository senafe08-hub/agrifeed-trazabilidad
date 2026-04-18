// ══════════════════════════════════════════════════════════════
// API: FORMULACIÓN
// Funciones para fórmulas, asignaciones OP↔Fórmula, 
// explosión de materiales y liquidación de inventario.
// ══════════════════════════════════════════════════════════════

import supabase from '../supabase';
import { registrarAuditoria } from '../supabase';

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
  header: Omit<FormulaHeader, 'id' | 'created_at' | 'updated_at' | 'maestro_alimentos' | 'maestro_clientes' | 'formula_detalle'>,
  detalles: Omit<FormulaDetalle, 'id' | 'formula_id' | 'inventario_materiales'>[]
) {
  const { data: newFormula, error: e1 } = await supabase.from('formulas').insert([{
    nombre: header.nombre, alimento_sap: header.alimento_sap, cliente_sap: header.cliente_sap,
    observaciones: header.observaciones || '', sacos_por_bache: header.sacos_por_bache, categoria: header.categoria || '', estado: header.estado || 'activa',
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
  header: Partial<Omit<FormulaHeader, 'id' | 'created_at' | 'updated_at' | 'maestro_alimentos' | 'maestro_clientes' | 'formula_detalle'>>,
  detalles: Omit<FormulaDetalle, 'id' | 'formula_id' | 'inventario_materiales'>[]
) {
  const { error: e1 } = await supabase.from('formulas').update({
    nombre: header.nombre, alimento_sap: header.alimento_sap, cliente_sap: header.cliente_sap,
    observaciones: header.observaciones, sacos_por_bache: header.sacos_por_bache, categoria: header.categoria, estado: header.estado,
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
  opsData: { id: number, snapshot: any }[],
  consumos: { material_id: number, cantidad: number }[]
) {
  const getSemana = (d: Date) => {
    return Math.ceil(d.getDate() / 7);
  };

  if (consumos.length > 0) {
    const now = new Date();
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
      const { error } = await supabase.from('inventario_traslados').insert(traslados);
      if (error) throw new Error('Falló el descuento en BD: ' + error.message);
    }
  }

  for (const op of opsData) {
    const { error } = await supabase.from('programacion').update({ estado_formulacion: 'LIQUIDADA', formula_snapshot: op.snapshot }).eq('id', op.id);
    if (error) throw new Error('Falló al cambiar el estado de la OP: ' + error.message);
  }

  await registrarAuditoria('CREATE', 'Formulación', `Liquidación de ${opsData.length} OPs con descuento de inventario`);
}

export async function reversarLiquidacionExplosion(opId: number) {
  const { data: op, error: opError } = await supabase.from('programacion').select('lote, formula_snapshot').eq('id', opId).single();
  if (opError) throw opError;
  if (!op || !op.formula_snapshot) throw new Error('La OP no tiene un comprobante histórico de liquidación válido para reversar.');

  const snap = op.formula_snapshot as any;
  const baches = snap.baches_usados || 0;
  const detalles = snap.detalles || [];

  if (baches > 0 && detalles.length > 0) {
    const today = new Date().toISOString().split('T')[0];
    const entradas = detalles.map((d: any) => ({
      fecha: today,
      material_id: d.material_id,
      cantidad_kg: d.cantidad_base * baches,
      observaciones: `REVERSO AUTOMÁTICO DE LIQUIDACIÓN - OP: ${snap.lote || opId}`
    })).filter((e: any) => e.cantidad_kg > 0 && e.material_id);

    if (entradas.length > 0) {
      const { error: insError } = await supabase.from('inventario_entradas').insert(entradas);
      if (insError) throw new Error('Error devolviendo el material al inventario: ' + insError.message);
    }
  }

  const { error: updError } = await supabase.from('programacion')
    .update({ estado_formulacion: 'PENDIENTE', formula_snapshot: null })
    .eq('id', opId);
  
  if (updError) throw new Error('Error destrabando el estado de la OP: ' + updError.message);

  await registrarAuditoria('UPDATE', 'Formulación', `Reverso de liquidación ejecutado para OP: ${snap.lote || opId}`);
}
