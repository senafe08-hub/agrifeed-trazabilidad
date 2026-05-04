// ══════════════════════════════════════════════════════════════
// API BARREL — Re-exporta todos los módulos de la capa de datos.
//
// NOTA: Actualmente NO se usa directamente. Todos los imports
// existentes pasan por '../lib/supabase' que re-exporta los mismos
// módulos. Este barrel se mantiene para una futura migración donde
// los imports se actualicen a: import { ... } from '../lib/api';
// ══════════════════════════════════════════════════════════════

export * from './despachos';
export * from './facturacion';
export * from './inventario';
export * from './formulacion';
export * from './maestros';
export * from './ventas';
