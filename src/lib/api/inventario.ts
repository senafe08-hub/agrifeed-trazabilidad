// ══════════════════════════════════════════════════════════════
// API: INVENTARIO DE MATERIA PRIMA
// Funciones para materiales, entradas, traslados, stock inicial
// y cálculo consolidado del inventario.
// ══════════════════════════════════════════════════════════════

import supabase from '../supabase';
import { registrarAuditoria } from '../supabase';

let consolidadoCache: Record<string, { ts: number, data: any[] }> = {};

export function clearInventarioCache() {
  consolidadoCache = {};
}

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
  fecha: string; material_id: number; cantidad_kg: number; observaciones?: string; fecha_vencimiento?: string | null;
}) {
  const { error } = await supabase.from('inventario_entradas').insert([entrada]);
  if (error) throw error;
  
  // Upsert logic for daily lot (differentiated by vencimiento)
  const fechaVenc = entrada.fecha_vencimiento ? entrada.fecha_vencimiento.replace(/-/g, '') : 'NA';
  const codigoLote = `LOTE-${entrada.material_id}-${entrada.fecha.replace(/-/g, '')}-${fechaVenc}`;
  
  const { data: existingLot } = await supabase.from('inventario_lotes').select('*').eq('codigo_lote', codigoLote).single();
  
  if (existingLot) {
    const { error: updError } = await supabase.from('inventario_lotes').update({
      cantidad_inicial: Number(existingLot.cantidad_inicial) + Number(entrada.cantidad_kg),
      cantidad_disponible: Number(existingLot.cantidad_disponible) + Number(entrada.cantidad_kg),
      fecha_vencimiento: entrada.fecha_vencimiento || existingLot.fecha_vencimiento
    }).eq('id', existingLot.id);
    if (updError) console.error("Error actualizando lote:", updError.message);
  } else {
    const { error: insError } = await supabase.from('inventario_lotes').insert([{
      codigo_lote: codigoLote,
      material_id: entrada.material_id,
      cantidad_inicial: entrada.cantidad_kg,
      cantidad_disponible: entrada.cantidad_kg,
      fecha_ingreso: entrada.fecha,
      fecha_vencimiento: entrada.fecha_vencimiento || null
    }]);
    if (insError) console.error("Error creando lote:", insError.message);
  }

  clearInventarioCache();
  await registrarAuditoria('CREATE', 'Inventario MP', `Entrada de ${entrada.cantidad_kg} kg, material ID ${entrada.material_id}`);
}

export async function updateInventarioEntrada(id: number, entrada: {
  fecha?: string; material_id?: number; cantidad_kg?: number; observaciones?: string; fecha_vencimiento?: string | null;
}) {
  // 1. Obtener entrada actual
  const { data: entradaAnterior } = await supabase.from('inventario_entradas').select('*').eq('id', id).single();
  
  if (entradaAnterior) {
    // 2. Restar del lote anterior
    const venciAnt = entradaAnterior.fecha_vencimiento ? entradaAnterior.fecha_vencimiento.replace(/-/g, '') : 'NA';
    const codigoLoteAnt = `LOTE-${entradaAnterior.material_id}-${entradaAnterior.fecha.replace(/-/g, '')}-${venciAnt}`;
    const codigoLoteAntViejo = `LOTE-${entradaAnterior.material_id}-${entradaAnterior.fecha.replace(/-/g, '')}`;
    
    let { data: loteAnt } = await supabase.from('inventario_lotes').select('*').eq('codigo_lote', codigoLoteAnt).single();
    if (!loteAnt) {
      const { data: oldLote } = await supabase.from('inventario_lotes').select('*').eq('codigo_lote', codigoLoteAntViejo).single();
      loteAnt = oldLote;
    }

    if (loteAnt) {
      const newAntInicial = Number(loteAnt.cantidad_inicial) - Number(entradaAnterior.cantidad_kg);
      if (newAntInicial <= 0) {
        await supabase.from('inventario_lotes').delete().eq('id', loteAnt.id);
      } else {
        await supabase.from('inventario_lotes').update({
          cantidad_inicial: newAntInicial,
          cantidad_disponible: Number(loteAnt.cantidad_disponible) - Number(entradaAnterior.cantidad_kg)
        }).eq('id', loteAnt.id);
      }
    }
  }

  // 3. Actualizar la entrada
  const { error } = await supabase.from('inventario_entradas').update(entrada).eq('id', id);
  if (error) throw error;

  // 4. Sumar al nuevo lote (o actualizarlo)
  if (entradaAnterior) {
    const fechaFinal = entrada.fecha || entradaAnterior.fecha;
    const matIdFinal = entrada.material_id || entradaAnterior.material_id;
    const cantFinal = entrada.cantidad_kg ?? entradaAnterior.cantidad_kg;
    const venciFinal = entrada.fecha_vencimiento !== undefined ? entrada.fecha_vencimiento : entradaAnterior.fecha_vencimiento;

    const fechaVencNuevo = venciFinal ? venciFinal.replace(/-/g, '') : 'NA';
    const codigoLoteNuevo = `LOTE-${matIdFinal}-${fechaFinal.replace(/-/g, '')}-${fechaVencNuevo}`;

    let { data: loteNuevo } = await supabase.from('inventario_lotes').select('*').eq('codigo_lote', codigoLoteNuevo).single();
    
    if (loteNuevo) {
      await supabase.from('inventario_lotes').update({
        cantidad_inicial: Number(loteNuevo.cantidad_inicial) + Number(cantFinal),
        cantidad_disponible: Number(loteNuevo.cantidad_disponible) + Number(cantFinal),
        fecha_vencimiento: venciFinal || loteNuevo.fecha_vencimiento
      }).eq('id', loteNuevo.id);
    } else {
      await supabase.from('inventario_lotes').insert([{
        codigo_lote: codigoLoteNuevo,
        material_id: matIdFinal,
        cantidad_inicial: cantFinal,
        cantidad_disponible: cantFinal,
        fecha_ingreso: fechaFinal,
        fecha_vencimiento: venciFinal || null
      }]);
    }
  }

  clearInventarioCache();
  await registrarAuditoria('UPDATE', 'Inventario MP', `Actualizada entrada ID ${id}`);
}

