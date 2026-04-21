// ══════════════════════════════════════════════════════════════
// API: VENTAS & MRP
// Solicitudes, Vista Semanal, Motor MRP, Propuestas de OP,
// Reprocesos y Préstamos de inventario PT.
// ══════════════════════════════════════════════════════════════

import supabase from '../supabase';
import { registrarAuditoria } from '../supabase';

// ═══════════ TIPOS ═══════════

export interface CasaFormuladora {
  id: number;
  nombre: string;
  activo: boolean;
}

import { getISOWeek, parseISO, setISOWeek, startOfISOWeek, addDays, format, setWeekYear } from 'date-fns';

export interface VentaSolicitud {
  id?: number;
  fecha: string;
  semana: number;
  dia_semana: string;
  cliente_id: number;
  codigo_sap: number;
  casa_formuladora_id: number;
  presentacion: string;
  cantidad: number;
  observaciones?: string;
  created_by?: string;
  // JOINs
  maestro_clientes?: { nombre: string; codigo_sap: number } | null;
  maestro_alimentos?: { descripcion: string; codigo_sap: number } | null;
  casas_formuladoras?: { nombre: string } | null;
}

export interface VistaSemanalRow {
  cliente: string;
  clienteId: number;
  referencia: string;
  codigoSap: number;
  casa: string;
  casaId: number;
  dias: number[]; // [lun, mar, mie, jue, vie, sab, dom]
  total: number;
}

export interface MRPRow {
  grupo: string;
  referencia: string;
  codigoSap: number;
  casa: string;
  casaId: number;
  demandaActual: number;
  demandaProxima: number;
  inventarioFisico: number;
  opPendientes: number;
  reproceso: number;
  prestamosPendientes: number;
  saldoProyectado: number;
  necesidadNeta: number;
  diasDemanda: number[]; // [lun..dom] para semáforo por día
  estado: string; // 'ALCANZA' | 'SE AGOTA EL ...' | 'SIN STOCK'
  faltante: number;
  formulaId?: number;
  sacosPorBache?: number;
  bachesSugeridos?: number;
}

// ═══════════ CASAS FORMULADORAS ═══════════

export async function fetchCasasFormuladoras(): Promise<CasaFormuladora[]> {
  const { data, error } = await supabase.from('casas_formuladoras').select('*').eq('activo', true).order('nombre');
  if (error) throw error;
  return data || [];
}

// ═══════════ HELPERS ═══════════

const DIAS_SEMANA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

export function calcularSemanaISO(fecha: string): number {
  return getISOWeek(parseISO(fecha));
}

export function calcularDiaSemana(fecha: string): string {
  const d = new Date(fecha + 'T12:00:00');
  return DIAS_SEMANA[d.getDay()];
}

export function getFechasSemana(semana: number, anio: number): string[] {
  let d = setWeekYear(new Date(), anio);
  d = setISOWeek(d, semana);
  const start = startOfISOWeek(d);
  
  const fechas: string[] = [];
  for (let i = 0; i < 7; i++) {
    fechas.push(format(addDays(start, i), 'yyyy-MM-dd'));
  }
  return fechas;
}

function diaIndex(dia: string): number {
  const map: Record<string, number> = { 'Lunes': 0, 'Martes': 1, 'Miércoles': 2, 'Jueves': 3, 'Viernes': 4, 'Sábado': 5, 'Domingo': 6 };
  return map[dia] ?? -1;
}

// ═══════════ SOLICITUDES CRUD ═══════════

// Cache de maestros para enriquecer solicitudes sin FK joins
let _clientesCache: Map<number, string> | null = null;
let _alimentosCache: Map<number, string> | null = null;
let _casasCache: Map<number, string> | null = null;

async function ensureCaches() {
  if (!_clientesCache) {
    const { data } = await supabase.from('maestro_clientes').select('codigo_sap, nombre');
    _clientesCache = new Map((data || []).map(c => [c.codigo_sap, c.nombre]));
  }
  if (!_alimentosCache) {
    const { data } = await supabase.from('maestro_alimentos').select('codigo_sap, descripcion');
    _alimentosCache = new Map((data || []).map(a => [a.codigo_sap, a.descripcion]));
  }
  if (!_casasCache) {
    const { data } = await supabase.from('casas_formuladoras').select('id, nombre');
    _casasCache = new Map((data || []).map(c => [c.id, c.nombre]));
  }
}

// Invalidar caches cuando se necesite refrescar
export function invalidarCachesVentas() {
  _clientesCache = null;
  _alimentosCache = null;
  _casasCache = null;
}

