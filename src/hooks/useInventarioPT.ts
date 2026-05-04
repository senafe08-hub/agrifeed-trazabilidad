import { useState, useEffect, useCallback } from 'react';
import supabase from '../lib/supabase';
import { usePermissions } from '../lib/permissions';
import { 
  fetchInventarioPT, fetchGruposInventario, 
  registrarReproceso,
  crearPrestamo,
  calcularSemanaISO,
  toggleReferenciaFijaPT,
  fetchDetallesMovimientosPT,
  getSaldoDisponiblePorOP,
  reversarPrestamo,
  reversarReproceso,
  getBolsaReprocesosDisponibles
} from '../lib/api/ventas';

function getSemanaActual() {
  const d = new Date();
  return { semana: calcularSemanaISO(d.toISOString().split('T')[0]), anio: d.getFullYear() };
}

export interface InvItem {
  codigo_sap: number;
  grupo: string;
  inventario_inicial?: number;
  producido?: number;
  despachado?: number;
  prestado?: number;
  recibido?: number;
  reproceso?: number;
  saldo_actual?: number;
  isFijo?: boolean;
}

export interface HistorialReproceso {
  id: number;
  fecha: string;
  codigo_sap: number;
  cantidad: number;
  motivo: string;
  created_by: string;
}

export interface HistorialPrestamo {
  id: number;
  fecha?: string;
  created_at?: string;
  grupo_origen: string;
  grupo_destino: string;
  codigo_sap: number;
  cantidad: number;
  cantidad_compensada?: number;
  estado: string;
  motivo?: string;
  op_compensacion?: string | number;
}

export interface DetalleProduccion {
  fecha_produccion: string;
  turno: string;
  lote: string;
  bultos_entregados: number;
}

export interface DetalleDespacho {
  fecha: string;
  remision: string;
  lote: string;
  placa: string;
  bultos_despachados: number;
}

export interface DetallePrestamo {
  fecha: string;
  tipo: 'PRESTADO' | 'RECIBIDO';
  contraparte: string;
  cantidad: number;
  estado: string;
  motivo?: string;
  cantidad_compensada: number;
  compensado_at: string | null;
}

