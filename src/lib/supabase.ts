// ══════════════════════════════════════════════════════════════
// SUPABASE CLIENT — Inicialización y Auditoría
// 
// Este archivo contiene ÚNICAMENTE:
// 1. La creación del cliente Supabase
// 2. La función de auditoría (usada por todos los módulos API)
// 3. Re-exports de todos los módulos API para retrocompatibilidad
//
// Los módulos de negocio están organizados en src/lib/api/:
//   - despachos.ts    → Remisiones y despachos
//   - facturacion.ts  → Pedidos, facturas, cartera
//   - inventario.ts   → Materiales, entradas, traslados, stock
//   - formulacion.ts  → Fórmulas, explosión, liquidación
//   - maestros.ts     → Clientes, granjas, vehículos, programación
// ══════════════════════════════════════════════════════════════

import { createClient } from '@supabase/supabase-js';

// These will be configured when the user provides their Supabase credentials
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://YOUR_PROJECT.supabase.co';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'YOUR_ANON_KEY';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
});

export default supabase;

// ---------- Auditoria / Logging ----------
export async function registrarAuditoria(accion: 'CREATE' | 'UPDATE' | 'DELETE' | 'IMPORT', modulo: string, detalle: string) {
  try {
    let userEmail = localStorage.getItem('localUserEmail');
    if (!userEmail) {
      const { data } = await supabase.auth.getSession();
      userEmail = data.session?.user?.email || 'Sistema';
    }

    await supabase.from('auditoria').insert({
      usuario: userEmail,
      accion,
      modulo,
      detalle
    });
  } catch (err) {
    console.error('Error registrando auditoria:', err);
  }
}

// ══════════════════════════════════════════════════════════════
// RE-EXPORTS — Mantiene retrocompatibilidad con todos los
// archivos que importan desde '../lib/supabase'
// ══════════════════════════════════════════════════════════════
export * from './api/despachos';
export * from './api/facturacion';
export * from './api/inventario';
export * from './api/formulacion';
export * from './api/maestros';
export * from './api/ventas';
