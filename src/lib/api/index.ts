// ══════════════════════════════════════════════════════════════
// API BARREL — Re-exporta todos los módulos de la capa de datos
// para retrocompatibilidad con los imports existentes.
//
// Uso: import { fetchDespachos, crearPedido } from '../lib/api';
// ══════════════════════════════════════════════════════════════

export * from './despachos';
export * from './facturacion';
export * from './inventario';
export * from './formulacion';
export * from './maestros';
export * from './ventas';
