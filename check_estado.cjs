const { createClient } = require('@supabase/supabase-js');
const SUPABASE_URL = 'https://schhqtttjysiyghwmefv.supabase.co';
const SUPABASE_KEY = 'sb_publishable_mZeu7Ba0_WrzO-pImkqAow_tHlPoa5p';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function check() {
  const { data, error } = await supabase.from('despachos').select('estado').limit(1);
  console.log('Error:', error);
  console.log('Data:', data);
}
check();