export async function deleteInventarioEntrada(id: number) {
  // 1. Obtener la entrada
  const { data: entrada } = await supabase.from('inventario_entradas').select('*').eq('id', id).single();
  if (entrada) {
    // 2. Restar del lote diario
    const venciStr = entrada.fecha_vencimiento ? entrada.fecha_vencimiento.replace(/-/g, '') : 'NA';
    const codigoLote = `LOTE-${entrada.material_id}-${entrada.fecha.replace(/-/g, '')}-${venciStr}`;
    const codigoLoteViejo = `LOTE-${entrada.material_id}-${entrada.fecha.replace(/-/g, '')}`;
    
    let { data: lote } = await supabase.from('inventario_lotes').select('*').eq('codigo_lote', codigoLote).single();
    if (!lote) {
      const { data: oldLote } = await supabase.from('inventario_lotes').select('*').eq('codigo_lote', codigoLoteViejo).single();
      lote = oldLote;
    }

    if (lote) {
      const newInicial = Number(lote.cantidad_inicial) - Number(entrada.cantidad_kg);
      if (newInicial <= 0) {
        await supabase.from('inventario_lotes').delete().eq('id', lote.id);
      } else {
        await supabase.from('inventario_lotes').update({
          cantidad_inicial: newInicial,
          cantidad_disponible: Number(lote.cantidad_disponible) - Number(entrada.cantidad_kg)
        }).eq('id', lote.id);
      }
    }
  }

  // 3. Borrar entrada
  const { error } = await supabase.from('inventario_entradas').delete().eq('id', id);
  if (error) throw error;
  clearInventarioCache();
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
  clearInventarioCache();
  await registrarAuditoria('CREATE', 'Inventario MP', `Registrados ${traslados.length} traslados para OP ${traslados[0].cliente_op}`);
}

export async function createInventarioTraslado(traslado: {
  fecha: string; cliente_op: string; material_id: number;
  cantidad_kg: number; semana: number; mes: number; anio: number; observaciones?: string;
}) {
  const { error } = await supabase.from('inventario_traslados').insert([traslado]);
  if (error) throw error;
  clearInventarioCache();
  await registrarAuditoria('CREATE', 'Inventario MP', `Traslado de ${traslado.cantidad_kg} kg a ${traslado.cliente_op}`);
}

export async function updateInventarioTraslado(id: number, traslado: {
  fecha?: string; cliente_op?: string; material_id?: number;
  cantidad_kg?: number; semana?: number; observaciones?: string;
}) {
  const { error } = await supabase.from('inventario_traslados').update(traslado).eq('id', id);
  if (error) throw error;
  clearInventarioCache();
  await registrarAuditoria('UPDATE', 'Inventario MP', `Actualizado traslado ID ${id}`);
}

export async function deleteInventarioTraslado(id: number) {
  const { error } = await supabase.from('inventario_traslados').delete().eq('id', id);
  if (error) throw error;
  clearInventarioCache();
  await registrarAuditoria('DELETE', 'Inventario MP', `Eliminado traslado ID ${id}`);
}

// ── Histórico de Consumos ──

export async function fetchLotesActivos(material_id: number) {
  const { data, error } = await supabase
    .from('inventario_lotes')
    .select('*')
    .eq('material_id', material_id)
    .gt('cantidad_disponible', 0)
    .order('fecha_vencimiento', { ascending: true, nullsFirst: false });
  if (error) throw error;
  return data;
}

