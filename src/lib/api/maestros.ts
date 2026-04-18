// ══════════════════════════════════════════════════════════════
// API: MAESTROS Y PROGRAMACIÓN
// Funciones generales de consulta de maestros (clientes, granjas,
// vehículos) y programación de OPs.
// ══════════════════════════════════════════════════════════════

import supabase from '../supabase';

// ---------- Helper to fetch programacion (OP) data ----------
export async function fetchProgramacion() {
  const { data, error } = await supabase.from('programacion').select(`
    id, lote, fecha, codigo_sap, bultos_programados, num_baches, cliente_id, observaciones, maestro_alimentos(descripcion), maestro_clientes(nombre)`
  );
  if (error) throw error;
  return (data || []).map(row => ({
    ...row,
    op: row.lote,
    cantidad_entregada: 0,
    cantidad_despachada_acumulada: 0
  }));
}

// ---------- Helper to fetch master data ----------
export async function fetchMaestros() {
  const [{ data: granjas }, { data: vehiculos }, { data: clientes }] = await Promise.all([
    supabase.from('maestro_granjas').select('id, nombre').order('nombre'),
    supabase.from('maestro_vehiculos').select('id, placa, conductor').order('placa'),
    supabase.from('maestro_clientes').select('id, codigo_sap, nombre').order('nombre'),
  ]);
  return { granjas, vehiculos, clientes };
}

// ---------- Fetch accumulated delivered quantities from production per lote ----------
export async function fetchProduccionAcumulada(): Promise<Record<number, number>> {
  const { data, error } = await supabase
    .from('produccion')
    .select('lote, bultos_entregados');
  if (error) {
    console.error('Error fetching production acumulada:', error);
    return {};
  }
  const produccion: Record<number, number> = {};
  for (const row of (data || [])) {
    if (row.lote) {
      produccion[row.lote] = (produccion[row.lote] || 0) + (row.bultos_entregados || 0);
    }
  }
  return produccion;
}
