import { useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import supabase, { registrarAuditoria } from '../lib/supabase';
import * as XLSX from 'xlsx';
import { ProduccionFormValues } from '../schemas/produccion';
import { getBolsaReprocesosDisponibles } from '../lib/api/ventas';

export interface ExtendedProduccionRow {
  id: number;
  fecha_produccion: string;
  turno: string;
  lote: number;
  fecha_programa: string;
  codigo_sap: number | string;
  alimento: string;
  categoria: string;
  cliente: string;
  baches: number;
  bultos: number;
  bultos_reproceso?: number;
  op_reproceso_origen?: string;
  kg: number;
  observaciones?: string;
}

export interface ProduccionLote {
  lote: number;
  num_baches: number;
  bultos_programados: number;
  maestro_alimentos?: { descripcion: string } | { descripcion: string }[];
  maestro_clientes?: { nombre: string } | { nombre: string }[];
}

export interface PaginationConfig {
  page: number;
  pageSize: number;
  searchTerm?: string;
  columnFilters?: Record<string, string>;
}

export function useProduccion(canEdit: boolean, currentLote?: number | null, config?: PaginationConfig) {
  const queryClient = useQueryClient();
  
  const { data: tableResult = { data: [], total: 0 }, isLoading: loading, refetch: fetchData } = useQuery({
    queryKey: ['produccion_paginated', config],
    queryFn: async () => {
      let query = supabase.from('vista_produccion').select('*', { count: 'exact' });

      if (config?.searchTerm) {
        const st = `%${config.searchTerm}%`;
        query = query.or(`alimento.ilike.${st},cliente.ilike.${st},lote.eq.${config.searchTerm}`);
      }

      if (config?.columnFilters) {
        Object.entries(config.columnFilters).forEach(([key, value]) => {
          if (value) {
            query = query.ilike(key, `%${value}%`);
          }
        });
      }

      query = query.order('fecha_produccion', { ascending: false }).order('id', { ascending: false });

      if (config) {
        const from = (config.page - 1) * config.pageSize;
        const to = from + config.pageSize - 1;
        query = query.range(from, to);
      } else {
        query = query.limit(100);
      }

      const { data, count, error } = await query;
      if (error) throw error;
      
      const mapped = (data || []).map(item => ({
        id: item.id,
        fecha_produccion: item.fecha_produccion,
        turno: item.turno || 'Diurno',
        lote: item.lote,
        fecha_programa: item.fecha_programa || '-',
        codigo_sap: item.codigo_sap || '-',
        alimento: item.alimento || 'Sin alimento',
        categoria: item.categoria || 'Sin Categoría',
        cliente: item.cliente || 'Sin cliente',
        baches: Number(item.baches_entregados || 0),
        bultos: item.bultos_entregados,
        bultos_reproceso: item.bultos_reproceso,
        op_reproceso_origen: item.op_reproceso_origen,
        kg: (item.bultos_entregados || 0) * 40,
        observaciones: item.observaciones,
      }));

      return { data: mapped, total: count || 0 };
    }
  });

  const { data: kpis = { total_registros: 0, total_bultos: 0, total_ops: 0 } } = useQuery({
    queryKey: ['produccion_kpis', config],
    queryFn: async () => {
      const params: Record<string, unknown> = {};
      
      if (config?.searchTerm) params.p_search = config.searchTerm;
      
      if (config?.columnFilters) {
        if (config.columnFilters.fecha_produccion) params.p_fecha_produccion = config.columnFilters.fecha_produccion;
        if (config.columnFilters.turno) params.p_turno = config.columnFilters.turno;
        if (config.columnFilters.lote) params.p_lote = config.columnFilters.lote;
        if (config.columnFilters.alimento) params.p_alimento = config.columnFilters.alimento;
        if (config.columnFilters.categoria) params.p_categoria = config.columnFilters.categoria;
        if (config.columnFilters.observaciones) params.p_observaciones = config.columnFilters.observaciones;
      }
      
      const { data, error } = await supabase.rpc('rpc_produccion_kpis', params);
      
      if (error) throw error;
      
      if (!data || data.length === 0) {
        return { total_registros: 0, total_bultos: 0, total_ops: 0 };
      }

      const row = data[0];
      return {
        total_registros: Number(row.total_registros) || 0,
        total_bultos: Number(row.total_bultos) || 0,
        total_ops: Number(row.total_ops) || 0
      };
    }
  });

  const { data: opsResumen = [] } = useQuery({
    queryKey: ['produccion_ops_resumen'],
    queryFn: async () => {
      const { data, error } = await supabase.from('vista_produccion_ops_resumen').select('*').order('lote', { ascending: false });
      if (error) throw error;
      
      interface VistaOpsResumenRow {
        lote: number;
        alimento: string;
        cliente: string;
        programado_baches: number;
        acumulado_baches: number;
        pendiente_baches: number;
        programado_bultos: number;
        acumulado_bultos: number;
        pendiente_bultos: number;
      }
      
      return (data as VistaOpsResumenRow[]).map((d) => ({
        lote: d.lote,
        alimento: d.alimento || '',
        cliente: d.cliente || '',
        programadoBaches: d.programado_baches || 0,
        acumuladoBaches: d.acumulado_baches || 0,
        pendienteBaches: d.pendiente_baches || 0,
        porcentaje: (d.programado_baches || 0) > 0 ? (d.acumulado_baches / d.programado_baches) * 100 : (d.acumulado_baches > 0 ? 100 : 0),
        programado: d.programado_bultos || 0,
        acumulado: d.acumulado_bultos || 0,
        pendiente: d.pendiente_bultos || 0
      }));
    }
  });

  const { data: lotes = [] } = useQuery<ProduccionLote[]>({
    queryKey: ['programacion_lotes'],
    queryFn: async () => {
      const { data: l } = await supabase
        .from('programacion')
        .select('lote, num_baches, bultos_programados, maestro_alimentos(descripcion), maestro_clientes(nombre)')
        .order('fecha', { ascending: false })
        .limit(10000);
      return (l || []) as ProduccionLote[];
    }
  });

  // CRUD state
  const [showForm, setShowForm] = useState(false);
  const [formMode] = useState<'crear' | 'editar'>('crear');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  const [importing, setImporting] = useState(false);

  const { data: bolsaReprocesos = [] } = useQuery({
    queryKey: ['bolsa_reprocesos_disponibles'],
    queryFn: getBolsaReprocesosDisponibles
  });

  const { data: opInfo } = useQuery({
    queryKey: ['produccion_opInfo', currentLote, editingId],
    queryFn: async () => {
      if (!currentLote) {
        return { alimento: '', cliente: '', programado: 0, acumulado: 0, pendiente: 0, bachesProgramados: 0, bachesAcumulados: 0, bachesPendiente: 0 };
      }
      
      const op = opsResumen.find(o => String(o.lote) === String(currentLote));
      
      let bachesAcumulados = op?.acumuladoBaches || 0;
      let acumulado = op?.acumulado || 0;

      if (editingId) {
        const currentEdit = tableResult.data.find(d => d.id === editingId);
        if (currentEdit) {
           bachesAcumulados -= currentEdit.baches;
           acumulado -= currentEdit.bultos;
        } else {
           const { data: currentDb } = await supabase.from('produccion').select('baches_entregados, bultos_entregados').eq('id', editingId).single();
           if (currentDb) {
             bachesAcumulados -= (currentDb.baches_entregados || 0);
             acumulado -= (currentDb.bultos_entregados || 0);
           }
        }
      }
      
      const programado = op?.programado || 0;
      const bachesProgramados = op?.programadoBaches || 0;

      return {
        alimento: op?.alimento || 'No encontrado',
        cliente: op?.cliente || 'Sin asignar',
        programado,
        acumulado,
        pendiente: programado - acumulado,
        bachesProgramados,
        bachesAcumulados,
        bachesPendiente: bachesProgramados - bachesAcumulados
      };
    },
    enabled: !!opsResumen.length,
    initialData: { alimento: '', cliente: '', programado: 0, acumulado: 0, pendiente: 0, bachesProgramados: 0, bachesAcumulados: 0, bachesPendiente: 0 }
  });

  const handleOpenForm = useCallback(() => {
    if (!canEdit) return;
    setShowForm(true);
  }, [canEdit]);

  const handleCloseForm = useCallback(() => {
    setShowForm(false);
    setEditingId(null);
  }, []);

  const handleSave = async (formData: ProduccionFormValues) => {
    if (!canEdit) return;
    setSaving(true);
    
    const bultos = Number(formData.bultos_entregados);
    const baches = Number(formData.baches_entregados);
    const currentOpInfo = opInfo || { bachesProgramados: 0, bachesAcumulados: 0, programado: 0 };

    if (currentOpInfo.bachesProgramados > 0) {
      if (currentOpInfo.bachesAcumulados + baches > currentOpInfo.bachesProgramados) {
        alert(`No puedes entregar esta cantidad porque supera los baches programados para la OP.\nBaches Programados: ${currentOpInfo.bachesProgramados}\nBaches Acumulados previamente: ${currentOpInfo.bachesAcumulados}\nTu entrega de ${baches} daría un total de ${currentOpInfo.bachesAcumulados + baches} baches que excede el límite.`);
        setSaving(false);
        return;
      }
    }

    if (currentOpInfo.bachesProgramados > 0 && currentOpInfo.programado > 0 && baches > 0) {
      const yieldPerBatch = currentOpInfo.programado / currentOpInfo.bachesProgramados;
      const expectedSacks = Math.round(yieldPerBatch * baches);
      if (Math.abs(bultos - expectedSacks) > expectedSacks * 0.1) {
        if (!window.confirm(`⚠️ ADVERTENCIA ANORMAL\nEsta OP rinde aprox. ${Math.round(yieldPerBatch)} bultos por bache.\nAl entregar ${baches} baches, se esperaban ~${expectedSacks} bultos totales, pero reportaste ${bultos} bultos.\n\n¿Estás completamente seguro de que este valor desfasado es correcto?`)) {
          setSaving(false);
          return;
        }
      }
    }

    const bultosReproceso = Number(formData.bultos_reproceso || 0);
    if (bultosReproceso > bultos) {
      alert(`No puedes indicar más bultos de reproceso (${bultosReproceso}) que el total de bultos entregados (${bultos}).`);
      setSaving(false);
      return;
    }

    try {
      if (formMode === 'crear') {
        const { error } = await supabase.from('produccion').insert([{
          ...formData,
          bultos_reproceso: bultosReproceso,
          op_reproceso_origen: formData.op_reproceso_origen || null
        }]);
        if (error) throw error;
        
        let auditMsg = `Se registró entrega de ${formData.baches_entregados} baches (${formData.bultos_entregados} bultos) para el lote ${formData.lote}`;
        if (bultosReproceso > 0) {
          auditMsg += ` incluyendo ${bultosReproceso} bultos reciclados (Origen: ${formData.op_reproceso_origen || 'N/A'})`;
        }
        await registrarAuditoria('CREATE', 'Producción', auditMsg);
        
        try {
          const { compensarPrestamosPorOP } = await import('../lib/api/ventas');
          await compensarPrestamosPorOP(formData.lote as string | number, Number(formData.bultos_entregados));
        } catch (err) {
          console.warn("No se pudo compensar el préstamo", err);
        }

      } else {
        const { error } = await supabase.from('produccion').update(formData).eq('id', editingId);
        if (error) throw error;
        await registrarAuditoria('UPDATE', 'Producción', `Se actualizó registro de entrega del lote ${formData.lote}`);
      }
      handleCloseForm();
      await queryClient.invalidateQueries({ queryKey: ['produccion_paginated'] });
      await queryClient.invalidateQueries({ queryKey: ['produccion_ops_resumen'] });
      await queryClient.invalidateQueries({ queryKey: ['produccion_opInfo'] });
    } catch (error: unknown) {
      alert(`Error al guardar: ${(error as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = useCallback((id: number) => {
    if (!canEdit) return;
    setDeleteConfirm(id);
  }, [canEdit]);

  const handleDelete = useCallback(async () => {
    if (!canEdit || !deleteConfirm) return;
    
    // Obtener información antes de borrar
    const { data: prodInfo } = await supabase.from('produccion').select('lote, bultos_entregados').eq('id', deleteConfirm).single();
    
    if (prodInfo) {
      try {
        const { verificarDependenciasOP } = await import('../lib/api/ventas');
        const validacion = await verificarDependenciasOP(prodInfo.lote);
        if (validacion.tieneDependencias) {
          alert(`❌ ACCIÓN DENEGADA\n\nNo se puede eliminar la entrega de esta OP.\n\nMotivo: ${validacion.mensaje}\n\nPara poder eliminarla, primero debes reversar manualmente esas acciones.`);
          setDeleteConfirm(null);
          return;
        }
      } catch (e) {
        console.warn('Error verificando dependencias', e);
      }
    }

    const { error } = await supabase.from('produccion').delete().eq('id', deleteConfirm);
    if (error) {
      alert('No se pudo eliminar: este registro puede estar relacionado con otras tablas.');
    } else {
      await registrarAuditoria('DELETE', 'Producción', `Se eliminó un registro de entrega de producción`);
      
      if (prodInfo && prodInfo.bultos_entregados > 0) {
        try {
          const { reversarCompensacionPorOP } = await import('../lib/api/ventas');
          await reversarCompensacionPorOP(prodInfo.lote, prodInfo.bultos_entregados);
        } catch (e) {
          console.warn('Error reversando compensación', e);
        }
      }

      await queryClient.invalidateQueries({ queryKey: ['produccion_paginated'] });
      await queryClient.invalidateQueries({ queryKey: ['produccion_ops_resumen'] });
    }
    setDeleteConfirm(null);
  }, [canEdit, deleteConfirm, queryClient]);

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>, fileInputRef: React.RefObject<HTMLInputElement | null>) => {
    if (!canEdit) return;
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rawRows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });

      const mappedRows = rawRows.map(r => ({
        fecha_produccion: r['Fecha Producción'] || r['fecha_produccion'],
        turno: r['Turno'] || r['turno'],
        lote: Number(r['Lote'] || r['lote']),
        baches_entregados: Number(r['Baches Entregados'] || r['baches_entregados'] || 0),
        bultos_entregados: Number(r['Bultos Entregados'] || r['bultos_entregados'] || 0),
        observaciones: r['Observaciones'] || r['observaciones'] || ''
      })).filter(r => r.lote && r.bultos_entregados > 0);

      if (mappedRows.length === 0) throw new Error("No se encontraron filas válidas para importar.");
      
      let inserted = 0, skipped = 0, errors = 0;
      for (const row of mappedRows) {
        const { error: insertErr } = await supabase.from('produccion').insert([row]);
        if (insertErr) {
          if (insertErr.message.includes('duplicate') || insertErr.message.includes('unique')) skipped++;
          else { errors++; console.error(`Error lote ${row.lote}:`, insertErr.message); }
        } else { inserted++; }
      }
      alert(`✅ Importación completa: ${inserted} nuevos, ${skipped} ya existían, ${errors} errores.`);
      await queryClient.invalidateQueries({ queryKey: ['produccion_paginated'] });
      await queryClient.invalidateQueries({ queryKey: ['produccion_ops_resumen'] });
    } catch (err: unknown) {
      alert(`Error en importación: ${(err as Error).message}`);
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, [canEdit, queryClient]);

  return {
    data: tableResult.data, 
    totalRecords: tableResult.total,
    kpis,
    opsResumen,
    bolsaReprocesos,
    loading, lotes, opInfo,
    showForm, formMode, editingId, saving, deleteConfirm, importing,
    handleOpenForm, handleCloseForm, handleSave, confirmDelete, handleDelete, handleFileSelect, setDeleteConfirm,
    refetchData: fetchData
  };
}
