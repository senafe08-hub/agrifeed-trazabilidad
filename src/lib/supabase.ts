import { createClient } from '@supabase/supabase-js';

// These will be configured when the user provides their Supabase credentials
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://YOUR_PROJECT.supabase.co';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'YOUR_ANON_KEY';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
});

export default supabase;

// ---------- Auditoria / Logging ----------
export async function registrarAuditoria(accion: 'CREATE' | 'UPDATE' | 'DELETE' | 'IMPORT', modulo: string, detalle: string) {
  try {
    let userEmail = localStorage.getItem('localUserEmail');
    if (!userEmail) {
      const { data } = await supabase.auth.getSession();
      userEmail = data.session?.user?.email || 'Sistema';
    }

    await supabase.from('auditoria').insert({
      usuario: userEmail,
      accion,
      modulo,
      detalle
    });
  } catch (err) {
    console.error('Error registrando auditoria:', err);
  }
}
// ---------- Helper to fetch programacion (OP) data ----------
export async function fetchProgramacion() {
  const { data, error } = await supabase.from('programacion').select(`
    id, lote, fecha, codigo_sap, bultos_programados, num_baches, cliente_id, observaciones, maestro_alimentos(descripcion), maestro_clientes(nombre)`
  );
  if (error) throw error;
  return (data || []).map(row => ({
    ...row,
    op: row.lote, // map for backward compatibility
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

// ---------- API Helper Functions for Despachos ----------

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
        id: key, // use remision or composite key as UI ID
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
        estado: row.num_remision ? 'Despachado' : 'borrador',
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
  // Auto-assign remision if not provided
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
    observaciones: encabezado.observaciones || null
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
  // Flush previous rows for this remision and insert the updated ones
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

// ══════════════════════════════════════════════════════════════
// FACTURACIÓN V2 HELPERS
// ══════════════════════════════════════════════════════════════

// ── Clientes / alimentos con facturación anticipada (sin remisión) ──
export const CLIENTES_ANTICIPADOS = [
  'INDUSTRIAS PUROPOLLO S.A.S',
  'COLOMBIANA DE INCUBACION SAS INCUBA',
  'KROKODEILOS SAS',
];
export const ALIMENTOS_ANTICIPADOS = ['FRIJOL SOYA INACTIVADO'];

/**
 * Check if a client or food qualifies for anticipated billing (no remisión needed)
 */
export function esFacturacionAnticipada(clienteNombre?: string, alimentoNombre?: string): boolean {
  if (clienteNombre && CLIENTES_ANTICIPADOS.some(c => clienteNombre.toUpperCase().includes(c.toUpperCase()))) return true;
  if (alimentoNombre && ALIMENTOS_ANTICIPADOS.some(a => alimentoNombre.toUpperCase().includes(a.toUpperCase()))) return true;
  return false;
}

/**
 * Fetch remisiones pendientes de facturar (con saldo > 0).
 * Returns grouped remisiones with their OPs, client info, and remaining balance.
 */
export async function fetchRemisionesPendientes(excludePedidoId?: number) {
  // 1. Get all despachos grouped by num_remision
  const { data: despachos, error: dErr } = await supabase
    .from('despachos')
    .select('num_remision, lote, bultos_despachados, fecha, cliente_id, maestro_clientes(nombre, codigo_sap)')
    .not('num_remision', 'is', null)
    .order('num_remision', { ascending: false });
  if (dErr) throw dErr;

  // 2. Get all pedido_detalle amounts grouped by OP+remision (non-annulled)
  const { data: pedidoDetalles } = await supabase
    .from('pedido_detalle')
    .select('op, bultos_pedido, pedido_id, pedidos!inner(num_remision, estado)');

  // Build a map of already-ordered amounts per remision+op
  const pedidoMap: Record<string, number> = {};
  for (const pd of (pedidoDetalles || [])) {
    if (excludePedidoId && pd.pedido_id === excludePedidoId) continue;
    const ped = (pd as any).pedidos;
    if (!ped || ped.estado === 'FACTURADO') {
      // Check if the associated factura is annulled
      // If facturado, the amounts are committed
    }
    // Only count if the pedido is NOT from an annulled factura
    const key = `${ped?.num_remision}_${pd.op}`;
    pedidoMap[key] = (pedidoMap[key] || 0) + (pd.bultos_pedido || 0);
  }

  // 3. Get alimento info from programacion
  const { data: progData } = await supabase
    .from('programacion')
    .select('lote, codigo_sap, maestro_alimentos(descripcion)');
  const alimentoMap: Record<number, { codigo: number; nombre: string }> = {};
  for (const p of (progData || [])) {
    const alim = Array.isArray(p.maestro_alimentos) ? p.maestro_alimentos[0] : p.maestro_alimentos;
    alimentoMap[p.lote] = {
      codigo: p.codigo_sap || 0,
      nombre: alim?.descripcion || '',
    };
  }

  // 4. Group despachos by remision
  const remisionMap = new Map<number, any>();
  for (const d of (despachos || [])) {
    const rem = d.num_remision!;
    if (!remisionMap.has(rem)) {
      const cliente = d.maestro_clientes as any;
      remisionMap.set(rem, {
        num_remision: rem,
        fecha_despacho: d.fecha,
        cliente_nombre: cliente?.nombre || '',
        cliente_codigo: cliente?.codigo_sap || d.cliente_id,
        ops: [],
      });
    }
    const key = `${rem}_${d.lote}`;
    const yaPedido = pedidoMap[key] || 0;
    const saldo = (d.bultos_despachados || 0) - yaPedido;
    const alim = alimentoMap[d.lote!] || { codigo: 0, nombre: '' };

    remisionMap.get(rem).ops.push({
      op: d.lote,
      codigo_alimento: alim.codigo,
      referencia: alim.nombre,
      bultos_despachados: d.bultos_despachados || 0,
      bultos_ya_pedidos: yaPedido,
      saldo_pendiente: saldo,
    });
  }

  // 5. Filter only remisiones that have at least 1 OP with saldo > 0
  return Array.from(remisionMap.values()).filter(r =>
    r.ops.some((op: any) => op.saldo_pendiente > 0)
  );
}

/**
 * Fetch detail of a specific remision by number
 */
export async function fetchRemisionDetalle(numRemision: number, excludePedidoId?: number) {
  const remisiones = await fetchRemisionesPendientes(excludePedidoId);
  return remisiones.find(r => r.num_remision === numRemision) || null;
}

/**
 * Fetch all remision info (including fully invoiced) for a specific remision number
 */
export async function fetchRemisionCompleta(numRemision: number) {
  const { data: despachos } = await supabase
    .from('despachos')
    .select('num_remision, lote, bultos_despachados, fecha, cliente_id, maestro_clientes(nombre, codigo_sap)')
    .eq('num_remision', numRemision);

  const { data: progData } = await supabase
    .from('programacion')
    .select('lote, codigo_sap, maestro_alimentos(descripcion)');
  const alimentoMap: Record<number, { codigo: number; nombre: string }> = {};
  for (const p of (progData || [])) {
    const alim = Array.isArray(p.maestro_alimentos) ? p.maestro_alimentos[0] : p.maestro_alimentos;
    alimentoMap[p.lote] = { codigo: p.codigo_sap || 0, nombre: alim?.descripcion || '' };
  }

  if (!despachos || despachos.length === 0) return null;
  const first = despachos[0];
  const cliente = first.maestro_clientes as any;

  return {
    num_remision: numRemision,
    fecha_despacho: first.fecha,
    cliente_nombre: cliente?.nombre || '',
    cliente_codigo: cliente?.codigo_sap || first.cliente_id,
    ops: despachos.map(d => {
      const alim = alimentoMap[d.lote!] || { codigo: 0, nombre: '' };
      return {
        op: d.lote,
        codigo_alimento: alim.codigo,
        referencia: alim.nombre,
        bultos_despachados: d.bultos_despachados || 0,
      };
    }),
  };
}

/**
 * Create a new pedido with its detail rows
 */
export async function crearPedido(pedido: {
  num_pedido?: string;
  num_remision?: number | null;
  cliente_id?: number;
  codigo_cliente?: number;
  nombre_cliente?: string;
  fecha_despacho?: string;
  estado: string;
  es_anticipado?: boolean;
  pedido_relacionado_id?: number | null;
}, detalles: Array<{
  op: number;
  codigo_alimento?: number;
  referencia?: string;
  bultos_despachados: number;
  bultos_pedido: number;
}>) {
  // Validate: if estado !== 'PENDIENTE PV', num_pedido is required
  if (pedido.estado !== 'PENDIENTE PV' && !pedido.num_pedido) {
    throw new Error('El número de pedido es obligatorio (excepto para estado PENDIENTE PV).');
  }

  // Insert pedido header
  const { data: newPedido, error: pErr } = await supabase
    .from('pedidos')
    .insert([{
      num_pedido: pedido.num_pedido || null,
      num_remision: pedido.num_remision || null,
      cliente_id: pedido.cliente_id || null,
      codigo_cliente: pedido.codigo_cliente || null,
      nombre_cliente: pedido.nombre_cliente || null,
      fecha_despacho: pedido.fecha_despacho || null,
      estado: pedido.estado,
      es_anticipado: pedido.es_anticipado || false,
      pedido_relacionado_id: pedido.pedido_relacionado_id || null,
    }])
    .select('id')
    .single();
  if (pErr) throw pErr;

  // Insert detail rows
  const detailRows = detalles.map(d => ({
    pedido_id: newPedido.id,
    op: d.op,
    codigo_alimento: d.codigo_alimento || null,
    referencia: d.referencia || null,
    bultos_despachados: d.bultos_despachados,
    bultos_pedido: d.bultos_pedido,
  }));
  const { error: dErr } = await supabase.from('pedido_detalle').insert(detailRows);
  if (dErr) throw dErr;

  return newPedido;
}

/**
 * Update an existing pedido (header + detail rows)
 */
export async function actualizarPedido(pedidoId: number, pedido: {
  num_pedido?: string;
  estado: string;
  pedido_relacionado_id?: number | null;
}, detalles: Array<{
  op: number;
  codigo_alimento?: number;
  referencia?: string;
  bultos_despachados: number;
  bultos_pedido: number;
}>) {
  if (pedido.estado !== 'PENDIENTE PV' && !pedido.num_pedido) {
    throw new Error('El número de pedido es obligatorio (excepto para estado PENDIENTE PV).');
  }

  const { error: pErr } = await supabase
    .from('pedidos')
    .update({
      num_pedido: pedido.num_pedido || null,
      estado: pedido.estado,
      pedido_relacionado_id: pedido.pedido_relacionado_id || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', pedidoId);
  if (pErr) throw pErr;

  // Replace detail rows
  await supabase.from('pedido_detalle').delete().eq('pedido_id', pedidoId);
  const detailRows = detalles.map(d => ({
    pedido_id: pedidoId,
    op: d.op,
    codigo_alimento: d.codigo_alimento || null,
    referencia: d.referencia || null,
    bultos_despachados: d.bultos_despachados,
    bultos_pedido: d.bultos_pedido,
  }));
  const { error: dErr } = await supabase.from('pedido_detalle').insert(detailRows);
  if (dErr) throw dErr;

  await registrarAuditoria('UPDATE', 'Facturación', `Se actualizó el pedido de facturación #${pedidoId} (Estado: ${pedido.estado})`);
}

/**
 * Fetch pedidos by estado (with full detail)
 */
export async function fetchPedidosPorEstado(estado: string | string[]) {
  let query = supabase
    .from('pedidos')
    .select(`
      *,
      pedido_detalle(*)
    `)
    .order('created_at', { ascending: false });

  if (Array.isArray(estado)) {
    query = query.in('estado', estado);
  } else {
    query = query.eq('estado', estado);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

/**
 * Fetch all pedidos (for the creation module - to find related pedidos, etc.)
 */
export async function fetchAllPedidos() {
  const { data, error } = await supabase
    .from('pedidos')
    .select('id, num_pedido, num_remision, estado, nombre_cliente, created_at')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

/**
 * Update the estado of a pedido (used by Cartera module)
 */
export async function actualizarEstadoPedido(pedidoId: number, nuevoEstado: string) {
  const { error } = await supabase
    .from('pedidos')
    .update({ estado: nuevoEstado, updated_at: new Date().toISOString() })
    .eq('id', pedidoId);
  if (error) throw error;
  
  await registrarAuditoria('UPDATE', 'Facturación', `Se cambió el estado del pedido #${pedidoId} a ${nuevoEstado}`);
}

/**
 * Fetch pedidos liberados for facturación (with full detail)
 */
export async function fetchPedidosLiberados() {
  const { data, error } = await supabase
    .from('pedidos')
    .select(`
      *,
      pedido_detalle(*)
    `)
    .eq('estado', 'LIBERADO')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

/**
 * Get cached Orden SAP for an OP
 */
export async function fetchOrdenSapOP(op: number): Promise<string | null> {
  const { data } = await supabase
    .from('orden_sap_op')
    .select('orden_sap')
    .eq('op', op)
    .single();
  return data?.orden_sap || null;
}

/**
 * Get all cached Orden SAP entries
 */
export async function fetchAllOrdenSapOP(): Promise<Record<number, string>> {
  const { data } = await supabase
    .from('orden_sap_op')
    .select('op, orden_sap');
  const map: Record<number, string> = {};
  for (const row of (data || [])) {
    map[row.op] = row.orden_sap;
  }
  return map;
}

/**
 * Create a factura grouping multiple pedidos
 */
export async function crearFactura(factura: {
  num_factura: string;
  num_entrega?: string;
  fecha_facturacion: string;
}, pedidoIds: number[], ordenSapPorOP: Record<number, string>) {
  // 1. Insert factura
  const { data: newFactura, error: fErr } = await supabase
    .from('facturas')
    .insert([{
      num_factura: factura.num_factura,
      num_entrega: factura.num_entrega || null,
      fecha_facturacion: factura.fecha_facturacion,
      estado: 'FACTURADA',
    }])
    .select('id')
    .single();
  if (fErr) throw fErr;

  // 2. Link factura ↔ pedidos
  const links = pedidoIds.map(pid => ({
    factura_id: newFactura.id,
    pedido_id: pid,
  }));
  const { error: lErr } = await supabase.from('factura_pedidos').insert(links);
  if (lErr) throw lErr;

  // 3. Update pedido estados to FACTURADO
  for (const pid of pedidoIds) {
    await supabase.from('pedidos').update({
      estado: 'FACTURADO',
      updated_at: new Date().toISOString(),
    }).eq('id', pid);
  }

  // 4. Cache Orden SAP per OP (upsert)
  for (const [opStr, ordenSap] of Object.entries(ordenSapPorOP)) {
    if (!ordenSap) continue;
    const op = Number(opStr);
    const { data: existing } = await supabase
      .from('orden_sap_op')
      .select('id')
      .eq('op', op)
      .single();
    if (!existing) {
      await supabase.from('orden_sap_op').insert([{ op, orden_sap: ordenSap }]);
    }
  }

  await registrarAuditoria('CREATE', 'Facturación', `Se generó la factura ${factura.num_factura} agrupando ${pedidoIds.length} pedidos`);
  return newFactura;
}

/**
 * Fetch historical facturacion data (fully denormalized for display)
 */
export async function fetchHistoricoFacturacion() {
  const { data: facturas, error } = await supabase
    .from('facturas')
    .select(`
      *,
      factura_pedidos(
        pedido_id,
        pedidos(
          id, num_pedido, num_remision, nombre_cliente, codigo_cliente,
          fecha_despacho, estado, es_anticipado, created_at,
          pedido_detalle(op, codigo_alimento, referencia, bultos_pedido, kg_pedido, bultos_despachados)
        )
      )
    `)
    .order('num_factura', { ascending: false });
  if (error) throw error;

  // Flatten into rows for display
  const rows: any[] = [];
  for (const factura of (facturas || [])) {
    for (const fp of (factura.factura_pedidos || [])) {
      const pedido = (fp as any).pedidos;
      if (!pedido) continue;
      for (const det of (pedido.pedido_detalle || [])) {
        rows.push({
          factura_id: factura.id,
          num_factura: factura.num_factura,
          num_entrega: factura.num_entrega,
          fecha_facturacion: factura.fecha_facturacion,
          estado_factura: factura.estado,
          pedido_id: pedido.id,
          num_pedido: pedido.num_pedido,
          num_remision: pedido.num_remision,
          nombre_cliente: pedido.nombre_cliente,
          codigo_cliente: pedido.codigo_cliente,
          fecha_despacho: pedido.fecha_despacho,
          estado_pedido: pedido.estado,
          es_anticipado: pedido.es_anticipado,
          fecha_pedido: pedido.created_at,
          op: det.op,
          codigo_alimento: det.codigo_alimento,
          referencia: det.referencia,
          bultos: det.bultos_pedido,
          kg: det.kg_pedido,
          bultos_despachados: det.bultos_despachados,
        });
      }
    }
  }

  // Fetch orden SAP from cache
  const sapMap = await fetchAllOrdenSapOP();
  for (const row of rows) {
    row.orden_sap = sapMap[row.op] || '';
  }

  return rows;
}

/**
 * Anular factura: marks as ANULADA and releases pedido saldos
 */
export async function anularFactura(facturaId: number) {
  // Update the factura
  const { error: fErr } = await supabase.from('facturas').update({ estado: 'ANULADA' }).eq('id', facturaId);
  if (fErr) throw fErr;

  // Get the pedidos
  const { data: factPeds } = await supabase.from('factura_pedidos').select('pedido_id').eq('factura_id', facturaId);
  if (factPeds && factPeds.length > 0) {
    const pedidoIds = factPeds.map(fp => fp.pedido_id);
    const { error: pErr } = await supabase.from('pedidos').update({ estado: 'LIBERADO' }).in('id', pedidoIds);
    if (pErr) throw pErr;
  }
}

/**
 * Elimina un pedido y todos sus detalles (HARD DELETE). Solo para Administrador.
 */
export async function eliminarPedido(pedidoId: number) {
  const { error: dErr } = await supabase.from('pedido_detalle').delete().eq('pedido_id', pedidoId);
  if (dErr) throw dErr;

  const { error: pErr } = await supabase.from('pedidos').delete().eq('id', pedidoId);
  if (pErr) throw pErr;
}

/**
 * Elimina una factura (HARD DELETE) y restaura los pedidos a estado LIBERADO. Solo para Administrador.
 */
export async function eliminarFactura(facturaId: number) {
  const { data: factPeds } = await supabase.from('factura_pedidos').select('pedido_id').eq('factura_id', facturaId);
  const pedidoIds = factPeds?.map(fp => fp.pedido_id) || [];

  const { error: fpErr } = await supabase.from('factura_pedidos').delete().eq('factura_id', facturaId);
  if (fpErr) throw fpErr;

  const { error: fErr } = await supabase.from('facturas').delete().eq('id', facturaId);
  if (fErr) throw fErr;

  if (pedidoIds.length > 0) {
    const { error: updErr } = await supabase.from('pedidos').update({ estado: 'LIBERADO' }).in('id', pedidoIds);
    if (updErr) throw updErr;
  }
}

/**
 * Fetch programacion amounts for a given list of OPs
 */
export async function fetchProgramacionParaOPs(ops: number[]) {
  if (!ops || ops.length === 0) return [];
  const { data, error } = await supabase
    .from('programacion')
    .select('op:lote, bultos_programados')
    .in('lote', ops);
  if (error) throw error;
  return (data || []).map(d => ({ op: d.op, bultos: d.bultos_programados }));
}

/**
 * Elimina la orden SAP guardada para una OP 
 */
export async function eliminarOrdenSapOP(op: number) {
  const { error } = await supabase.from('orden_sap_op').delete().eq('op', op);
  if (error) throw error;
}

/**
 * Import historical facturas based on exported headers.
 * Resolves deduplications directly here.
 */
export async function importarHistoricoFacturasExcel(data: any[]) {
  if (!data || data.length === 0) return { success: 0, errors: 0 };
  
  let successCount = 0;
  let errorCount = 0;

  // Group by factura -> by pedido
  const facturasMap = new Map<string, any>();

  for (const row of data) {
    const numFactura = String(row['N° Factura'] || '').trim();
    if (!numFactura) continue;

    if (!facturasMap.has(numFactura)) {
      facturasMap.set(numFactura, {
        num_factura: numFactura,
        num_entrega: String(row['N° Entrega'] || '').trim(),
        fecha_facturacion: row['Fecha Facturación'] || new Date().toISOString().split('T')[0],
        estado: row['Estado Factura'] || 'FACTURADA',
        pedidos: new Map<string, any>(),
      });
    }

    const fac = facturasMap.get(numFactura);
    const numPedido = String(row['N° Pedido'] || '').trim();
    if (!numPedido) continue;

    if (!fac.pedidos.has(numPedido)) {
      fac.pedidos.set(numPedido, {
        num_pedido: numPedido,
        num_remision: row['N° Remisión'] ? String(row['N° Remisión']) : null,
        fecha_despacho: row['Fecha Despacho'] || null,
        nombre_cliente: row['Cliente'] || null,
        codigo_cliente: row['Cód. Cliente'] ? String(row['Cód. Cliente']) : null,
        estado: row['Estado Pedido'] || 'FACTURADO',
        es_anticipado: !row['N° Remisión'],
        detalles: [],
      });
    }

    const ped = fac.pedidos.get(numPedido);
    ped.detalles.push({
      op: Number(row['OP']) || 0,
      referencia: row['Referencia'] || null,
      codigo_alimento: row['Cód. Alimento'] || null,
      bultos: Number(row['Bultos']) || 0,
      kg: Number(row['KG']) || 0,
      orden_sap: String(row['Orden SAP'] || '').trim(),
    });
  }

  // Insert sequentially to avoid conflicts
  for (const [numFac, fData] of facturasMap.entries()) {
    try {
      let facturaId: number;
      const { data: exF } = await supabase.from('facturas').select('id').eq('num_factura', numFac).single();
      if (exF) {
        facturaId = exF.id;
      } else {
        const { data: nF, error: fErr } = await supabase.from('facturas').insert([{
          num_factura: numFac,
          num_entrega: fData.num_entrega || null,
          fecha_facturacion: fData.fecha_facturacion,
          estado: fData.estado,
        }]).select('id').single();
        if (fErr) throw fErr;
        facturaId = nF.id;
      }

      for (const [numPed, pData] of fData.pedidos.entries()) {
        // Create/Get Pedido
        let pedidoId: number;
        const { data: exP } = await supabase.from('pedidos').select('id').eq('num_pedido', numPed).single();
        if (exP) {
          pedidoId = exP.id;
        } else {
          const { data: nP, error: pErr } = await supabase.from('pedidos').insert([{
            num_pedido: numPed,
            num_remision: pData.num_remision ? Number(pData.num_remision) : null,
            nombre_cliente: pData.nombre_cliente,
            codigo_cliente: pData.codigo_cliente,
            fecha_despacho: pData.fecha_despacho,
            estado: pData.estado,
            es_anticipado: pData.es_anticipado,
          }]).select('id').single();
          if (pErr) throw pErr;
          pedidoId = nP.id;

          // Insert detales (if fresh pedido)
          const detallesRows = pData.detalles.map((d: any) => ({
            pedido_id: pedidoId,
            op: d.op,
            referencia: d.referencia,
            codigo_alimento: typeof d.codigo_alimento === 'number' ? d.codigo_alimento : Number(d.codigo_alimento) || null,
            bultos_pedido: d.bultos,
            kg_pedido: d.kg,
            bultos_despachados: d.bultos,
          }));
          await supabase.from('pedido_detalle').insert(detallesRows);
        }

        // Link factura-pedido
        const { data: lnk } = await supabase.from('factura_pedidos')
           .select('*').eq('factura_id', facturaId).eq('pedido_id', pedidoId).single();
        if (!lnk) {
          await supabase.from('factura_pedidos').insert([{ factura_id: facturaId, pedido_id: pedidoId }]);
        }

        // Cache SAP combinations
        for (const d of pData.detalles) {
          if (d.orden_sap && d.op) {
            const { data: exSap } = await supabase.from('orden_sap_op').select('id').eq('op', d.op).single();
            if (!exSap) {
              await supabase.from('orden_sap_op').insert([{ op: d.op, orden_sap: d.orden_sap }]);
            }
          }
        }
      }
      successCount++;
    } catch (e) {
      console.error(e);
      errorCount++;
    }
  }

  return { success: successCount, errors: errorCount };
}

/**
 * Fetch programacion for anticipated orders (manual OP selection)
 */
export async function fetchProgramacionParaAnticipado() {
  const { data, error } = await supabase
    .from('programacion')
    .select('lote, codigo_sap, bultos_programados, maestro_alimentos(descripcion), maestro_clientes(nombre)')
    .order('lote', { ascending: false })
    .limit(5000);
  if (error) throw error;
  return (data || []).map(row => ({
    op: row.lote,
    codigo_alimento: row.codigo_sap,
    referencia: (row.maestro_alimentos as any)?.descripcion || '',
    cliente: (row.maestro_clientes as any)?.nombre || '',
    bultos_programados: row.bultos_programados,
  }));
}

/**
 * Fetch existing pedidos for a specific remision (for compartido logic)
 */
export async function fetchPedidosPorRemision(numRemision: number) {
  const { data, error } = await supabase
    .from('pedidos')
    .select('id, num_pedido, estado, created_at')
    .eq('num_remision', numRemision)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

// ══════════════════════════════════════════════════════════════
// INVENTARIO DE MATERIA PRIMA HELPERS
// ══════════════════════════════════════════════════════════════

// =========== INVENTARIO ===========
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
  // Obtenemos los traslados de los últimos 6 meses aprox.
  const d = new Date();
  d.setMonth(d.getMonth() - 6);
  // first day of limit month
  const startDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;

  const { data, error } = await supabase
    .from('inventario_traslados')
    .select('cantidad_kg, mes, anio, fecha')
    .eq('material_id', material_id)
    .gte('fecha', startDate)
    .order('fecha', { ascending: true });

  if (error) throw error;
  
  // Agrupar por mes
  const grouped: Record<string, number> = {};
  for (const t of (data || [])) {
    const key = `${t.anio}-${String(t.mes).padStart(2, '0')}`;
    grouped[key] = (grouped[key] || 0) + Number(t.cantidad_kg);
  }

  return grouped; // Retorna { "2026-01": 1500, "2026-02": 1800 ... }
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
  // Fetch all required data in parallel
  const [materiales, stockData, entradasData, trasladosData] = await Promise.all([
    fetchInventarioMateriales(),
    fetchStockInicial(mes, anio),
    fetchInventarioEntradas(mes, anio),
    fetchInventarioTraslados(mes, anio),
  ]);

  // Build lookups
  const stockMap: Record<number, { stock_kg: number; consumo_estimado_mes: number }> = {};
  for (const s of stockData) {
    stockMap[s.material_id] = { stock_kg: s.stock_kg || 0, consumo_estimado_mes: s.consumo_estimado_mes || 0 };
  }

  // Sum entradas by material
  const entradasMap: Record<number, number> = {};
  for (const e of entradasData) {
    entradasMap[e.material_id] = (entradasMap[e.material_id] || 0) + (e.cantidad_kg || 0);
  }

  // Sum traslados by material and semana
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

  // Calculate consolidated for each material
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

    // Only include materials that have stock, entries, transfers, or an initial stock record
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