export async function fetchTrasladoLotes(traslado_id: number) {
  const { data, error } = await supabase
    .from('inventario_traslados_lotes')
    .select('cantidad, inventario_lotes(codigo_lote, fecha_ingreso, fecha_vencimiento)')
    .eq('traslado_id', traslado_id);
  if (error) throw error;
  return data;
}

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
  clearInventarioCache();
}

export async function upsertStockInicialBatch(rows: Array<{
  material_id: number; mes: number; anio: number; stock_kg: number; consumo_estimado_mes?: number;
}>) {
  const { error } = await supabase
    .from('inventario_stock_inicial')
    .upsert(rows, { onConflict: 'material_id,mes,anio' });
  if (error) throw error;
  clearInventarioCache();
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
  proximo_vencimiento?: string | null;
  dias_vencimiento?: number | null;
}

export async function calcularInventarioConsolidado(mes: number, anio: number, depth: number = 0, forceRefresh: boolean = false): Promise<InventarioConsolidado[]> {
  const cacheKey = `${mes}-${anio}`;
  if (!forceRefresh && depth === 0 && consolidadoCache[cacheKey] && (Date.now() - consolidadoCache[cacheKey].ts < 60000)) {
    return consolidadoCache[cacheKey].data;
  }

  const [materiales, stockData, entradasData, trasladosData, lotesActivosResult] = await Promise.all([
    fetchInventarioMateriales(),
    fetchStockInicial(mes, anio),
    fetchInventarioEntradas(mes, anio),
    fetchInventarioTraslados(mes, anio),
    supabase.from('inventario_lotes').select('material_id, fecha_vencimiento').gt('cantidad_disponible', 0).not('fecha_vencimiento', 'is', null).order('fecha_vencimiento', { ascending: true })
  ]);

  const stockMap: Record<number, { stock_kg: number; consumo_estimado_mes: number }> = {};
  for (const s of stockData) {
    stockMap[s.material_id] = { stock_kg: s.stock_kg || 0, consumo_estimado_mes: s.consumo_estimado_mes || 0 };
  }

  // Fallback to previous month's final stock if not explicitly set
  if (depth < 6) {
    const missing = materiales.some(mat => !stockMap[mat.id]);
    if (missing) {
      let prevMes = mes - 1;
      let prevAnio = anio;
      if (prevMes === 0) { prevMes = 12; prevAnio = anio - 1; }
      
      const prevConsolidado = await calcularInventarioConsolidado(prevMes, prevAnio, depth + 1);
      
      for (const mat of materiales) {
        if (!stockMap[mat.id]) {
          const prevMat = prevConsolidado.find(p => p.material_id === mat.id);
          stockMap[mat.id] = { 
            stock_kg: prevMat ? prevMat.stock_final : 0, 
            consumo_estimado_mes: prevMat ? prevMat.consumo_estimado_mes : 0 
          };
        }
      }
    }
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

  const vencimientosMap: Record<number, { fecha: string; dias: number }> = {};
  const today = new Date().getTime();
  for (const l of (lotesActivosResult.data || [])) {
    if (!vencimientosMap[l.material_id] && l.fecha_vencimiento) {
      if (l.fecha_vencimiento.startsWith('2099')) continue;
      const days = Math.ceil((new Date(l.fecha_vencimiento).getTime() - today) / (1000 * 3600 * 24));
      vencimientosMap[l.material_id] = { fecha: l.fecha_vencimiento, dias: days };
    }
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
    const vencimientoInfo = vencimientosMap[mat.id];

    if (stock.stock_kg === 0 && entradas === 0 && traslados === 0 && consumoEst === 0) continue;

    result.push({
      material_id: mat.id,
      codigo: mat.codigo,
      nombre: mat.nombre,
      peso_kg: mat.peso_kg || null,
      stock_inicial: stock.stock_kg,
      entradas,
      traslados,
      stock_final: stockFinal,
      consumo_estimado_mes: consumoEst,
      consumo_semanal: consumoSemanal,
      semanas_cobertura: semanasCobertura,
      min_cobertura_semanas: mat.min_cobertura_semanas || 2,
      pendiente_ingresar: pendiente,
      consumo_semana: trasladosPorMaterial[mat.id] || [0,0,0,0,0],
      proximo_vencimiento: vencimientoInfo?.fecha || null,
      dias_vencimiento: vencimientoInfo?.dias ?? null,
    });
  }

  const finalResult = result.sort((a, b) => a.nombre.localeCompare(b.nombre));
  if (depth === 0) {
    consolidadoCache[cacheKey] = { ts: Date.now(), data: finalResult };
  }
  return finalResult;
}
