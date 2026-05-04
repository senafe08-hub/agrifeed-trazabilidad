import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  fetchInventarioMateriales, upsertInventarioMaterial, deleteInventarioMaterial,
  fetchInventarioEntradas, createInventarioEntrada, deleteInventarioEntrada, updateInventarioEntrada,
  fetchInventarioTraslados, createInventarioTrasladoBatch, updateInventarioTraslado, deleteInventarioTraslado,
  fetchStockInicial, upsertStockInicialBatch, calcularInventarioConsolidado, fetchHistoricoConsumo,
  fetchLotesActivos, fetchTrasladoLotes,
  type InventarioConsolidado,
} from '../lib/supabase';
import type { InventarioMaterial, InventarioEntradaRow, InventarioTrasladoRow, StockInicialRow } from '../lib/types';
import { toast } from '../components/Toast';
import * as XLSX from 'xlsx';

export const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
export const ITEMS_PER_PAGE = 100;

export function useInventarioMP() {
  const [activeTab, setActiveTab] = useState<'panel' | 'entradas' | 'traslados' | 'catalogo' | 'stock_inicial'>('panel');
  const now = new Date();
  const [mes, setMes] = useState(now.getMonth() + 1);
  const [anio, setAnio] = useState(now.getFullYear());

  // ═══ Panel ═══
  const [consolidado, setConsolidado] = useState<InventarioConsolidado[]>([]);
  const [loadingPanel, setLoadingPanel] = useState(false);
  const [panelSearch, setPanelSearch] = useState('');
  const [expandedPanel, setExpandedPanel] = useState<Set<number>>(new Set());
  const [loadingHistorico, setLoadingHistorico] = useState<Record<number, boolean>>({});
  const [historicoData, setHistoricoData] = useState<Record<number, { name: string; kg: number }[]>>({});
  const [loadingLotes, setLoadingLotes] = useState<Record<number, boolean>>({});
  const [lotesActivos, setLotesActivos] = useState<Record<number, any[]>>({});
  const [kpiFilter, setKpiFilter] = useState<'all' | 'critico' | 'alerta' | 'ok'>('all');

  // ═══ Entradas ═══
  const [entradas, setEntradas] = useState<InventarioEntradaRow[]>([]);
  const [loadingEntradas, setLoadingEntradas] = useState(false);
  const [showEntradaForm, setShowEntradaForm] = useState(false);
  const [entradaForm, setEntradaForm] = useState({ id: 0, fecha: now.toISOString().split('T')[0], material_id: '' as string | number, cantidad_kg: '' as string | number, observaciones: '', fecha_vencimiento: '' });
  const [entradasSearch, setEntradasSearch] = useState('');
  const [entradasPage, setEntradasPage] = useState(1);

  // ═══ Traslados ═══
  const [traslados, setTraslados] = useState<InventarioTrasladoRow[]>([]);
  const [loadingTraslados, setLoadingTraslados] = useState(false);
  const [showTrasladoForm, setShowTrasladoForm] = useState(false);
  const [trasladoForm, setTrasladoForm] = useState({
    id: 0, fecha: now.toISOString().split('T')[0], cliente_op: '', semana: '1', observaciones: '',
    materiales: [{ material_id: '' as string | number, cantidad_kg: '' as string | number }]
  });
  const [trasladosSearch, setTrasladosSearch] = useState('');
  const [trasladosPage, setTrasladosPage] = useState(1);
  const [expandedTraslados, setExpandedTraslados] = useState<Set<number>>(new Set());
  const [loadingTrasladoLotes, setLoadingTrasladoLotes] = useState<Record<number, boolean>>({});
  const [trasladoLotesData, setTrasladoLotesData] = useState<Record<number, any[]>>({});

  // ═══ Catálogo ═══
  const [materiales, setMateriales] = useState<InventarioMaterial[]>([]);
  const [loadingMat, setLoadingMat] = useState(false);
  const [showMatForm, setShowMatForm] = useState(false);
  const [matForm, setMatForm] = useState({ id: 0, codigo: '', nombre: '', peso_kg: '', min_cobertura_semanas: '2' });
  const [matSearch, setMatSearch] = useState('');
  const [matPage, setMatPage] = useState(1);

  // ═══ Stock Inicial ═══
  const [stockRows, setStockRows] = useState<{ material_id: number; codigo: number; nombre: string; stock_kg: number | string; consumo_estimado_mes: number | string; dirty: boolean }[]>([]);
  const [loadingStock, setLoadingStock] = useState(false);
  const [stockSearch, setStockSearch] = useState('');

  const loadMateriales = useCallback(async () => {
    setLoadingMat(true);
    try { setMateriales(await fetchInventarioMateriales()); } catch (e: unknown) { toast.error((e as Error).message); }
    setLoadingMat(false);
  }, []);

  const loadPanel = useCallback(async (forceRefresh?: boolean | unknown) => {
    setLoadingPanel(true);
    const force = forceRefresh === true;
    try { setConsolidado(await calcularInventarioConsolidado(mes, anio, 0, force)); } catch (e: unknown) { toast.error((e as Error).message); }
    setLoadingPanel(false);
  }, [mes, anio]);

  const loadEntradas = useCallback(async () => {
    setLoadingEntradas(true);
    try { setEntradas(await fetchInventarioEntradas(mes, anio)); } catch (e: unknown) { toast.error((e as Error).message); }
    setLoadingEntradas(false);
  }, [mes, anio]);

  const loadTraslados = useCallback(async () => {
    setLoadingTraslados(true);
    try { setTraslados(await fetchInventarioTraslados(mes, anio)); } catch (e: unknown) { toast.error((e as Error).message); }
    setLoadingTraslados(false);
  }, [mes, anio]);

  const loadStockInicial = useCallback(async () => {
    setLoadingStock(true);
    try {
      const stock = await fetchStockInicial(mes, anio);
      const mats = materiales.length ? materiales : await fetchInventarioMateriales();
      if (!materiales.length) setMateriales(mats);
      const stockMap: Record<number, StockInicialRow> = {};
      for (const s of stock) stockMap[s.material_id] = s as StockInicialRow;
      const merged = mats.map((m: InventarioMaterial) => ({
        material_id: m.id, codigo: m.codigo, nombre: m.nombre,
        stock_kg: stockMap[m.id]?.stock_kg ?? '',
        consumo_estimado_mes: stockMap[m.id]?.consumo_estimado_mes ?? '',
        dirty: false,
      }));
      setStockRows(merged);
    } catch (e: unknown) { toast.error((e as Error).message); }
    setLoadingStock(false);
  }, [mes, anio, materiales]);

  useEffect(() => { loadMateriales(); }, [loadMateriales]);
  useEffect(() => {
    if (activeTab === 'panel') loadPanel();
    if (activeTab === 'entradas') loadEntradas();
    if (activeTab === 'traslados') loadTraslados();
    if (activeTab === 'stock_inicial') loadStockInicial();
  }, [activeTab, mes, anio, loadPanel, loadEntradas, loadTraslados, loadStockInicial]);

  // KPIs Panel
  const panelKpis = useMemo(() => {
    const total = consolidado.length;
    const criticos = consolidado.filter(r => r.semanas_cobertura !== null && r.semanas_cobertura < r.min_cobertura_semanas).length;
    const alertas = consolidado.filter(r => r.semanas_cobertura !== null && r.semanas_cobertura >= r.min_cobertura_semanas && r.semanas_cobertura < r.min_cobertura_semanas + 2).length;
    const ok = consolidado.filter(r => r.semanas_cobertura === null || r.semanas_cobertura >= r.min_cobertura_semanas + 2).length;
    return { total, criticos, alertas, ok };
  }, [consolidado]);

  const filteredPanel = useMemo(() => {
    let filtered = consolidado;
    if (kpiFilter === 'critico') filtered = filtered.filter(r => r.semanas_cobertura !== null && r.semanas_cobertura < r.min_cobertura_semanas);
    else if (kpiFilter === 'alerta') filtered = filtered.filter(r => r.semanas_cobertura !== null && r.semanas_cobertura >= r.min_cobertura_semanas && r.semanas_cobertura < r.min_cobertura_semanas + 2);
    else if (kpiFilter === 'ok') filtered = filtered.filter(r => r.semanas_cobertura === null || r.semanas_cobertura >= r.min_cobertura_semanas + 2);

    if (!panelSearch) return filtered;
    const s = panelSearch.toLowerCase();
    return filtered.filter(r => r.nombre.toLowerCase().includes(s) || String(r.codigo).includes(s));
  }, [consolidado, panelSearch, kpiFilter]);

  const exportPanelExcel = useCallback(async () => {
    const rows = filteredPanel.map(r => ({
      'Código': r.codigo,
      'Material': r.nombre,
      'Stock Inicial (kg)': r.stock_inicial,
      'Entradas (kg)': r.entradas,
      'Traslados (kg)': r.traslados,
      'Stock Final (kg)': r.stock_final,
      'Consumo Est. Mes (kg)': r.consumo_estimado_mes,
      'Consumo Semanal (kg)': Number(r.consumo_semanal.toFixed(2)),
      'Sem. Cobertura': r.semanas_cobertura !== null ? Number(r.semanas_cobertura.toFixed(2)) : '-',
      'Pendiente Ingresar (kg)': r.pendiente_ingresar,
      'Sem 1': r.consumo_semana[0],
      'Sem 2': r.consumo_semana[1],
      'Sem 3': r.consumo_semana[2],
      'Sem 4': r.consumo_semana[3],
      'Sem 5': r.consumo_semana[4],
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Inventario');
    try {
      if ('showSaveFilePicker' in window) {
        const win = window as unknown as { showSaveFilePicker: (options: unknown) => Promise<{ createWritable: () => Promise<{ write: (data: unknown) => Promise<void>; close: () => Promise<void> }> }> };
        const h = await win.showSaveFilePicker({ suggestedName: `Inventario_${MESES[mes-1]}_${anio}.xlsx`, types: [{ description: 'Excel', accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] } }] });
        const w = await h.createWritable(); await w.write(XLSX.write(wb, { bookType: 'xlsx', type: 'array' })); await w.close();
      } else { XLSX.writeFile(wb, `Inventario_${MESES[mes-1]}_${anio}.xlsx`); }
    } catch (e: unknown) { if ((e as Error).name !== 'AbortError') toast.error((e as Error).message); }
  }, [filteredPanel, mes, anio]);

  const handleExpandPanel = useCallback(async (id: number) => {
    setExpandedPanel(prev => {
      const n = new Set(prev);
      if (n.has(id)) {
        n.delete(id);
      } else {
        n.add(id);
        if (!historicoData[id] && !loadingHistorico[id]) {
          setLoadingHistorico(p => ({ ...p, [id]: true }));
          fetchHistoricoConsumo(id).then(dict => {
            const keys = Object.keys(dict).sort();
            const arr = keys.map(k => {
              const [, m] = k.split('-');
              return { name: MESES[Number(m)-1].substring(0,3), kg: dict[k] };
            });
            setHistoricoData(p => ({ ...p, [id]: arr }));
          }).catch(e => {
            toast.error("Error cargando historial: " + e.message);
          }).finally(() => {
            setLoadingHistorico(p => ({ ...p, [id]: false }));
          });
        }
        
        if (!lotesActivos[id] && !loadingLotes[id]) {
          setLoadingLotes(p => ({ ...p, [id]: true }));
          fetchLotesActivos(id).then(data => {
            setLotesActivos(p => ({ ...p, [id]: data || [] }));
          }).catch(e => {
            toast.error("Error cargando lotes: " + e.message);
          }).finally(() => {
            setLoadingLotes(p => ({ ...p, [id]: false }));
          });
        }
      }
      return n;
    });
  }, [historicoData, loadingHistorico, lotesActivos, loadingLotes]);

  const handleExpandTraslado = useCallback(async (id: number) => {
    setExpandedTraslados(prev => {
      const n = new Set(prev);
      if (n.has(id)) {
        n.delete(id);
      } else {
        n.add(id);
        if (!trasladoLotesData[id] && !loadingTrasladoLotes[id]) {
          setLoadingTrasladoLotes(p => ({ ...p, [id]: true }));
          fetchTrasladoLotes(id).then(data => {
            setTrasladoLotesData(p => ({ ...p, [id]: data || [] }));
          }).catch(e => {
            toast.error("Error cargando lotes del traslado: " + e.message);
          }).finally(() => {
            setLoadingTrasladoLotes(p => ({ ...p, [id]: false }));
          });
        }
      }
      return n;
    });
  }, [trasladoLotesData, loadingTrasladoLotes]);

  const refreshLotesIfExpanded = useCallback(async (material_id: number) => {
    if (expandedPanel.has(material_id)) {
      try {
        const data = await fetchLotesActivos(material_id);
        setLotesActivos(p => ({ ...p, [material_id]: data || [] }));
      } catch (e) {
        console.error("Error refreshing lotes:", e);
      }
    }
  }, [expandedPanel]);

  const handleSaveEntrada = useCallback(async () => {
    if (!entradaForm.material_id || !entradaForm.cantidad_kg) return toast.error('Material y cantidad son requeridos');
    if (!entradaForm.fecha_vencimiento) return toast.error('La fecha de vencimiento es obligatoria');

    // Validar < 30 dias
    const diffTime = new Date(entradaForm.fecha_vencimiento).getTime() - new Date().getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    if (diffDays < 30) {
      if (!window.confirm('Atención: El producto que intentas agregar vence en menos de 30 días. ¿Estás seguro de continuar?')) {
        return;
      }
    }

    try {
      setLoadingEntradas(true);
      if (entradaForm.id) {
        await updateInventarioEntrada(entradaForm.id, {
          fecha: entradaForm.fecha, material_id: Number(entradaForm.material_id),
          cantidad_kg: Number(entradaForm.cantidad_kg), observaciones: entradaForm.observaciones || undefined,
          fecha_vencimiento: entradaForm.fecha_vencimiento || undefined
        });
        toast.success('Entrada actualizada');
      } else {
        await createInventarioEntrada({
          fecha: entradaForm.fecha, material_id: Number(entradaForm.material_id),
          cantidad_kg: Number(entradaForm.cantidad_kg), observaciones: entradaForm.observaciones || undefined,
          fecha_vencimiento: entradaForm.fecha_vencimiento || undefined
        });
        toast.success('Entrada registrada');
      }
      
      const matId = Number(entradaForm.material_id);
      setShowEntradaForm(false);
      setEntradaForm({ id: 0, fecha: now.toISOString().split('T')[0], material_id: '', cantidad_kg: '', observaciones: '', fecha_vencimiento: '' });
      loadEntradas();
      await refreshLotesIfExpanded(matId);
    } catch (e: unknown) { toast.error((e as Error).message); }
    finally { setLoadingEntradas(false); }
  }, [entradaForm, loadEntradas, now, refreshLotesIfExpanded]);

  const handleDeleteEntrada = useCallback(async (id: number) => {
    try { 
      const entradaToDelete = entradas.find(e => e.id === id);
      await deleteInventarioEntrada(id); 
      toast.success('Entrada eliminada'); 
      loadEntradas(); 
      if (entradaToDelete) {
        await refreshLotesIfExpanded(entradaToDelete.material_id);
      }
    } catch (e: unknown) { toast.error((e as Error).message); }
  }, [loadEntradas, entradas, refreshLotesIfExpanded]);

  const filteredEntradas = useMemo(() => {
    if (!entradasSearch) return entradas;
    const s = entradasSearch.toLowerCase();
    return entradas.filter((e: InventarioEntradaRow) => (e.inventario_materiales?.nombre || '').toLowerCase().includes(s) || String(e.inventario_materiales?.codigo || '').includes(s));
  }, [entradas, entradasSearch]);

  const handleSaveTraslado = useCallback(async () => {
    if (!trasladoForm.cliente_op) return toast.error('El Motivo / Referencia es requerido');
    const validMats = trasladoForm.materiales.filter(m => m.material_id && m.cantidad_kg);
    if (validMats.length === 0) return toast.error('Debes agregar al menos un material con cantidad');

    try {
      if (trasladoForm.id) {
        if (validMats.length > 1) return toast.error("Al editar un registro existente, no puedes añadir múltiples filas. Edita solo el material que estabas modificando, o bórralo y agrégalo de nuevo.");
        await updateInventarioTraslado(trasladoForm.id, {
          fecha: trasladoForm.fecha,
          cliente_op: trasladoForm.cliente_op,
          material_id: Number(validMats[0].material_id),
          cantidad_kg: Number(validMats[0].cantidad_kg),
          semana: Number(trasladoForm.semana),
          observaciones: trasladoForm.observaciones || undefined
        });
        toast.success(`Ajuste actualizado`);
      } else {
        const payload = validMats.map(m => ({
          fecha: trasladoForm.fecha,
          cliente_op: trasladoForm.cliente_op,
          material_id: Number(m.material_id),
          cantidad_kg: Number(m.cantidad_kg),
          semana: Number(trasladoForm.semana),
          mes,
          anio,
          observaciones: trasladoForm.observaciones || undefined
        }));
        await createInventarioTrasladoBatch(payload);
        toast.success(`${payload.length} salidas registradas`);
      }
      setShowTrasladoForm(false);
      setTrasladoForm({ id: 0, fecha: now.toISOString().split('T')[0], cliente_op: '', semana: '1', observaciones: '', materiales: [{ material_id: '', cantidad_kg: '' }] });
      loadTraslados();
    } catch (e: unknown) { toast.error((e as Error).message); }
  }, [trasladoForm, mes, anio, loadTraslados, now]);

  const handleDeleteTraslado = useCallback(async (id: number) => {
    try { await deleteInventarioTraslado(id); toast.success('Registro eliminado'); loadTraslados(); } catch (e: unknown) { toast.error((e as Error).message); }
  }, [loadTraslados]);

  const filteredTraslados = useMemo(() => {
    if (!trasladosSearch) return traslados;
    const s = trasladosSearch.toLowerCase();
    return traslados.filter((t: InventarioTrasladoRow) => (t.inventario_materiales?.nombre || '').toLowerCase().includes(s) || (t.cliente_op || '').toLowerCase().includes(s));
  }, [traslados, trasladosSearch]);

  const handleSaveMat = useCallback(async () => {
    if (!matForm.codigo || !matForm.nombre) return toast.error('Código y nombre son requeridos');
    try {
      await upsertInventarioMaterial({ 
        id: matForm.id || undefined, 
        codigo: Number(matForm.codigo), 
        nombre: matForm.nombre, 
        tipo: 'Materia Prima', 
        udm: 'kg', 
        peso_kg: matForm.peso_kg ? Number(matForm.peso_kg) : undefined,
        min_cobertura_semanas: matForm.min_cobertura_semanas ? Number(matForm.min_cobertura_semanas) : 2
      });
      toast.success('Material guardado');
      setShowMatForm(false);
      setMatForm({ id: 0, codigo: '', nombre: '', peso_kg: '', min_cobertura_semanas: '2' });
      loadMateriales();
    } catch (e: unknown) { toast.error((e as Error).message); }
  }, [matForm, loadMateriales]);

  const handleDeleteMat = useCallback(async (id: number) => {
    try { await deleteInventarioMaterial(id); toast.success('Material eliminado'); loadMateriales(); } catch (e: unknown) { toast.error((e as Error).message); }
  }, [loadMateriales]);

  const handleImportMateriales = useCallback(async (e: React.ChangeEvent<HTMLInputElement>, fileRef: React.RefObject<HTMLInputElement | null>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const ab = await file.arrayBuffer();
      const wb = XLSX.read(ab);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(ws);
      let count = 0;
      for (const r of rows) {
        const codigo = Number(r['CODIGO'] || r['codigo'] || r['Código']);
        const nombre = String(r['MATERIAL'] || r['material'] || r['nombre'] || r['NOMBRE'] || r['Nombre'] || '').trim();
        const pesoKey = Object.keys(r).find(k => k.toUpperCase().includes('PESO'));
        const peso = pesoKey ? Number(r[pesoKey]) || null : null;
        if (!codigo || !nombre) continue;
        await upsertInventarioMaterial({ codigo, nombre, tipo: 'Materia Prima', udm: 'kg', peso_kg: peso ?? undefined, min_cobertura_semanas: 2 });
        count++;
      }
      toast.success(`${count} materiales importados`);
      loadMateriales();
    } catch (err: unknown) { toast.error((err as Error).message); }
    if (fileRef && fileRef.current) fileRef.current.value = '';
  }, [loadMateriales]);

  const filteredMat = useMemo(() => {
    if (!matSearch) return materiales;
    const s = matSearch.toLowerCase();
    return materiales.filter((m: InventarioMaterial) => m.nombre.toLowerCase().includes(s) || String(m.codigo).includes(s));
  }, [materiales, matSearch]);

  const exportMatExcel = useCallback(async () => {
    const rows = filteredMat.map(m => ({
      'Código': m.codigo,
      'Nombre del Material': m.nombre,
      'Peso (kg/ud)': m.peso_kg ?? '',
      'Mín. Cobertura (Sem)': m.min_cobertura_semanas ?? 2
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Catálogo');
    try {
      if ('showSaveFilePicker' in window) {
        const win = window as unknown as { showSaveFilePicker: (options: unknown) => Promise<{ createWritable: () => Promise<{ write: (data: unknown) => Promise<void>; close: () => Promise<void> }> }> };
        const h = await win.showSaveFilePicker({ suggestedName: `Catalogo_Materiales_${MESES[mes-1]}_${anio}.xlsx`, types: [{ description: 'Excel', accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] } }] });
        const w = await h.createWritable(); await w.write(XLSX.write(wb, { bookType: 'xlsx', type: 'array' })); await w.close();
      } else { XLSX.writeFile(wb, `Catalogo_Materiales_${MESES[mes-1]}_${anio}.xlsx`); }
    } catch (e: unknown) { if ((e as Error).name !== 'AbortError') toast.error((e as Error).message); }
  }, [filteredMat, mes, anio]);

  const handleStockChange = useCallback((idx: number, field: string, val: string) => {
    setStockRows(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: val, dirty: true };
      return next;
    });
  }, []);

  const handleSaveStock = useCallback(async () => {
    const rows = stockRows.filter(r => r.dirty && (r.stock_kg !== '' || r.consumo_estimado_mes !== ''));
    if (rows.length === 0) return toast.info('No hay cambios para guardar');
    try {
      const payload = rows.map(r => ({
        material_id: r.material_id, mes, anio,
        stock_kg: Number(r.stock_kg) || 0,
        consumo_estimado_mes: Number(r.consumo_estimado_mes) || 0,
      }));
      await upsertStockInicialBatch(payload);
      toast.success(`Stock inicial guardado para ${rows.length} materiales`);
      loadStockInicial();
    } catch (e: unknown) { toast.error((e as Error).message); }
  }, [stockRows, mes, anio, loadStockInicial]);

  const handleImportStock = useCallback(async (e: React.ChangeEvent<HTMLInputElement>, fileRef: React.RefObject<HTMLInputElement | null>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const ab = await file.arrayBuffer();
      const wb = XLSX.read(ab);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(ws);
      const matMap: Record<number, number> = {};
      for (const m of materiales) matMap[m.codigo] = m.id;
      const payload: { material_id: number; stock_kg: number; consumo_estimado_mes: number; mes: number; anio: number }[] = [];
      for (const r of rows) {
        const codigo = Number(r['CODIGO'] || r['Código'] || r['codigo']);
        const matId = matMap[codigo];
        if (!matId) continue;
        const stockKey = Object.keys(r).find(k => k.toUpperCase().includes('STOCK'));
        const consumoKey = Object.keys(r).find(k => k.toUpperCase().includes('CONSUMO') && k.toUpperCase().includes('ESTIMADO'));
        payload.push({
          material_id: matId, mes, anio,
          stock_kg: stockKey ? Number(r[stockKey]) || 0 : 0,
          consumo_estimado_mes: consumoKey ? Number(r[consumoKey]) || 0 : 0,
        });
      }
      if (payload.length > 0) {
        await upsertStockInicialBatch(payload);
        toast.success(`${payload.length} registros de stock importados`);
        loadStockInicial();
      } else {
        toast.error('No se encontraron datos válidos');
      }
    } catch (err: unknown) { toast.error((err as Error).message); }
    if (fileRef && fileRef.current) fileRef.current.value = '';
  }, [materiales, mes, anio, loadStockInicial]);

  const filteredStock = useMemo(() => {
    if (!stockSearch) return stockRows;
    const s = stockSearch.toLowerCase();
    return stockRows.filter((r) => r.nombre.toLowerCase().includes(s) || String(r.codigo).includes(s));
  }, [stockRows, stockSearch]);

  const dirtyCount = useMemo(() => stockRows.filter(r => r.dirty).length, [stockRows]);

  return {
    activeTab, setActiveTab,
    mes, setMes, anio, setAnio,
    
    loadingPanel, panelSearch, setPanelSearch, expandedPanel, 
    historicoData, loadingHistorico, lotesActivos, loadingLotes,
    kpiFilter, setKpiFilter,
    panelKpis, filteredPanel, exportPanelExcel, handleExpandPanel, loadPanel,

    loadingEntradas, showEntradaForm, setShowEntradaForm, entradaForm, setEntradaForm,
    entradasSearch, setEntradasSearch, entradasPage, setEntradasPage,
    filteredEntradas, handleSaveEntrada, handleDeleteEntrada,

    loadingTraslados, showTrasladoForm, setShowTrasladoForm, trasladoForm, setTrasladoForm,
    trasladosSearch, setTrasladosSearch, trasladosPage, setTrasladosPage,
    expandedTraslados, handleExpandTraslado, trasladoLotesData, loadingTrasladoLotes,
    filteredTraslados, handleSaveTraslado, handleDeleteTraslado,

    materiales, loadingMat, showMatForm, setShowMatForm, matForm, setMatForm,
    matSearch, setMatSearch, matPage, setMatPage,
    filteredMat, handleSaveMat, handleDeleteMat, handleImportMateriales, exportMatExcel,

    stockRows, loadingStock, stockSearch, setStockSearch,
    filteredStock, dirtyCount, handleStockChange, handleSaveStock, handleImportStock,
  };
}