export async function getClienteGrupoMap(): Promise<Map<number, string>> {
  const { data: clientes } = await supabase.from('maestro_clientes').select('codigo_sap, nombre, tipo_inventario, grupo_inventario');
  const clienteGrupoMap = new Map<number, string>();
  for (const c of (clientes || [])) {
    const nombre = (c.nombre || '').toUpperCase();
    if (nombre.includes('COLOMBIA DE INCUBACION') || nombre.includes('PURO POLLO')) continue;
    let grupo: string;
    if (c.tipo_inventario === 'UNICO' && c.grupo_inventario) {
      grupo = c.grupo_inventario;
    } else {
      grupo = 'CERDOS VARIOS';
    }
    clienteGrupoMap.set(c.codigo_sap, grupo);
  }
  return clienteGrupoMap;
}

export async function fetchSolicitudes(semana: number, anio: number): Promise<VentaSolicitud[]> {
  await ensureCaches();

  const { data, error } = await supabase
    .from('ventas_solicitudes')
    .select('*')
    .eq('semana', semana)
    .gte('fecha', `${anio}-01-01`)
    .lte('fecha', `${anio}-12-31`)
    .order('fecha')
    .order('cliente_id');
  if (error) throw error;

  // Enriquecer cada registro con nombres legibles
  return (data || []).map(s => ({
    ...s,
    maestro_clientes: { nombre: _clientesCache?.get(s.cliente_id) || `Cliente ${s.cliente_id}`, codigo_sap: s.cliente_id },
    maestro_alimentos: { descripcion: _alimentosCache?.get(s.codigo_sap) || `SAP ${s.codigo_sap}`, codigo_sap: s.codigo_sap },
    casas_formuladoras: { nombre: _casasCache?.get(s.casa_formuladora_id) || `Casa ${s.casa_formuladora_id}` },
  }));
}

export async function createSolicitud(sol: {
  fecha: string; cliente_id: number; codigo_sap: number;
  casa_formuladora_id: number; cantidad: number;
  presentacion?: string; observaciones?: string;
}) {
  const semana = calcularSemanaISO(sol.fecha);
  const dia_semana = calcularDiaSemana(sol.fecha);
  const userEmail = localStorage.getItem('localUserEmail') || 'Sistema';

  const { error } = await supabase.from('ventas_solicitudes').insert([{
    ...sol, semana, dia_semana, presentacion: sol.presentacion || 'BULTOS', created_by: userEmail,
  }]);
  if (error) throw error;
  await registrarAuditoria('CREATE', 'Ventas', `Solicitud: ${sol.cantidad} bt, cliente ${sol.cliente_id}, SAP ${sol.codigo_sap}`);
}

export async function updateSolicitud(id: number, updates: Partial<VentaSolicitud>) {
  const payload: any = { ...updates };
  delete payload.id; delete payload.created_at; delete payload.maestro_clientes;
  delete payload.maestro_alimentos; delete payload.casas_formuladoras;
  if (payload.fecha) {
    payload.semana = calcularSemanaISO(payload.fecha);
    payload.dia_semana = calcularDiaSemana(payload.fecha);
  }
  const { error } = await supabase.from('ventas_solicitudes').update(payload).eq('id', id);
  if (error) throw error;
  await registrarAuditoria('UPDATE', 'Ventas', `Solicitud ID ${id} actualizada`);
}

export async function deleteSolicitud(id: number) {
  const { error } = await supabase.from('ventas_solicitudes').delete().eq('id', id);
  if (error) throw error;
  await registrarAuditoria('DELETE', 'Ventas', `Solicitud ID ${id} eliminada`);
}

/** 
 * Guarda (crea/actualiza) las solicitudes de un cliente para un día específico.
 * Borra las solicitudes previas de esa fecha/cliente y re-inserta las nuevas.
 */
export async function saveSolicitudesBatch(
  fecha: string,
  cliente_id: number,
  detalles: { codigo_sap: number; casa_formuladora_id: number; cantidad: number; observaciones?: string }[]
) {
  // 1. Borrar todas las solicitudes para esta fecha y cliente
  await supabase.from('ventas_solicitudes')
    .delete()
    .eq('fecha', fecha)
    .eq('cliente_id', cliente_id);

  if (detalles.length === 0) return;

  const semana = calcularSemanaISO(fecha);
  const dia_semana = calcularDiaSemana(fecha);
  const userEmail = localStorage.getItem('localUserEmail') || 'Sistema';

  const rowsToInsert = detalles.map(d => ({
    fecha,
    cliente_id,
    codigo_sap: d.codigo_sap,
    casa_formuladora_id: d.casa_formuladora_id,
    cantidad: d.cantidad,
    observaciones: d.observaciones || null,
    semana,
    dia_semana,
    presentacion: 'BULTOS',
    created_by: userEmail
  }));

  const { error } = await supabase.from('ventas_solicitudes').insert(rowsToInsert);
  if (error) throw error;
  
  await registrarAuditoria('UPDATE', 'Ventas', `Actualizada programación lote cliente ${cliente_id} para fecha ${fecha}`);
}

