/**
 * Script para migrar datos del Excel "Cupo De Clientes" al maestro_clientes en Supabase.
 * 
 * Uso: node migrar_cupos.mjs
 * 
 * Lee el Excel, y por cada cliente:
 *  - Si existe en maestro_clientes (por codigo_sap), actualiza poblacion, tipo_pago, limite_credito
 *  - Si NO existe, lo crea con todos los campos
 */

import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';
import { readFileSync } from 'fs';

// --- Supabase config (mismas credenciales que la app) ---
const SUPABASE_URL = 'https://schhqtttjysiyghwmefv.supabase.co';
const SUPABASE_KEY = 'sb_publishable_mZeu7Ba0_WrzO-pImkqAow_tHlPoa5p';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// --- Read Excel ---
const excelPath = 'C:\\PYTHON\\APP AGRIFEED TRAZABILIDAD\\ANALISIS TRAZABILIDAD\\Cupo De Clientes.xlsx';
const buffer = readFileSync(excelPath);
const wb = XLSX.read(buffer, { type: 'buffer' });
const sheet = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

console.log(`📄 Leídos ${rows.length} registros del Excel de cupos`);

// --- Process ---
let updated = 0;
let created = 0;
let errors = 0;

for (const r of rows) {
  const codigoSap = Number(r['Deudor']) || 0;
  if (!codigoSap) continue;

  const nombre = String(r['Nombre Deudor'] || '').trim();
  const limiteCredito = Number(r['Límite crédito'] || r['Limite credito'] || r['Límite Crédito'] || 0);
  const tipoPago = String(r['Tipo Pago'] || '').trim().toUpperCase() || 'CONTADO';
  const poblacion = String(r['Poblacion'] || r['Población'] || '').trim();

  // Check if client already exists
  const { data: existing } = await supabase
    .from('maestro_clientes')
    .select('id')
    .eq('codigo_sap', codigoSap)
    .limit(1);

  if (existing && existing.length > 0) {
    // UPDATE existing client
    const { error } = await supabase
      .from('maestro_clientes')
      .update({
        poblacion,
        tipo_pago: tipoPago.includes('CRED') ? 'CREDITO' : 'CONTADO',
        limite_credito: limiteCredito,
      })
      .eq('codigo_sap', codigoSap);

    if (error) {
      console.error(`❌ Error actualizando ${codigoSap} (${nombre}): ${error.message}`);
      errors++;
    } else {
      updated++;
    }
  } else {
    // INSERT new client
    const { error } = await supabase
      .from('maestro_clientes')
      .insert({
        codigo_sap: codigoSap,
        nombre,
        poblacion,
        tipo_pago: tipoPago.includes('CRED') ? 'CREDITO' : 'CONTADO',
        limite_credito: limiteCredito,
      });

    if (error) {
      console.error(`❌ Error creando ${codigoSap} (${nombre}): ${error.message}`);
      errors++;
    } else {
      created++;
    }
  }
}

console.log('');
console.log('════════════════════════════════════');
console.log(`✅ Actualizados: ${updated} clientes`);
console.log(`🆕 Creados:      ${created} clientes`);
if (errors > 0) console.log(`❌ Errores:      ${errors}`);
console.log('════════════════════════════════════');
console.log('');
console.log('Los cupos ahora están en maestro_clientes.');
console.log('Ya se pueden ver/editar desde Maestro de Datos → Clientes.');
