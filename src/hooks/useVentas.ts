import { useState, useEffect, useCallback, useMemo } from 'react';
import supabase from '../lib/supabase';
import { usePermissions } from '../lib/permissions';
import { useMaestrosStore } from '../store/maestrosStore';
import { 
  fetchSolicitudes, 
  ejecutarMRP, 
  calcularVistaSemanal,
  calcularSemanaISO, 
  calcularDiaSemana,
  type VentaSolicitud, 
  type VistaSemanalRow, 
  type MRPRow 
} from '../lib/api/ventas';
import { getISOWeek, getISOWeeksInYear } from 'date-fns';

export function getSemanaActual() {
  const d = new Date();
  return { semana: getISOWeek(d), anio: d.getFullYear() };
}

export function useVentas() {
  const { canView, canEdit } = usePermissions('ventas');
  const [activeTab, setActiveTab] = useState('solicitudes');
  const [loading, setLoading] = useState(false);

  // Semana selector
  const [semana, setSemana] = useState(getSemanaActual().semana);
  const [anio, setAnio] = useState(getSemanaActual().anio);

  // Maestros
  const { alimentos, clientes, casasFormuladoras: casas, fetchData: fetchMaestrosStore } = useMaestrosStore();
  const [materiasPrimas, setMateriasPrimas] = useState<{ id: number; nombre: string }[]>([]);

  // Tab 1 - Solicitudes
  const [solicitudes, setSolicitudes] = useState<VentaSolicitud[]>([]);
  const [solicitudModalData, setSolicitudModalData] = useState<{ fecha: string, cliente_id: number | '', detalles: VentaSolicitud[] } | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [expandedDays, setExpandedDays] = useState<Record<string, boolean>>({});

  const [deleteConfirm, setDeleteConfirm] = useState<{ fecha: string, cliente_id: number } | null>(null);
  const [reprogramarData, setReprogramarData] = useState<{ fecha: string, cliente_id: number, nombreCliente: string } | null>(null);
  const [nuevaFecha, setNuevaFecha] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  // Tab 2 - Vista Semanal
  const [vistaSemanal, setVistaSemanal] = useState<VistaSemanalRow[]>([]);

  // Tab 3 - MRP
  const [mrpData, setMrpData] = useState<MRPRow[]>([]);
  const [propuestaModal, setPropuestaModal] = useState<MRPRow | null>(null);
  const [bulkPropuestaModal, setBulkPropuestaModal] = useState<MRPRow[] | null>(null);
  const [bachesCustom, setBachesCustom] = useState<number>(0);
  const [sacosCustom, setSacosCustom] = useState<number | ''>('');
  const [expandedMrpRow, setExpandedMrpRow] = useState<number | null>(null);
  const [mrpSearchTerm, setMrpSearchTerm] = useState('');
  const [selectedMrpRows, setSelectedMrpRows] = useState<Set<number>>(new Set());

  const loadMaestrosExtras = useCallback(async () => {
    const { data } = await supabase.from('inventario_materiales').select('id, codigo, nombre').order('nombre');
    setMateriasPrimas(data || []);
  }, []);

  const loadTabData = useCallback(async () => {
    setLoading(true);
    try {
      const solPromise = fetchSolicitudes(semana, anio);
      
      if (activeTab === 'solicitudes') {
        const data = await solPromise;
        setSolicitudes(data);
      } else if (activeTab === 'vista_semanal') {
        const [solData, vsData] = await Promise.all([
          solPromise,
          calcularVistaSemanal(semana, anio)
        ]);
        setSolicitudes(solData);
        setVistaSemanal(vsData);
      } else if (activeTab === 'mrp') {
        const [solData, mrpResult] = await Promise.all([
          solPromise,
          ejecutarMRP(semana, anio)
        ]);
        setSolicitudes(solData);
        setMrpData(mrpResult);
      }
    } catch (err: unknown) {
      console.error(err);
    }
    setLoading(false);
  }, [activeTab, semana, anio]);

  useEffect(() => { 
    fetchMaestrosStore();
    loadMaestrosExtras();
  }, [fetchMaestrosStore, loadMaestrosExtras]);

  useEffect(() => { 
    if (canView) loadTabData(); 
  }, [activeTab, semana, anio, canView, loadTabData]);

  const handleOpenForm = useCallback((fecha?: string, cliente_id?: number, items?: VentaSolicitud[]) => {
    if (fecha && cliente_id && items) {
      setSolicitudModalData({ fecha, cliente_id, detalles: items });
    } else {
      setSolicitudModalData({ fecha: new Date().toISOString().split('T')[0], cliente_id: '', detalles: [] });
    }
    setShowForm(true);
  }, []);

  const handleDelete = useCallback(async () => {
    if (!deleteConfirm) return;
    try {
      await supabase.from('ventas_solicitudes').delete()
        .eq('fecha', deleteConfirm.fecha)
        .eq('cliente_id', deleteConfirm.cliente_id);
      loadTabData();
    } catch (err: unknown) {
      alert('Error eliminando: ' + (err as Error).message);
    }
    setDeleteConfirm(null);
  }, [deleteConfirm, loadTabData]);

  const handleReprogramar = useCallback(async () => {
    if (!reprogramarData || !nuevaFecha) return;
    if (nuevaFecha === reprogramarData.fecha) return alert('La nueva fecha es igual a la actual.');
    try {
      const newSemana = calcularSemanaISO(nuevaFecha);
      const newDia = calcularDiaSemana(nuevaFecha);
      const { error } = await supabase.from('ventas_solicitudes')
        .update({ fecha: nuevaFecha, semana: newSemana, dia_semana: newDia })
        .eq('fecha', reprogramarData.fecha)
        .eq('cliente_id', reprogramarData.cliente_id);
      if (error) throw error;
      setReprogramarData(null);
      setNuevaFecha('');
      loadTabData();
    } catch (err: unknown) {
      alert('Error reprogramando: ' + (err as Error).message);
    }
  }, [reprogramarData, nuevaFecha, loadTabData]);

  const toggleDay = useCallback((dia: string) => {
    setExpandedDays(prev => ({ ...prev, [dia]: prev[dia] === false ? true : false }));
  }, []);

  const cambiarSemana = useCallback((delta: number) => {
    let s = semana + delta, a = anio;
    const maxWeeks = getISOWeeksInYear(new Date(a, 0, 4));
    if (s < 1) { s = getISOWeeksInYear(new Date(a - 1, 0, 4)); a--; }
    if (s > maxWeeks) { s = 1; a++; }
    setSemana(s); setAnio(a);
  }, [semana, anio]);

  const filteredSol = useMemo(() => {
    return solicitudes.filter(s => {
      if (!searchTerm) return true;
      const str = `${(s.maestro_clientes as { nombre?: string })?.nombre || ''} ${(s.maestro_alimentos as { descripcion?: string })?.descripcion || ''} ${(s.casas_formuladoras as { nombre?: string })?.nombre || ''}`.toLowerCase();
      return str.includes(searchTerm.toLowerCase());
    });
  }, [solicitudes, searchTerm]);

  const totalBultosSemana = useMemo(() => {
    return filteredSol.reduce((s, r) => s + r.cantidad, 0);
  }, [filteredSol]);

  const filteredMrpData = useMemo(() => {
    return mrpData.filter(r => {
      if (!mrpSearchTerm) return true;
      const str = `${r.grupo || ''} ${r.referencia || ''} ${r.casa || ''}`.toLowerCase();
      return str.includes(mrpSearchTerm.toLowerCase());
    });
  }, [mrpData, mrpSearchTerm]);

  return {
    canView, canEdit,
    activeTab, setActiveTab,
    loading,
    semana, setSemana,
    anio, setAnio,
    alimentos, clientes, casas, materiasPrimas,
    solicitudes, setSolicitudes,
    solicitudModalData, setSolicitudModalData,
    showForm, setShowForm,
    expandedDays, setExpandedDays,
    deleteConfirm, setDeleteConfirm,
    reprogramarData, setReprogramarData,
    nuevaFecha, setNuevaFecha,
    searchTerm, setSearchTerm,
    vistaSemanal, setVistaSemanal,
    mrpData, setMrpData,
    propuestaModal, setPropuestaModal,
    bulkPropuestaModal, setBulkPropuestaModal,
    bachesCustom, setBachesCustom,
    sacosCustom, setSacosCustom,
    expandedMrpRow, setExpandedMrpRow,
    mrpSearchTerm, setMrpSearchTerm,
    selectedMrpRows, setSelectedMrpRows,
    loadTabData, handleOpenForm, handleDelete, handleReprogramar,
    toggleDay, cambiarSemana,
    filteredSol, totalBultosSemana,
    filteredMrpData
  };
}
