// ══════════════════════════════════════════════════════════════
// TIPOS CENTRALES — Agrifeed Trazabilidad
// Interfaces para todas las tablas de Supabase y estructuras
// de datos derivadas usadas en la aplicación.
// ══════════════════════════════════════════════════════════════

import type { Database } from './database.types';

export type DBRow<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row'];

// ── Maestros ──

export interface MaestroCliente extends Partial<DBRow<'maestro_clientes'>> {
  id?: number;
  codigo_sap: number;
  nombre: string;
}

export interface MaestroAlimento extends Partial<DBRow<'maestro_alimentos'>> {
  codigo_sap: number;
  descripcion: string;
}

export interface MaestroGranja extends Partial<DBRow<'maestro_granjas'>> {
  id: number;
  nombre: string;
}

export interface MaestroVehiculo extends Partial<DBRow<'maestro_vehiculos'>> {
  id: number;
  placa: string;
}

export interface InventarioMaterial extends Partial<DBRow<'inventario_materiales'>> {
  id: number;
  codigo: number;
  nombre: string;
}

// ── Programación / OPs ──

export interface ProgramacionRow extends Partial<DBRow<'programacion'>> {
  id: number;
  lote: number;
  fecha: string;
  codigo_sap: number;
  bultos_programados: number;
  num_baches: number;
  cliente_id: number;
  maestro_alimentos?: MaestroAlimento | null;
  maestro_clientes?: MaestroCliente | null;
  /** Alias de lote, usado en la UI */
  op?: number;
  cantidad_entregada?: number;
  cantidad_despachada_acumulada?: number;
  formula_id?: number;
  formulas?: { nombre: string; sacos_por_bache: number } | null;
  estado_formulacion?: string;
}

// ── Despachos ──

export interface DespachoDetalle {
  id: number;
  op: number;
  lote: number;
  alimento: string;
  cantidad_a_despachar: number;
  bultos_devueltos?: number;
  cantidad_entregada?: number;
  cantidad_despachada_acumulada?: number;
  observaciones?: string;
  cliente_programado?: { nombre: string } | null;
}

export interface DespachoEncabezado {
  id: string | number;
  fecha: string;
  hora?: string;
  remision: number | null;
  cliente_id: number | null;
  cliente: { nombre: string } | null;
  vehiculo_id: number | null;
  vehiculo: { placa: string; conductor?: string } | null;
  conductor_id: number | null;
  conductor: string;
  entregado_por: string;
  granja_id: number | null;
  granja: { nombre: string } | null;
  observaciones: string;
  estado: string;
  detalle: DespachoDetalle[];
}

export interface DespachoHeaderFormData {
  remision?: string;
  fecha: string;
  hora?: string;
  cliente_id: number | string;
  vehiculo_id: number | string;
  conductor?: string;
  entregado_por?: string;
  granja_id: number | string;
  observaciones?: string;
  estado: string;
}

export interface DetalleFormRow {
  id?: number;
  op: string | number;
  lote?: string | number;
  alimento?: string;
  cliente_programado?: string;
  cantidad_entregada?: number;
  cantidad_despachada_acumulada?: number;
  cantidad_a_despachar: number;
  bultos_danados?: number;
  observaciones?: string;
}

// ── Facturación ──

export interface RemisionPendiente {
  num_remision: number;
  fecha_despacho: string;
  cliente_nombre: string;
  cliente_codigo: number;
  ops: RemisionOPDetail[];
}

export interface RemisionOPDetail {
  op: number;
  codigo_alimento: number;
  referencia: string;
  bultos_despachados: number;
  bultos_ya_pedidos?: number;
  saldo_pendiente?: number;
}

export interface Pedido {
  id: number;
  num_pedido: string | null;
  num_remision: number | null;
  cliente_id?: number | null;
  codigo_cliente?: number | string | null;
  nombre_cliente?: string | null;
  fecha_despacho?: string | null;
  estado: string;
  es_anticipado?: boolean;
  pedido_relacionado_id?: number | null;
  created_at?: string;
  updated_at?: string;
  pedido_detalle?: PedidoDetalle[];
}

