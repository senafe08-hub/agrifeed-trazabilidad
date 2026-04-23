import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://dummy.supabase.co';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || 'dummy';
const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  const { data: rep } = await supabase.from('reprocesos_pt').select('*').limit(1);
  const { data: prest } = await supabase.from('prestamos_inventario').select('*').limit(1);
  console.log('reprocesos_pt columns:', rep && rep.length > 0 ? Object.keys(rep[0]) : 'empty table', rep);
  console.log('prestamos_inventario columns:', prest && prest.length > 0 ? Object.keys(prest[0]) : 'empty table', prest);
  
  // also check if columns exist by trying to select them
  const { error: e1 } = await supabase.from('reprocesos_pt').select('op_reproceso').limit(1);
  console.log('has op_reproceso?', !e1);
  const { error: e2 } = await supabase.from('prestamos_inventario').select('op_origen').limit(1);
  console.log('has op_origen?', !e2);
}
test();
