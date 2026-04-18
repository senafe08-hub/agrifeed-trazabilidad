// ══════════════════════════════════════════════════════════════
// API: FACTURACIÓN Y CARTERA
// Funciones para pedidos, facturas, remisiones pendientes,
// histórico de facturación, y gestión de cartera.
// ══════════════════════════════════════════════════════════════

import supabase from '../supabase';
import { registrarAuditoria } from '../supabase';

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
 */
export async function fetchRemisionesPendientes(excludePedidoId?: number) {
  const { data: despachos, error: dErr } = await supabase
    .from('despachos')
    .select('num_remision, lote, bultos_despachados, fecha, cliente_id, maestro_clientes(nombre, codigo_sap)')
    .not('num_remision', 'is', null)
    .eq('estado', 'despachado')
    .order('num_remision', { ascending: false });
  if (dErr) throw dErr;

  const { data: pedidoDetalles } = await supabase
    .from('pedido_detalle')
    .select('op, bultos_pedido, pedido_id, pedidos!inner(num_remision, estado)');

  const pedidoMap: Record<string, number> = {};
  for (const pd of (pedidoDetalles || [])) {
    if (excludePedidoId && pd.pedido_id === excludePedidoId) continue;
    const ped = (pd as any).pedidos;
    const key = `${ped?.num_remision}_${pd.op}`;
    pedidoMap[key] = (pedidoMap[key] || 0) + (pd.bultos_pedido || 0);
  }

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
  if (pedido.estado !== 'PENDIENTE PV' && !pedido.num_pedido) {
    throw new Error('El número de pedido es obligatorio (excepto para estado PENDIENTE PV).');
  }

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
 * Fetch all pedidos
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

  const links = pedidoIds.map(pid => ({
    factura_id: newFactura.id,
    pedido_id: pid,
  }));
  const { error: lErr } = await supabase.from('factura_pedidos').insert(links);
  if (lErr) throw lErr;

  for (const pid of pedidoIds) {
    await supabase.from('pedidos').update({
      estado: 'FACTURADO',
      updated_at: new Date().toISOString(),
    }).eq('id', pid);
  }

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
          matrizada: factura.matrizada || false,
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
  const { error: fErr } = await supabase.from('facturas').update({ estado: 'ANULADA' }).eq('id', facturaId);
  if (fErr) throw fErr;

  const { data: factPeds } = await supabase.from('factura_pedidos').select('pedido_id').eq('factura_id', facturaId);
  if (factPeds && factPeds.length > 0) {
    const pedidoIds = factPeds.map(fp => fp.pedido_id);
    const { error: pErr } = await supabase.from('pedidos').update({ estado: 'LIBERADO' }).in('id', pedidoIds);
    if (pErr) throw pErr;
  }
}

/**
 * Elimina un pedido y todos sus detalles (HARD DELETE).
 */
export async function eliminarPedido(pedidoId: number) {
  const { error: dErr } = await supabase.from('pedido_detalle').delete().eq('pedido_id', pedidoId);
  if (dErr) throw dErr;

  const { error: pErr } = await supabase.from('pedidos').delete().eq('id', pedidoId);
  if (pErr) throw pErr;
}

/**
 * Elimina una factura (HARD DELETE) y restaura los pedidos a estado LIBERADO.
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

export async function toggleMatrizadaFactura(facturaId: number, newState: boolean) {
  const { error } = await supabase.from('facturas').update({ matrizada: newState }).eq('id', facturaId);
  if (error) throw error;
  await registrarAuditoria('UPDATE', 'Facturación', `Marcó factura ID ${facturaId} como matrizada = ${newState}`);
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
 */
export async function importarHistoricoFacturasExcel(data: any[]) {
  if (!data || data.length === 0) return { success: 0, errors: 0 };
  
  let successCount = 0;
  let errorCount = 0;

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

        const { data: lnk } = await supabase.from('factura_pedidos')
           .select('*').eq('factura_id', facturaId).eq('pedido_id', pedidoId).single();
        if (!lnk) {
          await supabase.from('factura_pedidos').insert([{ factura_id: facturaId, pedido_id: pedidoId }]);
        }

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