export interface PedidoDetalle {
  id?: number;
  pedido_id?: number;
  op: number;
  codigo_alimento?: number | null;
  referencia?: string | null;
  bultos_despachados: number;
  bultos_pedido: number;
  kg_pedido?: number;
}

export interface Factura {
  id: number;
  num_factura: string;
  num_entrega?: string | null;
  fecha_facturacion: string;
  estado: string;
  matrizada?: boolean;
  factura_pedidos?: Array<{ pedido_id: number; pedidos?: Pedido }>;
}

export interface HistoricoFacturacionRow {
  factura_id: number;
  num_factura: string;
  num_entrega?: string | null;
  fecha_facturacion: string;
  estado_factura: string;
  matrizada: boolean;
  pedido_id: number;
  num_pedido: string;
  num_remision: number | null;
  nombre_cliente: string;
  codigo_cliente: number | string;
  fecha_despacho: string;
  estado_pedido: string;
  es_anticipado: boolean;
  fecha_pedido: string;
  op: number;
  codigo_alimento: number;
  referencia: string;
  bultos: number;
  kg: number;
  bultos_despachados: number;
  orden_sap?: string;
}

// ── Importación de facturas ──

export interface ImportFacturaExcelRow {
  'N° Factura'?: string;
  'N° Entrega'?: string;
  'Fecha Facturación'?: string;
  'Estado Factura'?: string;
  'N° Pedido'?: string;
  'N° Remisión'?: string | number;
  'Fecha Despacho'?: string;
  'Cliente'?: string;
  'Cód. Cliente'?: string | number;
  'Estado Pedido'?: string;
  'OP'?: number;
  'Referencia'?: string;
  'Cód. Alimento'?: number | string;
  'Bultos'?: number;
  'KG'?: number;
  'Orden SAP'?: string;
}

// ── Producción ──

export interface ProduccionRow {
  id?: number;
  lote: number;
  codigo_sap: number;
  bultos_entregados: number;
  fecha?: string;
  supervisor?: string;
  dosificador?: string;
  num_bache?: number;
  observaciones?: string;
}

// ── Inventario ──

export interface InventarioMPRow {
  id: number;
  codigo: number;
  nombre: string;
  cantidad_actual: number;
  unidad: string;
  ubicacion?: string;
  proveedor?: string;
  lote_proveedor?: string;
  fecha_ingreso?: string;
  fecha_vencimiento?: string;
}

export interface InventarioEntradaRow {
  id: number;
  fecha: string;
  material_id: number;
  cantidad_kg: number;
  observaciones?: string;
  fecha_vencimiento?: string | null;
  inventario_materiales?: { codigo: number; nombre: string; peso_kg?: number | null } | null;
}

export interface InventarioLoteRow {
  id: number;
  codigo_lote: string;
  material_id: number;
  cantidad_inicial: number;
  cantidad_disponible: number;
  fecha_ingreso: string;
  fecha_vencimiento?: string | null;
}

export interface InventarioTrasladoRow {
  id: number;
  fecha: string;
  cliente_op: string;
  material_id: number;
  cantidad_kg: number;
  semana: number;
  mes: number;
  anio: number;
  observaciones?: string;
  inventario_materiales?: { codigo: number; nombre: string } | null;
}

export interface InventarioTrasladoLoteRow {
  lote_id: number;
  cantidad: number;
  inventario_lotes?: { codigo_lote: string; fecha_ingreso: string; fecha_vencimiento: string | null; } | null;
}

export interface StockInicialRow {
  material_id: number;
  stock_kg: number;
  consumo_estimado_mes?: number;
}

// ── Auditoría ──

export interface AuditoriaRow {
  id?: number;
  accion: string;
  modulo: string;
  detalle: string;
  usuario?: string;
  created_at?: string;
}

// ── Dashboard ──

export interface DashboardKPIs {
  totalOPs: number;
  totalBultosProgramados: number;
  totalProducido: number;
  totalDespachado: number;
  eficiencia: number;
}