// ═══════════ VISTA SEMANAL (PIVOTE) ═══════════

export async function calcularVistaSemanal(semana: number, anio: number): Promise<VistaSemanalRow[]> {
  const solicitudes = await fetchSolicitudes(semana, anio);
  const map = new Map<string, VistaSemanalRow>();

  for (const s of solicitudes) {
    const key = `${s.cliente_id}-${s.codigo_sap}-${s.casa_formuladora_id}`;
    if (!map.has(key)) {
      map.set(key, {
        cliente: (s.maestro_clientes as any)?.nombre || `Cliente ${s.cliente_id}`,
        clienteId: s.cliente_id,
        referencia: (s.maestro_alimentos as any)?.descripcion || `SAP ${s.codigo_sap}`,
        codigoSap: s.codigo_sap,
        casa: (s.casas_formuladoras as any)?.nombre || '',
        casaId: s.casa_formuladora_id,
        dias: [0, 0, 0, 0, 0, 0, 0],
        total: 0,
      });
    }
    const row = map.get(key)!;
    const idx = diaIndex(s.dia_semana);
    if (idx >= 0) row.dias[idx] += s.cantidad;
    row.total += s.cantidad;
  }

  return Array.from(map.values()).sort((a, b) => a.cliente.localeCompare(b.cliente) || a.referencia.localeCompare(b.referencia));
}

// ═══════════ MOTOR MRP ═══════════

