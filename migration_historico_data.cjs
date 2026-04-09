/**
 * migration_historico_data.js
 * 
 * Migrates historical billing data from the Excel "Facturacion Historica" sheet
 * into the new V2 facturación tables (pedidos, pedido_detalle, facturas, factura_pedidos, orden_sap_op).
 * 
 * Usage: node migration_historico_data.js
 * 
 * Prerequisites:
 * 1. Run migration_facturacion_v2.sql in Supabase first
 * 2. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env
 * 3. npm install (xlsx and @supabase/supabase-js should be available)
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

function excelDateToISO(serial) {
  if (!serial || serial < 1) return null;
  const d = new Date((serial - 25569) * 86400 * 1000);
  return d.toISOString().split('T')[0];
}

async function main() {
  console.log('=== MIGRACIÓN HISTÓRICO DE FACTURACIÓN V2 ===\n');

  // 1. Read Excel
  const xlsxPath = path.join(__dirname, '..', 'TRAZABILDAD DE OPERACION AGRIFEED.xlsx');
  if (!fs.existsSync(xlsxPath)) {
    console.error('ERROR: No se encontró el archivo Excel en:', xlsxPath);
    process.exit(1);
  }

  const wb = XLSX.readFile(xlsxPath);
  const ws = wb.Sheets['Facturacion Historica'];
  const rows = XLSX.utils.sheet_to_json(ws);

  // Filter rows that have a factura number
  const withFactura = rows.filter(r => r['N° FACTURA'] != null && r['N° FACTURA'] !== '' && r['N° FACTURA'] !== 0);
  console.log(`Total filas con factura: ${withFactura.length}`);

  // 2. Get programacion data for codigo_alimento lookup
  const { data: progData } = await supabase
    .from('programacion')
    .select('lote, codigo_sap, maestro_alimentos(descripcion)');
  const alimentoMap = {};
  for (const p of (progData || [])) {
    const alim = Array.isArray(p.maestro_alimentos) ? p.maestro_alimentos[0] : p.maestro_alimentos;
    alimentoMap[p.lote] = {
      codigo: p.codigo_sap || 0,
      nombre: alim?.descripcion || '',
    };
  }

  // 3. Get clientes for lookup
  const { data: clientesData } = await supabase
    .from('maestro_clientes')
    .select('codigo_sap, nombre');
  const clienteMap = {};
  for (const c of (clientesData || [])) {
    clienteMap[c.codigo_sap] = c.nombre;
  }

  // 4. Group by N° FACTURA
  const facturaGroups = {};
  for (const row of withFactura) {
    const numFact = String(row['N° FACTURA']);
    if (!facturaGroups[numFact]) {
      facturaGroups[numFact] = [];
    }
    facturaGroups[numFact].push(row);
  }
  console.log(`Facturas únicas: ${Object.keys(facturaGroups).length}`);

  // 5. Clear existing V2 data
  console.log('\nLimpiando datos V2 existentes...');
  await supabase.from('factura_pedidos').delete().neq('id', 0);
  await supabase.from('pedido_detalle').delete().neq('id', 0);
  await supabase.from('facturas').delete().neq('id', 0);
  await supabase.from('pedidos').delete().neq('id', 0);
  await supabase.from('orden_sap_op').delete().neq('id', 0);
  console.log('Datos limpiados.');

  // 6. Process each factura group
  let migrated = 0;
  let errors = 0;
  const ordenSapCache = {};

  for (const [numFactura, factRows] of Object.entries(facturaGroups)) {
    try {
      const first = factRows[0];
      const fechaFact = excelDateToISO(first['FECHA FACT']);
      const numEntrega = first['N° ENTREGA'] ? String(first['N° ENTREGA']) : null;
      const numPedido = first['N° PEDIDO'] ? String(first['N° PEDIDO']) : null;
      const remision = first['Remisión '] || first['Remision'] || null;
      const codigoCliente = first['Codigo Cliente'] || null;
      const nombreCliente = first['NOMBRE CLIENTE'] || clienteMap[codigoCliente] || null;
      const fechaOP = excelDateToISO(first['FECHA OP']);

      // Determine if anticipado
      const anticipadoClients = ['INDUSTRIAS PUROPOLLO S.A.S', 'COLOMBIANA DE INCUBACION SAS INCUBA', 'KROKODEILOS SAS'];
      const esAnticipado = !remision || remision === 0 ||
        anticipadoClients.some(c => (nombreCliente || '').toUpperCase().includes(c.toUpperCase()));

      // Create pedido
      const { data: newPedido, error: pErr } = await supabase
        .from('pedidos')
        .insert([{
          num_pedido: numPedido,
          num_remision: (remision && remision !== 0) ? parseInt(remision) : null,
          cliente_id: codigoCliente ? parseInt(codigoCliente) : null,
          codigo_cliente: codigoCliente ? parseInt(codigoCliente) : null,
          nombre_cliente: nombreCliente,
          fecha_despacho: fechaOP || fechaFact,
          estado: 'FACTURADO',
          es_anticipado: esAnticipado,
        }])
        .select('id')
        .single();

      if (pErr) {
        console.error(`Error pedido for factura ${numFactura}:`, pErr.message);
        errors++;
        continue;
      }

      // Create pedido_detalle rows
      const detalles = factRows.map(r => {
        const op = r['OP (LOTE)'];
        const alim = alimentoMap[op] || {};
        const codSap = r['CODIGO SAP'] || alim.codigo || null;
        const alimento = r['ALIMENTO'] || alim.nombre || null;
        const bultos = r[' N° BULTOS '] || r['N° BULTOS'] || 0;

        return {
          pedido_id: newPedido.id,
          op: op,
          codigo_alimento: codSap ? parseInt(codSap) : null,
          referencia: alimento,
          bultos_despachados: Math.round(bultos),
          bultos_pedido: Math.round(bultos),
        };
      });

      const { error: dErr } = await supabase.from('pedido_detalle').insert(detalles);
      if (dErr) {
        console.error(`Error detalle for factura ${numFactura}:`, dErr.message);
        errors++;
        continue;
      }

      // Create factura
      const { data: newFactura, error: fErr } = await supabase
        .from('facturas')
        .insert([{
          num_factura: numFactura,
          num_entrega: numEntrega,
          fecha_facturacion: fechaFact,
          estado: 'FACTURADA',
        }])
        .select('id')
        .single();

      if (fErr) {
        console.error(`Error factura ${numFactura}:`, fErr.message);
        errors++;
        continue;
      }

      // Link factura ↔ pedido
      await supabase.from('factura_pedidos').insert([{
        factura_id: newFactura.id,
        pedido_id: newPedido.id,
      }]);

      // Cache Orden SAP
      for (const r of factRows) {
        const op = r['OP (LOTE)'];
        const ordenSap = r['ORDEN SAP'];
        if (op && ordenSap && !ordenSapCache[op]) {
          ordenSapCache[op] = String(ordenSap);
        }
      }

      migrated++;
    } catch (err) {
      console.error(`Error processing factura ${numFactura}:`, err.message || err);
      errors++;
    }
  }

  // 7. Insert Orden SAP cache
  console.log(`\nInsertando ${Object.keys(ordenSapCache).length} entradas de Orden SAP...`);
  const sapRows = Object.entries(ordenSapCache).map(([op, sap]) => ({
    op: parseInt(op),
    orden_sap: sap,
  }));

  // Insert in batches of 100
  for (let i = 0; i < sapRows.length; i += 100) {
    const batch = sapRows.slice(i, i + 100);
    const { error } = await supabase.from('orden_sap_op').insert(batch);
    if (error) console.error('Error SAP batch:', error.message);
  }

  console.log('\n=== RESULTADO ===');
  console.log(`Facturas migradas: ${migrated}`);
  console.log(`Errores: ${errors}`);
  console.log(`Orden SAP cacheados: ${Object.keys(ordenSapCache).length}`);
  console.log('Migración completada.');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
