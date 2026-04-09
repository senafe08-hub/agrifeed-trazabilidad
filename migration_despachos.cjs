/**
 * migration_despachos.cjs
 * 
 * Migrates dispatch (despachos) data from the Excel "Despachos Logistica Hist" sheet
 * into the Supabase `despachos` table.
 * 
 * Steps:
 * 1. Deletes ALL existing rows from `despachos`
 * 2. Reads Excel data
 * 3. Resolves client/vehicle/granja IDs via master tables
 * 4. Validates lote FK against programacion
 * 5. Inserts rows in batches
 * 
 * Usage: node migration_despachos.cjs
 */

const XLSX = require('xlsx');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const fs = require('fs');

// Load .env
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  for (const line of envContent.split('\n')) {
    const [key, ...valParts] = line.split('=');
    if (key && valParts.length) {
      process.env[key.trim()] = valParts.join('=').trim();
    }
  }
}

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY || SUPABASE_URL.includes('YOUR_PROJECT')) {
  console.error('ERROR: Configure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

/**
 * Convert Excel serial date number to ISO date string (YYYY-MM-DD)
 */
function excelDateToISO(serial) {
  if (!serial || serial < 1) return null;
  const d = new Date((serial - 25569) * 86400 * 1000);
  return d.toISOString().split('T')[0];
}

/**
 * Normalize name for fuzzy matching (trim, collapse spaces, uppercase)
 */
function normalize(name) {
  if (!name) return '';
  return String(name).trim().replace(/\s+/g, ' ').toUpperCase();
}

async function main() {
  console.log('=== MIGRACIÓN DE DESPACHOS DESDE EXCEL ===\n');

  // ── 1. Read Excel ──
  const xlsxPath = path.join(__dirname, '..', 'TRAZABILDAD DE OPERACION AGRIFEED.xlsx');
  if (!fs.existsSync(xlsxPath)) {
    console.error('ERROR: No se encontró el archivo Excel en:', xlsxPath);
    process.exit(1);
  }

  const wb = XLSX.readFile(xlsxPath);
  const ws = wb.Sheets['Despachos Logistica Hist'];
  if (!ws) {
    console.error('ERROR: No se encontró la hoja "Despachos Logistica Hist"');
    process.exit(1);
  }

  const rows = XLSX.utils.sheet_to_json(ws);
  // Filter rows that have at least a Remision or a Lote
  const validRows = rows.filter(r => r['N° Remision'] || r['Lote']);
  console.log(`Total filas en Excel: ${rows.length}`);
  console.log(`Filas válidas (con remisión o lote): ${validRows.length}`);

  // ── 2. Load master tables for ID lookups ──
  console.log('\nCargando tablas maestras...');

  // Clientes
  const { data: clientesData } = await supabase
    .from('maestro_clientes')
    .select('codigo_sap, nombre');
  const clienteMap = {};
  for (const c of (clientesData || [])) {
    clienteMap[normalize(c.nombre)] = c.codigo_sap;
  }
  console.log(`  Clientes cargados: ${Object.keys(clienteMap).length}`);

  // Vehículos
  const { data: vehiculosData } = await supabase
    .from('maestro_vehiculos')
    .select('id, placa');
  const vehiculoMap = {};
  for (const v of (vehiculosData || [])) {
    vehiculoMap[normalize(v.placa)] = v.id;
  }
  console.log(`  Vehículos cargados: ${Object.keys(vehiculoMap).length}`);

  // Granjas
  const { data: granjasData } = await supabase
    .from('maestro_granjas')
    .select('id, nombre');
  const granjaMap = {};
  for (const g of (granjasData || [])) {
    granjaMap[normalize(g.nombre)] = g.id;
  }
  console.log(`  Granjas cargadas: ${Object.keys(granjaMap).length}`);

  // Programación (lotes válidos)
  const { data: progData } = await supabase
    .from('programacion')
    .select('lote');
  const validLotes = new Set((progData || []).map(p => p.lote));
  console.log(`  Lotes válidos en programación: ${validLotes.size}`);

  // ── 3. Delete ALL existing despachos ──
  console.log('\n⚠️  Eliminando TODOS los despachos existentes de la base de datos...');
  // Delete in batches to handle large datasets
  let deleteCount = 0;
  while (true) {
    const { data: batch } = await supabase
      .from('despachos')
      .select('id')
      .limit(1000);
    if (!batch || batch.length === 0) break;
    const ids = batch.map(b => b.id);
    const { error: delErr } = await supabase
      .from('despachos')
      .delete()
      .in('id', ids);
    if (delErr) {
      console.error('Error eliminando batch:', delErr.message);
      break;
    }
    deleteCount += ids.length;
    process.stdout.write(`\r  Eliminados: ${deleteCount} registros`);
  }
  console.log(`\n✅ Despachos existentes eliminados: ${deleteCount}`);

  // ── 4. Map Excel rows to despachos table format ──
  console.log('\nProcesando filas del Excel...');
  const despachoRows = [];
  const unmatchedClients = new Set();
  const unmatchedVehicles = new Set();
  const unmatchedGranjas = new Set();
  let skipped = 0;
  let lotesNotInProg = 0;

  for (const row of validRows) {
    // Date: column "0-Jan-00" is the Excel serial date
    const fecha = excelDateToISO(row['0-Jan-00']);
    if (!fecha) {
      skipped++;
      continue;
    }

    // Remisión
    const numRemision = row['N° Remision'] ? parseInt(row['N° Remision']) : null;

    // Lote (OP) — validate against programacion FK
    let lote = row['Lote'] ? parseInt(row['Lote']) : null;
    if (lote && !validLotes.has(lote)) {
      // Lote doesn't exist in programacion — set to null to avoid FK violation
      lotesNotInProg++;
      lote = null;
    }

    // Bultos despachados
    const bultosDesp = parseInt(row[' Bultos Desp  '] || row['Bultos Desp'] || 0) || 0;

    // Bultos dañados
    const bultosDanados = parseInt(row['Bultos dañados'] || row['Bultos danados'] || 0) || 0;

    // Cliente lookup
    const clienteNombre = normalize(row['Clientes Al Que Se Despacha']);
    let clienteId = null;
    if (clienteNombre) {
      clienteId = clienteMap[clienteNombre] || null;
      if (!clienteId) {
        // Fuzzy: try partial match
        for (const [name, id] of Object.entries(clienteMap)) {
          if (name.includes(clienteNombre) || clienteNombre.includes(name)) {
            clienteId = id;
            break;
          }
        }
        if (!clienteId) unmatchedClients.add(clienteNombre);
      }
    }

    // Vehículo lookup
    const placa = normalize(row['#Placa']);
    let vehiculoId = null;
    if (placa) {
      vehiculoId = vehiculoMap[placa] || null;
      if (!vehiculoId) unmatchedVehicles.add(placa);
    }

    // Granja lookup
    const granjaNombre = normalize(row['Granja Puropollo']);
    let granjaId = null;
    if (granjaNombre) {
      granjaId = granjaMap[granjaNombre] || null;
      if (!granjaId) {
        // Fuzzy match: try partial
        for (const [name, id] of Object.entries(granjaMap)) {
          if (name.includes(granjaNombre) || granjaNombre.includes(name)) {
            granjaId = id;
            break;
          }
        }
        if (!granjaId) unmatchedGranjas.add(granjaNombre);
      }
    }

    // Observaciones
    const observaciones = (row['Observaciones'] || '').toString().trim() || null;

    despachoRows.push({
      fecha,
      num_remision: numRemision,
      lote,
      granja_id: granjaId,
      bultos_despachados: bultosDesp,
      bultos_danados: bultosDanados,
      vehiculo_id: vehiculoId,
      cliente_id: clienteId,
      observaciones,
    });
  }

  console.log(`\nFilas preparadas para inserción: ${despachoRows.length}`);
  console.log(`Filas sin fecha válida (omitidas): ${skipped}`);
  console.log(`Lotes no encontrados en programación (seteados a null): ${lotesNotInProg}`);

  if (unmatchedClients.size > 0) {
    console.log(`\n⚠️  Clientes sin match (${unmatchedClients.size}):`);
    for (const c of unmatchedClients) console.log(`   - ${c}`);
  }
  if (unmatchedVehicles.size > 0) {
    console.log(`\n⚠️  Vehículos sin match (${unmatchedVehicles.size}):`);
    for (const v of unmatchedVehicles) console.log(`   - ${v}`);
  }
  if (unmatchedGranjas.size > 0) {
    console.log(`\n⚠️  Granjas sin match (${unmatchedGranjas.size}):`);
    for (const g of unmatchedGranjas) console.log(`   - ${g}`);
  }

  // ── 5. Insert in batches ──
  const BATCH_SIZE = 200;
  let inserted = 0;
  let batchErrors = 0;

  console.log(`\nInsertando ${despachoRows.length} filas en batches de ${BATCH_SIZE}...`);

  for (let i = 0; i < despachoRows.length; i += BATCH_SIZE) {
    const batch = despachoRows.slice(i, i + BATCH_SIZE);
    const { error: insertError } = await supabase.from('despachos').insert(batch);
    if (insertError) {
      console.error(`\nError en batch ${Math.floor(i / BATCH_SIZE) + 1}:`, insertError.message);
      batchErrors++;
      // Try row-by-row for this batch
      for (const row of batch) {
        const { error: rowErr } = await supabase.from('despachos').insert([row]);
        if (rowErr) {
          console.error(`  Row error (rem=${row.num_remision}, lote=${row.lote}):`, rowErr.message);
        } else {
          inserted++;
        }
      }
    } else {
      inserted += batch.length;
    }

    // Progress
    const pct = Math.round(((i + batch.length) / despachoRows.length) * 100);
    process.stdout.write(`\r  Progreso: ${pct}% (${inserted} insertados)`);
  }

  console.log('\n\n=== RESULTADO ===');
  console.log(`✅ Filas insertadas exitosamente: ${inserted}`);
  console.log(`❌ Batches con error: ${batchErrors}`);
  console.log(`📊 Total filas en Excel: ${validRows.length}`);
  console.log('Migración completada.');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