export async function ejecutarMRP(semana: number, anio: number): Promise<MRPRow[]> {
  // 1. Fetch ALL data in parallel (was sequential before — massive speedup)
  const clienteGrupoMapPromise = getClienteGrupoMap();
  
  const [
    { data: alimentos },
    clienteGrupoMap,
    solActual,
    solProxima,
    { data: repData },
    { data: prestData },
    { data: opsData },
    { data: formulas },
  ] = await Promise.all([
    supabase.from('maestro_alimentos').select('codigo_sap, descripcion'),
    clienteGrupoMapPromise,
    fetchSolicitudes(semana, anio),
    fetchSolicitudes(semana + 1 > 52 ? 1 : semana + 1, semana + 1 > 52 ? anio + 1 : anio),
    supabase.from('reprocesos_pt').select('grupo, codigo_sap, cantidad').eq('semana', semana).eq('anio', anio),
    supabase.from('prestamos_inventario').select('*').in('estado', ['PENDIENTE', 'PARCIAL']),
    supabase.from('programacion')
      .select('id, lote, codigo_sap, cliente_id, bultos_programados, produccion(bultos_entregados)')
      .limit(10000),
    supabase.from('formulas').select('id, nombre, alimento_sap, sacos_por_bache, estado').eq('estado', 'activa'),
  ]);

  const alimentoMap = new Map<number, string>();
  for (const a of (alimentos || [])) alimentoMap.set(a.codigo_sap, a.descripcion);

  // Agregar demandas por grupo+referencia+casa
  type DemandaKey = string;
  const mkKey = (g: string, sap: number, casaId: number) => `${g}|${sap}|${casaId}`;

  interface DemandaAccum {
    grupo: string; codigoSap: number; casaId: number; casa: string;
    actual: number; proxima: number; diasActual: number[];
  }

  const demandas = new Map<DemandaKey, DemandaAccum>();

  const procesarSolicitudes = (sols: VentaSolicitud[], campo: 'actual' | 'proxima') => {
    for (const s of sols) {
      let grupo = clienteGrupoMap.get(s.cliente_id);
      if (!grupo) continue;
      const casaNombre = (s.casas_formuladoras as any)?.nombre || '';
      if (grupo === 'CERDOS VARIOS') grupo = `CERDOS VARIOS ${casaNombre}`;
      const key = mkKey(grupo, s.codigo_sap, s.casa_formuladora_id);
      if (!demandas.has(key)) {
        demandas.set(key, { grupo, codigoSap: s.codigo_sap, casaId: s.casa_formuladora_id, casa: casaNombre, actual: 0, proxima: 0, diasActual: [0,0,0,0,0,0,0] });
      }
      const d = demandas.get(key)!;
      d[campo] += s.cantidad;
      if (campo === 'actual') {
        const idx = diaIndex(s.dia_semana);
        if (idx >= 0) d.diasActual[idx] += s.cantidad;
      }
    }
  };
  procesarSolicitudes(solActual, 'actual');
  procesarSolicitudes(solProxima, 'proxima');

  // 3. Inventario PT Dinámico (Inicial + Producción - Despachos)
  const invMap = new Map<string, number>();
  const despMap = new Map<string, number>();
  try {
    const ptDin = await fetchInventarioPT(semana, anio);
    for (const p of ptDin) {
      if (p) {
        invMap.set(`${p.grupo}|${p.codigo_sap}`, p.saldo_actual);
        despMap.set(`${p.grupo}|${p.codigo_sap}`, p.despachado);
      }
    }
  } catch (e) {
    console.error('Error fetching inventario PT:', e);
  }

  // 4. Reprocesos (data already fetched in parallel above)
  const repMap = new Map<string, number>();
  for (const r of (repData || [])) {
    const k = `${r.grupo}|${r.codigo_sap}`;
    repMap.set(k, (repMap.get(k) || 0) + r.cantidad);
  }

  // 5. Préstamos pendientes (data already fetched in parallel above)
  const prestMap = new Map<string, number>();
  for (const p of (prestData || [])) {
    const k = `${p.grupo_origen}|${p.codigo_sap}`;
    const pendiente = p.cantidad - (p.cantidad_compensada || 0);
    prestMap.set(k, (prestMap.get(k) || 0) + pendiente);
  }

  // 6. OPs pendientes (data already fetched in parallel above)
  const opPendMap = new Map<string, number>();
  for (const op of (opsData || [])) {
    const grupo = clienteGrupoMap.get(op.cliente_id);
    if (!grupo) continue;
    const producido = ((op.produccion as any[]) || []).reduce((s: number, p: any) => s + (p.bultos_entregados || 0), 0);
    const pendiente = Math.max(0, (op.bultos_programados || 0) - producido);
    if (pendiente <= 0) continue;
    const grupoFinal = grupo;
    const k = `${grupoFinal}|${op.codigo_sap}`;
    opPendMap.set(k, (opPendMap.get(k) || 0) + pendiente);
  }

  // 7. Fórmulas (data already fetched in parallel above)
  const formulaMap = new Map<number, { id: number; sacos: number }>();
  for (const f of (formulas || [])) {
    if (f.alimento_sap && f.sacos_por_bache) {
      formulaMap.set(f.alimento_sap, { id: f.id, sacos: f.sacos_por_bache });
    }
  }

  // 8. Calcular MRP para cada grupo+referencia
  const results: MRPRow[] = [];
  for (const [, d] of demandas) {
    const invKey = `${d.grupo}|${d.codigoSap}`;
    const inv = invMap.get(invKey) || 0;
    const despachado = despMap.get(invKey) || 0;
    const rep = repMap.get(invKey) || 0;
    const prest = prestMap.get(invKey) || 0;
    const opPend = opPendMap.get(invKey) || 0;

    // LÓGICA COMPLEJA: Consumir la demanda programada con los despachos reales
    // Esto evita que se "doble-cuente" el faltante si ya se despacharon los bultos del pedido
    let restanteDespacho = despachado;
    for (let i = 0; i < 7; i++) {
      if (restanteDespacho <= 0) break;
      if (d.diasActual[i] > 0) {
        const descontar = Math.min(d.diasActual[i], restanteDespacho);
        d.diasActual[i] -= descontar;
        d.actual -= descontar;
        restanteDespacho -= descontar;
      }
    }

    const saldoProyectado = inv + opPend - d.actual - rep - prest;
    const necesidad = Math.max(0, d.proxima - saldoProyectado);

    // Estado semáforo (recorrer día a día)
    let estado = 'ALCANZA';
    let faltante = 0;
    const disponible = inv + opPend - rep - prest;
    if (disponible <= 0) {
      estado = 'SIN STOCK';
      faltante = d.actual + d.proxima;
    } else {
      let acum = 0;
      const diasNombres = ['LUNES', 'MARTES', 'MIÉRCOLES', 'JUEVES', 'VIERNES', 'SÁBADO', 'DOMINGO'];
      for (let i = 0; i < 7; i++) {
        acum += d.diasActual[i];
        if (acum > disponible) {
          estado = `SE AGOTA EL ${diasNombres[i]}`;
          faltante = d.actual + d.proxima - disponible;
          break;
        }
      }
      if (estado === 'ALCANZA' && disponible < d.actual + d.proxima) {
        estado = 'INSUFICIENTE PRÓXIMA SEMANA';
        faltante = d.actual + d.proxima - disponible;
      }
    }

    const formula = formulaMap.get(d.codigoSap);

    results.push({
      grupo: d.grupo,
      referencia: alimentoMap.get(d.codigoSap) || `SAP ${d.codigoSap}`,
      codigoSap: d.codigoSap,
      casa: d.casa,
      casaId: d.casaId,
      demandaActual: d.actual,
      demandaProxima: d.proxima,
      inventarioFisico: inv,
      opPendientes: opPend,
      reproceso: rep,
      prestamosPendientes: prest,
      saldoProyectado,
      necesidadNeta: necesidad,
      diasDemanda: d.diasActual,
      estado,
      faltante,
      formulaId: formula?.id,
      sacosPorBache: formula?.sacos,
      bachesSugeridos: formula ? Math.ceil(necesidad / formula.sacos) : undefined,
    });
  }

  return results.sort((a, b) => {
    if (a.necesidadNeta > 0 && b.necesidadNeta === 0) return -1;
    if (a.necesidadNeta === 0 && b.necesidadNeta > 0) return 1;
    return a.grupo.localeCompare(b.grupo);
  });
}

