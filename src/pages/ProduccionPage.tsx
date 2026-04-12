import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Plus, Search, Edit2, Trash2, Download, Upload, ChevronLeft, ClipboardList, Lock, Unlock, Trophy } from 'lucide-react';
import supabase, { registrarAuditoria } from '../lib/supabase';
import * as XLSX from 'xlsx';
import { LineChart, Line, BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer } from 'recharts';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Navigate } from 'react-router-dom';
import { usePermissions } from '../lib/permissions';

const PAGE_SIZE = 100;
const META_BULTOS = 5500;
const META_BACHES = 108;

export default function ProduccionPage({ isAdmin = false }: { isAdmin?: boolean }) {
  const { canView, canEdit } = usePermissions('produccion');

  // Tabs & Turno Report
  const [activeTab, setActiveTab] = useState<'registros' | 'reporte' | 'estado_ops' | 'reporte_explosion'>('registros');
  const [reportMode, setReportMode] = useState<'lista' | 'nuevo' | 'detalle' | 'editar_detalle'>('lista');
  const [historialReportes, setHistorialReportes] = useState<any[]>([]);
  const [reporteFecha, setReporteFecha] = useState(new Date().toISOString().split('T')[0]);
  const [reporteTurno, setReporteTurno] = useState('Diurno');
  const [reporteFormData, setReporteFormData] = useState({ supervisor: '', dosificador: '', baches_dosificados: '', observaciones: '' });
  const [reporteSavedInfo, setReporteSavedInfo] = useState<any>(null);

  // Data & loading
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // CRUD state
  const [showForm, setShowForm] = useState(false);
  const [formMode, setFormMode] = useState<'crear' | 'editar'>('crear');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);

  // Import state
  const [importing, setImporting] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-filled OP info
  const [opInfo, setOpInfo] = useState<{ alimento: string; cliente: string; programado: number; acumulado: number; pendiente: number; bachesProgramados: number; bachesAcumulados: number; bachesPendiente: number }>({ alimento: '', cliente: '', programado: 0, acumulado: 0, pendiente: 0, bachesProgramados: 0, bachesAcumulados: 0, bachesPendiente: 0 });

  // Masters for dropdowns
  const [lotes, setLotes] = useState<any[]>([]);

  // Search & filters
  const [searchTerm, setSearchTerm] = useState('');
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
  const [mostrarSoloPendientes, setMostrarSoloPendientes] = useState(true);
  const [opsSearchTerm, setOpsSearchTerm] = useState('');
  const [opColumnFilters, setOpColumnFilters] = useState<Record<string, string>>({});

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [opCurrentPage, setOpCurrentPage] = useState(1);
  const OP_PAGE_SIZE = 100;

  // Export range UI
  const [showExportRange, setShowExportRange] = useState(false);
  const [exportFechaDesde, setExportFechaDesde] = useState('');
  const [exportFechaHasta, setExportFechaHasta] = useState('');
  const [exportOpDesde, setExportOpDesde] = useState('');
  const [exportOpHasta, setExportOpHasta] = useState('');

  // Report filter UI
  const [reportFilterDesde, setReportFilterDesde] = useState('');
  const [reportFilterHasta, setReportFilterHasta] = useState('');

  // Explosion Report UI
  const [explosionDesde, setExplosionDesde] = useState(new Date().toISOString().split('T')[0]);
  const [explosionHasta, setExplosionHasta] = useState(new Date().toISOString().split('T')[0]);
  const [explosionLoading, setExplosionLoading] = useState(false);
  const [explosionData, setExplosionData] = useState<any[]>([]);
  const [explosionDetalle, setExplosionDetalle] = useState<any[]>([]);
  const [explosionOps, setExplosionOps] = useState<any[]>([]);

  // Fetch masters & data
  useEffect(() => {
    fetchMaestros();
    fetchData();
  }, []);

  const fetchMaestros = async () => {
    const { data: l } = await supabase.from('programacion').select('lote, num_baches, bultos_programados, maestro_alimentos(descripcion), maestro_clientes(nombre)').order('fecha', { ascending: false }).limit(10000);
    if (l) setLotes(l);
  };

  const fetchData = async () => {
    setLoading(true);
    const { data: rawData, error } = await supabase
      .from('produccion')
      .select(`
        id, fecha_produccion, turno, lote, bultos_entregados, baches_entregados, observaciones,
        programacion(fecha, codigo_sap, maestro_alimentos(descripcion, categoria), maestro_clientes(nombre))
      `)
      .order('fecha_produccion', { ascending: false })
      .limit(10000);
    if (!error && rawData) {
      const processed = rawData.map(item => {
        const rawProg = (item as any).programacion;
        const prog = Array.isArray(rawProg) ? rawProg[0] : (rawProg || {});
        const rawAlimento = prog.maestro_alimentos;
        const alimentoInfo = Array.isArray(rawAlimento) ? rawAlimento[0] : (rawAlimento || {});
        const rawCliente = prog.maestro_clientes;
        const clienteInfo = Array.isArray(rawCliente) ? rawCliente[0] : (rawCliente || {});
        
        return {
          id: item.id,
          fecha_produccion: item.fecha_produccion,
          turno: item.turno || 'Diurno',
          lote: item.lote,
          fecha_programa: prog.fecha || '-',
          codigo_sap: prog.codigo_sap || '-',
          alimento: alimentoInfo.descripcion || 'Sin alimento',
          categoria: alimentoInfo.categoria || 'Sin Categoría',
          cliente: clienteInfo.nombre || 'Sin cliente',
          baches: (item as any).baches_entregados || 0,
          bultos: item.bultos_entregados,
          kg: (item.bultos_entregados || 0) * 40,
          observaciones: item.observaciones,
        };
      });
      setData(processed);
    }
    setLoading(false);
  };

  const fetchHistorialReportes = useCallback(async () => {
    const { data: reportes } = await supabase.from('reportes_turno').select('*').order('fecha', { ascending: false });
    if (reportes) setHistorialReportes(reportes);
  }, []);

  useEffect(() => {
    if (canView) {
      if (activeTab === 'reporte') {
        fetchHistorialReportes();
      }
    }
  }, [activeTab, fetchHistorialReportes, canView]);

  if (!canView) return <Navigate to="/" replace />;

  // Check if a report exists dynamically when searching by date/shift in NEW mode
  useEffect(() => {
    if (reportMode === 'nuevo') {
      const existing = historialReportes.find(r => r.fecha === reporteFecha && r.turno === reporteTurno);
      if (existing) {
        setReporteSavedInfo(existing);
      } else {
        setReporteSavedInfo(null);
      }
    }
  }, [reporteFecha, reporteTurno, reportMode, historialReportes]);

  const currentTotalBultos = useMemo(() => {
    const turnData = data.filter(d => d.fecha_produccion === reporteFecha && d.turno === reporteTurno);
    const opsMap = new Map<string, any>();
    turnData.forEach(r => {
      if (!opsMap.has(String(r.lote))) {
        opsMap.set(String(r.lote), { ...r, sum: 0 });
      }
      opsMap.get(String(r.lote)).sum += r.bultos;
    });
    const uniqueOps = Array.from(opsMap.values());
    const sum = uniqueOps.reduce((s, o) => s + o.sum, 0);
    return sum;
  }, [data, reporteFecha, reporteTurno]);

  const handleSaveReporte = async () => {
    if (!reporteFormData.supervisor || !reporteFormData.dosificador) {
      alert("Por favor completa los nombres de supervisor y dosificador.");
      return;
    }
    if (reportMode === 'nuevo' && reporteSavedInfo) {
      alert("Ya existe un reporte para esta fecha y turno. Edita el existente desde el historial.");
      return;
    }
    const payload = {
      fecha: reporteFecha,
      turno: reporteTurno,
      supervisor: reporteFormData.supervisor?.toUpperCase() || null,
      dosificador: reporteFormData.dosificador?.toUpperCase() || null,
      baches_dosificados: reporteFormData.baches_dosificados ? Number(reporteFormData.baches_dosificados) : null,
      total_bultos: currentTotalBultos,
      observaciones: reporteFormData.observaciones
    };
    try {
      if (reportMode === 'editar_detalle' && reporteSavedInfo?.id) {
        await supabase.from('reportes_turno').update(payload).eq('id', reporteSavedInfo.id);
        await registrarAuditoria('UPDATE', 'Producción', `Se actualizó el reporte de turno ${payload.fecha}`);
        alert('Reporte actualizado correctamente.');
      } else {
        await supabase.from('reportes_turno').insert([payload]);
        await registrarAuditoria('CREATE', 'Producción', `Se guardó el reporte de turno ${payload.fecha}`);
        alert('Reporte guardado correctamente.');
      }
      setReportMode('lista');
      fetchHistorialReportes();
    } catch (err: any) {
      alert('Error al guardar reporte: Asegúrate de haber ejecutado el nuevo script SQL para bultos_totales. Detalles -> ' + err.message);
    }
  };

  const handleDeleteReporte = async () => {
    if (!reporteSavedInfo?.id) return;
    if (!window.confirm('¿Estás seguro de que deseas ELIMINAR este reporte? Esta acción no se puede deshacer.')) return;
    
    try {
      const { error } = await supabase.from('reportes_turno').delete().eq('id', reporteSavedInfo.id);
      if (error) throw error;
      await registrarAuditoria('DELETE', 'Producción', `Se eliminó el reporte de turno ${reporteSavedInfo?.fecha}`);
      alert('Reporte eliminado correctamente.');
      setReportMode('lista');
      fetchHistorialReportes();
    } catch (err: any) {
      alert('Error al eliminar reporte: ' + err.message);
    }
  };

  const unlockReport = () => {
    if (window.confirm("Este reporte ya se guardó previamente. ¿Estás seguro de que deseas desbloquearlo para realizar ediciones?")) {
      setReportMode('editar_detalle');
    }
  };

  // ── Import / Form Handlers ──
  const handleOpenForm = (item?: any) => {
    if (!canEdit) return;
    if (item) {
      setFormMode('editar');
      setEditingId(item.id);
      setFormData({
        fecha_produccion: item.fecha_produccion,
        turno: item.turno,
        lote: item.lote,
        baches_entregados: item.baches,
        bultos_entregados: item.bultos,
        observaciones: item.observaciones,
      });
    } else {
      setFormMode('crear');
      setEditingId(null);
      setFormData({ fecha_produccion: new Date().toISOString().split('T')[0], turno: 'Diurno', baches_entregados: '', bultos_entregados: '' });
    }
    setShowForm(true);
  };

  const handleCloseForm = useCallback(() => {
    setShowForm(false);
    setFormData({});
    setEditingId(null);
  }, []);

  useEffect(() => {
    const loadOpInfo = async () => {
      if (!formData.lote) {
        setOpInfo({ alimento: '', cliente: '', programado: 0, acumulado: 0, pendiente: 0, bachesProgramados: 0, bachesAcumulados: 0, bachesPendiente: 0 });
        return;
      }
      const loteObj = lotes.find(l => String(l.lote) === String(formData.lote));
      const alimentoDesc = loteObj?.maestro_alimentos ? (Array.isArray(loteObj.maestro_alimentos) ? loteObj.maestro_alimentos[0]?.descripcion : loteObj.maestro_alimentos?.descripcion) : '';
      const clienteNombre = loteObj?.maestro_clientes ? (Array.isArray(loteObj.maestro_clientes) ? loteObj.maestro_clientes[0]?.nombre : loteObj.maestro_clientes?.nombre) : '';
      const programado = loteObj?.bultos_programados || 0;
      const bachesProgramados = loteObj?.num_baches || 0;

      const query = await supabase.from('produccion').select('baches_entregados, bultos_entregados, id').eq('lote', formData.lote);
      let acumulado = 0;
      let bachesAcumulados = 0;
      if (query.data) {
        acumulado = query.data.filter(r => r.id !== editingId).reduce((sum, r) => sum + (r.bultos_entregados || 0), 0);
        bachesAcumulados = query.data.filter(r => r.id !== editingId).reduce((sum, r) => sum + (r.baches_entregados || 0), 0);
      }
      
      setOpInfo({
        alimento: alimentoDesc || 'No encontrado',
        cliente: clienteNombre || 'Sin asignar',
        programado,
        acumulado,
        pendiente: programado - acumulado,
        bachesProgramados,
        bachesAcumulados,
        bachesPendiente: bachesProgramados - bachesAcumulados
      });
    };
    if (showForm) loadOpInfo();
  }, [formData.lote, showForm, lotes, editingId]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    const target = e.target as any;
    let val: any = value;
    if (target.type === 'number') val = value ? Number(value) : null;
    if (value === '') val = null;
    setFormData((prev: any) => ({ ...prev, [name]: val }));
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit) return;
    setSaving(true);
    if (!formData.fecha_produccion || !formData.turno || !formData.lote || !formData.baches_entregados || !formData.bultos_entregados) {
      alert("Faltan campos obligatorios");
      setSaving(false);
      return;
    }

    const bultos = Number(formData.bultos_entregados);
    const baches = Number(formData.baches_entregados);

    if (opInfo.bachesProgramados > 0) {
      if (opInfo.bachesAcumulados + baches > opInfo.bachesProgramados) {
        alert(`No puedes entregar esta cantidad porque supera los baches programados para la OP.\nBaches Programados: ${opInfo.bachesProgramados}\nBaches Acumulados previamente: ${opInfo.bachesAcumulados}\nTu entrega de ${baches} daría un total de ${opInfo.bachesAcumulados + baches} baches que excede el límite.`);
        setSaving(false);
        return;
      }
    }

    if (opInfo.bachesProgramados > 0 && opInfo.programado > 0 && baches > 0) {
      const yieldPerBatch = opInfo.programado / opInfo.bachesProgramados;
      const expectedSacks = Math.round(yieldPerBatch * baches);
      if (Math.abs(bultos - expectedSacks) > expectedSacks * 0.1) {
        if (!window.confirm(`⚠️ ADVERTENCIA ANORMAL\nEsta OP rinde aprox. ${Math.round(yieldPerBatch)} bultos por bache.\nAl entregar ${baches} baches, se esperaban ~${expectedSacks} bultos totales, pero reportaste ${bultos} bultos.\n\n¿Estás completamente seguro de que este valor desfasado es correcto?`)) {
          setSaving(false);
          return;
        }
      }
    }

    try {
      if (formMode === 'crear') {
        const { error } = await supabase.from('produccion').insert([formData]);
        if (error) throw error;
        await registrarAuditoria('CREATE', 'Producción', `Se registró entrega de ${formData.baches_entregados} baches (${formData.bultos_entregados} bultos) para el lote ${formData.lote}`);
      } else {
        const { error } = await supabase.from('produccion').update(formData).eq('id', editingId);
        if (error) throw error;
        await registrarAuditoria('UPDATE', 'Producción', `Se actualizó registro de entrega del lote ${formData.lote}`);
      }
      handleCloseForm();
      fetchData();
    } catch (err: any) {
      alert(`Error al guardar: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = (id: number) => {
    if (!canEdit) return;
    setDeleteConfirm(id);
  };

  const handleDelete = async () => {
    if (!canEdit || !deleteConfirm) return;
    const { error } = await supabase.from('produccion').delete().eq('id', deleteConfirm);
    if (error) {
      alert('No se pudo eliminar: este registro puede estar relacionado con otras tablas.');
    } else {
      await registrarAuditoria('DELETE', 'Producción', `Se eliminó un registro de entrega de producción`);
      fetchData();
    }
    setDeleteConfirm(null);
  };

  // Filters & Excel Logic
  const handleColFilter = useCallback((key: string, value: string) => {
    setColumnFilters(prev => ({ ...prev, [key]: value }));
    setCurrentPage(1);
  }, []);

  const filtered = useMemo(() => {
    const st = searchTerm.toLowerCase();
    return data.filter(item => {
      if (st) {
        const str = `${item.fecha_produccion} ${item.turno} ${item.lote} ${item.alimento} ${item.categoria} ${item.observaciones || ''}`.toLowerCase();
        if (!str.includes(st)) return false;
      }
      for (const key of Object.keys(columnFilters)) {
        const fv = columnFilters[key];
        if (!fv) continue;
        const val = String(item[key] || '').toLowerCase();
        if (!val.includes(fv.toLowerCase())) return false;
      }
      return true;
    });
  }, [data, searchTerm, columnFilters]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, currentPage]);

  const opsResumen = useMemo(() => {
    return lotes.map(l => {
      const opsData = data.filter(d => String(d.lote) === String(l.lote));
      const bachesAcumulados = opsData.reduce((sum, current) => sum + (current.baches || 0), 0);
      const bultosAcumulados = opsData.reduce((sum, current) => sum + (current.bultos || 0), 0);
      const programadoBaches = l.num_baches || 0;
      const pendienteBaches = programadoBaches - bachesAcumulados;
      let porcentajeBaches = 0;
      if (programadoBaches > 0) {
        porcentajeBaches = (bachesAcumulados / programadoBaches) * 100;
      } else if (bachesAcumulados > 0) {
        porcentajeBaches = 100;
      }

      const programadoBultos = l.bultos_programados || 0;
      const pendienteBultos = programadoBultos - bultosAcumulados;

      const rawAlimento = l.maestro_alimentos;
      const alimento = Array.isArray(rawAlimento) ? rawAlimento[0]?.descripcion : rawAlimento?.descripcion || '';
      
      const rawCliente = l.maestro_clientes;
      const cliente = Array.isArray(rawCliente) ? rawCliente[0]?.nombre : rawCliente?.nombre || '';

      return {
        lote: l.lote,
        alimento,
        cliente,
        programadoBaches,
        acumuladoBaches: bachesAcumulados,
        pendienteBaches,
        porcentaje: porcentajeBaches,
        programado: programadoBultos,
        acumulado: bultosAcumulados,
        pendiente: pendienteBultos,
      };
    }).filter(op => op.programado > 0 || op.acumulado > 0 || op.programadoBaches > 0);
  }, [lotes, data]);

  const handleOpColFilter = useCallback((key: string, value: string) => {
    setOpColumnFilters(prev => ({ ...prev, [key]: value }));
  }, []);

  const opDatalistValues = useMemo(() => {
    const cols = ['lote', 'alimento', 'cliente'];
    const result: Record<string, string[]> = {};
    for (const col of cols) {
      const set = new Set<string>();
      opsResumen.forEach(row => {
        const v = (row as any)[col];
        if (v != null && v !== '') set.add(String(v));
      });
      result[col] = Array.from(set);
    }
    return result;
  }, [opsResumen]);

  const renderOpFilterInput = useCallback((colKey: string) => {
    const listId = `dl-op-${colKey}`;
    return (
      <div style={{ marginTop: '6px' }}>
        <input
          type="text"
          list={listId}
          className="col-filter-input"
          placeholder="Filtrar..."
          value={opColumnFilters[colKey] || ''}
          onChange={e => handleOpColFilter(colKey, e.target.value)}
        />
        <datalist id={listId}>
          {(opDatalistValues[colKey] || []).slice(0, 200).map(val => (
            <option key={val} value={val} />
          ))}
        </datalist>
      </div>
    );
  }, [opColumnFilters, opDatalistValues, handleOpColFilter]);

  const opsParaMostrar = useMemo(() => {
    let filteredOps = opsResumen;
    if (mostrarSoloPendientes) {
      filteredOps = filteredOps.filter(op => op.acumuladoBaches < op.programadoBaches);
    }
    if (opsSearchTerm) {
      const q = opsSearchTerm.toLowerCase();
      filteredOps = filteredOps.filter(op => 
        String(op.lote).toLowerCase().includes(q) || 
        op.alimento.toLowerCase().includes(q) ||
        op.cliente.toLowerCase().includes(q)
      );
    }
    for (const key of Object.keys(opColumnFilters)) {
      const fv = opColumnFilters[key];
      if (!fv) continue;
      filteredOps = filteredOps.filter(op => {
        const val = String((op as any)[key] || '').toLowerCase();
        return val.includes(fv.toLowerCase());
      });
    }
    return filteredOps;
  }, [opsResumen, mostrarSoloPendientes, opsSearchTerm, opColumnFilters]);

  useEffect(() => {
    setOpCurrentPage(1);
  }, [mostrarSoloPendientes, opsSearchTerm, opColumnFilters]);

  const opTotalPages = Math.ceil(opsParaMostrar.length / OP_PAGE_SIZE);
  const paginatedOps = useMemo(() => {
    const start = (opCurrentPage - 1) * OP_PAGE_SIZE;
    return opsParaMostrar.slice(start, start + OP_PAGE_SIZE);
  }, [opsParaMostrar, opCurrentPage]);

  const datalistValues = useMemo(() => {
    const cols = ['fecha_produccion', 'turno', 'lote', 'alimento', 'categoria', 'observaciones'];
    const result: Record<string, string[]> = {};
    for (const col of cols) {
      const set = new Set<string>();
      data.forEach(row => {
        const v = (row as any)[col];
        if (v != null && v !== '') set.add(String(v));
      });
      result[col] = Array.from(set);
    }
    return result;
  }, [data]);

  const renderFilterInput = useCallback((colKey: string) => {
    const listId = `dl-prod-${colKey}`;
    return (
      <div style={{ marginTop: '6px' }}>
        <input
          type="text"
          list={listId}
          className="col-filter-input"
          placeholder="Filtrar..."
          value={columnFilters[colKey] || ''}
          onChange={e => handleColFilter(colKey, e.target.value)}
        />
        <datalist id={listId}>
          {(datalistValues[colKey] || []).slice(0, 200).map(val => (
            <option key={val} value={val} />
          ))}
        </datalist>
      </div>
    );
  }, [columnFilters, datalistValues, handleColFilter]);

  const exportToExcel = async () => { /* Export logic intact */
     let tableData = [...filtered];
    if (exportFechaDesde) tableData = tableData.filter(r => r.fecha_produccion >= exportFechaDesde);
    if (exportFechaHasta) tableData = tableData.filter(r => r.fecha_produccion <= exportFechaHasta);
    if (exportOpDesde) tableData = tableData.filter(r => Number(r.lote) >= Number(exportOpDesde));
    if (exportOpHasta) tableData = tableData.filter(r => Number(r.lote) <= Number(exportOpHasta));
    if (tableData.length === 0) { alert('No hay datos en ese rango para exportar.'); return; }
    const dataForExcel = tableData.map(row => ({
      'Fecha Producción': row.fecha_produccion,
      'Turno': row.turno,
      'Lote': row.lote,
      'Alimento': row.alimento,
      'Categoría': row.categoria,
      'Bultos': row.bultos,
      'Kg': row.kg,
      'Observaciones': row.observaciones || ''
    }));
    const ws = XLSX.utils.json_to_sheet(dataForExcel);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'PRODUCCION');
    try {
      if ('showSaveFilePicker' in window) {
        const handle = await (window as any).showSaveFilePicker({ suggestedName: 'Produccion.xlsx', types: [{ description: 'Excel', accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] } }] });
        const writable = await handle.createWritable();
        await writable.write(XLSX.write(wb, { bookType: 'xlsx', type: 'array' }));
        await writable.close();
      } else { XLSX.writeFile(wb, 'Produccion.xlsx'); }
    } catch (_e) { /* user cancelled */ }
  };

  const generarReporteExplosion = async () => {
    setExplosionLoading(true);
    try {
      const { data: prodData, error } = await supabase
        .from('produccion')
        .select(`
          lote, baches_entregados, fecha_produccion, turno,
          programacion:programacion!inner(formula_id, maestro_clientes(nombre), maestro_alimentos(descripcion))
        `)
        .gte('fecha_produccion', explosionDesde)
        .lte('fecha_produccion', explosionHasta);
      if (error) throw error;
      
      const agrupado: Record<number, { baches: number, cliente: string, formula_id: number, alimento: string }> = {};
      const formulaIds = new Set<number>();
      const detallesList: any[] = [];

      for (const p of prodData || []) {
        const prog = Array.isArray(p.programacion) ? p.programacion[0] : (p.programacion || {});
        const fid = prog.formula_id;
        const baches = Number((p as any).baches_entregados || 0);
        if (!fid || baches === 0) continue;
        
        formulaIds.add(fid);
        const cNombre = Array.isArray(prog.maestro_clientes) ? (prog.maestro_clientes as any)[0]?.nombre : (prog.maestro_clientes as any)?.nombre;
        const aNombre = Array.isArray(prog.maestro_alimentos) ? (prog.maestro_alimentos as any)[0]?.descripcion : (prog.maestro_alimentos as any)?.descripcion;
        
        const loteKey = Number(p.lote);
        if (!agrupado[loteKey]) agrupado[loteKey] = { baches: 0, formula_id: fid, cliente: cNombre || 'General', alimento: aNombre || '-' };
        agrupado[loteKey].baches += baches;
        
        detallesList.push({
          fecha: p.fecha_produccion,
          turno: p.turno,
          op: p.lote,
          cliente: cNombre || '-',
          formula: aNombre || '-',
          baches: baches
        });
      }

      setExplosionDetalle(detallesList.sort((a,b) => a.fecha.localeCompare(b.fecha)));

      if (formulaIds.size === 0) {
        setExplosionData([]);
        setExplosionLoading(false);
        return;
      }

      const { data: detalles, error: detErr } = await supabase
        .from('formula_detalle')
        .select(`
          formula_id, cantidad_base, material_id, 
          inventario_materiales!inner(codigo, nombre)
        `)
        .in('formula_id', Array.from(formulaIds));
      if (detErr) throw detErr;

      const consolidado: Record<number, { codigo: string, material: string, totalKg: number, porOP: Record<string, number> }> = {};
      const opsWithFormula = Object.keys(agrupado);

      for (const lote of opsWithFormula) {
        const info = agrupado[Number(lote)];
        const baches = info.baches;
        if (baches <= 0) continue;
        
        const de_f = detalles.filter(d => d.formula_id === info.formula_id);
        for (const d of de_f) {
          const mId = d.material_id;
          const invObj = Array.isArray(d.inventario_materiales) ? d.inventario_materiales[0] : d.inventario_materiales;
          if (!consolidado[mId]) consolidado[mId] = { codigo: (invObj as any)?.codigo || '-', material: (invObj as any)?.nombre || 'Desconocido', totalKg: 0, porOP: {} };
          
          const kg = d.cantidad_base * baches;
          consolidado[mId].totalKg += kg;
          consolidado[mId].porOP[lote] = (consolidado[mId].porOP[lote] || 0) + kg;
        }
      }

      setExplosionData(Object.values(consolidado).sort((a,b) => b.totalKg - a.totalKg));
      setExplosionOps(Object.keys(agrupado).map(k => ({ lote: k, ...agrupado[Number(k)] })));
    } catch(err: any) {
      alert("Error generando explosión: " + err.message);
    }
    setExplosionLoading(false);
  };

  const exportExplosionToExcel = async () => {
    if (!explosionData.length && !explosionDetalle.length) return;
    const wb = XLSX.utils.book_new();

    const flatList: any[] = [];
    for (const op of explosionOps) {
       for (const e of explosionData) {
          const kg = e.porOP[op.lote];
          if (kg > 0) {
             flatList.push({
               'DESCRIPCION ALIMENTO': op.alimento,
               'BACHEZ': op.baches,
               'Código': e.codigo,
               'Materia Prima': e.material,
               'TOTAL KG': kg,
               'OP': Number(op.lote)
             });
          }
       }
    }

    if (flatList.length > 0) {
      const wsFlat = XLSX.utils.json_to_sheet(flatList);
      XLSX.utils.book_append_sheet(wb, wsFlat, 'Explosión de Producción');
    }

    try {
      if ('showSaveFilePicker' in window) {
        const handle = await (window as any).showSaveFilePicker({ suggestedName: `Reporte_Explosion_${explosionDesde}_al_${explosionHasta}.xlsx`, types: [{ description: 'Excel', accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] } }] });
        const writable = await handle.createWritable();
        await writable.write(XLSX.write(wb, { bookType: 'xlsx', type: 'array' }));
        await writable.close();
      } else { XLSX.writeFile(wb, `Reporte_Explosion_${explosionDesde}.xlsx`); }
    } catch (_e) { }
  };

  const exportExplosionToPDF = async () => {
    if (!explosionData.length && !explosionDetalle.length) return;
    try {
      const doc = new jsPDF('landscape');
      doc.setFontSize(18);
      doc.text('Explosión de Consumos y Producción', 14, 20);
      doc.setFontSize(11);
      doc.text(`Periodo evaluado: ${explosionDesde} a ${explosionHasta}`, 14, 28);
      
      let finalY = 35;
      if (explosionDetalle.length > 0) {
        doc.setFontSize(14);
        doc.text('Detalle de Órdenes (Baches)', 14, 34);
        autoTable(doc, {
          startY: 38,
          head: [['Fecha', 'Turno', 'Lote', 'Cliente', 'Baches']],
          body: explosionDetalle.map(e => [e.fecha, e.turno, e.op, e.cliente, e.baches]),
          theme: 'grid',
          headStyles: { fillColor: [25, 118, 210] }
        });
        finalY = (doc as any).lastAutoTable.finalY + 15;
      }

      if (explosionData.length > 0) {
         doc.setFontSize(14);
         doc.text('Consolidado Materiales Estimados', 14, finalY - 4);
         
         const headers = ['Código', 'Materia Prima', ...explosionOps.map(o => `OP ${o.lote}`), 'TOTAL(Kg)'];
         const bodyRows = explosionData.map(e => [
           e.codigo, e.material, 
           ...explosionOps.map(o => (e.porOP[o.lote] || 0).toLocaleString('es-CO', { maximumFractionDigits: 2 })),
           e.totalKg.toLocaleString('es-CO', { maximumFractionDigits: 2 })
         ]);

         autoTable(doc, {
           startY: finalY,
           head: [headers],
           body: bodyRows,
           theme: 'grid',
           headStyles: { fillColor: [46, 125, 50] }
         });
      }

      if ('showSaveFilePicker' in window) {
        const handle = await (window as any).showSaveFilePicker({ suggestedName: `Explosion_${explosionDesde}.pdf`, types: [{ description: 'PDF', accept: { 'application/pdf': ['.pdf'] } }] });
        const writable = await handle.createWritable();
        await writable.write(doc.output('blob'));
        await writable.close();
      } else {
        doc.save(`Explosion_${explosionDesde}.pdf`);
      }
    } catch(err) {
      alert("Error generating PDF");
    }
  };

  const handleImportClick = () => fileInputRef.current?.click();

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!canEdit) return;
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rawRows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });
      if (rawRows.length === 0) throw new Error('El archivo está vacío.');

      const mapRow = (row: any) => {
        const keys = Object.keys(row);
        const find = (patterns: string[]) => {
          const key = keys.find(k => patterns.some(p => k.toUpperCase().includes(p)));
          return key ? row[key] : null;
        };
        const fechaRaw = find(['FECHA']);
        let fecha = null;
        if (fechaRaw) {
          if (typeof fechaRaw === 'number') {
            const d = XLSX.SSF.parse_date_code(fechaRaw);
            fecha = `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
          } else {
            fecha = fechaRaw;
          }
        }
        const obsText = String(find(['OBS', 'OBSERV']) || '');
        return {
          fecha_produccion: fecha,
          turno: 'Diurno',
          lote: Number(find(['OP', 'LOTE'])) || null,
          bultos_entregados: Number(find(['BULTO', 'PRODUCIR'])) || 0,
          observaciones: obsText || null,
        };
      };
      const mappedRows = rawRows.map(mapRow).filter(r => r.lote && r.fecha_produccion);
      let inserted = 0, skipped = 0, errors = 0;
      for (const row of mappedRows) {
        const { error: insertErr } = await supabase.from('produccion').insert([row]);
        if (insertErr) {
          if (insertErr.message.includes('duplicate') || insertErr.message.includes('unique')) skipped++;
          else { errors++; console.error(`Error lote ${row.lote}:`, insertErr.message); }
        } else { inserted++; }
      }
      alert(`✅ Importación completa: ${inserted} nuevos, ${skipped} ya existían, ${errors} errores.`);
      fetchData();
    } catch (err: any) {
      alert(`❌ Error: ${err.message}`);
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // AGGREGATIONS FOR COMPLIANCE DASHBOARD
  const filteredHistorialReportes = useMemo(() => {
    let res = [...historialReportes];
    if (reportFilterDesde) res = res.filter(r => r.fecha >= reportFilterDesde);
    if (reportFilterHasta) res = res.filter(r => r.fecha <= reportFilterHasta);
    return res;
  }, [historialReportes, reportFilterDesde, reportFilterHasta]);

  const supervisorStats = useMemo(() => {
    const stats: Record<string, { totalPct: number, count: number }> = {};
    filteredHistorialReportes.forEach(r => {
      if (!r.supervisor) return;
      let bultos = r.total_bultos;
      if (!bultos) {
        bultos = data.filter(d => d.fecha_produccion === r.fecha && d.turno === r.turno).reduce((s, d) => s + (d.bultos || 0), 0);
      }
      const pct = (bultos / META_BULTOS) * 100;
      if (!stats[r.supervisor]) stats[r.supervisor] = { totalPct: 0, count: 0 };
      stats[r.supervisor].totalPct += pct;
      stats[r.supervisor].count += 1;
    });
    return Object.entries(stats).map(([nombre, s]) => ({ nombre, promedio: s.count > 0 ? (s.totalPct / s.count) : 0 })).sort((a,b) => b.promedio - a.promedio);
  }, [filteredHistorialReportes, data]);

  const dosificadorStats = useMemo(() => {
    const stats: Record<string, { totalPct: number, count: number }> = {};
    filteredHistorialReportes.forEach(r => {
      if (!r.dosificador) return;
      const baches = r.baches_dosificados || 0;
      const pct = (baches / META_BACHES) * 100;
      if (!stats[r.dosificador]) stats[r.dosificador] = { totalPct: 0, count: 0 };
      stats[r.dosificador].totalPct += pct;
      stats[r.dosificador].count += 1;
    });
    return Object.entries(stats).map(([nombre, s]) => ({ nombre, promedio: s.count > 0 ? (s.totalPct / s.count) : 0 })).sort((a,b) => b.promedio - a.promedio);
  }, [filteredHistorialReportes]);

  const uniqueSup = useMemo(() => Array.from(new Set(historialReportes.map(r => r.supervisor).filter(Boolean))), [historialReportes]);
  
  const chartData = useMemo(() => {
    return [...filteredHistorialReportes].sort((a,b) => a.fecha.localeCompare(b.fecha)).map(r => {
      const bultos = r.total_bultos || data.filter(d => d.fecha_produccion === r.fecha && d.turno === r.turno).reduce((s, d) => s + (d.bultos || 0), 0);
      const baches = r.baches_dosificados || 0;
      return {
        nombre: `${r.fecha} ${r.turno.substring(0,1)}`,
        baches,
        bultos,
        baches_pct: Number(((baches / META_BACHES) * 100).toFixed(1)),
        bultos_pct: Number(((bultos / META_BULTOS) * 100).toFixed(1))
      };
    });
  }, [filteredHistorialReportes, data]);

  const handleExportPDF = async () => {
    if (!reporteSavedInfo) {
      alert("No hay información guardada para exportar.");
      return;
    }
    
    try {
      const doc = new jsPDF();
      
      try {
        const response = await fetch('/logo-agrifeed.png');
        const blob = await response.blob();
        const reader = new FileReader();
        await new Promise((resolve) => {
          reader.onloadend = resolve;
          reader.readAsDataURL(blob);
        });
        const imgData = reader.result as string;
        doc.addImage(imgData, 'PNG', 14, 10, 40, 28);
      } catch (e) {
        console.warn('No se pudo cargar el logo', e);
      }
      
      const r = reporteSavedInfo;
      const tBultos = r.total_bultos || data.filter(d => d.fecha_produccion === r.fecha && d.turno === r.turno).reduce((s, d) => s + (d.bultos || 0), 0);
      const baches = r.baches_dosificados || 0;
      
      doc.setFontSize(22);
      doc.setTextColor(40, 40, 40);
      doc.text('Reporte de Cumplimiento', 60, 20);
      
      doc.setFontSize(11);
      doc.setTextColor(80, 80, 80);
      
      // Fila 1: Fecha y Turno
      doc.setFont("helvetica", "bold");
      doc.text('Fecha:', 60, 30);
      doc.setFont("helvetica", "normal");
      doc.text(r.fecha, 75, 30);
      
      doc.setFont("helvetica", "bold");
      doc.text('Turno:', 120, 30);
      doc.setFont("helvetica", "normal");
      doc.text(r.turno, 135, 30);
      
      // Fila 2: Supervisor
      doc.setFont("helvetica", "bold");
      doc.text('Supervisor:', 60, 38);
      doc.setFont("helvetica", "normal");
      doc.text(r.supervisor || 'N/A', 84, 38);
      
      // Fila 3: Dosificador
      doc.setFont("helvetica", "bold");
      doc.text('Dosificador:', 60, 46);
      doc.setFont("helvetica", "normal");
      doc.text(r.dosificador || 'N/A', 84, 46);
      
      doc.setFontSize(12);
      doc.setTextColor(0, 0, 0);
      doc.setFont("helvetica", "bold");
      doc.text('Cumplimiento del Turno:', 14, 58);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);
      doc.text(`Baches: ${baches} / ${META_BACHES} (${((baches/META_BACHES)*100).toFixed(1)}%)`, 14, 65);
      doc.text(`Bultos: ${tBultos} / ${META_BULTOS} (${((tBultos/META_BULTOS)*100).toFixed(1)}%)`, 14, 71);

      let startY = 85;
      if (r.observaciones) {
        doc.setFontSize(11);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(200, 50, 50);
        doc.text('Observaciones:', 14, 80);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(60, 60, 60);
        const splitObs = doc.splitTextToSize(r.observaciones, 180);
        doc.text(splitObs, 14, 86);
        startY = 86 + (splitObs.length * 5) + 5;
      }
      
      const filteredRecords = data.filter(d => d.fecha_produccion === r.fecha && d.turno === r.turno);
      const tableData = filteredRecords.map(item => [
        item.lote,
        typeof item.alimento === 'string' ? item.alimento : (Array.isArray(item.alimento) ? item.alimento[0]?.descripcion : item.alimento?.descripcion || ''),
        item.bultos,
        item.kg,
        item.observaciones || ''
      ]);

      autoTable(doc, {
        startY: startY,
        head: [['Lote', 'Alimento', 'Bultos', 'Kg', 'Novedad']],
        body: tableData,
        theme: 'grid',
        headStyles: { fillColor: [46, 125, 50] }
      });

      if ('showSaveFilePicker' in window) {
        const handle = await (window as any).showSaveFilePicker({
          suggestedName: `Reporte_Turno_${r.fecha}_${r.turno}.pdf`,
          types: [{ description: 'PDF Document', accept: { 'application/pdf': ['.pdf'] } }]
        });
        const writable = await handle.createWritable();
        const pdfBlob = doc.output('blob');
        await writable.write(pdfBlob);
        await writable.close();
      } else {
        doc.save(`Reporte_Turno_${r.fecha}_${r.turno}.pdf`);
      }
    } catch (error: any) {
      if (error.name !== 'AbortError') {
        console.error("Error generating PDF:", error);
        alert("Hubo un error al generar/guardar el PDF: " + (error.message || "Usa la consola para ver detalles."));
      }
    }
  };
  const uniqueDosif = useMemo(() => Array.from(new Set(historialReportes.map(r => r.dosificador).filter(Boolean))), [historialReportes]);

  const pctColor = (pct: number) => {
    if (pct >= 100) return 'var(--green-700)';
    if (pct >= 85) return 'var(--primary-color)';
    return 'var(--color-error)';
  };

  return (
    <div>
      {/* Tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        <button 
          className={`btn ${activeTab === 'registros' ? 'btn-primary' : 'btn-outline'}`} 
          onClick={() => setActiveTab('registros')}
          style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
        >
          <ClipboardList size={16} /> Registros de Producción
        </button>
        <button 
          className={`btn ${activeTab === 'estado_ops' ? 'btn-primary' : 'btn-outline'}`} 
          onClick={() => setActiveTab('estado_ops')}
        >
          Estado Órdenes (OP)
        </button>
        <button 
          className={`btn ${activeTab === 'reporte' ? 'btn-primary' : 'btn-outline'}`} 
          onClick={() => { setActiveTab('reporte'); setReportMode('lista'); }}
        >
          Reporte del Turno / Cumplimiento
        </button>
        <button 
          className={`btn ${activeTab === 'reporte_explosion' ? 'btn-primary' : 'btn-outline'}`} 
          onClick={() => setActiveTab('reporte_explosion')}
        >
          Explosión de Entregas
        </button>
      </div>

      {/* --- REGISTROS TAB --- */}
      <div style={{ display: activeTab === 'registros' ? 'block' : 'none', animation: 'fadeIn 0.3s ease' }}>
        
        <div className="grid-4" style={{ marginBottom: 16 }}>
          <div className="card" style={{ background: 'linear-gradient(to right, #4CAF50, #81C784)', color: 'white', border: 'none', borderRadius: 12, boxShadow: '0 4px 12px rgba(76, 175, 80, 0.2)' }}>
            <div className="card-body" style={{ padding: '20px' }}>
              <p style={{ margin: 0, opacity: 0.9, fontSize: '0.9rem', fontWeight: 600 }}>Total Registros</p>
              <h3 style={{ margin: '8px 0 0', fontSize: '2rem', fontWeight: 800 }}>{data.length}</h3>
            </div>
          </div>
          <div className="card" style={{ background: 'linear-gradient(to right, #1976D2, #64B5F6)', color: 'white', border: 'none', borderRadius: 12, boxShadow: '0 4px 12px rgba(25, 118, 210, 0.2)' }}>
            <div className="card-body" style={{ padding: '20px' }}>
              <p style={{ margin: 0, opacity: 0.9, fontSize: '0.9rem', fontWeight: 600 }}>Bultos Producidos (Histórico)</p>
              <h3 style={{ margin: '8px 0 0', fontSize: '2rem', fontWeight: 800 }}>{data.reduce((sum, d) => sum + (d.bultos || 0), 0).toLocaleString()}</h3>
            </div>
          </div>
          <div className="card" style={{ background: 'white', border: 'none', borderRadius: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
            <div className="card-body" style={{ padding: '20px' }}>
              <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.9rem', fontWeight: 600 }}>OPs Producidas/Activas</p>
              <h3 style={{ margin: '8px 0 0', fontSize: '2rem', color: 'var(--text-color)', fontWeight: 800 }}>{opsResumen.length}</h3>
            </div>
          </div>
        </div>

        {/* Toolbar */}
        <div className="toolbar" style={{ background: 'white', padding: '16px', borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.04)', border: '1px solid #f0f0f0' }}>
          <div className="toolbar-left">
            <div className="search-box">
              <Search size={18} />
              <input type="text" className="form-input" placeholder="Buscar por lote o alimento..." value={searchTerm} onChange={e => { setSearchTerm(e.target.value); setCurrentPage(1); }} style={{ paddingLeft: 40, width: 320 }} />
            </div>
          </div>
          <div className="toolbar-right">
            <input type="file" ref={fileInputRef} accept=".xlsx,.xls" style={{ display: 'none' }} onChange={handleFileSelect} />
            {canEdit && (
              <button className="btn btn-secondary btn-sm" onClick={handleImportClick} disabled={importing}>
                <Upload size={16} /> {importing ? 'Importando...' : 'Importar Excel'}
              </button>
            )}
            <button className="btn btn-outline btn-sm" onClick={() => setShowExportRange(!showExportRange)}>
              <Download size={16} /> Exportar Excel
            </button>
            {canEdit && (
              <button className="btn btn-primary btn-sm" onClick={() => handleOpenForm()}>
                <Plus size={16} /> Registrar Producción
              </button>
            )}
          </div>
        </div>

        {/* --- PANEL DE EXPORTAR --- */}
        {showExportRange && (
          <div className="card" style={{ marginBottom: 16, background: '#f8f9fa', border: '1px solid #dee2e6' }}>
            <div className="card-body" style={{ padding: '12px 16px' }}>
              <h5 style={{ margin: '0 0 10px 0', fontSize: '0.9rem' }}>Exportar Rango a Excel</h5>
              <div className="grid-5" style={{ gap: 10, alignItems: 'flex-end' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ fontSize: '0.8rem' }}>Fecha Desde</label>
                  <input type="date" className="form-input" value={exportFechaDesde} onChange={e => setExportFechaDesde(e.target.value)} />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ fontSize: '0.8rem' }}>Fecha Hasta</label>
                  <input type="date" className="form-input" value={exportFechaHasta} onChange={e => setExportFechaHasta(e.target.value)} />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ fontSize: '0.8rem' }}>Lote Desde</label>
                  <input type="number" className="form-input" value={exportOpDesde} onChange={e => setExportOpDesde(e.target.value)} />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ fontSize: '0.8rem' }}>Lote Hasta</label>
                  <input type="number" className="form-input" value={exportOpHasta} onChange={e => setExportOpHasta(e.target.value)} />
                </div>
                <div>
                  <button className="btn btn-primary" onClick={exportToExcel} style={{ width: '100%' }}>Descargar</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Formularios & Eliminar Modals (Oculto para simplificar vista) */}
        {showForm && (
          <div className="card" style={{ marginBottom: 20 }}>
            <div className="card-header">
              <span className="card-title">{formMode === 'crear' ? 'Nuevo Registro de Producción' : 'Editar Registro de Producción'}</span>
              <button className="btn btn-outline btn-sm" onClick={handleCloseForm}>Cancelar</button>
            </div>
            <div className="card-body">
              <form onSubmit={handleSave}>
                <div className="grid-4" style={{ rowGap: '16px' }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Fecha Producción <span style={{ color: 'red' }}>*</span></label>
                    <input type="date" name="fecha_produccion" className="form-input" required value={formData.fecha_produccion || ''} onChange={handleInputChange} />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Turno <span style={{ color: 'red' }}>*</span></label>
                    <select name="turno" className="form-select" required value={formData.turno || ''} onChange={handleInputChange} disabled={formMode === 'editar' && activeTab === 'reporte'}>
                      <option value="Diurno">Diurno</option>
                      <option value="Nocturno">Nocturno</option>
                    </select>
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Lote (OP) <span style={{ color: 'red' }}>*</span></label>
                    <input type="text" name="lote" className="form-input" required list="lotes-op-list" placeholder="Digitar o seleccionar..." value={formData.lote || ''} onChange={handleInputChange} autoComplete="off" />
                    <datalist id="lotes-op-list">
                      {lotes.map((l: any, idx: number) => {
                        const rawAlimento = l.maestro_alimentos;
                        const alimentoDesc = Array.isArray(rawAlimento) ? rawAlimento[0]?.descripcion : rawAlimento?.descripcion;
                        return <option key={`${l.lote}-${idx}`} value={l.lote}>{alimentoDesc || ''}</option>;
                      })}
                    </datalist>
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Baches Entregados <span style={{ color: 'red' }}>*</span></label>
                    <input type="number" name="baches_entregados" className="form-input" required placeholder="0" value={formData.baches_entregados || ''} onChange={handleInputChange} 
                      style={Number(formData.baches_entregados) > opInfo.bachesPendiente && opInfo.bachesPendiente > 0 ? { borderColor: 'orange', outlineColor: 'orange' } : {}}
                    />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Bultos Entregados <span style={{ color: 'red' }}>*</span></label>
                    <input type="number" name="bultos_entregados" className="form-input" required placeholder="0" value={formData.bultos_entregados || ''} onChange={handleInputChange} 
                      style={Number(formData.bultos_entregados) > opInfo.pendiente && opInfo.pendiente > 0 ? { borderColor: 'orange', outlineColor: 'orange' } : {}}
                    />
                  </div>
                </div>

                <div style={{ background: 'var(--gray-50)', padding: '12px 16px', borderRadius: '8px', margin: '16px 0', border: '1px solid var(--gray-200)' }}>
                  <h5 style={{ margin: '0 0 10px 0', color: 'var(--text-muted)' }}>Información de la OP (Automática)</h5>
                  <div className="grid-4">
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label" style={{ fontSize: '0.8rem' }}>Alimento</label>
                      <input type="text" className="form-input" disabled value={opInfo.alimento} style={{ background: '#e9ecef', fontWeight: 600 }} />
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label" style={{ fontSize: '0.8rem' }}>Cliente Programado</label>
                      <input type="text" className="form-input" disabled value={opInfo.cliente} style={{ background: '#e9ecef' }} />
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label" style={{ fontSize: '0.8rem' }}>Acumulado (Baches)</label>
                      <input type="text" className="form-input" disabled value={`${opInfo.bachesAcumulados} / ${opInfo.bachesProgramados}`} style={{ background: '#e9ecef', fontWeight: 600 }} />
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label" style={{ fontSize: '0.8rem' }}>Pendientes (Baches)</label>
                      <input type="text" className="form-input" disabled value={opInfo.bachesPendiente} style={{ background: '#e9ecef', color: opInfo.bachesPendiente < 0 ? 'red' : 'var(--green-700)', fontWeight: 600 }} />
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label" style={{ fontSize: '0.8rem' }}>Acumulado (Bultos)</label>
                      <input type="text" className="form-input" disabled value={`${opInfo.acumulado} / ${opInfo.programado}`} style={{ background: '#e9ecef' }} />
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label" style={{ fontSize: '0.8rem' }}>Pendientes (Bultos)</label>
                      <input type="text" className="form-input" disabled value={opInfo.pendiente} style={{ background: '#e9ecef', color: opInfo.pendiente < 0 ? 'red' : 'inherit' }} />
                    </div>
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Observaciones</label>
                  <input type="text" name="observaciones" className="form-input" placeholder="Opcional..." value={formData.observaciones || ''} onChange={handleInputChange} />
                </div>
                
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
                  <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Guardando...' : 'Guardar Registro'}</button>
                </div>
              </form>
            </div>
          </div>
        )}
        
        {deleteConfirm && (
          <div className="modal-overlay" style={{ zIndex: 9999 }}>
            <div className="card" style={{ width: 420, padding: 24 }}>
              <h3 style={{ marginBottom: 15, color: 'var(--color-error)' }}>Confirmar Eliminación</h3>
              <p style={{ marginBottom: 20 }}>¿Estás absolutamente seguro de eliminar esta producción?</p>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button className="btn btn-outline" onClick={() => setDeleteConfirm(null)}>Cancelar</button>
                <button className="btn btn-danger" onClick={handleDelete}>Sí, Eliminar</button>
              </div>
            </div>
          </div>
        )}

        {/* Listado de Produccion Normal */}
        <div className="card">
          <div className="card-body" style={{ padding: 0 }}>
            <div className="data-table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th style={{ verticalAlign: 'top' }}>Fecha {renderFilterInput('fecha_produccion')}</th>
                    <th style={{ verticalAlign: 'top' }}>Turno {renderFilterInput('turno')}</th>
                    <th style={{ verticalAlign: 'top' }}>Lote {renderFilterInput('lote')}</th>
                    <th style={{ verticalAlign: 'top' }}>Alimento {renderFilterInput('alimento')}</th>
                    <th style={{ verticalAlign: 'top' }}>Categoría {renderFilterInput('categoria')}</th>
                    <th style={{ verticalAlign: 'top', textAlign: 'center' }}>Baches</th>
                    <th style={{ verticalAlign: 'top', textAlign: 'right' }}>Bultos</th>
                    <th style={{ verticalAlign: 'top' }}>Kg</th>
                    <th style={{ verticalAlign: 'top' }}>Obs {renderFilterInput('observaciones')}</th>
                    {canEdit && <th style={{ verticalAlign: 'top', width: 80 }}>Acciones</th>}
                  </tr>
                </thead>
                <tbody>
                  {loading ? <tr><td colSpan={canEdit ? 9 : 8} style={{ textAlign: 'center', padding: '20px' }}>Cargando...</td></tr> : (
                    paginatedData.map(item => (
                      <tr key={item.id}>
                        <td>{item.fecha_produccion}</td>
                        <td>{item.turno}</td>
                        <td style={{ fontWeight: 700 }}>{item.lote}</td>
                        <td>{item.alimento}</td>
                        <td>{item.categoria}</td>
                        <td style={{ fontWeight: 700, textAlign: 'center', color: '#1976D2' }}>{item.baches}</td>
                        <td style={{ fontWeight: 600, textAlign: 'right' }}>{item.bultos}</td>
                        <td>{item.kg.toLocaleString()}</td>
                        <td style={{ color: 'var(--text-muted)' }}>{item.observaciones || '—'}</td>
                        {canEdit && (
                          <td>
                            <div style={{ display: 'flex', gap: 6 }}>
                              <button className="btn btn-outline btn-sm btn-icon" onClick={() => handleOpenForm(item)}><Edit2 size={14} /></button>
                              <button className="btn btn-danger btn-sm btn-icon" onClick={() => confirmDelete(item.id)}><Trash2 size={14} /></button>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            {/* Pagination Controls */}
            <div className="pagination" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px' }}>
              <span>Mostrando {((currentPage - 1) * PAGE_SIZE) + 1}–{Math.min(currentPage * PAGE_SIZE, filtered.length)} de {filtered.length} registros</span>
              {totalPages > 1 && (
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <button className="btn btn-outline btn-sm" disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)}>Ant</button>
                  <span style={{ fontWeight: 600 }}>Pág {currentPage} / {totalPages}</span>
                  <button className="btn btn-outline btn-sm" disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)}>Sig</button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* --- REPORTE EXPLOSIÓN EN REGISTROS TAB --- */}
      <div style={{ display: activeTab === 'reporte_explosion' ? 'block' : 'none', animation: 'fadeIn 0.3s ease' }}>
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-header"><span className="card-title">Explosión de Consumos Reales por Entrega (Baches)</span></div>
          <div className="card-body">
             <div className="grid-3" style={{ alignItems: 'flex-end', gap: 16 }}>
               <div className="form-group" style={{ marginBottom: 0 }}>
                 <label className="form-label">Entregas Desde</label>
                 <input type="date" className="form-input" value={explosionDesde} onChange={e => setExplosionDesde(e.target.value)} />
               </div>
               <div className="form-group" style={{ marginBottom: 0 }}>
                 <label className="form-label">Entregas Hasta</label>
                 <input type="date" className="form-input" value={explosionHasta} onChange={e => setExplosionHasta(e.target.value)} />
               </div>
               <div>
                  <button className="btn btn-primary" onClick={generarReporteExplosion} disabled={explosionLoading}>{explosionLoading ? 'Generando...' : 'Calcular Explosión'}</button>
                  <button className="btn btn-outline" onClick={exportExplosionToExcel} style={{ marginLeft: 8 }} disabled={!explosionData.length}>
                    <Download size={14} style={{ marginRight: 4 }} /> Excel
                  </button>
                  <button className="btn btn-outline" onClick={exportExplosionToPDF} style={{ marginLeft: 8 }} disabled={!explosionData.length}>
                    <Download size={14} style={{ marginRight: 4 }} /> PDF
                  </button>
               </div>
             </div>
          </div>
        </div>
        
        {explosionDetalle.length > 0 && (
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-header"><span className="card-title">Detalle de Entregas (OPs) Involucradas</span></div>
            <div className="card-body p-0">
               <div className="data-table-wrapper" style={{ maxHeight: 300, overflowY: 'auto' }}>
                 <table className="data-table">
                    <thead><tr><th>Fecha</th><th>Turno</th><th>Lote (OP)</th><th>Fórmula Solicitada</th><th>Cliente</th><th style={{ textAlign: 'center' }}>Baches Entregados</th></tr></thead>
                    <tbody>
                      {explosionDetalle.map((e, idx) => (
                         <tr key={idx}>
                            <td>{e.fecha}</td>
                            <td>{e.turno}</td>
                            <td style={{ fontWeight: 600 }}>{e.op}</td>
                            <td><span className="badge badge-info">{e.formula}</span></td>
                            <td>{e.cliente}</td>
                            <td style={{ textAlign: 'center', fontWeight: 'bold', color: '#1976D2' }}>{e.baches}</td>
                         </tr>
                      ))}
                    </tbody>
                 </table>
               </div>
            </div>
          </div>
        )}
        
        {explosionData.length > 0 && (
          <div className="card">
            <div className="card-header" style={{ background: 'var(--green-50)', borderBottom: '1px solid #C8E6C9' }}>
               <span className="card-title" style={{ color: 'var(--green-800)' }}>Consolidado Total y Cruce por OP</span>
            </div>
            <div className="card-body p-0">
               <div className="data-table-wrapper overflow-x-auto">
                 <table className="data-table w-full">
                    <thead>
                      <tr>
                        <th style={{ minWidth: 80 }}>Código</th>
                        <th style={{ minWidth: 200 }}>Materia Prima</th>
                        {explosionOps.map(op => (
                          <th key={op.lote} style={{ textAlign: 'right', fontSize: '0.8rem', minWidth: 100 }}>
                            <div style={{ fontSize: '0.7rem', color: '#2E7D32', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 120 }} title={op.alimento}>{op.alimento}</div>
                            <div title={op.cliente} style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 120 }}>{op.cliente}</div>
                            <div>OP {op.lote}</div>
                            <div style={{ fontWeight: 'normal', color: '#1565C0' }}>({op.baches} baches)</div>
                          </th>
                        ))}
                        <th style={{ textAlign: 'right', fontWeight: 800, minWidth: 100 }}>TOTAL KG</th>
                      </tr>
                    </thead>
                    <tbody>
                      {explosionData.map(e => (
                         <tr key={e.codigo}>
                            <td style={{ fontWeight: 600, color: 'var(--text-muted)' }}>{e.codigo}</td>
                            <td style={{ fontWeight: 600 }}>{e.material}</td>
                            {explosionOps.map(op => {
                              const v = e.porOP[op.lote] || 0;
                              return <td key={op.lote} style={{ textAlign: 'right', fontSize: '0.85rem' }}>{v > 0 ? v.toLocaleString('es-CO', { maximumFractionDigits: 2 }) : '—'}</td>
                            })}
                            <td style={{ textAlign: 'right', fontWeight: 700, color: '#2E7D32' }}>{e.totalKg.toLocaleString('es-CO', { maximumFractionDigits: 2 })}</td>
                         </tr>
                      ))}
                      {explosionData.length > 0 && (
                        <tr style={{ fontWeight: 800, borderTop: '2px solid var(--border-color)', background: 'rgba(46,125,50,0.04)' }}>
                          <td colSpan={2} style={{ textAlign: 'right' }}>TOTALES KG:</td>
                          {explosionOps.map(op => {
                            const opT = explosionData.reduce((s, e) => s + (e.porOP[op.lote] || 0), 0);
                            return <td key={op.lote} style={{ textAlign: 'right', color: '#1565C0' }}>{opT.toLocaleString('es-CO', { maximumFractionDigits: 0 })}</td>;
                          })}
                          <td style={{ textAlign: 'right', fontSize: '1.1rem', color: '#2E7D32' }}>
                            {explosionData.reduce((s,e)=>s+e.totalKg, 0).toLocaleString('es-CO', { maximumFractionDigits: 0 })}
                          </td>
                        </tr>
                      )}
                    </tbody>
                 </table>
               </div>
            </div>
          </div>
        )}
      </div>

      {/* --- ESTADO OPs TAB --- */}
      <div style={{ display: activeTab === 'estado_ops' ? 'block' : 'none', animation: 'fadeIn 0.3s ease' }}>
        
        <div className="grid-3" style={{ marginBottom: 16 }}>
          <div className="card" style={{ border: 'none', borderLeft: '4px solid #1976D2', borderRadius: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.04)' }}>
            <div className="card-body" style={{ padding: '20px' }}>
              <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.95rem', fontWeight: 600 }}>Total Programado (OPs Activas)</p>
              <h3 style={{ margin: '8px 0 0', fontSize: '1.8rem', fontWeight: 800 }}>{opsParaMostrar.reduce((s,o)=>s+o.programado,0).toLocaleString()} <span style={{fontSize:'1rem', color:'gray', fontWeight:500}}>Bultos</span></h3>
            </div>
          </div>
          <div className="card" style={{ border: 'none', borderLeft: '4px solid #388E3C', borderRadius: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.04)' }}>
            <div className="card-body" style={{ padding: '20px' }}>
              <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.95rem', fontWeight: 600 }}>Total Producido (Acumulado)</p>
              <h3 style={{ margin: '8px 0 0', fontSize: '1.8rem', fontWeight: 800 }}>{opsParaMostrar.reduce((s,o)=>s+o.acumulado,0).toLocaleString()} <span style={{fontSize:'1rem', color:'gray', fontWeight:500}}>Bultos</span></h3>
            </div>
          </div>
          <div className="card" style={{ border: 'none', borderLeft: '4px solid #FFA000', borderRadius: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.04)' }}>
            <div className="card-body" style={{ padding: '20px' }}>
              <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.95rem', fontWeight: 600 }}>Cumplimiento Promedio OPs</p>
              <h3 style={{ margin: '8px 0 0', fontSize: '1.8rem', fontWeight: 800 }}>
                {opsParaMostrar.reduce((sum, o) => sum + o.programado, 0) > 0 
                  ? ((opsParaMostrar.reduce((sum, o) => sum + Math.min(o.acumulado, o.programado), 0) / opsParaMostrar.reduce((sum, o) => sum + o.programado, 0)) * 100).toFixed(1) 
                  : 0}%
              </h3>
            </div>
          </div>
        </div>

        <div className="toolbar" style={{ marginBottom: 16, background: 'white', padding: '16px', borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.04)', border: '1px solid #f0f0f0' }}>
          <div className="toolbar-left" style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
             <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, cursor: 'pointer', userSelect: 'none' }}>
               <input type="checkbox" checked={mostrarSoloPendientes} onChange={e => setMostrarSoloPendientes(e.target.checked)} style={{ width: 18, height: 18 }} />
               Mostrar solo en proceso (Pendientes)
             </label>
             <div className="line-divider" style={{ width: 1, height: 24, background: '#e0e0e0' }}></div>
             <div className="search-box">
               <Search size={18} color="#999" />
               <input type="text" className="form-input" placeholder="Buscar OP, alimento, cliente..." value={opsSearchTerm} onChange={e => setOpsSearchTerm(e.target.value)} style={{ paddingLeft: 36, width: 320, borderRadius: 8, background: '#f8f9fa', border: '1px solid transparent' }} />
             </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <span className="card-title">Consolidado de Órdenes de Producción</span>
          </div>
          <div className="card-body" style={{ padding: 0 }}>
            <div className="data-table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th style={{ verticalAlign: 'top' }}>Lote (OP) {renderOpFilterInput('lote')}</th>
                    <th style={{ verticalAlign: 'top' }}>Alimento {renderOpFilterInput('alimento')}</th>
                    <th style={{ verticalAlign: 'top' }}>Cliente {renderOpFilterInput('cliente')}</th>
                    <th style={{ textAlign: 'center', verticalAlign: 'top' }}>Baches<br/><span style={{fontSize:'0.75rem', fontWeight:'normal'}}>Prog / Acum / Pend</span></th>
                    <th style={{ textAlign: 'right', verticalAlign: 'top' }}>Bultos<br/><span style={{fontSize:'0.75rem', fontWeight:'normal'}}>Prog / Acum / Pend</span></th>
                    <th style={{ textAlign: 'center', verticalAlign: 'top' }}>% Cumplimiento<br/>(Baches)</th>
                    <th style={{ textAlign: 'center', verticalAlign: 'top' }}>Adicional/Faltante<br/>(Bultos)</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedOps.length === 0 ? (
                    <tr><td colSpan={8} style={{ textAlign: 'center', padding: '20px' }}>No hay OPs para mostrar.</td></tr>
                  ) : (
                    paginatedOps.map(op => {
                      const diferencia = op.acumulado - op.programado;
                      const difPct = op.programado > 0 ? (diferencia / op.programado) * 100 : 0;
                      
                      return (
                      <tr key={op.lote}>
                        <td style={{ fontWeight: 700 }}>{op.lote}</td>
                        <td>{op.alimento}</td>
                        <td>{op.cliente || '—'}</td>
                        <td style={{ textAlign: 'center' }}>
                          <span style={{ fontWeight: 600 }}>{op.programadoBaches}</span> / <span style={{ color: '#1976D2', fontWeight: 600 }}>{op.acumuladoBaches}</span> / <span style={{ color: op.pendienteBaches > 0 ? 'inherit' : (op.pendienteBaches === 0 ? 'var(--green-700)' : 'red') }}>{op.pendienteBaches}</span>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <span style={{ fontWeight: 600 }}>{op.programado.toLocaleString()}</span> / <span style={{ color: '#388E3C', fontWeight: 600 }}>{op.acumulado.toLocaleString()}</span> / <span style={{ color: op.pendiente > 0 ? 'inherit' : (op.pendiente === 0 ? 'var(--green-700)' : 'red') }}>{op.pendiente.toLocaleString()}</span>
                        </td>
                        <td style={{ textAlign: 'center', fontWeight: 'bold', color: pctColor(op.porcentaje) }}>
                          {op.porcentaje.toFixed(1)}%
                        </td>
                        <td style={{ textAlign: 'center', fontWeight: 'bold' }}>
                          {diferencia > 0 ? (
                            <span className="badge" style={{ color: '#C62828', background: '#FFEBEE', padding: '4px 12px', fontSize: '0.75rem' }}>
                              +{diferencia.toLocaleString()} (+{difPct.toFixed(1)}%)
                            </span>
                          ) : (diferencia < 0 ? (
                            <span className="badge" style={{ color: '#E65100', background: '#FFF3E0', padding: '4px 12px', fontSize: '0.75rem' }}>
                              {diferencia.toLocaleString()} ({difPct.toFixed(1)}%)
                            </span>
                          ) : (
                            <span className="badge" style={{ color: '#2E7D32', background: '#E8F5E9', padding: '4px 12px', fontSize: '0.75rem' }}>Exacto</span>
                          ))}
                        </td>
                      </tr>
                    )})
                  )}
                </tbody>
              </table>
            </div>
            {/* OP Pagination Controls */}
            {opsParaMostrar.length > 0 && (
              <div className="pagination" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderTop: '1px solid #f0f0f0' }}>
                <span>Mostrando {((opCurrentPage - 1) * OP_PAGE_SIZE) + 1}–{Math.min(opCurrentPage * OP_PAGE_SIZE, opsParaMostrar.length)} de {opsParaMostrar.length} OPs</span>
                {opTotalPages > 1 && (
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <button className="btn btn-outline btn-sm" disabled={opCurrentPage === 1} onClick={() => setOpCurrentPage(p => p - 1)}>Ant</button>
                    <span style={{ fontWeight: 600 }}>Pág {opCurrentPage} / {opTotalPages}</span>
                    <button className="btn btn-outline btn-sm" disabled={opCurrentPage === opTotalPages} onClick={() => setOpCurrentPage(p => p + 1)}>Sig</button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* --- DASHBOARD REPORTE CUMPLIMIENTO TAB --- */}
      <div style={{ display: activeTab === 'reporte' ? 'block' : 'none' }}>
        
        {/* CUMPLIMIENTO SUMMARY TABLES ONLY IN LIST MODE */}
        {reportMode === 'lista' && (
          <>
            <div className="toolbar" style={{ marginBottom: 16 }}>
              <div className="toolbar-left" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>Filtrar Rendimiento:</span>
                <input type="date" className="form-input" style={{ width: 140 }} value={reportFilterDesde} onChange={e => setReportFilterDesde(e.target.value)} title="Desde" />
                <span>-</span>
                <input type="date" className="form-input" style={{ width: 140 }} value={reportFilterHasta} onChange={e => setReportFilterHasta(e.target.value)} title="Hasta" />
              </div>
              <div className="toolbar-right">
                <button className="btn btn-outline btn-sm" onClick={() => { setReportFilterDesde(''); setReportFilterHasta(''); }}>Limpiar Filtro</button>
                {canEdit && <button className="btn btn-primary btn-sm" onClick={() => setReportMode('nuevo')}><Plus size={16} /> Nuevo Reporte de Turno</button>}
              </div>
            </div>

            <div className="grid-2" style={{ marginBottom: '20px', alignItems: 'start' }}>
            <div className="card" style={{ border: '2px solid #FBC02D' }}>
              <div className="card-header" style={{ background: '#FFF59D', color: '#000', padding: '8px 16px', minHeight: 'auto' }}>
                <span className="card-title" style={{ fontSize: '0.9rem', textAlign: 'center', width: '100%' }}>SUPERVISORES (Meta {META_BULTOS} Blts)</span>
              </div>
              <div className="card-body" style={{ padding: 0 }}>
                <table className="data-table" style={{ border: 'none' }}>
                  <thead>
                    <tr><th style={{ background: '#FFF9C4', color: '#333' }}>NOMBRE</th><th style={{ background: '#FFF9C4', color: '#333', textAlign: 'center' }}>%</th></tr>
                  </thead>
                  <tbody>
                    {supervisorStats.map(s => (
                      <tr key={s.nombre}>
                        <td style={{ fontWeight: 600 }}>{s.nombre}</td>
                        <td style={{ textAlign: 'center', fontWeight: 'bold', color: pctColor(s.promedio) }}>{s.promedio.toFixed(2)}%</td>
                      </tr>
                    ))}
                    {supervisorStats.length === 0 && <tr><td colSpan={2} style={{ textAlign: 'center', fontStyle: 'italic' }}>Sin datos</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="card" style={{ border: '2px solid #FBC02D' }}>
              <div className="card-header" style={{ background: '#FFF59D', color: '#000', padding: '8px 16px', minHeight: 'auto' }}>
                <span className="card-title" style={{ fontSize: '0.9rem', textAlign: 'center', width: '100%' }}>DOSIFICADORES (Meta {META_BACHES} Baches)</span>
              </div>
              <div className="card-body" style={{ padding: 0 }}>
                <table className="data-table" style={{ border: 'none' }}>
                  <thead>
                    <tr><th style={{ background: '#FFF9C4', color: '#333' }}>NOMBRE</th><th style={{ background: '#FFF9C4', color: '#333', textAlign: 'center' }}>%</th></tr>
                  </thead>
                  <tbody>
                    {dosificadorStats.map(d => (
                      <tr key={d.nombre}>
                        <td style={{ fontWeight: 600 }}>{d.nombre}</td>
                        <td style={{ textAlign: 'center', fontWeight: 'bold', color: pctColor(d.promedio) }}>{d.promedio.toFixed(2)}%</td>
                      </tr>
                    ))}
                    {dosificadorStats.length === 0 && <tr><td colSpan={2} style={{ textAlign: 'center', fontStyle: 'italic' }}>Sin datos</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '24px', marginBottom: '24px' }}>
            <div className="card" style={{ border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.04)', borderRadius: 12 }}>
              <div className="card-header" style={{ borderBottom: '1px solid #f0f0f0', padding: '16px 20px' }}>
                <span className="card-title" style={{ fontSize: '1.05rem', fontWeight: 700 }}>Nivel de Producción (Llenado de Meta)</span>
              </div>
              <div className="card-body" style={{ height: 320, padding: '20px 20px 10px 0' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                    <XAxis dataKey="nombre" fontSize={11} stroke="#999" tickMargin={10} axisLine={false} tickLine={false} />
                    <YAxis yAxisId="bultos" orientation="left" fontSize={11} domain={[0, META_BULTOS]} stroke="#388E3C" tickFormatter={(value) => value.toLocaleString()} axisLine={false} tickLine={false} />
                    <YAxis yAxisId="baches" orientation="right" fontSize={11} domain={[0, META_BACHES]} stroke="#1976D2" axisLine={false} tickLine={false} />
                    <RechartsTooltip contentStyle={{ borderRadius: 8, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} formatter={(value: any) => typeof value === 'number' ? value.toLocaleString() : value} />
                    <Legend wrapperStyle={{ paddingTop: '10px' }} iconType="circle" />
                    <Bar yAxisId="bultos" dataKey="bultos" name={`Bultos (Meta: ${META_BULTOS})`} radius={[6, 6, 0, 0]} background={{ fill: 'rgba(0,0,0,0.02)' }} barSize={18}>
                      {chartData.map((entry, index) => {
                        let fill = "#4CAF50"; // Bien > 100%
                        if (entry.bultos_pct < 80) fill = "#EF5350"; // Mal < 80%
                        else if (entry.bultos_pct < 100) fill = "#FFA726"; // Regular 80-99%
                        return <Cell key={`cell-bult-${index}`} fill={fill} />;
                      })}
                    </Bar>
                    <Bar yAxisId="baches" dataKey="baches" name={`Baches (Meta: ${META_BACHES})`} radius={[6, 6, 0, 0]} background={{ fill: 'rgba(0,0,0,0.02)' }} barSize={18}>
                      {chartData.map((entry, index) => {
                        let fill = "#42A5F5"; // Bien > 100%
                        if (entry.baches_pct < 80) fill = "#EF5350"; // Mal < 80%
                        else if (entry.baches_pct < 100) fill = "#FFA726"; // Regular 80-99%
                        return <Cell key={`cell-bach-${index}`} fill={fill} />;
                      })}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="card" style={{ border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.04)', borderRadius: 12 }}>
              <div className="card-header" style={{ borderBottom: '1px solid #f0f0f0', padding: '16px 20px' }}>
                <span className="card-title" style={{ fontSize: '1.05rem', fontWeight: 700 }}>Tendencia de Cumplimiento Histórico</span>
              </div>
              <div className="card-body" style={{ height: 320, padding: '20px 20px 10px 0' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                    <XAxis dataKey="nombre" fontSize={11} stroke="#999" tickMargin={10} axisLine={false} tickLine={false} />
                    <YAxis fontSize={11} domain={[0, 120]} stroke="#999" axisLine={false} tickLine={false} />
                    <RechartsTooltip contentStyle={{ borderRadius: 8, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                    <Legend wrapperStyle={{ paddingTop: '10px' }} iconType="circle" />
                    <Line type="monotone" dataKey="baches_pct" name="% Meta Baches" stroke="#FFA726" strokeWidth={3} dot={{ r: 5, strokeWidth: 2, fill: '#fff' }} activeDot={{ r: 8 }} />
                    <Line type="monotone" dataKey="bultos_pct" name="% Meta Bultos" stroke="#66BB6A" strokeWidth={3} dot={{ r: 5, strokeWidth: 2, fill: '#fff' }} activeDot={{ r: 8 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
          </>
        )}
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-header">
            <span className="card-title">{(reportMode === 'detalle' || reportMode === 'editar_detalle') ? 'Detalle del Reporte' : (reportMode === 'nuevo' ? 'Nuevo Reporte de Turno' : 'Historial de Reportes')}</span>
            
            {reportMode === 'lista' && canEdit && (
               <button className="btn btn-primary btn-sm" onClick={() => {
                 setReporteFecha(new Date().toISOString().split('T')[0]);
                 setReporteTurno('Diurno');
                 setReporteSavedInfo(null);
                 setReporteFormData({ supervisor: '', dosificador: '', baches_dosificados: '', observaciones: '' });
                 setReportMode('nuevo');
               }}>
                 <Plus size={16} /> Crear Reporte
               </button>
            )}

            {(reportMode === 'nuevo' || reportMode === 'detalle' || reportMode === 'editar_detalle') && (
              <button className="btn btn-outline btn-sm" onClick={() => { setReportMode('lista'); fetchHistorialReportes(); }}>
                <ChevronLeft size={16} style={{ marginRight: '4px' }} /> Volver al Historial
              </button>
            )}
          </div>

          <div className="card-body">
            {reportMode === 'lista' && (
              <div className="data-table-wrapper">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th style={{ width: '100px' }}>Fecha</th>
                      <th>Turno</th>
                      <th>Supervisor</th>
                      <th>Dosificador</th>
                      <th style={{ textAlign: 'center' }}>Baches<br/><span style={{ fontSize:'0.7rem', color:'gray' }}>Obj:{META_BACHES}</span></th>
                      <th style={{ textAlign: 'center' }}>Bultos<br/><span style={{ fontSize:'0.7rem', color:'gray' }}>Obj:{META_BULTOS}</span></th>
                      <th style={{ textAlign: 'center' }}>% Cump<br/>Baches</th>
                      <th style={{ textAlign: 'center' }}>% Cump<br/>Bultos</th>
                      <th style={{ width: '80px', textAlign: 'center' }}>Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredHistorialReportes.length === 0 ? (
                      <tr><td colSpan={9} style={{ textAlign: 'center', padding: '20px' }}>No hay reportes históricos registrados en la base de datos.</td></tr>
                    ) : (
                      filteredHistorialReportes.map(r => {
                        const baches = r.baches_dosificados || 0;
                        let bultos = r.total_bultos;
                        if (!bultos) {
                           bultos = data.filter(d => d.fecha_produccion === r.fecha && d.turno === r.turno).reduce((s, d) => s + (d.bultos || 0), 0);
                        }
                        const pctBaches = (baches / META_BACHES) * 100;
                        const pctBultos = (bultos / META_BULTOS) * 100;

                        const esTurnoPerfecto = baches >= META_BACHES && bultos >= META_BULTOS;

                        return (
                          <tr key={r.id}>
                            <td style={{ fontWeight: 600 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                {r.fecha}
                                {esTurnoPerfecto && <Trophy size={16} color="#FBC02D" fill="#FBC02D" />}
                              </div>
                            </td>
                            <td><span className={`badge ${r.turno === 'Diurno' ? 'badge-neutral' : 'badge-primary'}`}>{r.turno}</span></td>
                            <td>{r.supervisor || '—'}</td>
                            <td>{r.dosificador || '—'}</td>
                            <td style={{ textAlign: 'center' }}>{baches || '—'}</td>
                            <td style={{ textAlign: 'center' }}>{bultos > 0 ? bultos.toLocaleString() : '—'}</td>
                            <td style={{ textAlign: 'center', fontWeight: 'bold', color: pctColor(pctBaches) }}>{pctBaches.toFixed(1)}%</td>
                            <td style={{ textAlign: 'center', fontWeight: 'bold', color: pctColor(pctBultos) }}>{pctBultos.toFixed(1)}%</td>
                            <td style={{ textAlign: 'center' }}>
                              <button className="btn btn-outline btn-sm" onClick={() => {
                                setReporteFecha(r.fecha);
                                setReporteTurno(r.turno);
                                setReporteSavedInfo(r);
                                setReporteFormData({
                                  supervisor: r.supervisor || '',
                                  dosificador: r.dosificador || '',
                                  baches_dosificados: r.baches_dosificados || '',
                                  observaciones: r.observaciones || ''
                                });
                                setReportMode('detalle');
                              }}>Ver</button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {(reportMode === 'nuevo' || reportMode === 'detalle' || reportMode === 'editar_detalle') && (
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 1fr) 350px', gap: '24px' }}>
                <div>
                  <h5 style={{ marginBottom: '16px', color: 'var(--text-color)', display: 'flex', gap: '10px', alignItems: 'center' }}>
                    Resumen de Producción 
                    {(reportMode === 'detalle' && reporteSavedInfo?.baches_dosificados >= META_BACHES && reporteSavedInfo?.total_bultos >= META_BULTOS) && (
                      <span className="badge" style={{ background: '#FFF59D', color: '#F57F17', border: '1px solid #FBC02D', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Trophy size={14} fill="#F57F17" /> Turno Perfecto
                      </span>
                    )}
                    {reportMode === 'nuevo' && (
                      <div style={{ display: 'flex', gap: 10, marginLeft: 'auto' }}>
                        <input type="date" className="form-input" style={{ width: '140px', padding: '4px 8px', fontSize: '0.9rem' }} value={reporteFecha} onChange={e => setReporteFecha(e.target.value)} />
                        <select className="form-select" style={{ width: '120px', padding: '4px 8px', fontSize: '0.9rem' }} value={reporteTurno} onChange={e => setReporteTurno(e.target.value)}>
                          <option value="Diurno">Diurno</option>
                          <option value="Nocturno">Nocturno</option>
                        </select>
                      </div>
                    )}
                    {(reportMode === 'detalle' || reportMode === 'editar_detalle') && (
                      <span className="badge badge-success" style={{ marginLeft: 'auto', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        {reportMode === 'detalle' ? <Lock size={14} /> : <Unlock size={14} />}
                        {reporteFecha} - {reporteTurno}
                      </span>
                    )}
                  </h5>
                  <div className="data-table-wrapper" style={{ border: '1px solid var(--gray-200)' }}>
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Lote (OP)</th>
                          <th>Alimento</th>
                          <th>Cliente</th>
                          <th style={{ textAlign: 'right' }}>Bultos</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(() => {
                          const turnData = data.filter(d => d.fecha_produccion === reporteFecha && d.turno === reporteTurno);
                          if (turnData.length === 0) return <tr><td colSpan={4} style={{ textAlign: 'center', padding: '20px' }}>No hay producción registrada en este turno actual.</td></tr>;
                          
                          const opsMap = new Map<string, any>();
                          turnData.forEach(r => {
                            if (!opsMap.has(r.lote)) { opsMap.set(r.lote, { ...r, sum: 0 }); }
                            opsMap.get(r.lote).sum += (r.bultos || 0);
                          });
                          
                          const uniqueOps = Array.from(opsMap.values());
                          const totalBultos = reportMode === 'nuevo' || reportMode === 'editar_detalle' ? currentTotalBultos : (reporteSavedInfo?.total_bultos || currentTotalBultos);

                          return (
                            <>
                              {uniqueOps.map(op => (
                                <tr key={op.lote}>
                                  <td style={{ fontWeight: 'bold' }}>{op.lote}</td>
                                  <td>{op.alimento}</td>
                                  <td>{op.cliente || '—'}</td>
                                  <td style={{ textAlign: 'right', fontWeight: 'bold' }}>{op.sum}</td>
                                </tr>
                              ))}
                              <tr style={{ background: 'var(--green-50)', borderTop: '2px solid var(--gray-300)' }}>
                                <td colSpan={3} style={{ textAlign: 'right', fontWeight: 'bold' }}>Total {uniqueOps.length} OPs | Total Bultos: (Meta: {META_BULTOS})</td>
                                <td style={{ textAlign: 'right', fontWeight: 'bold', color: 'var(--primary-color)' }}>{totalBultos.toLocaleString()}</td>
                              </tr>
                            </>
                          );
                        })()}
                      </tbody>
                    </table>
                  </div>
                  
                  {reportMode === 'nuevo' && reporteSavedInfo && (
                    <div style={{ marginTop: '16px', padding: '12px', background: '#ffebee', color: '#c62828', borderRadius: '8px', fontSize: '0.9rem', fontWeight: 600 }}>
                      ⚠️ Ya existe un reporte guardado para {reporteFecha} - {reporteTurno}. Búscalo en el historial para modificarlo.
                    </div>
                  )}

                  {/* Hidden Datalists for Autocomplete */}
                  <datalist id="lista-supervisores">
                    {uniqueSup.map(s => <option key={s} value={String(s)} />)}
                  </datalist>
                  <datalist id="lista-dosificadores">
                    {uniqueDosif.map(s => <option key={s} value={String(s)} />)}
                  </datalist>

                </div>

                {/* Formulario Lateral */}
                <div className="card" style={{ background: 'var(--gray-50)', border: reportMode === 'detalle' ? '1px solid var(--gray-200)' : '1px solid var(--primary-color)' }}>
                  <div className="card-body">
                    <h5 style={{ marginBottom: 15, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      Detalles del Reporte
                      {reportMode === 'detalle' && (
                        <button className="btn btn-outline btn-sm" onClick={handleExportPDF} title="Descargar PDF del Reporte" style={{ display: 'flex', gap: 6, alignItems: 'center', borderColor: '#4CAF50', color: '#388E3C' }}>
                          <Download size={14} /> Reporte PDF
                        </button>
                      )}
                    </h5>
                    
                    <fieldset disabled={reportMode === 'detalle'} style={{ border: 'none', padding: 0, margin: 0 }}>
                      <div className="form-group">
                        <label className="form-label" title="Selecciona o escribe uno nuevo">Supervisor <span style={{ color: 'red' }}>*</span></label>
                        <input type="text" className="form-input" placeholder="Buscar o crear..." list="lista-supervisores" required value={reporteFormData.supervisor} onChange={e => setReporteFormData(p => ({ ...p, supervisor: e.target.value.toUpperCase() }))} autoComplete="off" />
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Te sugerimos nombres previos automáticamente</span>
                      </div>
                      <div className="form-group">
                        <label className="form-label" title="Selecciona o escribe uno nuevo">Dosificador <span style={{ color: 'red' }}>*</span></label>
                        <input type="text" className="form-input" placeholder="Buscar o crear..." list="lista-dosificadores" required value={reporteFormData.dosificador} onChange={e => setReporteFormData(p => ({ ...p, dosificador: e.target.value.toUpperCase() }))} autoComplete="off" />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Baches Dosificados (Meta: {META_BACHES})</label>
                        <input type="number" className="form-input" placeholder="Ej: 108" value={reporteFormData.baches_dosificados} onChange={e => setReporteFormData(p => ({ ...p, baches_dosificados: e.target.value }))} />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Observaciones / Novedades</label>
                        <textarea className="form-input" rows={4} placeholder="Escribe las incidencias..." value={reporteFormData.observaciones} onChange={e => setReporteFormData(p => ({ ...p, observaciones: e.target.value }))}></textarea>
                      </div>
                    </fieldset>

                    <div style={{ marginTop: 20 }}>
                      {reportMode === 'nuevo' && !reporteSavedInfo && (
                        <button className="btn btn-primary" style={{ width: '100%' }} onClick={handleSaveReporte}>Guardar Reporte</button>
                      )}
                      {reportMode === 'detalle' && (
                        <button className="btn btn-outline" style={{ width: '100%' }} onClick={unlockReport}>Habilitar Edición</button>
                      )}
                      {reportMode === 'editar_detalle' && (
                        <div style={{ display: 'flex', gap: 10 }}>
                          <button className="btn btn-primary" style={{ flex: isAdmin ? 1 : '1 1 100%' }} onClick={handleSaveReporte}>Actualizar Reporte</button>
                          {isAdmin && (
                            <button className="btn btn-danger" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={handleDeleteReporte}>
                              <Trash2 size={16} style={{ marginRight: 6 }} /> Eliminar
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
