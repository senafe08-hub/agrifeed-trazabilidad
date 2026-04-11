// migrar_materiales_inventario.mjs
// Migra los 269 materiales del Excel CÓDIGOS SAP a la tabla inventario_materiales en Supabase
// Usage: node migrar_materiales_inventario.mjs

import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';
import { readFileSync } from 'fs';

// ── Supabase credentials (same .env as the app) ──
import { config } from 'dotenv';
config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  // Try reading from .env file directly
  const envContent = readFileSync('.env', 'utf-8');
  const vars = {};
  envContent.split('\n').forEach(line => {
    const [key, ...val] = line.split('=');
    if (key && val.length) vars[key.trim()] = val.join('=').trim();
  });
  if (!SUPABASE_URL) process.env.VITE_SUPABASE_URL = vars.VITE_SUPABASE_URL;
  if (!SUPABASE_KEY) process.env.VITE_SUPABASE_ANON_KEY = vars.VITE_SUPABASE_ANON_KEY;
}

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

const EXCEL_PATH = '../ANALISIS TRAZABILIDAD/INVENTARIO AGRIFEED ABRIL 2026.xlsx';

function excelDateToString(serial) {
  const epoch = new Date(Date.UTC(1899, 11, 30));
  const d = new Date(epoch.getTime() + serial * 86400000);
  return d.toISOString().split('T')[0];
}