// ═══════════ PROPUESTAS DE OP ═══════════

export async function crearPropuestaOP(mrp: MRPRow, semana: number, anio: number, baches?: number) {
  const sacos = mrp.sacosPorBache || 50;
  const bachesFinales = baches || mrp.bachesSugeridos || Math.ceil(mrp.necesidadNeta / sacos);
  const userEmail = localStorage.getItem('localUserEmail') || 'Sistema';

  const { error } = await supabase.from('propuestas_op').insert([{
    semana, anio, codigo_sap: mrp.codigoSap, grupo: mrp.grupo,
    casa_formuladora_id: mrp.casaId, formula_id: mrp.formulaId || null,
    demanda_actual: mrp.demandaActual, demanda_proxima: mrp.demandaProxima,
    inventario_fisico: mrp.inventarioFisico, op_pendientes: mrp.opPendientes,
    reproceso: mrp.reproceso, prestamos_pendientes: mrp.prestamosPendientes,
    necesidad_neta: mrp.necesidadNeta, sacos_por_bache: sacos,
    baches_propuestos: bachesFinales, bultos_resultantes: bachesFinales * sacos,
    created_by: userEmail,
  }]);
  if (error) throw error;
  await registrarAuditoria('CREATE', 'Ventas MRP', `Propuesta OP: ${bachesFinales} baches (${bachesFinales * sacos} bt) para ${mrp.referencia} [${mrp.grupo}]`);
}

export async function fetchPropuestasOP(filtroEstado?: string) {
  await ensureCaches();
  let query = supabase.from('propuestas_op').select('*').order('created_at', { ascending: false });
  if (filtroEstado) query = query.eq('estado', filtroEstado);
  const { data, error } = await query.limit(500);
  if (error) throw error;
  // Enriquecer con nombres
  return (data || []).map(p => ({
    ...p,
    casas_formuladoras: { nombre: _casasCache?.get(p.casa_formuladora_id) || `Casa ${p.casa_formuladora_id}` },
    referencia: _alimentosCache?.get(p.codigo_sap) || `SAP ${p.codigo_sap}`,
  }));
}

export async function revisarPropuestaOP(
  id: number, accion: 'ACEPTADA' | 'RECHAZADA' | 'AJUSTADA',
  opts?: { baches_ajustados?: number; motivo_rechazo?: string }
) {
  const userEmail = localStorage.getItem('localUserEmail') || 'Sistema';
  const { data: prop, error: e1 } = await supabase.from('propuestas_op').select('*').eq('id', id).single();
  if (e1 || !prop) throw e1 || new Error('Propuesta no encontrada');

  if (accion === 'RECHAZADA') {
    await supabase.from('propuestas_op').update({
      estado: 'RECHAZADA', motivo_rechazo: opts?.motivo_rechazo || '', reviewed_by: userEmail, reviewed_at: new Date().toISOString(),
    }).eq('id', id);
    await registrarAuditoria('UPDATE', 'Ventas MRP', `Propuesta ${id} RECHAZADA: ${opts?.motivo_rechazo}`);
    return;
  }

  const baches = accion === 'AJUSTADA' ? (opts?.baches_ajustados || prop.baches_propuestos) : prop.baches_propuestos;
  const bultos = baches * prop.sacos_por_bache;

  // Obtener siguiente lote
  const { data: maxLote } = await supabase.from('programacion').select('lote').order('lote', { ascending: false }).limit(1).single();
  const nuevoLote = ((maxLote?.lote || 5000) + 1);

  // Crear OP en programacion
  const { data: newOP, error: e2 } = await supabase.from('programacion').insert([{
    lote: nuevoLote, fecha: new Date().toISOString().split('T')[0],
    codigo_sap: prop.codigo_sap, cliente_id: prop.cliente_id,
    bultos_programados: bultos, num_baches: baches,
  }]).select('id').single();
  if (e2) throw e2;

  // Actualizar propuesta
  await supabase.from('propuestas_op').update({
    estado: 'PROGRAMADA', op_generada_id: newOP?.id, lote_generado: nuevoLote,
    baches_propuestos: baches, bultos_resultantes: bultos,
    reviewed_by: userEmail, reviewed_at: new Date().toISOString(),
  }).eq('id', id);

  await registrarAuditoria('CREATE', 'Ventas MRP', `OP ${nuevoLote} creada desde propuesta ${id}: ${baches} baches, ${bultos} bt`);
}

// ═══════════ REPROCESOS ═══════════

