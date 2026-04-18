// ══════════════════════════════════════════════════════════════
// API: DESPACHOS Y REMISIONES
// Todas las funciones de consulta, creación, actualización y eliminación
// de despachos y remisiones.
// ══════════════════════════════════════════════════════════════

import supabase from '../supabase';
import { registrarAuditoria } from '../supabase';

// ---------- Fetch accumulated dispatched quantities per lote ----------
export async function fetchDespachosAcumulados(): Promise<Record<number, number>> {
  const { data, error } = await supabase
    .from('despachos')
    .select('lote, bultos_despachados');
  if (error) {
    console.error('Error fetching acumulados:', error);
    return {};
  }
  const acumulados: Record<number, number> = {};
  for (const row of (data || [])) {
    if (row.lote) {
      acumulados[row.lote] = (acumulados[row.lote] || 0) + (row.bultos_despachados || 0);
    }
  }
  return acumulados;
}

/** Fetch all despachos and group them by remision to simulate encadezados */
export async function fetchDespachos() {
  const [{ data, error }, { data: progData }] = await Promise.all([
    supabase.from('despachos')
      .select(`*, maestro_clientes(nombre), maestro_vehiculos(placa, conductor), maestro_granjas(nombre)`),
    supabase.from('programacion')
      .select('lote, maestro_alimentos(descripcion)')
  ]);
  if (error) {
    console.error('Error fetching despachos:', error);
    throw error;
  }

  // Build a lote→alimento lookup from programacion
  const alimentoMap: Record<number, string> = {};
  for (const p of (progData || [])) {
    const alim = Array.isArray(p.maestro_alimentos) ? p.maestro_alimentos[0] : p.maestro_alimentos;
    if (p.lote && alim?.descripcion) {
      alimentoMap[p.lote] = alim.descripcion;
    }
  }
  
  const map = new Map<string | number, any>();
  for (const row of (data || [])) {
    const key = row.num_remision || `draft_${row.fecha}_${row.cliente_id}_${row.vehiculo_id}`;
    if (!map.has(key)) {
      map.set(key, {
        id: key,
        fecha: row.fecha,
        hora: row.hora || '',
        remision: row.num_remision,
        cliente_id: row.cliente_id,
        cliente: row.maestro_clientes,
        vehiculo_id: row.vehiculo_id,
        vehiculo: row.maestro_vehiculos,
        conductor_id: null,
        conductor: row.maestro_vehiculos?.conductor || '',
        entregado_por: row.entregado_por || '',
        granja_id: row.granja_id,
        granja: row.maestro_granjas,
        observaciones: row.observaciones,
        estado: row.estado || (row.num_remision ? 'despachado' : 'borrador'),
        detalle: []
      });
    }
    map.get(key).detalle.push({
      id: row.id,
      op: row.lote,
      lote: row.lote,
      alimento: alimentoMap[row.lote] || '',
      cantidad_a_despachar: row.bultos_despachados,
      bultos_devueltos: row.bultos_danados
    });
  }
  return Array.from(map.values()).sort((a: any, b: any) => (b.remision || 0) - (a.remision || 0));
}

/** Get the next consecutive remision number */
export async function fetchNextRemision(): Promise<number> {
  const { data, error } = await supabase
    .from('despachos')
    .select('num_remision')
    .not('num_remision', 'is', null)
    .order('num_remision', { ascending: false })
    .limit(1);
  if (error) {
    console.error('Error fetching max remision:', error);
    return 1;
  }
  const max = data?.[0]?.num_remision || 0;
  return max + 1;
}

/** Create a new despacho by inserting multiple flat rows */
export async function createDespacho(encabezado: any, detalles: any[]) {
  let remisionNum = encabezado.remision ? parseInt(encabezado.remision) : null;
  if (!remisionNum) {
    remisionNum = await fetchNextRemision();
  }

  const rows = detalles.map(d => ({
    fecha: encabezado.fecha,
    hora: encabezado.hora || null,
    num_remision: remisionNum,
    lote: (d.op || d.lote) ? parseInt(d.op || d.lote) : null,
    granja_id: encabezado.granja_id ? parseInt(encabezado.granja_id) : null,
    bultos_despachados: d.cantidad_a_despachar ? parseInt(d.cantidad_a_despachar) : 0,
    bultos_danados: d.bultos_danados ? parseInt(d.bultos_danados) : 0,
    vehiculo_id: encabezado.vehiculo_id ? parseInt(encabezado.vehiculo_id) : null,
    cliente_id: encabezado.cliente_id ? parseInt(encabezado.cliente_id) : null,
    entregado_por: encabezado.entregado_por || null,
    observaciones: encabezado.observaciones || null,
    estado: encabezado.estado || 'borrador'
  }));
  const { error: insertError } = await supabase.from('despachos').insert(rows);
  if (insertError) throw insertError;
  
  await registrarAuditoria('CREATE', 'Despachos', `Se registró el despacho con remisión ${remisionNum}`);
  return { encabezadoId: remisionNum };
}

async function deleteDespachoByUIKey(id: string | number) {
  let query = supabase.from('despachos').delete();
  if (String(id).startsWith('draft_')) {
    const [_, fecha, cliente_id, vehiculo_id] = String(id).split('_');
    query = query.is('num_remision', null).eq('fecha', fecha).eq('cliente_id', cliente_id);
    if (vehiculo_id && vehiculo_id !== 'null') query = query.eq('vehiculo_id', vehiculo_id);
    else query = query.is('vehiculo_id', null);
  } else {
    query = query.eq('num_remision', id);
  }
  const { error } = await query;
  if (error) throw error;
}

/** Update an existing despacho */
export async function updateDespacho(id: number | string, encabezadoUpdates: any, detalleUpdates: any[]) {
  await deleteDespachoByUIKey(id);
  const result = await createDespacho(encabezadoUpdates, detalleUpdates);
  await registrarAuditoria('UPDATE', 'Despachos', `Se actualizó el despacho con ID/Remisión ${id}`);
  return result;
}

/** Soft-delete a despacho */
export async function softDeleteDespacho(id: number | string) {
  await deleteDespachoByUIKey(id);
  await registrarAuditoria('DELETE', 'Despachos', `Se eliminó el despacho con ID/Remisión ${id}`);
  return true;
}
