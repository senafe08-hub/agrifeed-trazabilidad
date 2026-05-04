export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      auditoria: {
        Row: {
          accion: string
          created_at: string | null
          detalle: string
          id: number
          modulo: string
          usuario: string
        }
        Insert: {
          accion: string
          created_at?: string | null
          detalle: string
          id?: number
          modulo: string
          usuario: string
        }
        Update: {
          accion?: string
          created_at?: string | null
          detalle?: string
          id?: number
          modulo?: string
          usuario?: string
        }
        Relationships: []
      }
      cartera_cupos: {
        Row: {
          created_at: string | null
          deudor: number
          id: number
          limite_credito: number | null
          limite_total: number | null
          nombre_deudor: string
          poblacion: string | null
          tipo_pago: string | null
        }
        Insert: {
          created_at?: string | null
          deudor: number
          id?: number
          limite_credito?: number | null
          limite_total?: number | null
          nombre_deudor: string
          poblacion?: string | null
          tipo_pago?: string | null
        }
        Update: {
          created_at?: string | null
          deudor?: number
          id?: number
          limite_credito?: number | null
          limite_total?: number | null
          nombre_deudor?: string
          poblacion?: string | null
          tipo_pago?: string | null
        }
        Relationships: []
      }
      cartera_detalle: {
        Row: {
          cifra_interes: number | null
          clase_documento: string | null
          cliente: number
          condiciones_pago: string | null
          created_at: string | null
          cuenta_mayor: number | null
          demora_vencimiento: number | null
          ejercicio: number | null
          factura: number | null
          fecha_documento: string | null
          fecha_pago: string | null
          id: number
          importe: number
          num_documento: number | null
          periodo_contable: number | null
          sociedad: number | null
          texto: string | null
          vencimiento_neto: string | null
        }
        Insert: {
          cifra_interes?: number | null
          clase_documento?: string | null
          cliente: number
          condiciones_pago?: string | null
          created_at?: string | null
          cuenta_mayor?: number | null
          demora_vencimiento?: number | null
          ejercicio?: number | null
          factura?: number | null
          fecha_documento?: string | null
          fecha_pago?: string | null
          id?: number
          importe?: number
          num_documento?: number | null
          periodo_contable?: number | null
          sociedad?: number | null
          texto?: string | null
          vencimiento_neto?: string | null
        }
        Update: {
          cifra_interes?: number | null
          clase_documento?: string | null
          cliente?: number
          condiciones_pago?: string | null
          created_at?: string | null
          cuenta_mayor?: number | null
          demora_vencimiento?: number | null
          ejercicio?: number | null
          factura?: number | null
          fecha_documento?: string | null
          fecha_pago?: string | null
          id?: number
          importe?: number
          num_documento?: number | null
          periodo_contable?: number | null
          sociedad?: number | null
          texto?: string | null
          vencimiento_neto?: string | null
        }
        Relationships: []
      }
      casas_formuladoras: {
        Row: {
          activo: boolean | null
          created_at: string | null
          id: number
          nombre: string
        }
        Insert: {
          activo?: boolean | null
          created_at?: string | null
          id?: number
          nombre: string
        }
        Update: {
          activo?: boolean | null
          created_at?: string | null
          id?: number
          nombre?: string
        }
        Relationships: []
      }
      despachos: {
        Row: {
          bultos_danados: number | null
          bultos_despachados: number
          cliente_id: number | null
          created_at: string | null
          created_by: string | null
          entregado_por: string | null
          estado: string | null
          fecha: string | null
          granja_id: number | null
          hora: string | null
          id: number
          lote: number | null
          num_remision: number | null
          observaciones: string | null
          vehiculo_id: number | null
        }
        Insert: {
          bultos_danados?: number | null
          bultos_despachados: number
          cliente_id?: number | null
          created_at?: string | null
          created_by?: string | null
          entregado_por?: string | null
          estado?: string | null
          fecha?: string | null
          granja_id?: number | null
          hora?: string | null
          id?: number
          lote?: number | null
          num_remision?: number | null
          observaciones?: string | null
          vehiculo_id?: number | null
        }
        Update: {
          bultos_danados?: number | null
          bultos_despachados?: number
          cliente_id?: number | null
          created_at?: string | null
          created_by?: string | null
          entregado_por?: string | null
          estado?: string | null
          fecha?: string | null
          granja_id?: number | null
          hora?: string | null
          id?: number
          lote?: number | null
          num_remision?: number | null
          observaciones?: string | null
          vehiculo_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "despachos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "maestro_clientes"
            referencedColumns: ["codigo_sap"]
          },
          {
            foreignKeyName: "despachos_granja_id_fkey"
            columns: ["granja_id"]
            isOneToOne: false
            referencedRelation: "maestro_granjas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "despachos_lote_fkey"
            columns: ["lote"]
            isOneToOne: false
            referencedRelation: "programacion"
            referencedColumns: ["lote"]
          },
          {
            foreignKeyName: "despachos_vehiculo_id_fkey"
            columns: ["vehiculo_id"]
            isOneToOne: false
            referencedRelation: "maestro_vehiculos"
            referencedColumns: ["id"]
          },
        ]
      }
      factura_pedidos: {
        Row: {
          factura_id: number
          id: number
          pedido_id: number
        }
        Insert: {
          factura_id: number
          id?: number
          pedido_id: number
        }
        Update: {
          factura_id?: number
          id?: number
          pedido_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "factura_pedidos_factura_id_fkey"
            columns: ["factura_id"]
            isOneToOne: false
            referencedRelation: "facturas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "factura_pedidos_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
        ]
      }
      facturacion: {
        Row: {
          bultos_facturados: number
          cliente_id: number | null
          created_at: string | null
          created_by: string | null
          fecha_factura: string | null
          id: number
          lote: number | null
          num_entrega: number | null
          num_factura: number | null
          num_pedido: number | null
          orden_sap: number | null
          remision: number | null
          status: string | null
        }
        Insert: {
          bultos_facturados: number
          cliente_id?: number | null
          created_at?: string | null
          created_by?: string | null
          fecha_factura?: string | null
          id?: number
          lote?: number | null
          num_entrega?: number | null
          num_factura?: number | null
          num_pedido?: number | null
          orden_sap?: number | null
          remision?: number | null
          status?: string | null
        }
        Update: {
          bultos_facturados?: number
          cliente_id?: number | null
          created_at?: string | null
          created_by?: string | null
          fecha_factura?: string | null
          id?: number
          lote?: number | null
          num_entrega?: number | null
          num_factura?: number | null
          num_pedido?: number | null
          orden_sap?: number | null
          remision?: number | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "facturacion_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "maestro_clientes"
            referencedColumns: ["codigo_sap"]
          },
          {
            foreignKeyName: "facturacion_lote_fkey"
            columns: ["lote"]
            isOneToOne: false
            referencedRelation: "programacion"
            referencedColumns: ["lote"]
          },
        ]
      }
      facturas: {
        Row: {
          created_at: string | null
          estado: string
          fecha_facturacion: string | null
          id: number
          matrizada: boolean | null
          num_entrega: string | null
          num_factura: string | null
        }
        Insert: {
          created_at?: string | null
          estado?: string
          fecha_facturacion?: string | null
          id?: number
          matrizada?: boolean | null
          num_entrega?: string | null
          num_factura?: string | null
        }
        Update: {
          created_at?: string | null
          estado?: string
          fecha_facturacion?: string | null
          id?: number
          matrizada?: boolean | null
          num_entrega?: string | null
          num_factura?: string | null
        }
        Relationships: []
      }
      formula_detalle: {
        Row: {
          cantidad_base: number
          formula_id: number
          id: number
          material_id: number
          observaciones: string | null
          referencia: string | null
          unidad: string | null
        }
        Insert: {
          cantidad_base: number
          formula_id: number
          id?: number
          material_id: number
          observaciones?: string | null
          referencia?: string | null
          unidad?: string | null
        }
        Update: {
          cantidad_base?: number
          formula_id?: number
          id?: number
          material_id?: number
          observaciones?: string | null
          referencia?: string | null
          unidad?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "formula_detalle_formula_id_fkey"
            columns: ["formula_id"]
            isOneToOne: false
            referencedRelation: "formulas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "formula_detalle_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "inventario_materiales"
            referencedColumns: ["id"]
          },
        ]
      }
      formulas: {
        Row: {
          alimento_sap: number | null
          categoria: string
          cliente_sap: number | null
          created_at: string | null
          estado: string
          id: number
          kg_por_bache: number
          nombre: string
          observaciones: string | null
          peso_saco_kg: number
          sacos_por_bache: number
          updated_at: string | null
        }
        Insert: {
          alimento_sap?: number | null
          categoria?: string
          cliente_sap?: number | null
          created_at?: string | null
          estado?: string
          id?: number
          kg_por_bache?: number
          nombre: string
          observaciones?: string | null
          peso_saco_kg?: number
          sacos_por_bache?: number
          updated_at?: string | null
        }
        Update: {
          alimento_sap?: number | null
          categoria?: string
          cliente_sap?: number | null
          created_at?: string | null
          estado?: string
          id?: number
          kg_por_bache?: number
          nombre?: string
          observaciones?: string | null
          peso_saco_kg?: number
          sacos_por_bache?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      inventario_entradas: {
        Row: {
          cantidad_kg: number
          created_at: string | null
          fecha: string
          id: number
          material_id: number | null
          observaciones: string | null
        }
        Insert: {
          cantidad_kg: number
          created_at?: string | null
          fecha?: string
          id?: number
          material_id?: number | null
          observaciones?: string | null
        }
        Update: {
          cantidad_kg?: number
          created_at?: string | null
          fecha?: string
          id?: number
          material_id?: number | null
          observaciones?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventario_entradas_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "inventario_materiales"
            referencedColumns: ["id"]
          },
        ]
      }
      inventario_materiales: {
        Row: {
          codigo: number
          created_at: string | null
          id: number
          min_cobertura_semanas: number | null
          nombre: string
          peso_kg: number | null
        }
        Insert: {
          codigo: number
          created_at?: string | null
          id?: number
          min_cobertura_semanas?: number | null
          nombre: string
          peso_kg?: number | null
        }
        Update: {
          codigo?: number
          created_at?: string | null
          id?: number
          min_cobertura_semanas?: number | null
          nombre?: string
          peso_kg?: number | null
        }
        Relationships: []
      }
      inventario_pt: {
        Row: {
          anio: number
          codigo_sap: number
          grupo: string
          id: number
          inventario_inicial: number | null
          lote: string | null
          observaciones: string | null
          semana: number
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          anio: number
          codigo_sap: number
          grupo: string
          id?: number
          inventario_inicial?: number | null
          lote?: string | null
          observaciones?: string | null
          semana: number
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          anio?: number
          codigo_sap?: number
          grupo?: string
          id?: number
          inventario_inicial?: number | null
          lote?: string | null
          observaciones?: string | null
          semana?: number
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: []
      }
      inventario_stock_inicial: {
        Row: {
          anio: number
          consumo_estimado_mes: number | null
          id: number
          material_id: number | null
          mes: number
          stock_kg: number
        }
        Insert: {
          anio: number
          consumo_estimado_mes?: number | null
          id?: number
          material_id?: number | null
          mes: number
          stock_kg?: number
        }
        Update: {
          anio?: number
          consumo_estimado_mes?: number | null
          id?: number
          material_id?: number | null
          mes?: number
          stock_kg?: number
        }
        Relationships: [
          {
            foreignKeyName: "inventario_stock_inicial_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "inventario_materiales"
            referencedColumns: ["id"]
          },
        ]
      }
      inventario_traslados: {
        Row: {
          anio: number
          cantidad_kg: number
          cliente_op: string
          created_at: string | null
          fecha: string
          id: number
          material_id: number | null
          mes: number
          observaciones: string | null
          semana: number
        }
        Insert: {
          anio: number
          cantidad_kg: number
          cliente_op: string
          created_at?: string | null
          fecha?: string
          id?: number
          material_id?: number | null
          mes: number
          observaciones?: string | null
          semana: number
        }
        Update: {
          anio?: number
          cantidad_kg?: number
          cliente_op?: string
          created_at?: string | null
          fecha?: string
          id?: number
          material_id?: number | null
          mes?: number
          observaciones?: string | null
          semana?: number
        }
        Relationships: [
          {
            foreignKeyName: "inventario_traslados_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "inventario_materiales"
            referencedColumns: ["id"]
          },
        ]
      }
      maestro_alimentos: {
        Row: {
          categoria: string | null
          codigo_sap: number
          created_at: string | null
          descripcion: string
          id: number
          presentacion: string | null
          status: string | null
        }
        Insert: {
          categoria?: string | null
          codigo_sap: number
          created_at?: string | null
          descripcion: string
          id?: number
          presentacion?: string | null
          status?: string | null
        }
        Update: {
          categoria?: string | null
          codigo_sap?: number
          created_at?: string | null
          descripcion?: string
          id?: number
          presentacion?: string | null
          status?: string | null
        }
        Relationships: []
      }
      maestro_clientes: {
        Row: {
          abreviatura: string | null
          codigo_sap: number
          created_at: string | null
          grupo_inventario: string | null
          id: number
          limite_credito: number | null
          nombre: string
          poblacion: string | null
          tipo_inventario: string | null
          tipo_pago: string | null
        }
        Insert: {
          abreviatura?: string | null
          codigo_sap: number
          created_at?: string | null
          grupo_inventario?: string | null
          id?: number
          limite_credito?: number | null
          nombre: string
          poblacion?: string | null
          tipo_inventario?: string | null
          tipo_pago?: string | null
        }
        Update: {
          abreviatura?: string | null
          codigo_sap?: number
          created_at?: string | null
          grupo_inventario?: string | null
          id?: number
          limite_credito?: number | null
          nombre?: string
          poblacion?: string | null
          tipo_inventario?: string | null
          tipo_pago?: string | null
        }
        Relationships: []
      }
      maestro_granjas: {
        Row: {
          created_at: string | null
          id: number
          nombre: string
        }
        Insert: {
          created_at?: string | null
          id?: number
          nombre: string
        }
        Update: {
          created_at?: string | null
          id?: number
          nombre?: string
        }
        Relationships: []
      }
      maestro_vehiculos: {
        Row: {
          activo: boolean | null
          conductor: string | null
          created_at: string | null
          id: number
          placa: string
        }
        Insert: {
          activo?: boolean | null
          conductor?: string | null
          created_at?: string | null
          id?: number
          placa: string
        }
        Update: {
          activo?: boolean | null
          conductor?: string | null
          created_at?: string | null
          id?: number
          placa?: string
        }
        Relationships: []
      }
      orden_sap_op: {
        Row: {
          id: number
          op: number
          orden_sap: string
        }
        Insert: {
          id?: number
          op: number
          orden_sap: string
        }
        Update: {
          id?: number
          op?: number
          orden_sap?: string
        }
        Relationships: []
      }
      pedido_detalle: {
        Row: {
          bultos_despachados: number
          bultos_pedido: number
          codigo_alimento: number | null
          id: number
          kg_pedido: number | null
          op: number
          pedido_id: number
          referencia: string | null
        }
        Insert: {
          bultos_despachados?: number
          bultos_pedido?: number
          codigo_alimento?: number | null
          id?: number
          kg_pedido?: number | null
          op: number
          pedido_id: number
          referencia?: string | null
        }
        Update: {
          bultos_despachados?: number
          bultos_pedido?: number
          codigo_alimento?: number | null
          id?: number
          kg_pedido?: number | null
          op?: number
          pedido_id?: number
          referencia?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pedido_detalle_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
        ]
      }
      pedidos: {
        Row: {
          cliente_id: number | null
          codigo_cliente: number | null
          created_at: string | null
          es_anticipado: boolean | null
          estado: string
          fecha_despacho: string | null
          id: number
          nombre_cliente: string | null
          num_pedido: string | null
          num_remision: number | null
          pedido_relacionado_id: number | null
          updated_at: string | null
        }
        Insert: {
          cliente_id?: number | null
          codigo_cliente?: number | null
          created_at?: string | null
          es_anticipado?: boolean | null
          estado?: string
          fecha_despacho?: string | null
          id?: number
          nombre_cliente?: string | null
          num_pedido?: string | null
          num_remision?: number | null
          pedido_relacionado_id?: number | null
          updated_at?: string | null
        }
        Update: {
          cliente_id?: number | null
          codigo_cliente?: number | null
          created_at?: string | null
          es_anticipado?: boolean | null
          estado?: string
          fecha_despacho?: string | null
          id?: number
          nombre_cliente?: string | null
          num_pedido?: string | null
          num_remision?: number | null
          pedido_relacionado_id?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pedidos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "maestro_clientes"
            referencedColumns: ["codigo_sap"]
          },
          {
            foreignKeyName: "pedidos_pedido_relacionado_id_fkey"
            columns: ["pedido_relacionado_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
        ]
      }
      prestamos_inventario: {
        Row: {
          cantidad: number
          cantidad_compensada: number | null
          codigo_sap: number
          compensado_at: string | null
          created_at: string | null
          created_by: string | null
          estado: string | null
          fecha: string
          grupo_destino: string
          grupo_origen: string
          id: number
          motivo: string | null
          op_compensacion: number | null
        }
        Insert: {
          cantidad: number
          cantidad_compensada?: number | null
          codigo_sap: number
          compensado_at?: string | null
          created_at?: string | null
          created_by?: string | null
          estado?: string | null
          fecha?: string
          grupo_destino: string
          grupo_origen: string
          id?: number
          motivo?: string | null
          op_compensacion?: number | null
        }
        Update: {
          cantidad?: number
          cantidad_compensada?: number | null
          codigo_sap?: number
          compensado_at?: string | null
          created_at?: string | null
          created_by?: string | null
          estado?: string | null
          fecha?: string
          grupo_destino?: string
          grupo_origen?: string
          id?: number
          motivo?: string | null
          op_compensacion?: number | null
        }
        Relationships: []
      }
      produccion: {
        Row: {
          baches_entregados: number | null
          bultos_entregados: number
          created_at: string | null
          created_by: string | null
          fecha_produccion: string | null
          id: number
          lote: number | null
          observaciones: string | null
          turno: string | null
        }
        Insert: {
          baches_entregados?: number | null
          bultos_entregados: number
          created_at?: string | null
          created_by?: string | null
          fecha_produccion?: string | null
          id?: number
          lote?: number | null
          observaciones?: string | null
          turno?: string | null
        }
        Update: {
          baches_entregados?: number | null
          bultos_entregados?: number
          created_at?: string | null
          created_by?: string | null
          fecha_produccion?: string | null
          id?: number
          lote?: number | null
          observaciones?: string | null
          turno?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "produccion_lote_fkey"
            columns: ["lote"]
            isOneToOne: false
            referencedRelation: "programacion"
            referencedColumns: ["lote"]
          },
        ]
      }
      programacion: {
        Row: {
          alimento: string | null
          bultos_programados: number
          cliente_id: number | null
          codigo_sap: number | null
          created_at: string | null
          created_by: string | null
          estado_formulacion: string | null
          fecha: string
          formula_id: number | null
          formula_snapshot: Json | null
          id: number
          lote: number
          num_baches: number | null
          observaciones: string | null
          orden_sap: number | null
        }
        Insert: {
          alimento?: string | null
          bultos_programados: number
          cliente_id?: number | null
          codigo_sap?: number | null
          created_at?: string | null
          created_by?: string | null
          estado_formulacion?: string | null
          fecha: string
          formula_id?: number | null
          formula_snapshot?: Json | null
          id?: number
          lote: number
          num_baches?: number | null
          observaciones?: string | null
          orden_sap?: number | null
        }
        Update: {
          alimento?: string | null
          bultos_programados?: number
          cliente_id?: number | null
          codigo_sap?: number | null
          created_at?: string | null
          created_by?: string | null
          estado_formulacion?: string | null
          fecha?: string
          formula_id?: number | null
          formula_snapshot?: Json | null
          id?: number
          lote?: number
          num_baches?: number | null
          observaciones?: string | null
          orden_sap?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "programacion_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "maestro_clientes"
            referencedColumns: ["codigo_sap"]
          },
          {
            foreignKeyName: "programacion_codigo_sap_fkey"
            columns: ["codigo_sap"]
            isOneToOne: false
            referencedRelation: "maestro_alimentos"
            referencedColumns: ["codigo_sap"]
          },
          {
            foreignKeyName: "programacion_formula_id_fkey"
            columns: ["formula_id"]
            isOneToOne: false
            referencedRelation: "formulas"
            referencedColumns: ["id"]
          },
        ]
      }
      propuestas_op: {
        Row: {
          anio: number
          baches_propuestos: number
          bultos_resultantes: number
          casa_formuladora_id: number | null
          cliente_id: number | null
          codigo_sap: number
          created_at: string | null
          created_by: string | null
          demanda_actual: number | null
          demanda_proxima: number | null
          estado: string | null
          formula_id: number | null
          grupo: string | null
          id: number
          inventario_fisico: number | null
          lote_generado: number | null
          motivo_rechazo: string | null
          necesidad_neta: number
          op_generada_id: number | null
          op_pendientes: number | null
          prestamos_pendientes: number | null
          reproceso: number | null
          reviewed_at: string | null
          reviewed_by: string | null
          sacos_por_bache: number
          semana: number
        }
        Insert: {
          anio: number
          baches_propuestos: number
          bultos_resultantes: number
          casa_formuladora_id?: number | null
          cliente_id?: number | null
          codigo_sap: number
          created_at?: string | null
          created_by?: string | null
          demanda_actual?: number | null
          demanda_proxima?: number | null
          estado?: string | null
          formula_id?: number | null
          grupo?: string | null
          id?: number
          inventario_fisico?: number | null
          lote_generado?: number | null
          motivo_rechazo?: string | null
          necesidad_neta: number
          op_generada_id?: number | null
          op_pendientes?: number | null
          prestamos_pendientes?: number | null
          reproceso?: number | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          sacos_por_bache: number
          semana: number
        }
        Update: {
          anio?: number
          baches_propuestos?: number
          bultos_resultantes?: number
          casa_formuladora_id?: number | null
          cliente_id?: number | null
          codigo_sap?: number
          created_at?: string | null
          created_by?: string | null
          demanda_actual?: number | null
          demanda_proxima?: number | null
          estado?: string | null
          formula_id?: number | null
          grupo?: string | null
          id?: number
          inventario_fisico?: number | null
          lote_generado?: number | null
          motivo_rechazo?: string | null
          necesidad_neta?: number
          op_generada_id?: number | null
          op_pendientes?: number | null
          prestamos_pendientes?: number | null
          reproceso?: number | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          sacos_por_bache?: number
          semana?: number
        }
        Relationships: [
          {
            foreignKeyName: "propuestas_op_casa_formuladora_id_fkey"
            columns: ["casa_formuladora_id"]
            isOneToOne: false
            referencedRelation: "casas_formuladoras"
            referencedColumns: ["id"]
          },
        ]
      }
      reportes_turno: {
        Row: {
          baches_dosificados: number | null
          created_at: string | null
          dosificador: string | null
          fecha: string
          id: number
          observaciones: string | null
          supervisor: string | null
          total_bultos: number | null
          turno: string
        }
        Insert: {
          baches_dosificados?: number | null
          created_at?: string | null
          dosificador?: string | null
          fecha: string
          id?: number
          observaciones?: string | null
          supervisor?: string | null
          total_bultos?: number | null
          turno: string
        }
        Update: {
          baches_dosificados?: number | null
          created_at?: string | null
          dosificador?: string | null
          fecha?: string
          id?: number
          observaciones?: string | null
          supervisor?: string | null
          total_bultos?: number | null
          turno?: string
        }
        Relationships: []
      }
      reprocesos_pt: {
        Row: {
          anio: number
          cantidad: number
          codigo_sap: number
          created_at: string | null
          created_by: string | null
          fecha: string
          grupo: string
          id: number
          motivo: string
          semana: number
        }
        Insert: {
          anio: number
          cantidad: number
          codigo_sap: number
          created_at?: string | null
          created_by?: string | null
          fecha?: string
          grupo: string
          id?: number
          motivo: string
          semana: number
        }
        Update: {
          anio?: number
          cantidad?: number
          codigo_sap?: number
          created_at?: string | null
          created_by?: string | null
          fecha?: string
          grupo?: string
          id?: number
          motivo?: string
          semana?: number
        }
        Relationships: []
      }
      ventas_solicitudes: {
        Row: {
          cantidad: number
          casa_formuladora_id: number
          cliente_id: number
          codigo_sap: number
          created_at: string | null
          created_by: string | null
          dia_semana: string
          fecha: string
          id: number
          observaciones: string | null
          presentacion: string | null
          semana: number
        }
        Insert: {
          cantidad: number
          casa_formuladora_id: number
          cliente_id: number
          codigo_sap: number
          created_at?: string | null
          created_by?: string | null
          dia_semana: string
          fecha: string
          id?: number
          observaciones?: string | null
          presentacion?: string | null
          semana: number
        }
        Update: {
          cantidad?: number
          casa_formuladora_id?: number
          cliente_id?: number
          codigo_sap?: number
          created_at?: string | null
          created_by?: string | null
          dia_semana?: string
          fecha?: string
          id?: number
          observaciones?: string | null
          presentacion?: string | null
          semana?: number
        }
        Relationships: [
          {
            foreignKeyName: "ventas_solicitudes_casa_formuladora_id_fkey"
            columns: ["casa_formuladora_id"]
            isOneToOne: false
            referencedRelation: "casas_formuladoras"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_reset_password: {
        Args: { new_password: string; target_email: string }
        Returns: boolean
      }
      rpc_despachos_resumen: {
        Args: { fecha_desde: string; fecha_hasta: string }
        Returns: {
          cliente_id: number
          codigo_sap: number
          observaciones: string
          total_despachado: number
        }[]
      }
      rpc_prestamos_activos: {
        Args: never
        Returns: {
          codigo_sap: number
          grupo_destino: string
          grupo_origen: string
          pendiente: number
        }[]
      }
      rpc_produccion_resumen: {
        Args: { fecha_desde: string; fecha_hasta: string }
        Returns: {
          cliente_id: number
          codigo_sap: number
          observaciones: string
          total_entregado: number
        }[]
      }
      rpc_reprocesos_resumen: {
        Args: { p_anio: number; p_semana: number }
        Returns: {
          codigo_sap: number
          grupo: string
          total_reproceso: number
        }[]
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