export async function fetchReprocesos(semana: number, anio: number) {
  const { data, error } = await supabase.from('reprocesos_pt').select('*').eq('semana', semana).eq('anio', anio).order('fecha', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function registrarReproceso(rep: { grupo: string; codigo_sap: number; cantidad: number; motivo: string; fecha: string; semana: number; anio: number }) {
  const userEmail = localStorage.getItem('localUserEmail') || 'Sistema';
  const { error } = await supabase.from('reprocesos_pt').insert([{ ...rep, created_by: userEmail }]);
  if (error) throw error;
  await registrarAuditoria('CREATE', 'Inventario PT', `Reproceso: ${rep.cantidad} bt de SAP ${rep.codigo_sap} en ${rep.grupo}. Motivo: ${rep.motivo}`);
}

// ═══════════ PRÉSTAMOS ═══════════

export async function fetchPrestamos(estado?: string) {
  let query = supabase.from('prestamos_inventario').select('*').order('created_at', { ascending: false });
  if (estado) query = query.eq('estado', estado);
  const { data, error } = await query.limit(200);
  if (error) throw error;
  return data || [];
}

export async function crearPrestamo(prest: {
  grupo_origen: string; grupo_destino: string; codigo_sap: number; cantidad: number; op_compensacion?: number; motivo?: string;
}) {
  const userEmail = localStorage.getItem('localUserEmail') || 'Sistema';
  const { error } = await supabase.from('prestamos_inventario').insert([{ ...prest, created_by: userEmail }]);
  if (error) throw error;
  await registrarAuditoria('CREATE', 'Inventario PT', `Préstamo: ${prest.cantidad} bt de ${prest.grupo_origen} → ${prest.grupo_destino}`);
}

export async function compensarPrestamo(prestamoId: number, cantidadCompensar: number) {
  const { data: p, error: e1 } = await supabase.from('prestamos_inventario').select('*').eq('id', prestamoId).single();
  if (e1 || !p) throw e1 || new Error('Préstamo no encontrado');

  const nuevaComp = Math.min((p.cantidad_compensada || 0) + cantidadCompensar, p.cantidad);
  const nuevoEstado = nuevaComp >= p.cantidad ? 'COMPENSADO' : 'PARCIAL';

  await supabase.from('prestamos_inventario').update({
    cantidad_compensada: nuevaComp, estado: nuevoEstado,
    compensado_at: nuevoEstado === 'COMPENSADO' ? new Date().toISOString() : null,
  }).eq('id', prestamoId);

  await registrarAuditoria('UPDATE', 'Inventario PT', `Préstamo ${prestamoId}: compensado ${cantidadCompensar} bt → ${nuevoEstado}`);
}

export async function compensarPrestamosPorOP(opLote: number | string, cantidadEntregada: number) {
  const { data: prestamos } = await supabase.from('prestamos_inventario')
    .select('*')
    .eq('op_compensacion', opLote)
    .in('estado', ['PENDIENTE', 'PARCIAL'])
    .order('created_at', { ascending: true });

  if (!prestamos || prestamos.length === 0) return;

  let restante = cantidadEntregada;
  for (const p of prestamos) {
    if (restante <= 0) break;
    const faltante = p.cantidad - (p.cantidad_compensada || 0);
    const aCompensar = Math.min(faltante, restante);
    await compensarPrestamo(p.id, aCompensar);
    restante -= aCompensar;
  }
}

// ═══════════ INVENTARIO PT ═══════════

export async function fetchInventarioPT(semana: number, anio: number, grupo?: string) {
  // 1. Fetch Inventario Inicial (semana actual y plantillas fijadas semana=0)
  let query = supabase.from('inventario_pt').select('*').in('semana', [0, semana]).in('anio', [0, anio]);
  if (grupo) query = query.eq('grupo', grupo);
  const { data: invDataRaw, error } = await query;
  if (error) throw error;

  // Filtrar los fijos vs los de la semana
  const invData = invDataRaw?.filter(i => i.semana === semana && i.anio === anio) || [];
  const fijosData = invDataRaw?.filter(i => i.semana === 0 && i.anio === 0) || [];

  // 2. Fechas de la semana para filtrar produccion y despachos
  const fechas = getFechasSemana(semana, anio);
  const fechaDesde = fechas[0];
  const fechaHasta = fechas[6];

  // 3. Producción (Entregada)
  const { data: prodData } = await supabase.from('produccion')
    .select('bultos_entregados, programacion!inner(lote, codigo_sap, cliente_id)')
    .gte('fecha_produccion', fechaDesde)
    .lte('fecha_produccion', fechaHasta);

  // 4. Despachos
  // Para los despachos, cruzamos con despachos y programacion
  const { data: despData } = await supabase.from('despachos')
    .select('lote, bultos_despachados, cliente_id, fecha')
    .gte('fecha', fechaDesde)
    .lte('fecha', fechaHasta);
    
  // Need to get sap codes for despachos, so we fetch programacion again for those lotes
  const lotesDespacho = Array.from(new Set((despData || []).map(d => d.lote).filter(Boolean)));
  let progMap = new Map<number, { codigo_sap: number; cliente_id: number }>();
  if (lotesDespacho.length > 0) {
    const { data: progDesp } = await supabase.from('programacion').select('lote, codigo_sap, cliente_id').in('lote', lotesDespacho);
    for (const p of (progDesp || [])) {
      if (p.lote) progMap.set(p.lote, p);
    }
  }

  // Pre-cargar clienteGrupoMap
  const clienteGrupoMap = await getClienteGrupoMap();

  // Acumular
  const prodAcum = new Map<string, number>();
  for (const p of (prodData || [])) {
    const prog = Array.isArray(p.programacion) ? p.programacion[0] : p.programacion;
    if (!prog) continue;
    const g = clienteGrupoMap.get(prog.cliente_id);
    if (!g) continue;
    const key = `${g}|${prog.codigo_sap}`;
    prodAcum.set(key, (prodAcum.get(key) || 0) + (p.bultos_entregados || 0));
  }

  const despAcum = new Map<string, number>();
  for (const d of (despData || [])) {
    if (!d.lote) continue;
    const prog = progMap.get(d.lote);
    if (!prog) continue;
    const g = clienteGrupoMap.get(prog.cliente_id);
    if (!g) continue;
    const key = `${g}|${prog.codigo_sap}`;
    despAcum.set(key, (despAcum.get(key) || 0) + (d.bultos_despachados || 0));
  }

  // 5. Programado (Solicitudes de Venta)
  const { data: solData } = await supabase.from('ventas_solicitudes')
    .select('codigo_sap, cliente_id, casas_formuladoras(nombre)')
    .eq('semana', semana)
    .eq('anio', anio);

  // 6. Programado (Órdenes de Producción Activas)
  // Obtenemos los lotes que tienen OPs pendientes o activas
  const { data: opsData } = await supabase.from('programacion')
    .select('codigo_sap, cliente_id')
    .limit(5000); // Límite amplio para capturar las activas recientes

  // Combinar todos los keys (de invData, fijosData, prodAcum, despAcum, solData, opsData)
  const allKeys = new Set<string>();
  
  for (const s of (solData || [])) {
    let g = clienteGrupoMap.get(s.cliente_id);
    if (g) {
      if (g === 'CERDOS VARIOS') {
        const c = Array.isArray(s.casas_formuladoras) ? s.casas_formuladoras[0] : s.casas_formuladoras;
        g = `CERDOS VARIOS ${c?.nombre || ''}`;
      }
      allKeys.add(`${g}|${s.codigo_sap}`);
    }
  }

  for (const op of (opsData || [])) {
    let g = clienteGrupoMap.get(op.cliente_id);
    if (g) {
      if (g === 'CERDOS VARIOS') {
        // En OPs no tenemos la casa directamente a menos que hagamos un join extra
        // Por simplicidad, agregamos a 'CERDOS VARIOS' base.
      }
      allKeys.add(`${g}|${op.codigo_sap}`);
    }
  }

  for (const f of fijosData) {
    allKeys.add(`${f.grupo}|${f.codigo_sap}`);
  }

  const invMap = new Map<string, any>();
  const fijosMap = new Map<string, boolean>();
  
  for (const f of fijosData) {
    fijosMap.set(`${f.grupo}|${f.codigo_sap}`, true);
  }
  for (const i of (invData || [])) {
    const key = `${i.grupo}|${i.codigo_sap}`;
    allKeys.add(key);
    invMap.set(key, i);
  }
  for (const k of prodAcum.keys()) allKeys.add(k);
  for (const k of despAcum.keys()) allKeys.add(k);

  // Merge results
  const results = Array.from(allKeys).map(key => {
    const [grp, sapStr] = key.split('|');
    const sap = parseInt(sapStr);
    
    // Si filtra por un grupo específico en la llamada, ignorar otros grupos
    if (grupo && grp !== grupo) return null;

    const i = invMap.get(key);
    const inicial = i ? i.inventario_inicial : 0;
    const producido = prodAcum.get(key) || 0;
    const despachado = despAcum.get(key) || 0;
    const saldo_actual = inicial + producido - despachado;

    return {
      grupo: grp,
      codigo_sap: sap,
      semana: i ? i.semana : semana,
      anio: i ? i.anio : anio,
      inventario_inicial: inicial,
      producido,
      despachado,
      saldo_actual,
      isFijo: fijosMap.get(key) || false
    };
  }).filter(Boolean);
  
  // Sort
  return results.sort((a: any, b: any) => a.grupo.localeCompare(b.grupo));
}

export async function upsertInventarioPT(row: { grupo: string; codigo_sap: number; semana: number; anio: number; inventario_inicial: number; lote?: string; observaciones?: string }) {
  const userEmail = localStorage.getItem('localUserEmail') || 'Sistema';
  const { error } = await supabase.from('inventario_pt').upsert({ ...row, updated_by: userEmail, updated_at: new Date().toISOString() }, { onConflict: 'grupo,codigo_sap,semana,anio' });
  if (error) throw error;
}

export async function toggleReferenciaFijaPT(grupo: string, codigo_sap: number, isPinned: boolean) {
  const userEmail = localStorage.getItem('localUserEmail') || 'Sistema';
  if (isPinned) {
    // Insertar en semana 0 anio 0
    await supabase.from('inventario_pt').upsert({
      grupo, codigo_sap, semana: 0, anio: 0, inventario_inicial: 0, updated_by: userEmail, updated_at: new Date().toISOString()
    }, { onConflict: 'grupo,codigo_sap,semana,anio' });
  } else {
    // Eliminar de semana 0 anio 0
    await supabase.from('inventario_pt').delete().match({ grupo, codigo_sap, semana: 0, anio: 0 });
  }
}

export async function fetchDetallesMovimientosPT(semana: number, anio: number, grupo: string, codigo_sap: number) {
  const fechas = getFechasSemana(semana, anio);
  const fechaDesde = fechas[0];
  const fechaHasta = fechas[6];

  const clienteGrupoMap = await getClienteGrupoMap();

  // 1. OPs de Producción
  const { data: prodData } = await supabase.from('produccion')
    .select('id, bultos_entregados, fecha_produccion, turno, lote, observaciones, programacion!inner(lote, codigo_sap, cliente_id)')
    .gte('fecha_produccion', fechaDesde)
    .lte('fecha_produccion', fechaHasta)
    .order('fecha_produccion', { ascending: false });

  const produccion = (prodData || []).filter(p => {
    const prog = Array.isArray(p.programacion) ? p.programacion[0] : p.programacion;
    if (!prog || prog.codigo_sap !== codigo_sap) return false;
    const g = clienteGrupoMap.get(prog.cliente_id);
    return g === grupo || (grupo.startsWith('CERDOS VARIOS') && g === 'CERDOS VARIOS');
  });

  // 2. Despachos
  const { data: despData } = await supabase.from('despachos')
    .select('id, lote, bultos_despachados, fecha, num_remision, maestro_vehiculos(placa)')
    .gte('fecha', fechaDesde)
    .lte('fecha', fechaHasta)
    .order('fecha', { ascending: false });

  const lotesDespacho = Array.from(new Set((despData || []).map(d => d.lote).filter(Boolean)));
  let progMap = new Map<number, { codigo_sap: number; cliente_id: number }>();
  if (lotesDespacho.length > 0) {
    const { data: progDesp } = await supabase.from('programacion').select('lote, codigo_sap, cliente_id').in('lote', lotesDespacho);
    for (const p of (progDesp || [])) {
      if (p.lote) progMap.set(p.lote, p);
    }
  }

  const despachos = (despData || []).filter(d => {
    if (!d.lote) return false;
    const prog = progMap.get(d.lote);
    if (!prog || prog.codigo_sap !== codigo_sap) return false;
    const g = clienteGrupoMap.get(prog.cliente_id);
    return g === grupo || (grupo.startsWith('CERDOS VARIOS') && g === 'CERDOS VARIOS');
  }).map(d => {
    const vehiculo = Array.isArray(d.maestro_vehiculos) ? d.maestro_vehiculos[0] : d.maestro_vehiculos;
    return {
      fecha: d.fecha,
      remision: d.num_remision || 'N/A',
      lote: d.lote,
      placa: vehiculo?.placa || '—',
      bultos_despachados: d.bultos_despachados
    };
  });

  return { produccion, despachos };
}

// ═══════════ GRUPOS DE INVENTARIO ═══════════

export async function fetchGruposInventario(): Promise<string[]> {
  // 1. Grupos UNICO: clientes con bodega exclusiva
  const { data: unicoData } = await supabase.from('maestro_clientes')
    .select('grupo_inventario')
    .eq('tipo_inventario', 'UNICO')
    .not('grupo_inventario', 'is', null);
  
  const grupos = new Set<string>();
  for (const c of (unicoData || [])) {
    if (c.grupo_inventario) grupos.add(c.grupo_inventario);
  }

  // 2. Grupos VARIOS: uno por cada casa formuladora activa
  const { data: casas } = await supabase.from('casas_formuladoras')
    .select('nombre')
    .eq('activo', true);
  
  for (const casa of (casas || [])) {
    grupos.add(`CERDOS VARIOS ${casa.nombre}`);
  }

  return Array.from(grupos).sort();
}