export function useInventarioPT() {
  const { canEdit } = usePermissions('despachos');
  const [loading, setLoading] = useState(false);
  const [grupos, setGrupos] = useState<string[]>([]);
  // We keep grupoSel ONLY for Modals (Reproceso/Préstamo), not for fetching
  const [grupoSel, setGrupoSel] = useState('');
  const [activeGroup, setActiveGroup] = useState<string | null>(null);
  const [semana, setSemana] = useState(getSemanaActual().semana);
  const [anio, setAnio] = useState(getSemanaActual().anio);

  const [inventario, setInventario] = useState<InvItem[]>([]);
  const [alimentos, setAlimentos] = useState<{ codigo_sap: number; descripcion: string }[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Modals
  const [showReproceso, setShowReproceso] = useState(false);
  const [showPrestamo, setShowPrestamo] = useState(false);
  const [showAddRefModal, setShowAddRefModal] = useState(false);
  const [formData, setFormData] = useState<Record<string, any>>({});
  
  // Drill-down
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [detalles, setDetalles] = useState<{ produccion: DetalleProduccion[], despachos: DetalleDespacho[], prestamos: DetallePrestamo[] } | null>(null);
  const [loadingDetalles, setLoadingDetalles] = useState(false);

  // OPs pendientes (para préstamos)
  const [opsPendientes, setOpsPendientes] = useState<{ lote: number; codigo_sap: number; maestro_alimentos: { descripcion: string }; bultos_programados: number; bultos_disponibles?: number }[]>([]);

  // Historial de movimientos
  const [showHistorial, setShowHistorial] = useState(false);
  const [historial, setHistorial] = useState<{ reprocesos: HistorialReproceso[], prestamos: HistorialPrestamo[] }>({ reprocesos: [], prestamos: [] });

  const [showBodegaReprocesos, setShowBodegaReprocesos] = useState(false);
  const [bodegaReprocesos, setBodegaReprocesos] = useState<any[]>([]);

  const loadMaestros = useCallback(async () => {
    const g = await fetchGruposInventario();
    setGrupos(g);
    if (g.length > 0) setGrupoSel(g[0]);
    
    const { data: al } = await supabase.from('maestro_alimentos').select('codigo_sap, descripcion').order('descripcion');
    setAlimentos(al || []);
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // Omit grupoSel to fetch ALL
      const inv = await fetchInventarioPT(semana, anio);
      setInventario(inv);
    } catch (err) { console.error(err); }
    setLoading(false);
  }, [semana, anio]);

  useEffect(() => { loadMaestros(); }, [loadMaestros]);
  useEffect(() => { loadData(); }, [loadData]);

  // Eliminated handleInvChange because the initial inventory is now fully automated

  async function fetchOpsConSaldo() {
    // Traer OPs con producción
    const { data: prodData } = await supabase.from('produccion').select('lote, bultos_entregados, programacion!inner(codigo_sap, maestro_alimentos(descripcion), cliente_id)').order('fecha_produccion', { ascending: false }).limit(200);
    
    const opMap = new Map();
    const lotes: number[] = [];

    for (const d of (prodData || [])) {
      if (!opMap.has(d.lote)) {
        const prog = Array.isArray(d.programacion) ? d.programacion[0] : d.programacion;
        opMap.set(d.lote, { lote: d.lote, codigo_sap: prog?.codigo_sap, maestro_alimentos: prog?.maestro_alimentos, bultos_programados: 0, bultos_disponibles: 0 });
        lotes.push(d.lote);
      }
      opMap.get(d.lote).bultos_programados += d.bultos_entregados;
      opMap.get(d.lote).bultos_disponibles += d.bultos_entregados;
    }

    if (lotes.length > 0) {
      const [{ data: despData }, { data: prestData }, { data: repData }] = await Promise.all([
        supabase.from('despachos').select('lote, bultos_despachados').in('lote', lotes),
        supabase.from('prestamos_inventario').select('motivo, cantidad').order('created_at', { ascending: false }).limit(500),
        supabase.from('reprocesos_pt').select('motivo, cantidad').order('created_at', { ascending: false }).limit(500)
      ]);

      for (const d of (despData || [])) {
        if (d.lote && opMap.has(d.lote)) {
          opMap.get(d.lote).bultos_disponibles -= (d.bultos_despachados || 0);
        }
      }

      for (const p of (prestData || [])) {
        if (p.motivo && p.motivo.includes('OP ')) {
          for (const lote of lotes) {
            if (p.motivo.includes(`OP ${lote}`)) {
              opMap.get(lote).bultos_disponibles -= (p.cantidad || 0);
            }
          }
        }
      }
      
      for (const r of (repData || [])) {
        if (r.motivo && r.motivo.includes('OP ')) {
          for (const lote of lotes) {
            if (r.motivo.includes(`OP ${lote}`)) {
              opMap.get(lote).bultos_disponibles -= (r.cantidad || 0);
            }
          }
        }
      }
    }

    return Array.from(opMap.values()).filter(o => o.bultos_disponibles > 0);
  }

  async function handleReproceso(e: React.FormEvent) {
    e.preventDefault();
    if (!formData.op_origen) return alert('Debes seleccionar una OP para reproceso');

    setLoading(true);
    try {
      const opSel = opsPendientes.find(o => o.lote == Number(formData.op_origen));
      if (!opSel) throw new Error('OP inválida');

      const cant = Number(formData.cantidad);
      const saldoOP = await getSaldoDisponiblePorOP(opSel.lote);
      
      if (cant > saldoOP) {
        throw new Error(`No puedes enviar a reproceso más de lo disponible en la OP. Disponible: ${saldoOP} bultos.`);
      }

      const motivoFinal = `OP ${formData.op_origen} - ${formData.motivo || 'Reproceso general'}`;
      await registrarReproceso({
        grupo: grupoSel,
        codigo_sap: Number(formData.codigo_sap),
        cantidad: cant,
        motivo: motivoFinal,
        fecha: new Date().toISOString().split('T')[0],
        semana, anio
      });
      setShowReproceso(false);
      setFormData({});
      loadData();
    } catch (err: unknown) { alert('Error: ' + (err as Error).message); }
    setLoading(false);
  }

  async function openReprocesoModal() {
    const opsDisponibles = await fetchOpsConSaldo();
    setOpsPendientes(opsDisponibles);
    setShowReproceso(true);
  }

  async function openPrestamoModal() {
    const opsDisponibles = await fetchOpsConSaldo();
    setOpsPendientes(opsDisponibles);
    setShowPrestamo(true);
  }

  async function openHistorial(grupo: string) {
    setGrupoSel(grupo);
    const [{ data: rep }, { data: prest }] = await Promise.all([
      supabase.from('reprocesos_pt').select('*').ilike('grupo', `${grupo}%`).order('created_at', { ascending: false }).limit(50),
      supabase.from('prestamos_inventario').select('*').or(`grupo_origen.ilike.${grupo}%,grupo_destino.ilike.${grupo}%`).order('created_at', { ascending: false }).limit(50)
    ]);
    setHistorial({ reprocesos: (rep as HistorialReproceso[]) || [], prestamos: (prest as HistorialPrestamo[]) || [] });
    setShowHistorial(true);
  }

  async function handlePrestamo(e: React.FormEvent) {
    e.preventDefault();
    if (!formData.op_origen) return alert('Debes seleccionar una OP');
    
    setLoading(true);
    try {
      const opSel = opsPendientes.find(o => o.lote == Number(formData.op_origen));
      if (!opSel) throw new Error('OP inválida');

      const cant = Number(formData.cantidad);
      const saldoOP = await getSaldoDisponiblePorOP(opSel.lote);
      
      if (cant > saldoOP) {
        throw new Error(`No puedes prestar más de lo disponible en la OP. Disponible: ${saldoOP} bultos.`);
      }

      const motivoFinal = `Préstamo tomado de OP ${formData.op_origen}`;
      await crearPrestamo({
        grupo_origen: grupoSel,
        grupo_destino: formData.grupo_destino,
        codigo_sap: opSel.codigo_sap,
        cantidad: cant,
        motivo: motivoFinal,
        estado: formData.es_definitivo ? 'DEFINITIVO' : 'PENDIENTE'
      });
      setShowPrestamo(false);
      setFormData({});
      loadData();
    } catch (err: unknown) { alert('Error: ' + (err as Error).message); }
    setLoading(false);
  }

  async function handleReversarPrestamo(prestamoId: number, opLoteStr: string, grupoDestino: string) {
    const opLoteMatch = opLoteStr.match(/OP (\d+)/);
    if (!opLoteMatch) {
      alert('No se pudo identificar la OP origen de este préstamo.');
      return;
    }
    
    if (!window.confirm(`¿Estás seguro de que deseas reversar este préstamo hacia ${grupoDestino}? Esta acción no se puede deshacer.`)) {
      return;
    }
    
    setLoading(true);
    try {
      await reversarPrestamo(prestamoId, opLoteMatch[1], grupoDestino);
      alert('Préstamo reversado exitosamente.');
      await openHistorial(grupoSel); // Refresh modal
      loadData(); // Refresh background data
    } catch (err: unknown) {
      alert(`Error al reversar: ${(err as Error).message}`);
    }
    setLoading(false);
  }

  async function handleReversarReproceso(reprocesoId: number, motivo: string) {
    if (!window.confirm(`¿Estás seguro de que deseas eliminar este reproceso (${motivo})? Si ya fue usado en producción, el sistema no lo permitirá.`)) {
      return;
    }
    
    setLoading(true);
    try {
      await reversarReproceso(reprocesoId, motivo);
      alert('Reproceso eliminado exitosamente. El inventario ha retornado a su OP origen.');
      await openHistorial(grupoSel); // Refresh modal
      loadData(); // Refresh background data
    } catch (err: unknown) {
      alert(`Error al eliminar: ${(err as Error).message}`);
    }
    setLoading(false);
  }

  async function openBodegaReprocesos() {
    setLoading(true);
    try {
      const b = await getBolsaReprocesosDisponibles();
      setBodegaReprocesos(b);
      setShowBodegaReprocesos(true);
    } catch (err: unknown) {
      alert(`Error cargando bodega de reprocesos: ${(err as Error).message}`);
    }
    setLoading(false);
  }

  async function handleTogglePin(grupo: string, codigoSap: number, isPinned: boolean) {
    if (isPinned) {
      if (!window.confirm('¿Estás seguro de que deseas desfijar esta referencia? Si no tiene saldo actual, desaparecerá de la vista principal.')) {
        return;
      }
    }
    
    // Optimistic UI Update
    setInventario(prev => {
      const exists = prev.find(i => i.grupo === grupo && i.codigo_sap === codigoSap);
      if (exists) {
        return prev.map(i => (i.grupo === grupo && i.codigo_sap === codigoSap) ? { ...i, isFijo: !isPinned } : i);
      } else {
        return [...prev, { grupo, codigo_sap: codigoSap, isFijo: !isPinned, inventario_inicial: 0, producido: 0, despachado: 0, saldo_actual: 0 }];
      }
    });

    try {
      await toggleReferenciaFijaPT(grupo, codigoSap, !isPinned);
    } catch (err: unknown) { 
      alert('Error: ' + (err as Error).message);
      loadData(); // revert on error
    }
  }

  async function handleRowClick(grupo: string, codigoSap: number) {
    const rowKey = `${grupo}|${codigoSap}`;
    if (expandedRow === rowKey) {
      setExpandedRow(null);
      setDetalles(null);
      return;
    }
    setExpandedRow(rowKey);
    setLoadingDetalles(true);
    setDetalles(null);
    try {
      const d = await fetchDetallesMovimientosPT(semana, anio, grupo, codigoSap);
      setDetalles(d);
    } catch (err: unknown) {
      alert('Error cargando detalles: ' + (err as Error).message);
    } finally {
      setLoadingDetalles(false);
    }
  }

  return {
    canEdit,
    loading,
    grupos,
    grupoSel, setGrupoSel,
    semana, setSemana,
    anio, setAnio,
    inventario,
    alimentos,
    searchTerm, setSearchTerm,
    showReproceso, setShowReproceso,
    showPrestamo, setShowPrestamo,
    formData, setFormData,
    expandedRow,
    detalles,
    loadingDetalles,
    opsPendientes,
    showHistorial, setShowHistorial,
    historial,
    loadData,
    activeGroup, setActiveGroup,
    showAddRefModal, setShowAddRefModal,
    showBodegaReprocesos, setShowBodegaReprocesos,
    bodegaReprocesos,
    openBodegaReprocesos,
    openReprocesoModal: (grupo: string) => { setGrupoSel(grupo); openReprocesoModal(); },
    handleReproceso,
    openPrestamoModal: (grupo: string) => { setGrupoSel(grupo); openPrestamoModal(); },
    openHistorial,
    handlePrestamo,
    handleReversarPrestamo,
    handleReversarReproceso,
    handleTogglePin,
    handleRowClick
  };
}
