const fs = require('fs');
const content = fs.readFileSync('src/lib/supabase.ts', 'utf8');

// Find the start of calcularInventarioConsolidado
const targetMethod = 'export async function calcularInventarioConsolidado(mes: number, anio: number): Promise<InventarioConsolidado[]> {';
const startIndex = content.indexOf(targetMethod);

if (startIndex === -1) {
  console.log("Could not find calcularInventarioConsolidado");
  process.exit(1);
}

// Keep everything before it
const safePart = content.substring(0, startIndex);

const tailPart = `export async function calcularInventarioConsolidado(mes: number, anio: number): Promise<InventarioConsolidado[]> {
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
    if (!trasladosPorMaterial[t.material_id]) trasladosPorMaterial[t.material_id] = [0, 0, 0, 0, 0];
    const semIdx = (t.semana || 1) - 1;
    if (semIdx >= 0 && semIdx < 5) trasladosPorMaterial[t.material_id][semIdx] += t.cantidad_kg || 0;
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

// ══════════════════════════════════════════════════════════════
// FORMULACIÓN HELPERS
// ══════════════════════════════════════════════════════════════

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
  await registrarAuditoria('CREATE', 'Formulación', \`Fórmula "\${header.nombre}" creada con \${detalles.length} ingredientes\`);
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
  await registrarAuditoria('UPDATE', 'Formulación', \`Fórmula ID \${formulaId} actualizada (\${detalles.length} ingredientes)\`);
}

export async function toggleFormulaEstado(formulaId: number, nuevoEstado: 'activa' | 'inactiva') {
  const { error } = await supabase.from('formulas').update({ estado: nuevoEstado }).eq('id', formulaId);
  if (error) throw error;
  await registrarAuditoria('UPDATE', 'Formulación', \`Fórmula ID \${formulaId} → \${nuevoEstado}\`);
}

export async function assignFormulaToOP(opId: number, formulaId: number | null) {
  const { error } = await supabase.from('programacion').update({ formula_id: formulaId }).eq('id', opId);
  if (error) throw error;
  await registrarAuditoria('UPDATE', 'Formulación', \`OP ID \${opId} → Fórmula \${formulaId ?? 'ninguna'}\`);
}

export async function fetchOPsConFormula() {
  const { data, error } = await supabase.from('programacion')
    .select(\`*, maestro_alimentos(descripcion), maestro_clientes(nombre), formulas(id, nombre, estado)\`)
    .order('lote', { ascending: false }).limit(5000);
  if (error) throw error;
  return data || [];
}

export async function fetchOPsParaExplosion(fechaDesde: string, fechaHasta: string, clienteSap?: number) {
  let query = supabase.from('programacion')
    .select(\`*, maestro_alimentos(descripcion), maestro_clientes(nombre), formulas(id, nombre, sacos_por_bache, estado)\`)
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
  for (const op of opsData) {
    const { error } = await supabase.from('programacion').update({ estado_formulacion: 'LIQUIDADA', formula_snapshot: op.snapshot }).eq('id', op.id);
    if (error) throw error;
  }

  const getSemana = (d: Date) => {
    const date = new Date(d.getTime());
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() + 3 - (date.getDay() + 6) % 7);
    const week1 = new Date(date.getFullYear(), 0, 4);
    return 1 + Math.round(((date.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
  };

  if (consumos.length > 0) {
    const now = new Date();
    const opsLotes = opsData.map(o => o.snapshot.lote || o.id).join(', ');
    const traslados = consumos.map(c => ({
      fecha: now.toISOString().split('T')[0],
      cliente_op: \`OP(s): \${opsLotes.substring(0, 40)}\`,
      material_id: c.material_id,
      cantidad_kg: c.cantidad,
      semana: getSemana(now),
      mes: now.getMonth() + 1,
      anio: now.getFullYear(),
      observaciones: \`Liquidación automática Formulación\`
    }));

    // Reusing batch fn
    if (traslados.length > 0) {
      const { error } = await supabase.from('inventario_traslados').insert(traslados);
      if (error) throw error;
    }
  }

  await registrarAuditoria('CREATE', 'Formulación', \`Liquidación de \${opsData.length} OPs con descuento de inventario\`);
}
`;

fs.writeFileSync('src/lib/supabase.ts', safePart + tailPart);
console.log("File written correctly.");
