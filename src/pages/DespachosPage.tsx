import { useState, useEffect, useMemo, useCallback, Fragment, useRef } from 'react';
import { Plus, Search, Edit2, Trash2, Download, ChevronLeft, ChevronRight, X, Truck, FileText, Package, ChevronRight as ChevronR, Upload, Printer, Calendar, Boxes } from 'lucide-react';
import { fetchDespachos, createDespacho, updateDespacho, softDeleteDespacho, supabase } from '../lib/supabase';
import DespachoHeaderForm from '../components/DespachoHeaderForm';
import DetalleOPList from '../components/DetalleOPList';
import InventarioMPPanel from '../components/InventarioMPPanel';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import Toast, { toast } from '../components/Toast';
import { Navigate } from 'react-router-dom';
import { usePermissions } from '../lib/permissions';
import '../styles/modal.css';
import '../styles/despachos.css';

const PAGE_SIZE = 100;

export default function DespachosPage() {
  const { canView, canEdit } = usePermissions('despachos');
  const [mainTab, setMainTab] = useState<'despachos' | 'inventario'>('despachos');

  // Data
  const [despachos, setDespachos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // UI state
  const [showHeaderForm, setShowHeaderForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [headerData, setHeaderData] = useState<any>({});
  const [details, setDetails] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  const [expandedRows, setExpandedRows] = useState<Set<string | number>>(new Set());

  // Pagination & filters (still on master rows)
  const [searchTerm, setSearchTerm] = useState('');
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
  const [currentPage, setCurrentPage] = useState(1);

  // Date filters
  const [fechaFiltroDesde, setFechaFiltroDesde] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1); // Default to last 1 month
    return d.toISOString().split('T')[0];
  });
  const [fechaFiltroHasta, setFechaFiltroHasta] = useState(() => {
    return new Date().toISOString().split('T')[0];
  });

  // Export UI
  const [showExportRange, setShowExportRange] = useState(false);
  const [exportFechaDesde, setExportFechaDesde] = useState('');
  const [exportFechaHasta, setExportFechaHasta] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch master‑detail data
  useEffect(() => {
    loadDespachos();
  }, []);

  // Fetch master‑detail data
  useEffect(() => {
    if (canView) {
      loadDespachos();
    }
  }, [canView]);

  if (!canView) return <Navigate to="/" replace />;

  const loadDespachos = async () => {
    setLoading(true);
    try {
      const data = await fetchDespachos();
      setDespachos(data ?? []);
      if (!data || data.length === 0) {
        toast.info('No hay despachos registrados.');
      }
    } catch (e: any) {
      console.error(e);
      toast.error('Error al cargar despachos: ' + (e.message || JSON.stringify(e)));
    }
    setLoading(false);
  };

  // Toggle expanded row
  const toggleRow = (id: string | number) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Handlers for header form
  const openCreateForm = async () => {
    if (!canEdit) return;
    // Fetch the next consecutive remision number
    let nextRemision = '';
    try {
      const { fetchNextRemision } = await import('../lib/supabase');
      nextRemision = String(await fetchNextRemision());
    } catch (e) {
      console.warn('Could not fetch next remision', e);
    }
    setHeaderData({
      remision: nextRemision,
      fecha: new Date().toISOString().split('T')[0],
      hora: new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: false }),
      cliente_id: '',
      vehiculo_id: '',
      conductor: '',
      entregado_por: '',
      granja_id: '',
      observaciones: '',
      estado: 'borrador',
    });
    setDetails([]);
    setEditingId(null);
    setShowHeaderForm(true);
  };

  const openEditForm = (encabezado: any) => {
    if (!canEdit) return;
    setHeaderData({
      remision: encabezado.remision,
      fecha: encabezado.fecha,
      hora: encabezado.hora || '',
      cliente_id: encabezado.cliente_id,
      vehiculo_id: encabezado.vehiculo_id,
      conductor: encabezado.conductor,
      entregado_por: encabezado.entregado_por || '',
      granja_id: encabezado.granja_id,
      observaciones: encabezado.observaciones,
      estado: encabezado.estado,
    });
    // Map detalle rows to our DetalleRow shape
    const det = encabezado.detalle?.map((d: any) => ({
      id: d.id,
      op: d.op,
      alimento: d.alimento?.descripcion,
      cliente_programado: d.cliente_programado?.nombre,
      cantidad_entregada: d.cantidad_entregada,
      cantidad_despachada_acumulada: d.cantidad_despachada_acumulada,
      cantidad_a_despachar: d.cantidad_a_despachar,
      observaciones: d.observaciones,
    })) || [];
    setDetails(det);
    setEditingId(encabezado.id);
    setShowHeaderForm(true);
  };

  const handleHeaderChange = (data: any) => {
    setHeaderData(data);
  };

  const handleDetailsChange = (newDetails: any[]) => {
    setDetails(newDetails);
  };

  const handleSave = async () => {
    if (!canEdit) return;
    if (!headerData.cliente_id) return toast.error('Debes seleccionar un cliente.');
    if (details.length === 0) return toast.error('Debes agregar al menos una OP.');
    if (headerData.estado !== 'borrador' && !headerData.remision) return toast.error('El número de remisión es obligatorio para despachos definitivos.');
    setSaving(true);
    try {
      if (editingId) {
        await updateDespacho(editingId, headerData, details);
        toast.success('Despacho actualizado');
      } else {
        await createDespacho(headerData, details);
        toast.success('Despacho creado');
      }
      setShowHeaderForm(false);
      loadDespachos();
    } catch (e: any) {
      console.error('Save error:', e);
      toast.error('Error al guardar despacho: ' + e.message);
    }
    setSaving(false);
  };

  const confirmDelete = (id: number) => {
    if (!canEdit) return;
    setDeleteConfirm(id);
  };

  const handleDelete = async () => {
    if (!canEdit || !deleteConfirm) return;
    try {
      await softDeleteDespacho(deleteConfirm);
      toast.success('Despacho eliminado');
      loadDespachos();
    } catch (e: any) {
      toast.error('Error al eliminar: ' + e.message);
    }
    setDeleteConfirm(null);
  };

  // Filters
  const handleColFilter = useCallback((key: string, value: string) => {
    setColumnFilters(prev => ({ ...prev, [key]: value }));
    setCurrentPage(1);
  }, []);

  const filtered = useMemo(() => {
    const st = searchTerm.toLowerCase();
    return despachos.filter(item => {
      if (fechaFiltroDesde && item.fecha < fechaFiltroDesde) return false;
      if (fechaFiltroHasta && item.fecha > fechaFiltroHasta) return false;
      if (st) {
        const str = `${item.fecha} ${item.remision} ${item.cliente?.nombre || ''}`.toLowerCase();
        if (!str.includes(st)) return false;
      }
      for (const key of Object.keys(columnFilters)) {
        const fv = columnFilters[key];
        if (!fv) continue;
        let valStr = '';
        if (key === 'cliente') valStr = item.cliente?.nombre || '';
        else if (key === 'granja') valStr = item.granja?.nombre || '';
        else if (key === 'vehiculo') valStr = item.vehiculo?.placa || '';
        else if (key === 'op') valStr = item.detalle?.map((d: any) => d.op).join(' ') || '';
        else valStr = String(item[key as keyof typeof item] || '');
        
        if (!valStr.toLowerCase().includes(fv.toLowerCase())) return false;
      }
      return true;
    });
  }, [despachos, searchTerm, columnFilters, fechaFiltroDesde, fechaFiltroHasta]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, currentPage]);

  // KPI computations
  const kpis = useMemo(() => {
    const total = filtered.length;
    const borradores = filtered.filter(d => d.estado === 'borrador').length;
    const despachados = filtered.filter(d => d.estado === 'Despachado' || d.estado === 'despachado').length;
    const totalBultos = filtered.reduce((sum, d) =>
      sum + (d.detalle?.reduce((s: number, det: any) => s + (det.cantidad_a_despachar || 0), 0) || 0), 0);
    return { total, borradores, despachados, totalBultos };
  }, [filtered]);

  // Export to Excel (master‑detail)
  const exportToExcel = async () => {
    let rows = [] as any[];
    filtered.forEach(enc => {
      const base = {
        Fecha: enc.fecha,
        Remisión: enc.remision,
        Cliente: enc.cliente?.nombre,
        Granja: enc.granja?.nombre || '',
        Placa: enc.vehiculo?.placa,
        Conductor: enc.conductor,
        Observaciones: enc.observaciones || '',
        Estado: enc.estado,
      };
      if (enc.detalle && enc.detalle.length) {
        enc.detalle.forEach((det: any) => {
          rows.push({
            ...base,
            OP: det.op,
            Alimento: det.alimento?.descripcion,
            'Cant. Entregada': det.cantidad_entregada,
            'Cant. Despachada': det.cantidad_despachada_acumulada,
            'Cant. A Despachar': det.cantidad_a_despachar,
            ObservaciónDetalle: det.observaciones || '',
          });
        });
      } else {
        rows.push(base);
      }
    });
    if (rows.length === 0) { alert('No hay datos para exportar'); return; }
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'DESPACHOS');
    try {
      if ('showSaveFilePicker' in window) {
        const handle = await (window as any).showSaveFilePicker({
          suggestedName: 'Despachos.xlsx',
          types: [{ description: 'Excel', accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] } }],
        });
        const writable = await handle.createWritable();
        await writable.write(XLSX.write(wb, { bookType: 'xlsx', type: 'array' }));
        await writable.close();
      } else {
        XLSX.writeFile(wb, 'Despachos.xlsx');
      }
    } catch (e: any) {
      if (e.name !== 'AbortError') alert('Error al exportar: ' + e.message);
    }
  };

  // ── Import from Excel ──
  const handleImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!canEdit) return;
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const ab = await file.arrayBuffer();
      const wb = XLSX.read(ab);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows: any[] = XLSX.utils.sheet_to_json(ws);
      if (rows.length === 0) return toast.error('El archivo está vacío.');

      // Group rows by Remisión
      const groups: Record<string, any[]> = {};
      for (const r of rows) {
        const key = String(r['Remisión'] || r['Remision'] || 'sin_remision');
        if (!groups[key]) groups[key] = [];
        groups[key].push(r);
      }

      let imported = 0;
      for (const [, group] of Object.entries(groups)) {
        const first = group[0];
        // Look up cliente_id by name
        const { data: clienteMatch } = await supabase
          .from('maestro_clientes')
          .select('codigo_sap')
          .ilike('nombre', `%${first.Cliente || ''}%`)
          .limit(1);
        const clienteId = clienteMatch?.[0]?.codigo_sap || null;

        // Look up vehiculo_id by placa
        const { data: vehiculoMatch } = await supabase
          .from('maestro_vehiculos')
          .select('id')
          .eq('placa', first.Placa || '')
          .limit(1);
        const vehiculoId = vehiculoMatch?.[0]?.id || null;

        // Look up granja_id by nombre
        const { data: granjaMatch } = await supabase
          .from('maestro_granjas')
          .select('id')
          .ilike('nombre', `%${first.Granja || ''}%`)
          .limit(1);
        const granjaId = granjaMatch?.[0]?.id || null;

        const encabezado = {
          fecha: first.Fecha || new Date().toISOString().split('T')[0],
          remision: first['Remisión'] || first['Remision'] || '',
          cliente_id: clienteId,
          vehiculo_id: vehiculoId,
          granja_id: granjaId,
          conductor: first.Conductor || '',
          observaciones: first.Observaciones || '',
          estado: first.Estado || 'borrador',
        };
        const detalles = group.map(r => ({
          op: r.OP || r.op || '',
          cantidad_a_despachar: r['Cant. A Despachar'] || r['Cant. Despachada'] || 0,
          bultos_danados: 0,
        }));
        await createDespacho(encabezado, detalles);
        imported++;
      }
      toast.success(`Se importaron ${imported} despachos correctamente.`);
      loadDespachos();
    } catch (err: any) {
      toast.error('Error al importar: ' + err.message);
    }
    // Reset file input
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // ── Generate PDF Remisión ──
  const generateRemisionPDF = async (item: any) => {
    const doc = new jsPDF({ unit: 'mm', format: 'letter' });
    const pageW = doc.internal.pageSize.getWidth();
    const margin = 15;

    // Try load logo
    let logoImg: string | null = null;
    try {
      const resp = await fetch('/logo-agrifeed.png');
      const blob = await resp.blob();
      logoImg = await new Promise<string>((res) => {
        const reader = new FileReader();
        reader.onload = () => res(reader.result as string);
        reader.readAsDataURL(blob);
      });
    } catch { /* no logo */ }

    // ── Header ──
    if (logoImg) {
      doc.addImage(logoImg, 'PNG', pageW - margin - 45, margin, 45, 18);
    }
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('AGRIFEED S.A.S-', margin, margin + 4);
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    doc.text('NIT. 900.959.683-1', margin, margin + 9);
    doc.text('Zona Franca Palermo Kilometro 1', margin, margin + 13);
    doc.text('Vía Barranquilla - Ciénaga', margin, margin + 17);

    // ── Remisión Title ──
    const yRem = margin + 28;
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('REMISIÓN', margin, yRem);
    doc.setTextColor(200, 30, 30);
    doc.setFontSize(16);
    doc.text(String(item.remision || 'BORRADOR'), margin + 40, yRem);
    doc.setTextColor(0, 0, 0);

    // Fecha / Hora
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    const fechaStr = item.fecha || '';
    const horaStr = item.hora || '';
    doc.text(`Fecha: ${fechaStr}`, pageW - margin - 50, yRem);
    if (horaStr) doc.text(`Hora: ${horaStr}`, pageW - margin - 50, yRem + 6);

    // ── Info Fields ──
    const yInfo = yRem + 10;
    doc.setFontSize(9);
    doc.text(`Centro de Costos: AGRIFEED SAS`, margin, yInfo);
    doc.text(`Ordenado por: Marco Munive`, margin + 100, yInfo);
    doc.text(`Cliente: ${item.cliente?.nombre || '—'}`, margin, yInfo + 6);
    if (item.granja?.nombre) {
      doc.text(`Granja: ${item.granja.nombre}`, margin + 100, yInfo + 6);
    }
    doc.text(`Entregado por: ${item.entregado_por || '____________________'}`, margin, yInfo + 12);

    // ── Detail Table ──
    const tableY = yInfo + 20;
    const totalBultos = item.detalle?.reduce((s: number, d: any) => s + (d.cantidad_a_despachar || 0), 0) || 0;
    const bodyRows = (item.detalle || []).map((d: any) => [
      d.op || '',
      d.alimento || '—',
      'Bultos',
      d.cantidad_a_despachar || 0,
    ]);

    autoTable(doc, {
      startY: tableY,
      head: [['OP', 'ARTÍCULO', 'UNIDAD', 'CANTIDAD']],
      body: bodyRows,
      foot: [['', '', 'TOTAL', totalBultos]],
      theme: 'grid',
      styles: { fontSize: 9, cellPadding: 3 },
      headStyles: { fillColor: [27, 94, 32], textColor: 255, fontStyle: 'bold' },
      footStyles: { fillColor: [240, 244, 238], textColor: [27, 94, 32], fontStyle: 'bold', fontSize: 10 },
      margin: { left: margin, right: margin },
      tableWidth: pageW - margin * 2,
    });

    // ── Observaciones ──
    const finalY = (doc as any).lastAutoTable?.finalY || tableY + 60;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('OBSERVACIONES:', margin, finalY + 10);
    doc.setFont('helvetica', 'normal');
    doc.text(item.observaciones || '', margin + 35, finalY + 10);

    // ── Footer Legal ──
    const yFoot = finalY + 25;
    doc.setFontSize(7);
    doc.text(
      'Recibí de conformidad lo relacionado en esta remisión. En caso de pérdida autorizo a Industrias Puropollo S.A.S. descontar de mis salarios,',
      margin, yFoot
    );
    doc.text(
      'vacaciones y demás prestaciones sociales o compensaciones a que tenga derecho. En señal de aceptación firmo.',
      margin, yFoot + 4
    );

    // Signature fields
    const ySig = yFoot + 14;
    doc.setFontSize(9);
    doc.text(`Entregado por: ${item.entregado_por || '____________________________'}`, margin, ySig);
    doc.text(`Nombre Transportador: ${item.conductor || '________________'}`, pageW / 2, ySig);
    doc.text(`Firma y Placa Transportador: ${item.vehiculo?.placa || '________'}`, margin, ySig + 8);

    // Save
    const fileName = `Remision_${item.remision || 'borrador'}_${item.fecha}.pdf`;
    try {
      if ('showSaveFilePicker' in window) {
        const handle = await (window as any).showSaveFilePicker({
          suggestedName: fileName,
          types: [{ description: 'PDF', accept: { 'application/pdf': ['.pdf'] } }],
        });
        const writable = await handle.createWritable();
        await writable.write(doc.output('arraybuffer'));
        await writable.close();
      } else {
        doc.save(fileName);
      }
      toast.success('Remisión PDF generada');
    } catch (err: any) {
      if (err.name !== 'AbortError') toast.error('Error al generar PDF: ' + err.message);
    }
  };

  // Estado badge renderer
  const renderEstado = (estado: string) => {
    const normalized = (estado || '').toLowerCase();
    return <span className={`estado-badge ${normalized}`}>{estado || '—'}</span>;
  };

  // Render filter input helper
  const renderFilterInput = useCallback((colKey: string) => {
    return (
      <div style={{ marginTop: '6px' }}>
        <input
          type="text"
          className="col-filter-input"
          placeholder="Filtrar..."
          value={columnFilters[colKey] || ''}
          onChange={e => handleColFilter(colKey, e.target.value)}
        />
      </div>
    );
  }, [columnFilters, handleColFilter]);

  return (
    <div>
      {/* Main Tabs: Despachos | Inventario MP */}
      <div className="tabs" style={{ marginBottom: 20 }}>
        <button className={`tab ${mainTab === 'despachos' ? 'active' : ''}`} onClick={() => setMainTab('despachos')} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Truck size={16} /> Despachos
        </button>
        <button className={`tab ${mainTab === 'inventario' ? 'active' : ''}`} onClick={() => setMainTab('inventario')} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Boxes size={16} /> Inventario MP
        </button>
      </div>

      {mainTab === 'inventario' && <InventarioMPPanel canEdit={canEdit} />}

      {mainTab === 'despachos' && <>
      {/* KPI Summary Strip */}
      <div className="despachos-kpi-strip">
        <div className="despachos-kpi">
          <div className="despachos-kpi-icon total"><FileText size={20} /></div>
          <div className="despachos-kpi-info">
            <span className="despachos-kpi-label">Total Despachos</span>
            <span className="despachos-kpi-value">{kpis.total}</span>
          </div>
        </div>
        <div className="despachos-kpi">
          <div className="despachos-kpi-icon draft"><FileText size={20} /></div>
          <div className="despachos-kpi-info">
            <span className="despachos-kpi-label">Borradores</span>
            <span className="despachos-kpi-value">{kpis.borradores}</span>
          </div>
        </div>
        <div className="despachos-kpi">
          <div className="despachos-kpi-icon dispatched"><Truck size={20} /></div>
          <div className="despachos-kpi-info">
            <span className="despachos-kpi-label">Despachados</span>
            <span className="despachos-kpi-value">{kpis.despachados}</span>
          </div>
        </div>
        <div className="despachos-kpi">
          <div className="despachos-kpi-icon bultos"><Package size={20} /></div>
          <div className="despachos-kpi-info">
            <span className="despachos-kpi-label">Total Bultos</span>
            <span className="despachos-kpi-value">{kpis.totalBultos.toLocaleString()}</span>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="toolbar flex justify-between items-center mb-4">
        <div className="toolbar-left flex items-center">
          <div className="search-box mr-4">
            <Search size={18} />
            <input
              type="text"
              className="form-input"
              placeholder="Buscar por fecha, remisión, cliente..."
              value={searchTerm}
              onChange={e => { setSearchTerm(e.target.value); setCurrentPage(1); }}
              style={{ paddingLeft: 40, width: 300 }}
            />
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--bg-app)', padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border-color)', height: 38 }}>
             <Calendar size={16} style={{ color: 'var(--text-muted)' }} />
             <input type="date" className="filter-input-date" value={fechaFiltroDesde} onChange={e => {setFechaFiltroDesde(e.target.value); setCurrentPage(1);}} style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: '0.85rem' }} title="Fecha Desde" />
             <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>a</span>
             <input type="date" className="filter-input-date" value={fechaFiltroHasta} onChange={e => {setFechaFiltroHasta(e.target.value); setCurrentPage(1);}} style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: '0.85rem' }} title="Fecha Hasta" />
          </div>
        </div>
        <div className="toolbar-right flex gap-2">
          <input type="file" ref={fileInputRef} accept=".xlsx,.xls" style={{ display: 'none' }} onChange={handleImportExcel} />
          {canEdit && (
            <button className="btn btn-outline btn-sm" onClick={() => fileInputRef.current?.click()}>
              <Upload size={16} /> Importar Excel
            </button>
          )}
          <button className="btn btn-outline btn-sm" onClick={() => setShowExportRange(!showExportRange)}>
            <Download size={16} /> Exportar Excel
          </button>
          {canEdit && (
            <button className="btn btn-primary btn-sm" onClick={openCreateForm}>
              <Plus size={16} /> Nuevo Despacho
            </button>
          )}
        </div>
      </div>

      {/* Modal for create / edit */}
      {showHeaderForm && (
        <div className="modal-overlay" onClick={() => setShowHeaderForm(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 900, maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="modal-header flex justify-between items-center">
              <h2 className="text-xl font-semibold">{editingId ? 'Editar Despacho' : 'Nuevo Despacho'}</h2>
              <button className="btn btn-ghost" onClick={() => setShowHeaderForm(false)}><X size={20} /></button>
            </div>
            <DespachoHeaderForm formData={headerData} onChange={handleHeaderChange} />
            <DetalleOPList initialDetails={details} onChange={handleDetailsChange} />
            <div className="modal-actions flex justify-end gap-2 mt-4">
              <button className="btn btn-outline" onClick={() => setShowHeaderForm(false)} disabled={saving}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Guardando...' : 'Guardar'}</button>
            </div>
          </div>
        </div>
      )}
      <Toast />

      {/* Export Range Panel */}
      {showExportRange && (
        <div className="card mb-4">
          <div className="card-header flex justify-between items-center">
            <span className="card-title">Rango de Exportación</span>
            <button className="btn btn-outline btn-sm" onClick={() => setShowExportRange(false)}>Cerrar</button>
          </div>
          <div className="card-body grid-4 gap-4">
            <div className="form-group">
              <label className="form-label">Fecha Desde</label>
              <input type="date" className="form-input" value={exportFechaDesde} onChange={e => setExportFechaDesde(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Fecha Hasta</label>
              <input type="date" className="form-input" value={exportFechaHasta} onChange={e => setExportFechaHasta(e.target.value)} />
            </div>
            <div className="flex justify-end gap-2 mt-2" style={{ gridColumn: 'span 4' }}>
              <button className="btn btn-outline btn-sm" onClick={() => { setExportFechaDesde(''); setExportFechaHasta(''); }}>Limpiar Rango</button>
              <button className="btn btn-primary btn-sm" onClick={exportToExcel}><Download size={16} /> Descargar Excel</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="modal-overlay" style={{ zIndex: 9999 }}>
          <div className="card" style={{ width: 420, padding: 24 }}>
            <h3 style={{ marginBottom: 15, color: 'var(--color-error)' }}>Confirmar Eliminación</h3>
            <p style={{ marginBottom: 20 }}>¿Estás seguro de eliminar este despacho? Esta acción no se puede deshacer.</p>
            <div className="flex justify-end gap-2">
              <button className="btn btn-outline" onClick={() => setDeleteConfirm(null)}>Cancelar</button>
              <button className="btn btn-danger" onClick={handleDelete}>Sí, Eliminar</button>
            </div>
          </div>
        </div>
      )}

      {/* Master Table */}
      <div className="card">
        <div className="card-body p-0">
          <div className="data-table-wrapper overflow-x-auto">
            <table className="data-table w-full">
              <thead>
                <tr>
                  <th style={{ width: 30 }}></th>
                  <th>Fecha {renderFilterInput('fecha')}</th>
                  <th>Remisión {renderFilterInput('remision')}</th>
                  <th>Cliente {renderFilterInput('cliente')}</th>
                  <th>Granja {renderFilterInput('granja')}</th>
                  <th>Placa {renderFilterInput('vehiculo')}</th>
                  <th>Conductor {renderFilterInput('conductor')}</th>
                  <th>OPs {renderFilterInput('op')}</th>
                  <th>Total Bultos</th>
                  <th>Estado {renderFilterInput('estado')}</th>
                  <th style={{ width: 90 }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={11} className="text-center py-4">
                    <div style={{ padding: '32px 0', color: 'var(--text-muted)' }}>
                      <div style={{ fontSize: '1.2rem', marginBottom: 8 }}>⏳</div>
                      Cargando despachos...
                    </div>
                  </td></tr>
                ) : paginatedData.length === 0 ? (
                  <tr><td colSpan={11}>
                    <div className="empty-state">
                      <Truck size={48} />
                      <p><strong>No se encontraron despachos</strong></p>
                      <p>Intenta con otros filtros o crea un nuevo despacho</p>
                    </div>
                  </td></tr>
                ) : (
                  paginatedData.map(item => {
                    const totalBultos = item.detalle?.reduce((sum: number, d: any) => sum + (d.cantidad_a_despachar || 0), 0) || 0;
                    const isExpanded = expandedRows.has(item.id);
                    const ops = item.detalle?.map((d: any) => d.op) || [];
                    return (
                      <Fragment key={item.id}>
                        {/* Master Row */}
                        <tr
                          className={`despacho-master-row ${isExpanded ? 'expanded' : ''}`}
                          onClick={() => toggleRow(item.id)}
                        >
                          <td>
                            <span className="expand-icon">
                              <ChevronR size={12} />
                            </span>
                          </td>
                          <td>{item.fecha}</td>
                          <td>
                            {item.remision
                              ? <span className="remision-value">{item.remision}</span>
                              : <span className="remision-draft">Sin remisión</span>
                            }
                          </td>
                          <td>{item.cliente?.nombre || '—'}</td>
                          <td>{item.granja?.nombre || '—'}</td>
                          <td>{item.vehiculo?.placa || '—'}</td>
                          <td>{item.conductor || '—'}</td>
                          <td>
                            <div className="op-tags">
                              {ops.slice(0, 4).map((op: any, i: number) => (
                                <span key={i} className="op-tag">{op}</span>
                              ))}
                              {ops.length > 4 && <span className="op-tag" style={{ background: 'var(--gold-100)', borderColor: 'var(--gold-300)' }}>+{ops.length - 4}</span>}
                            </div>
                          </td>
                          <td><span className="bultos-total">{totalBultos}</span></td>
                          <td>{renderEstado(item.estado)}</td>
                          <td>
                            <div className="action-btns" onClick={e => e.stopPropagation()}>
                              <button className="btn btn-outline btn-sm btn-icon" title="PDF Remisión" onClick={() => generateRemisionPDF(item)}><Printer size={14} /></button>
                              {canEdit && (
                                <>
                                  <button className="btn btn-outline btn-sm btn-icon" title="Editar" onClick={() => openEditForm(item)}><Edit2 size={14} /></button>
                                  <button className="btn btn-danger btn-sm btn-icon" title="Eliminar" onClick={() => confirmDelete(item.id)}><Trash2 size={14} /></button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                        {/* Detail Row (expandable) */}
                        {isExpanded && item.detalle && item.detalle.length > 0 && (
                          <tr className="despacho-detail-row">
                            <td colSpan={11}>
                              <div className="detail-table-wrapper">
                                <h4>Detalle de OPs — {item.detalle.length} {item.detalle.length === 1 ? 'línea' : 'líneas'}</h4>
                                <table className="detail-table">
                                  <thead>
                                    <tr>
                                      <th>OP (Lote)</th>
                                      <th>Alimento</th>
                                      <th>Bultos Despachados</th>
                                      <th>Bultos Dañados</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {item.detalle.map((d: any, di: number) => (
                                      <tr key={di}>
                                        <td><strong>{d.op}</strong></td>
                                        <td>{d.alimento || '—'}</td>
                                        <td>{d.cantidad_a_despachar || 0}</td>
                                        <td>{d.bultos_devueltos || 0}</td>
                                      </tr>
                                    ))}
                                    <tr style={{ fontWeight: 700, background: 'rgba(46, 125, 50, 0.06)' }}>
                                      <td colSpan={2}>TOTAL</td>
                                      <td>{totalBultos}</td>
                                      <td>{item.detalle.reduce((s: number, d: any) => s + (d.bultos_devueltos || 0), 0)}</td>
                                    </tr>
                                  </tbody>
                                </table>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          {/* Pagination */}
          <div className="pagination flex justify-between items-center p-3">
            <span>Mostrando {((currentPage - 1) * PAGE_SIZE) + 1}–{Math.min(currentPage * PAGE_SIZE, filtered.length)} de {filtered.length} registros (Total: {despachos.length})</span>
            {totalPages > 1 && (
              <div className="flex gap-2 items-center">
                <button className="btn btn-outline btn-sm" disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)}><ChevronLeft size={14} /> Ant</button>
                <span className="font-semibold">Pág {currentPage} / {totalPages}</span>
                <button className="btn btn-outline btn-sm" disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)}>Sig <ChevronRight size={14} /></button>
              </div>
            )}
          </div>
        </div>
      </div>
      <Toast />
      </>}
    </div>
  );
}