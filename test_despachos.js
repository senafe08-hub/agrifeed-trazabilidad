import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  const { data: despData, error } = await supabase.from('despachos')
    .select('*')
    .eq('remision', '1000012');
  console.log('Despacho:', despData, error);

  const lotesDespacho = Array.from(new Set((despData || []).map(d => d.lote).filter(Boolean)));
  console.log('Lotes from despachos:', lotesDespacho);

  if (lotesDespacho.length > 0) {
    const { data: progDesp } = await supabase.from('programacion').select('lote, codigo_sap, cliente_id').in('lote', lotesDespacho);
    console.log('Programacion:', progDesp);
  }
}

test();
