// ══════════════════════════════════════════════════════════════
// API: INVENTARIO DE MATERIA PRIMA
// Funciones para materiales, entradas, traslados, stock inicial
// y cálculo consolidado del inventario.
// ══════════════════════════════════════════════════════════════

import supabase from '../supabase';
import { registrarAuditoria } from '../supabase';

// =========== MATERIALES ===========
export async function fetchInventarioMateriales() {
  const { data, error } = await supabase
    .from('inventario_materiales')
    .select('*')
    .order('nombre');
  if (error) throw error;
  return data || [];
}

export async function upsertInventarioMaterial(material: {
  id?: number, codigo: number, nombre: string, tipo?: string, udm?: string, peso_kg?: number | null, min_cobertura_semanas?: number
}) {
  const { data, error } = await supabase
    .from('inventario_materiales')
    .upsert(material, { onConflict: material.id ? 'id' : 'codigo' })
    .select('id')
    .single();
  if (error) throw error;
  return data;
}

export async function deleteInventarioMaterial(id: number) {
  const { error } = await supabase.from('inventario_materiales').delete().eq('id', id);
  if (error) throw error;
}

// ── Entradas ──
export async function fetchInventarioEntradas(mes: number, anio: number) {
  const startDate = `${anio}-${String(mes).padStart(2, '0')}-01`;
  const endMonth = mes === 12 ? 1 : mes + 1;
  const endYear = mes === 12 ? anio + 1 : anio;
  const endDate = `${endYear}-${String(endMonth).padStart(2, '0')}-01`;

  const { data, error } = await supabase
    .from('inventario_entradas')
    .select('*, inventario_materiales(codigo, nombre, peso_kg)')
    .gte('fecha', startDate)
    .lt('fecha', endDate)
    .order('fecha', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function createInventarioEntrada(entrada: {
  fecha: string; material_id: number; cantidad_kg: number; observaciones?: string;
}) {
  const { error } = await supabase.from('inventario_entradas').insert([entrada]);
  if (error) throw error;
  await registrarAuditoria('CREATE', 'Inventario MP', `Entrada de ${entrada.cantidad_kg} kg, material ID ${entrada.material_id}`);
}

export async function updateInventarioEntrada(id: number, entrada: {
  fecha?: string; material_id?: number; cantidad_kg?: number; observaciones?: string;
}) {
  const { error } = await supabase.from('inventario_entradas').update(entrada).eq('id', id);
  if (error) throw error;
  await registrarAuditoria('UPDATE', 'Inventario MP', `Actualizada entrada ID ${id}`);
}

export async function deleteInventarioEntrada(id: number) {
  const { error } = await supabase.from('inventario_entradas').delete().eq('id', id);
  if (error) throw error;
  await registrarAuditoria('DELETE', 'Inventario MP', `Eliminada entrada ID ${id}`);
}

// ── Traslados ──
export async function fetchInventarioTraslados(mes: number, anio: number) {
  const { data, error } = await supabase
    .from('inventario_traslados')
    .select('*, inventario_materiales(codigo, nombre)')
    .eq('mes', mes)
    .eq('anio', anio)
    .order('fecha', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function createInventarioTrasladoBatch(traslados: {
  fecha: string; cliente_op: string; material_id: number;
  cantidad_kg: number; semana: number; mes: number; anio: number; observaciones?: string;
}[]) {
  if (traslados.length === 0) return;
  const { error } = await supabase.from('inventario_traslados').insert(traslados);
  if (error) throw error;
  await registrarAuditoria('CREATE', 'Inventario MP', `Registrados ${traslados.length} traslados para OP ${traslados[0].cliente_op}`);
}

export async function createInventarioTraslado(traslado: {
  fecha: string; cliente_op: string; material_id: number;
  cantidad_kg: number; semana: number; mes: number; anio: number; observaciones?: string;
}) {
  const { error } = await supabase.from('inventario_traslados').insert([traslado]);
  if (error) throw error;
  await registrarAuditoria('CREATE', 'Inventario MP', `Traslado de ${traslado.cantidad_kg} kg a ${traslado.cliente_op}`);
}

export async function updateInventarioTraslado(id: number, traslado: {
  fecha?: string; cliente_op?: string; material_id?: number;
  cantidad_kg?: number; semana?: number; observaciones?: string;
}) {
  const { error } = await supabase.from('inventario_traslados').update(traslado).eq('id', id);
  if (error) throw error;
  await registrarAuditoria('UPDATE', 'Inventario MP', `Actualizado traslado ID ${id}`);
}

export async function deleteInventarioTraslado(id: number) {
  const { error } = await supabase.from('inventario_traslados').delete().eq('id', id);
  if (error) throw error;
  await registrarAuditoria('DELETE', 'Inventario MP', `Eliminado traslado ID ${id}`);
}

// ── Histórico de Consumos ──
export async function fetchHistoricoConsumo(material_id: number) {
  const d = new Date();
  d.setMonth(d.getMonth() - 6);
  const startDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;

  const { data, error } = await supabase
    .from('inventario_traslados')
    .select('cantidad_kg, mes, anio, fecha')
    .eq('material_id', material_id)
    .gte('fecha', startDate)
    .order('fecha', { ascending: true });

  if (error) throw error;
  
  const grouped: Record<string, number> = {};
  for (const t of (data || [])) {
    const key = `${t.anio}-${String(t.mes).padStart(2, '0')}`;
    grouped[key] = (grouped[key] || 0) + Number(t.cantidad_kg);
  }

  return grouped;
}

// ── Stock Inicial ──
export async function fetchStockInicial(mes: number, anio: number) {
  const { data, error } = await supabase
    .from('inventario_stock_inicial')
    .select('*, inventario_materiales(codigo, nombre)')
    .eq('mes', mes)
    .eq('anio', anio);
  if (error) throw error;
  return data || [];
}

export async function upsertStockInicial(row: {
  material_id: number; mes: number; anio: number; stock_kg: number; consumo_estimado_mes?: number;
}) {
  const { error } = await supabase
    .from('inventario_stock_inicial')
    .upsert(row, { onConflict: 'material_id,mes,anio' });
  if (error) throw error;
}

export async function upsertStockInicialBatch(rows: Array<{
  material_id: number; mes: number; anio: number; stock_kg: number; consumo_estimado_mes?: number;
}>) {
  const { error } = await supabase
    .from('inventario_stock_inicial')
    .upsert(rows, { onConflict: 'material_id,mes,anio' });
  if (error) throw error;
  await registrarAuditoria('UPDATE', 'Inventario MP', `Stock inicial actualizado para ${rows.length} materiales`);
}

// ── Cálculo Consolidado ──
export interface InventarioConsolidado {
  material_id: number;
  codigo: number;
  nombre: string;
  peso_kg: number | null;
  stock_inicial: number;
  entradas: number;
  traslados: number;
  stock_final: number;
  consumo_estimado_mes: number;
  consumo_semanal: number;
  semanas_cobertura: number | null;
  min_cobertura_semanas: number;
  pendiente_ingresar: number;
  consumo_semana: number[];
}

export async function calcularInventarioConsolidado(mes: number, anio: number): Promise<InventarioConsolidado[]> {
  const [materiales, stockData, entradasData, trasladosData] = await Promise.all([
    fetchInventarioMateriales(),
    fetchStockInicial(mes, anio),
    fetchInventarioEntradas(mes, anio),
    fetchInventarioTraslados(mes, anio),
  ]);

  const stockMap: Record<number, { stock_kg: number; consumo_estimado_mes: number }> = {};
  for (const s of stockData) {
    stockMap[s.material_id] = { stock_kg: s.stock_kg || 0, consumo_estimado_mes: s.consumo_estimado_mes || 0 };
  }

  const entradasMap: Record<number, number> = {};
  for (const e of entradasData) {
    entradasMap[e.material_id] = (entradasMap[e.material_id] || 0) + (e.cantidad_kg || 0);
  }

  const trasladosPorMaterial: Record<number, number[]> = {};
  const trasladosTotal: Record<number, number> = {};
  for (const t of trasladosData) {
    if (!trasladosPorMaterial[t.material_id]) {
      trasladosPorMaterial[t.material_id] = [0, 0, 0, 0, 0];
    }
    const semIdx = (t.semana || 1) - 1;
    if (semIdx >= 0 && semIdx < 5) {
      trasladosPorMaterial[t.material_id][semIdx] += t.cantidad_kg || 0;
    }
    trasladosTotal[t.material_id] = (trasladosTotal[t.material_id] || 0) + (t.cantidad_kg || 0);
  }

  const result: InventarioConsolidado[] = [];
  for (const mat of materiales) {
    const stock = stockMap[mat.id] || { stock_kg: 0, consumo_estimado_mes: 0 };
    const entradas = entradasMap[mat.id] || 0;
    const traslados = trasladosTotal[mat.id] || 0;
    const stockFinal = stock.stock_kg + entradas - traslados;
    const consumoEst = stock.consumo_estimado_mes;
    const consumoSemanal = consumoEst / 4.3;
    const semanasCobertura = consumoSemanal > 0 ? stockFinal / consumoSemanal : null;
    const pendiente = Math.max(0, consumoEst - stock.stock_kg - entradas);

    if (stock.stock_kg === 0 && entradas === 0 && traslados === 0 && consumoEst === 0) continue;

    result.push({
      material_id: mat.id,
      codigo: mat.codigo,
      nombre: mat.nombre,
      peso_kg: mat.peso_kg,
      stock_inicial: stock.stock_kg,
      entradas,
      traslados,
      stock_final: stockFinal,
      consumo_estimado_mes: consumoEst,
      consumo_semanal: consumoSemanal,
      semanas_cobertura: semanasCobertura,
      min_cobertura_semanas: mat.min_cobertura_semanas || 2,
      pendiente_ingresar: pendiente,
      consumo_semana: trasladosPorMaterial[mat.id] || [0, 0, 0, 0, 0],
    });
  }

  return result.sort((a, b) => a.nombre.localeCompare(b.nombre));
}