async function main() {
  console.log('📦 Leyendo Excel de CÓDIGOS SAP...');
  
  const fileBuffer = readFileSync(EXCEL_PATH);
  const wb = XLSX.read(fileBuffer);
  // The sheet name has special chars, use index 3
  const sheetName = wb.SheetNames[3]; // CÓDIGOS SAP
  console.log(`  Hoja: "${sheetName}"`);
  
  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(ws);
  
  console.log(`  ${rows.length} filas encontradas`);
  
  // Map to our schema
  const materiales = [];
  const seen = new Set();
  
  for (const row of rows) {
    const codigo = Number(row['CODIGO']);
    const nombre = String(row['MATERIAL'] || '').trim();
    // Column name has trailing space
    const pesoKey = Object.keys(row).find(k => k.includes('PESO'));
    const peso = pesoKey ? Number(row[pesoKey]) || null : null;
    
    if (!codigo || !nombre || seen.has(codigo)) continue;
    seen.add(codigo);
    
    materiales.push({ codigo, nombre, peso_kg: peso });
  }
  
  console.log(`  ${materiales.length} materiales únicos a migrar`);
  
  // Also add materials from the INVENTARIO sheet that might not be in CÓDIGOS SAP
  const invSheet = wb.Sheets['INVENTARIO'];
  const invRows = XLSX.utils.sheet_to_json(invSheet);
  let extraCount = 0;
  for (const row of invRows) {
    const codigo = Number(row['CODIGO']);
    const nombre = String(row['DESCRIPCION'] || '').trim();
    if (!codigo || !nombre || seen.has(codigo)) continue;
    seen.add(codigo);
    materiales.push({ codigo, nombre, peso_kg: null });
    extraCount++;
  }
  if (extraCount > 0) {
    console.log(`  +${extraCount} materiales adicionales del sheet INVENTARIO`);
  }
  
  console.log(`\n🚀 Insertando ${materiales.length} materiales en Supabase...`);
  
  // Insert in batches of 50
  let success = 0;
  let errors = 0;
  const BATCH_SIZE = 50;
  
  for (let i = 0; i < materiales.length; i += BATCH_SIZE) {
    const batch = materiales.slice(i, i + BATCH_SIZE);
    const { error } = await supabase
      .from('inventario_materiales')
      .upsert(batch, { onConflict: 'codigo' });
    
    if (error) {
      console.error(`  ❌ Error en batch ${i}-${i + batch.length}:`, error.message);
      errors += batch.length;
    } else {
      success += batch.length;
      process.stdout.write(`  ✅ ${success}/${materiales.length}\r`);
    }
  }
  
  console.log(`\n\n📊 Resultado:`);
  console.log(`  ✅ Insertados: ${success}`);
  console.log(`  ❌ Errores: ${errors}`);
  
  // Also migrate stock inicial for April 2026 from the INVENTARIO sheet
  console.log('\n📋 Migrando stock inicial de Abril 2026...');
  
  // First get material IDs from DB
  const { data: dbMaterials } = await supabase
    .from('inventario_materiales')
    .select('id, codigo');
  
  const codeToId = {};
  for (const m of (dbMaterials || [])) {
    codeToId[m.codigo] = m.id;
  }
  
  const stockRows = [];
  for (const row of invRows) {
    const codigo = Number(row['CODIGO']);
    const materialId = codeToId[codigo];
    if (!materialId) continue;
    
    // Find stock inicial column (has "STOCK INICIAL 01 ABRIL" in name)
    const stockKey = Object.keys(row).find(k => k.includes('STOCK INICIAL 01'));
    const stockVal = stockKey ? Number(row[stockKey]) || 0 : 0;
    
    // Find consumo estimado
    const consumoKey = Object.keys(row).find(k => k.includes('CONSUMO ESTIMADO'));
    const consumoVal = consumoKey ? Number(row[consumoKey]) || 0 : 0;
    
    stockRows.push({
      material_id: materialId,
      mes: 4,  // Abril
      anio: 2026,
      stock_kg: stockVal,
      consumo_estimado_mes: consumoVal,
    });
  }
  
  if (stockRows.length > 0) {
    const { error: sErr } = await supabase
      .from('inventario_stock_inicial')
      .upsert(stockRows, { onConflict: 'material_id,mes,anio' });
    
    if (sErr) {
      console.error('  ❌ Error migrando stock:', sErr.message);
    } else {
      console.log(`  ✅ ${stockRows.length} registros de stock inicial migrados`);
    }
  }
  
  // Migrate entradas from ENTRADAS sheet
  console.log('\n📥 Migrando entradas de Abril 2026...');
  const entSheet = wb.Sheets['ENTRADAS'];
  const entRows = XLSX.utils.sheet_to_json(entSheet);
  
  const entradas = [];
  for (const row of entRows) {
    const codigo = Number(row['CODIGO']);
    const materialId = codeToId[codigo];
    // Find product and qty columns
    const prodKey = Object.keys(row).find(k => k.trim().startsWith('PRODUCTO'));
    const qtyKey = Object.keys(row).find(k => k.includes('CANTIDAD KG'));
    const producto = prodKey ? row[prodKey] : null;
    const cantidad = qtyKey ? Number(row[qtyKey]) : 0;
    
    if (!materialId || !producto || !cantidad || cantidad <= 0) continue;
    
    // Parse fecha
    let fecha = null;
    const fechaRaw = row['FECHA'];
    if (fechaRaw) {
      if (typeof fechaRaw === 'number') {
        fecha = excelDateToString(fechaRaw);
      } else {
        fecha = String(fechaRaw).split('T')[0];
      }
    }
    
    entradas.push({
      fecha: fecha || '2026-04-01',
      material_id: materialId,
      cantidad_kg: cantidad,
    });
  }
  
  if (entradas.length > 0) {
    const { error: eErr } = await supabase
      .from('inventario_entradas')
      .insert(entradas);
    if (eErr) {
      console.error('  ❌ Error migrando entradas:', eErr.message);
    } else {
      console.log(`  ✅ ${entradas.length} entradas migradas`);
    }
  }
  
  // Migrate traslados from TRASLADOS sheet
  console.log('\n📤 Migrando traslados de Abril 2026...');
  const trSheet = wb.Sheets['TRASLADOS'];
  const trRows = XLSX.utils.sheet_to_json(trSheet);
  
  const traslados = [];
  for (const row of trRows) {
    const codKey = Object.keys(row).find(k => k.includes('DIGO'));
    const codigo = codKey ? Number(row[codKey]) : 0;
    const materialId = codeToId[codigo];
    
    const prodKey = Object.keys(row).find(k => k.trim().startsWith('PRODUCTO'));
    const producto = prodKey ? row[prodKey] : null;
    
    const qtyKey = Object.keys(row).find(k => k.includes('CANT TRASLADO'));
    const cantidad = qtyKey ? Number(row[qtyKey]) : 0;
    
    const clienteOp = row['CLIENTE-OP'] || '';
    const semana = Number(row['SEMANA']) || 0;
    
    if (!materialId || !producto || !cantidad || cantidad <= 0 || !semana) continue;
    
    let fecha = null;
    const fechaKey = Object.keys(row).find(k => k.trim().startsWith('FECHA'));
    const fechaRaw = fechaKey ? row[fechaKey] : null;
    if (fechaRaw) {
      if (typeof fechaRaw === 'number') {
        fecha = excelDateToString(fechaRaw);
      } else {
        fecha = String(fechaRaw).split('T')[0];
      }
    }
    
    traslados.push({
      fecha: fecha || '2026-04-01',
      cliente_op: clienteOp,
      material_id: materialId,
      cantidad_kg: cantidad,
      semana: semana,
      mes: 4,
      anio: 2026,
    });
  }
  
  if (traslados.length > 0) {
    // Insert in batches
    for (let i = 0; i < traslados.length; i += BATCH_SIZE) {
      const batch = traslados.slice(i, i + BATCH_SIZE);
      const { error: tErr } = await supabase
        .from('inventario_traslados')
        .insert(batch);
      if (tErr) {
        console.error(`  ❌ Error en batch traslados ${i}:`, tErr.message);
      }
    }
    console.log(`  ✅ ${traslados.length} traslados migrados`);
  }
  
  console.log('\n🎉 Migración completada!');
}

main().catch(console.error);
