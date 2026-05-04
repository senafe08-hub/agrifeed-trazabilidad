import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createDespacho, updateDespacho, softDeleteDespacho, supabase } from '../lib/supabase';
import { DespachoEncabezado, DespachoDetalle } from '../lib/types';
import { toast } from '../components/Toast';
import { usePermissions } from '../lib/permissions';
import { DespachoFormValues } from '../schemas/despachos';
import { ensureCaches, getClienteGrupoMap, resolveGrupo } from '../lib/api/ventas';

export interface DespachosPaginationConfig {
  page: number;
  pageSize: number;
  searchTerm?: string;
  columnFilters?: Record<string, string>;
  fechaDesde?: string;
  fechaHasta?: string;
}

export function useDespachos(config?: DespachosPaginationConfig) {
  const { canView, canEdit } = usePermissions('despachos');
  const queryClient = useQueryClient();
  
  // Data Fetching with React Query (Paginated)
  const { 
    data: tableResult = { data: [], total: 0 }, 
    isLoading: loading, 
    refetch: loadDespachos 
  } = useQuery({
    queryKey: ['despachos_paginated', config],
    queryFn: async () => {
      let query = supabase.from('vista_despachos_encabezados').select('*', { count: 'exact' });

      if (config?.fechaDesde) query = query.gte('fecha', config.fechaDesde);
      if (config?.fechaHasta) query = query.lte('fecha', config.fechaHasta);

      if (config?.searchTerm) {
        const st = `%${config.searchTerm}%`;
        query = query.or(`remision.ilike.${st},cliente_nombre.ilike.${st},vehiculo_placa.ilike.${st},conductor.ilike.${st}`);
      }

      if (config?.columnFilters) {
        Object.entries(config.columnFilters).forEach(([key, value]) => {
          if (value) {
            if (key === 'cliente') query = query.ilike('cliente_nombre', `%${value}%`);
            else if (key === 'granja') query = query.ilike('granja_nombre', `%${value}%`);
            else if (key === 'vehiculo') query = query.ilike('vehiculo_placa', `%${value}%`);
            else if (key === 'op') {} // handled locally or skip
            else query = query.ilike(key, `%${value}%`);
          }
        });
      }

      query = query.order('remision', { ascending: false, nullsFirst: false }).order('fecha', { ascending: false });

      if (config) {
        const from = (config.page - 1) * config.pageSize;
        const to = from + config.pageSize - 1;
        query = query.range(from, to);
      } else {
        query = query.limit(100);
      }

      const { data: headersData, count, error } = await query;
      if (error) throw error;
      
      if (!headersData || headersData.length === 0) return { data: [], total: count || 0 };

      // Get all header IDs
      const headerIds = headersData.map(h => h.id_encabezado);

      // Fetch details for these headers
      const { data: detailsData, error: detError } = await supabase
        .from('vista_despachos_detalle')
        .select('*')
        .in('id_encabezado', headerIds);
      
      if (detError) throw detError;

      // Group details by id_encabezado
      const detailsMap: Record<string, DespachoDetalle[]> = {};
      for (const d of (detailsData || [])) {
        if (!detailsMap[d.id_encabezado]) detailsMap[d.id_encabezado] = [];
        detailsMap[d.id_encabezado].push({
          id: d.id,
          op: d.op,
          lote: d.op,
          alimento: d.alimento || '',
          cantidad_a_despachar: d.cantidad_a_despachar || 0,
          bultos_devueltos: d.bultos_devueltos || 0,
          observaciones: d.observaciones
        });
      }

      // Map back to DespachoEncabezado
      const mapped: DespachoEncabezado[] = headersData.map((row: any) => ({
        id: row.id_encabezado,
        fecha: row.fecha,
        hora: row.hora || '',
        remision: row.remision,
        cliente_id: row.cliente_id || '',
        cliente: { nombre: row.cliente_nombre || '' },
        granja_id: row.granja_id || '',
        granja: { nombre: row.granja_nombre || '' },
        vehiculo_id: row.vehiculo_id || '',
        vehiculo: { placa: row.vehiculo_placa || '' },
        conductor_id: null,
        conductor: row.conductor || '',
        entregado_por: row.entregado_por || '',
        observaciones: row.observaciones,
        estado: row.estado || 'borrador',
        detalle: detailsMap[row.id_encabezado] || []
      }));

      return { data: mapped, total: count || 0 };
    },
    enabled: canView,
    staleTime: 1000 * 60 * 2, // 2 minutes cache
  });

  // Fetch KPIs efficiently
  const { data: kpis = { total: 0, borradores: 0, despachados: 0, totalBultos: 0 } } = useQuery({
    queryKey: ['despachos_kpis', config],
    queryFn: async () => {
      const params: any = {};
      
      if (config?.fechaDesde) params.p_fecha_desde = config.fechaDesde;
      if (config?.fechaHasta) params.p_fecha_hasta = config.fechaHasta;
      if (config?.searchTerm) params.p_search = config.searchTerm;
      
      if (config?.columnFilters) {
        if (config.columnFilters.remision) params.p_remision = config.columnFilters.remision;
        if (config.columnFilters.cliente) params.p_cliente = config.columnFilters.cliente;
        if (config.columnFilters.granja) params.p_granja = config.columnFilters.granja;
        if (config.columnFilters.vehiculo) params.p_vehiculo = config.columnFilters.vehiculo;
        if (config.columnFilters.conductor) params.p_conductor = config.columnFilters.conductor;
        if (config.columnFilters.estado) params.p_estado = config.columnFilters.estado;
      }
      
      const { data, error } = await supabase.rpc('rpc_despachos_kpis', params);
      
      if (error) throw error;
      
      if (!data || data.length === 0) {
        return { total: 0, borradores: 0, despachados: 0, totalBultos: 0 };
      }

      const row = data[0];
      return {
        total: Number(row.total) || 0,
        borradores: Number(row.borradores) || 0,
        despachados: Number(row.despachados) || 0,
        totalBultos: Number(row.total_bultos) || 0
      };
    },
    enabled: canView
  });

  const despachos = tableResult.data || [];
  const totalRecords = tableResult.total || 0;

  // UI form state
  const [showHeaderForm, setShowHeaderForm] = useState(false);
  const [editingId, setEditingId] = useState<number | string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<number | string | null>(null);
  
  // Expanded rows state
  const [expandedRows, setExpandedRows] = useState<Set<string | number>>(new Set());

  const toggleRow = (id: string | number) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSave = async (formValues: DespachoFormValues) => {
    if (!canEdit) return;
    
    // Zod already validates required fields, so no need for basic checks
    const { details, ...headerData } = formValues;
    
    setSaving(true);
    
    // VALIDACIÓN ESTRICTA: Cruzar OP vs Cliente Destino y Préstamos
    try {
      const opLotes = details.map(d => Number(d.op)).filter(Boolean);
      const destinoClienteId = headerData.cliente_id ? Number(headerData.cliente_id) : null;
      
      if (opLotes.length > 0 && destinoClienteId) {
        
        await ensureCaches();
        const clienteGrupoMap = await getClienteGrupoMap();
        const destinoGrupo = resolveGrupo(destinoClienteId, clienteGrupoMap) || 'SIN GRUPO';
        
        // 1. Fetch OP data (with origin group and product code)
        const { data: programacionData, error: progErr } = await supabase
          .from('programacion')
          .select('lote, cliente_id, codigo_sap, observaciones, maestro_clientes(nombre)')
          .in('lote', opLotes);
          
        if (progErr) throw progErr;
        
        // 2. Fetch Destination Client data
        const { data: destinoData } = await supabase
          .from('maestro_clientes')
          .select('nombre, tipo_inventario')
          .eq('codigo_sap', destinoClienteId)
          .single();
          
        const destinoNombre = destinoData?.nombre || destinoClienteId.toString();
        const isDestinoVarios = destinoData?.tipo_inventario === 'VARIOS';
        
        for (const prog of (programacionData || [])) {
          if (prog.cliente_id && prog.cliente_id !== destinoClienteId) {
            
            const mc = prog.maestro_clientes;
            const origenGrupo = resolveGrupo(prog.cliente_id, clienteGrupoMap, prog.observaciones || undefined) || 'SIN GRUPO';
            const clienteName = Array.isArray(mc) ? (mc[0] as any)?.nombre : (mc as any)?.nombre;
            
            // Lógica de pertenencia al mismo grupo:
            let isSameGroup = origenGrupo === destinoGrupo;
            
            // Si el destino es VARIOS y el origen es de la familia "CERDOS VARIOS"
            if (!isSameGroup && isDestinoVarios && origenGrupo.startsWith('CERDOS VARIOS')) {
               // Permitir libremente entre clientes VARIOS, sin importar si la OP está 
               // etiquetada para un cliente específico (medicada o especial) dentro del grupo.
               isSameGroup = true;
            }
            
            // Si pertenecen al mismo grupo corporativo, solo advertir
            if (isSameGroup) {
                const confirm = window.confirm(
                  `⚠️ ADVERTENCIA ⚠️\n\nLa OP ${prog.lote} fue fabricada para "${clienteName}" y estás enviando a "${destinoNombre}".\n\nAmbos pertenecen al mismo grupo corporativo (Varios/Mismo Grupo). ¿Deseas continuar con el despacho?`
                );
                if (!confirm) { setSaving(false); return; }
                continue;
            }
            
            // Si son de diferentes grupos, EXIGIR un préstamo activo o una compensación
            const gOrigen = origenGrupo;
            const gDestino = destinoGrupo;
            
            const [{ data: prestamos }, { data: compensaciones }] = await Promise.all([
              supabase.from('prestamos_inventario')
                .select('id, cantidad, cantidad_compensada')
                .ilike('grupo_origen', gOrigen.startsWith('CERDOS VARIOS') ? 'CERDOS VARIOS%' : gOrigen)
                .ilike('grupo_destino', gDestino.startsWith('CERDOS VARIOS') ? 'CERDOS VARIOS%' : gDestino)
                .eq('codigo_sap', prog.codigo_sap),
              supabase.from('prestamos_inventario')
                .select('id, cantidad_compensada')
                .ilike('grupo_origen', gDestino.startsWith('CERDOS VARIOS') ? 'CERDOS VARIOS%' : gDestino)
                .ilike('grupo_destino', gOrigen.startsWith('CERDOS VARIOS') ? 'CERDOS VARIOS%' : gOrigen)
                .eq('codigo_sap', prog.codigo_sap)
                .ilike('motivo', `%Repuesto con OP ${prog.lote}%`)
            ]);
            
            const prestadoDisponible = (prestamos || []).reduce((sum, p) => sum + p.cantidad, 0);
            const compensadoDisponible = (compensaciones || []).reduce((sum, p) => sum + (p.cantidad_compensada || 0), 0);
            const totalPermitido = prestadoDisponible + compensadoDisponible;
              
            if (totalPermitido === 0) {
              alert(`⛔ ACCESO DENEGADO ⛔\n\nLa OP ${prog.lote} pertenece al grupo "${gOrigen}". Estás intentando despacharla al grupo "${gDestino}".\n\nNo se permite esta acción porque NO HAY NINGÚN PRÉSTAMO ACTIVO o COMPENSACIÓN registrada para este alimento entre estos dos grupos.`);
              setSaving(false);
              return;
            }
            
            // Si existe permiso, sumarizar el saldo pendiente y advertir
            const confirm = window.confirm(
              `⚠️ DESPACHO CRUZADO (CON PRÉSTAMO/COMPENSACIÓN) ⚠️\n\nLa OP ${prog.lote} es de "${gOrigen}". Estás despachando a "${gDestino}".\nExiste un saldo a favor de ${totalPermitido} bultos para este producto.\n\n¿Estás seguro de registrar esta salida?`
            );
            
            if (!confirm) { setSaving(false); return; }
          }
        }
      }
    } catch (e: unknown) {
      console.warn("Error cross-checking OP client ownership:", e);
    }
    
    try {
      const dbHeaderData: any = {
        fecha: headerData.fecha,
        hora: headerData.hora,
        num_remision: headerData.remision || '',
        cliente_id: headerData.cliente_id ? Number(headerData.cliente_id) : '',
        vehiculo_id: headerData.vehiculo_id ? Number(headerData.vehiculo_id) : '',
        granja_id: headerData.granja_id ? Number(headerData.granja_id) : '',
        entregado_por: headerData.entregado_por,
        observaciones: headerData.observaciones,
        estado: headerData.estado || 'borrador',
      };

      const dbDetails = details.map(d => ({
        op: Number(d.op),
        cantidad_a_despachar: Number(d.cantidad_a_despachar),
        bultos_danados: d.observaciones?.toLowerCase().includes('daño') ? Number(d.cantidad_a_despachar) : 0,
        observaciones: d.observaciones
      }));

      if (editingId) {
        await updateDespacho(editingId as string | number, dbHeaderData, dbDetails);
        toast.success('Despacho actualizado con éxito.');
      } else {
        await createDespacho(dbHeaderData, dbDetails);
        toast.success('Despacho creado con éxito.');
      }

      setShowHeaderForm(false);
      setEditingId(null);
      await queryClient.invalidateQueries({ queryKey: ['despachos_paginated'] });
      await queryClient.invalidateQueries({ queryKey: ['despachos_kpis'] });
    } catch (e: unknown) {
      const err = e as Error;
      toast.error('Error guardando despacho: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = (id: number | string) => {
    if (!canEdit) return;
    setDeleteConfirm(id);
  };

  const handleDelete = async () => {
    if (!canEdit || !deleteConfirm) return;
    try {
      await softDeleteDespacho(deleteConfirm);
      toast.success('Despacho eliminado con éxito.');
      setDeleteConfirm(null);
      await queryClient.invalidateQueries({ queryKey: ['despachos_paginated'] });
      await queryClient.invalidateQueries({ queryKey: ['despachos_kpis'] });
    } catch (e: unknown) {
      const err = e as Error;
      toast.error('Error al eliminar despacho: ' + err.message);
    }
  };

  return {
    despachos,
    totalRecords,
    kpis,
    loading,
    expandedRows,
    showHeaderForm,
    setShowHeaderForm,
    saving,
    editingId,
    setEditingId,
    deleteConfirm,
    setDeleteConfirm,
    toggleRow,
    handleSave,
    confirmDelete,
    handleDelete,
    loadDespachos: async () => { await loadDespachos(); }
  };
}
