import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Search, Download, Upload, XCircle, ChevronLeft, ChevronRight, History, Trash2, Calendar } from 'lucide-react';
import { fetchHistoricoFacturacion, anularFactura, eliminarFactura, importarHistoricoFacturasExcel, toggleMatrizadaFactura, fetchOPsPorLotes, fetchFormulasDetalleBatch } from '../../lib/supabase';
import { HistoricoFacturacionRow } from '../../lib/types';
import { toast } from '../../components/Toast';
import { useVirtualizer } from '@tanstack/react-virtual';
import * as XLSX from 'xlsx';

const PAGE_SIZE = 200; // Increased from 100 — virtualizer handles the DOM load

export default function HistoricoFacturacion({ onRefreshKpis, isAdmin, canEdit = true, userRole }: { onRefreshKpis?: () => void; isAdmin?: boolean; canEdit?: boolean; userRole?: string }) {
  const [data, setData] = useState<HistoricoFacturacionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
  const [currentPage, setCurrentPage] = useState(1);
  
  // Date filter
  const [fechaFiltroDesde, setFechaFiltroDesde] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().split('T')[0];
  });
  const [fechaFiltroHasta, setFechaFiltroHasta] = useState(() => {
    return new Date().toISOString().split('T')[0];
  });
  const [anulando, setAnulando] = useState<number | null>(null);
  const [eliminando, setEliminando] = useState<number | null>(null);
  const [importing, setImporting] = useState(false);
  const [confirmAnular, setConfirmAnular] = useState<{ facturaId: number; numFactura: string } | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const rows = await fetchHistoricoFacturacion();
      setData(rows);
    } catch (e: unknown) {
      toast.error('Error cargando histórico: ' + (e as Error).message);
    }
    setLoading(false);
  };

  const handleColFilter = useCallback((key: string, value: string) => {
    setColumnFilters(prev => ({ ...prev, [key]: value }));
    setCurrentPage(1);
  }, []);

  const filtered = useMemo(() => {
    const st = searchTerm.toLowerCase();
    return data.filter(item => {
      // Use facturacion date or despacho date depending on what's available
      const rawDate = item.fecha_facturacion || item.fecha_despacho;
      const itemDate = rawDate ? String(rawDate).substring(0, 10) : '';
      if (fechaFiltroDesde && itemDate && itemDate < fechaFiltroDesde) return false;
      if (fechaFiltroHasta && itemDate && itemDate > fechaFiltroHasta) return false;

      if (st) {
        const str = `${item.num_factura} ${item.num_pedido} ${item.nombre_cliente} ${item.referencia} ${item.op} ${item.num_remision}`.toLowerCase();
        if (!str.includes(st)) return false;
      }
      for (const key of Object.keys(columnFilters)) {
        const fv = columnFilters[key];
        if (!fv) continue;
        const val = String((item as unknown as Record<string, unknown>)[key] ?? '').toLowerCase();
        if (!val.includes(fv.toLowerCase())) return false;
      }
      return true;
    }).sort((a, b) => {
      const numA = parseInt(String(a.num_factura).replace(/\D/g, '')) || 0;
      const numB = parseInt(String(b.num_factura).replace(/\D/g, '')) || 0;
      if (numA !== numB) return numB - numA;
      return String(b.num_factura).localeCompare(String(a.num_factura));
    });
  }, [data, searchTerm, columnFilters, fechaFiltroDesde, fechaFiltroHasta]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, currentPage]);

  const renderFilterInput = useCallback((colKey: string) => {
    return (
      <div style={{ marginTop: '4px' }}>
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

  const handleAnular = async () => {
    if (!canEdit) return;
    if (!confirmAnular) return;
    setAnulando(confirmAnular.facturaId);
    try {
      await anularFactura(confirmAnular.facturaId);
      toast.success(`Factura ${confirmAnular.numFactura} anulada. Los pedidos vuelven a estado LIBERADO.`);
      loadData();
      if (onRefreshKpis) onRefreshKpis();
    } catch (e: unknown) {
      toast.error('Error al anular: ' + (e as Error).message);
    }
    setAnulando(null);
    setConfirmAnular(null);
  };

  const handleEliminar = async (facturaId: number, numFactura: string) => {
    if (!canEdit) return;
    if (!window.confirm(`¿Estás seguro de ELIMINAR PERMANENTEMENTE la factura ${numFactura}? Sus pedidos volverán a estar LIBERADOS.`)) return;
    setEliminando(facturaId);
    try {
      await eliminarFactura(facturaId);
      toast.success(`Factura ${numFactura} eliminada.`);
      loadData();
      if (onRefreshKpis) onRefreshKpis();
    } catch (e: unknown) {
      toast.error('Error al eliminar: ' + (e as Error).message);
    }
    setEliminando(null);
  };

  const handleImportExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!canEdit) return;
    const file = e.target.files?.[0];
    if (!file) return;
    if (!window.confirm('¿Estás seguro de importar esta data? Se creará historial nuevo basado en las facturas.')) {
      e.target.value = '';
      return;
    }
    setImporting(true);
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const parsedData = XLSX.utils.sheet_to_json(ws);
        
        if (parsedData.length === 0) {
          toast.error("El archivo está vacío o no es válido.");
          setImporting(false);
          e.target.value = '';
          return;
        }
        
        const res = await importarHistoricoFacturasExcel(parsedData as Record<string, unknown>[]);
        toast.success(`Importación finalizada. ${res.success} facturas creadas. Errores: ${res.errors}`);
        loadData();
        if (onRefreshKpis) onRefreshKpis();
      } catch (err: unknown) {
        toast.error("Error al importar: " + (err as Error).message);
      }
      setImporting(false);
      e.target.value = ''; // Reset
    };
    reader.readAsBinaryString(file);
  };

  const handleToggleMatrizada = async (facturaId: number, currentStat: boolean) => {
    const isPiciz = userRole === 'Coordinador PICIZ' || userRole?.toLowerCase().includes('piciz');
    if (!canEdit && !isPiciz) return;
    try {
      // Find the num_factura to update duplicates as well
      const targetNumFactura = data.find(r => r.factura_id == facturaId)?.num_factura;
      
      // Optimistic update for ALL rows with this num_factura (handles imported duplicates)
      setData(prev => prev.map(r => r.num_factura === targetNumFactura ? { ...r, matrizada: !currentStat } : r));
      
      // Update ALL facturas in DB that share this num_factura
      const facturasToUpdate = Array.from(new Set(data.filter(r => r.num_factura === targetNumFactura).map(r => r.factura_id)));
      for (const fId of facturasToUpdate) {
         await toggleMatrizadaFactura(fId, !currentStat);
      }

      await loadData();
    } catch(e) {
      toast.error('Error al actualizar matrizado en Base de Datos');
      loadData();
    }
  };

  const generarReportePiciz = async () => {
    const pendientes = filtered.filter(f => !f.matrizada && f.estado_factura !== 'ANULADA');
    if (pendientes.length === 0) {
       toast.error("No hay facturas filtradas en pantalla que estén vigentes y Pendientes por Matrizar.");
       return;
    }
    
    // Obtener el file handle INMEDIATAMENTE para evitar perder el "user gesture" del navegador
    let fileHandle: any = null;
    if ('showSaveFilePicker' in window) {
      try {
        const win = window as unknown as { showSaveFilePicker: (options: unknown) => Promise<any> };
        fileHandle = await win.showSaveFilePicker({ 
           suggestedName: `Matrizado_Requerido_${new Date().toISOString().split('T')[0]}.xlsx`, 
           types: [{ description: 'Excel', accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] } }] 
        });
      } catch (err: unknown) {
        if ((err as Error).name !== 'AbortError') toast.error("Error al obtener acceso al archivo: " + (err as Error).message);
        return; // El usuario canceló el diálogo o no hay soporte
      }
    }

    setLoading(true);
    try {
        // Optimización: Solo consultar las OPs que están en las facturas pendientes
        const pendingLotes = Array.from(new Set(pendientes.map(p => p.op).filter(Boolean)));
        const opsProg = await fetchOPsPorLotes(pendingLotes);
        
        // Extraer los IDs de las fórmulas usadas por estas OPs
        const formulaIds = Array.from(new Set(opsProg.map(o => o.formula_id).filter(Boolean))) as number[];
        
        // Consultar los detalles de TODAS las fórmulas de una sola vez
        const formulasBatch = await fetchFormulasDetalleBatch(formulaIds);
        const formulasMap = new Map();
        for (const id of formulaIds) {
           formulasMap.set(id, formulasBatch[id] || []);
        }

        const reportData: Record<string, unknown>[] = [];
        for (const p of pendientes) {
           const opData = opsProg.find((o: Record<string, unknown>) => o.lote === p.op);
           if (!opData || !opData.formula_id) continue;
           const formulaDet = formulasMap.get(opData.formula_id) || [];
           
           let sacosPorBache = (opData as { formulas?: { sacos_por_bache?: number } }).formulas?.sacos_por_bache || 0;
           if (!sacosPorBache || sacosPorBache === 0) {
              const sacoMat = formulaDet.find((m: Record<string, unknown>) => (m.inventario_materiales as { nombre?: string })?.nombre?.toUpperCase().includes('SACO'));
              if (sacoMat && sacoMat.cantidad_base > 0) {
                 sacosPorBache = sacoMat.cantidad_base;
              } else {
                 const totalKgFormula = formulaDet.reduce((s: number, m: Record<string, unknown>) => {
                    const nom = (m.inventario_materiales as { nombre?: string })?.nombre?.toUpperCase() || '';
                    if (nom.includes('SACO') || nom.includes('ETIQUETA') || nom.includes('HILO')) return s;
                    return s + (Number(m.cantidad_base) || 0);
                 }, 0);
                 sacosPorBache = totalKgFormula > 0 ? Math.round(totalKgFormula / 40) : 25;
              }
           }
           if (sacosPorBache <= 0) sacosPorBache = 25;

           const bachesEq = (p.bultos || 0) / sacosPorBache;
           
           for (const mat of formulaDet) {
              const kgCon = mat.cantidad_base * bachesEq;
              if (kgCon > 0) {
                 reportData.push({
                    'N° Factura': p.num_factura,
                    'Cliente': p.nombre_cliente,
                    'Descripción Alimento': p.referencia,
                    'Categoría': mat.referencia || 'SIN CLASIFICAR',
                    'Código Materia Prima': mat.inventario_materiales?.codigo || '',
                    'Materia Prima': mat.inventario_materiales?.nombre || '',
                    'Total KG': Number(kgCon.toFixed(2)),
                    'OP': p.op
                 });
              }
           }
        }

        if (reportData.length === 0) {
           toast.error("No hay consumos calculables (verifique que las OPs ligadas tengan fórmulas asignadas).");
           setLoading(false);
           return;
        }

        const ws = XLSX.utils.json_to_sheet(reportData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Pendientes_Piciz');
        
        if (fileHandle) {
          const writable = await fileHandle.createWritable();
          await writable.write(XLSX.write(wb, { bookType: 'xlsx', type: 'array' }));
          await writable.close();
        } else {
          XLSX.writeFile(wb, `Matrizado_Requerido_${new Date().toISOString().split('T')[0]}.xlsx`);
        }
        toast.success("Reporte generado con éxito.");
    } catch(e: unknown) {
        toast.error("Error al generar: " + (e as Error).message);
    }
    setLoading(false);
  };

  // Export to Excel
  const exportToExcel = async () => {
    if (filtered.length === 0) { toast.error('No hay datos para exportar.'); return; }
    const dataForExcel = filtered.map(row => ({
      'N° Remisión': row.num_remision || '',
      'Fecha Despacho': row.fecha_despacho || '',
      'Cliente': row.nombre_cliente || '',
      'Cód. Cliente': row.codigo_cliente || '',
      'OP': row.op || '',
      'Referencia': row.referencia || '',
      'Cód. Alimento': row.codigo_alimento || '',
      'Bultos': row.bultos || 0,
      'KG': row.kg || 0,
      'N° Pedido': row.num_pedido || '',
      'Estado Pedido': row.estado_pedido || '',
      'N° Entrega': row.num_entrega || '',
      'Orden SAP': row.orden_sap || '',
      'N° Factura': row.num_factura || '',
      'Fecha Facturación': row.fecha_facturacion || '',
      'Estado Factura': row.estado_factura || '',
    }));
    const ws = XLSX.utils.json_to_sheet(dataForExcel);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'HISTORICO_FACTURACION');
    try {
      if ('showSaveFilePicker' in window) {
        const win = window as unknown as { showSaveFilePicker: (options: unknown) => Promise<{ createWritable: () => Promise<{ write: (data: unknown) => Promise<void>; close: () => Promise<void> }> }> };
        const handle = await win.showSaveFilePicker({
          suggestedName: 'Historico_Facturacion.xlsx',
          types: [{ description: 'Excel', accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] } }],
        });
        const writable = await handle.createWritable();
        await writable.write(XLSX.write(wb, { bookType: 'xlsx', type: 'array' }));
        await writable.close();
      } else {
        XLSX.writeFile(wb, 'Historico_Facturacion.xlsx');
      }
      toast.success('Exportación completada.');
    } catch (e: unknown) {
      if ((e as Error).name !== 'AbortError') toast.error('Error al exportar: ' + (e as Error).message);
    }
  };

  const renderEstadoFactura = (est: string) => {
    if (est === 'ANULADA') return <span className="estado-tag anulada">ANULADA</span>;
    return <span className="estado-tag facturada">FACTURADA</span>;
  };

  // Pre-compute per-row flags for virtualized rendering
  // (can't use mutable Set inside render with virtualization)
  const rowFlags = useMemo(() => {
    const flags: Record<number, { showAnular: boolean; showMatrizada: boolean; showDelete: boolean }> = {};
    const seen = new Set<number>();
    const matSeen = new Set<number>();
    const delSeen = new Set<number>();
    for (let i = 0; i < paginatedData.length; i++) {
      const row = paginatedData[i];
      const fId = row.factura_id || 0;
      flags[i] = {
        showAnular: row.estado_factura !== 'ANULADA' && !seen.has(fId),
        showMatrizada: !matSeen.has(fId),
        showDelete: !delSeen.has(fId),
      };
      if (row.estado_factura !== 'ANULADA') seen.add(fId);
      matSeen.add(fId);
      delSeen.add(fId);
    }
    return flags;
  }, [paginatedData]);

  // Virtualized scrolling
  const scrollRef = useRef<HTMLDivElement>(null);
  const ROW_HEIGHT = 38;
  const virtualizer = useVirtualizer({
    count: paginatedData.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
  });


  return (
    <div className="fact-tab-content">
      {/* Confirm Modal */}
      {confirmAnular && (
        <div className="modal-overlay" style={{ zIndex: 9999 }}>
          <div className="card" style={{ width: 460, padding: 28 }}>
            <h3 style={{ marginBottom: 12, color: 'var(--color-error)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <XCircle size={20} /> Confirmar Anulación
            </h3>
            <p style={{ marginBottom: 8 }}>
              ¿Estás seguro de anular la factura <strong>{confirmAnular.numFactura}</strong>?
            </p>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 20 }}>
              Los pedidos asociados volverán a estado <strong>LIBERADO</strong> y el saldo de las OPs se liberará
              para iniciar nuevamente el proceso.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button className="btn btn-outline" onClick={() => setConfirmAnular(null)}>Cancelar</button>
              <button className="btn btn-danger" onClick={handleAnular} disabled={anulando !== null}>
                {anulando ? 'Anulando...' : 'Sí, Anular Factura'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-header">
          <span className="card-title">📊 Histórico de Facturación ({filtered.length} registros)</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <div className="search-box">
              <Search size={16} />
              <input
                type="text"
                className="form-input"
                placeholder="Buscar..."
                value={searchTerm}
                onChange={e => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                style={{ paddingLeft: 36, width: 200 }}
              />
            </div>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--bg-app)', padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border-color)', height: 38 }}>
               <Calendar size={16} style={{ color: 'var(--text-muted)' }} />
               <input type="date" className="filter-input-date" value={fechaFiltroDesde} onChange={e => {setFechaFiltroDesde(e.target.value); setCurrentPage(1);}} style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: '0.85rem' }} title="Fecha Desde" />
               <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>a</span>
               <input type="date" className="filter-input-date" value={fechaFiltroHasta} onChange={e => {setFechaFiltroHasta(e.target.value); setCurrentPage(1);}} style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: '0.85rem' }} title="Fecha Hasta" />
            </div>

            {canEdit && (
              <label className="btn btn-outline btn-sm" style={{ cursor: 'pointer', opacity: importing ? 0.7 : 1 }}>
                <input 
                  type="file" 
                  accept=".xlsx, .xls" 
                  style={{ display: 'none' }} 
                  onChange={handleImportExcel} 
                  disabled={importing}
                />
                <Upload size={14} /> {importing ? '...' : 'Import Excel'}
              </label>
            )}
            <button className="btn btn-primary btn-sm" onClick={generarReportePiciz} disabled={loading} style={{ background: 'var(--color-warning)', color: '#000', borderColor: 'var(--color-warning)' }}>
              Explosión PICIZ (Pendientes)
            </button>
            <button className="btn btn-outline btn-sm" onClick={exportToExcel}>
              <Download size={14} /> Export Excel
            </button>
          </div>
        </div>
        <div className="card-body" style={{ padding: 0 }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)' }}>
              Cargando histórico de facturación...
            </div>
          ) : paginatedData.length === 0 ? (
            <div className="fact-empty">
              <History size={48} />
              <h3>Sin registros</h3>
              <p>No hay facturas registradas en el histórico.</p>
            </div>
          ) : (
            <div
              ref={scrollRef}
              style={{ maxHeight: 'calc(100vh - 380px)', overflow: 'auto' }}
            >
              <table className="data-table" style={{ width: '100%', minWidth: 1800, whiteSpace: 'nowrap' }}>
                <thead style={{ position: 'sticky', top: 0, zIndex: 2 }}>
                  <tr>
                    <th style={{ verticalAlign: 'top', width: 60, textAlign: 'center' }}>Matrizada</th>
                    <th style={{ verticalAlign: 'top' }}>Remisión {renderFilterInput('num_remision')}</th>
                    <th style={{ verticalAlign: 'top' }}>F. Despacho</th>
                    <th style={{ verticalAlign: 'top' }}>Cliente {renderFilterInput('nombre_cliente')}</th>
                    <th style={{ verticalAlign: 'top' }}>Cód. Cl.</th>
                    <th style={{ verticalAlign: 'top' }}>OP {renderFilterInput('op')}</th>
                    <th style={{ verticalAlign: 'top' }}>Referencia {renderFilterInput('referencia')}</th>
                    <th style={{ verticalAlign: 'top' }}>Cód. Alim.</th>
                    <th style={{ verticalAlign: 'top' }}>Bultos</th>
                    <th style={{ verticalAlign: 'top' }}>KG</th>
                    <th style={{ verticalAlign: 'top' }}>N° Pedido {renderFilterInput('num_pedido')}</th>
                    <th style={{ verticalAlign: 'top' }}>N° Entrega</th>
                    <th style={{ verticalAlign: 'top' }}>Orden SAP</th>
                    <th style={{ verticalAlign: 'top' }}>N° Factura {renderFilterInput('num_factura')}</th>
                    <th style={{ verticalAlign: 'top' }}>F. Factura</th>
                    <th style={{ verticalAlign: 'top' }}>Estado {renderFilterInput('estado_factura')}</th>
                    {canEdit && <th style={{ verticalAlign: 'top', width: 90 }}>Acciones</th>}
                  </tr>
                </thead>
                <tbody>
                  {/* Top spacer for virtualization */}
                  {virtualizer.getVirtualItems().length > 0 && virtualizer.getVirtualItems()[0].start > 0 && (
                    <tr><td colSpan={canEdit ? 17 : 16} style={{ height: virtualizer.getVirtualItems()[0].start, padding: 0, border: 'none' }} /></tr>
                  )}
                  {virtualizer.getVirtualItems().map(virtualRow => {
                    const idx = virtualRow.index;
                    const row = paginatedData[idx];
                    const flags = rowFlags[idx] || { showAnular: false, showMatrizada: false, showDelete: false };

                    const isPiciz = userRole === 'Coordinador PICIZ' || userRole?.toLowerCase().includes('piciz');
                    const canToggleMatrizado = canEdit || isPiciz;
                    const disableToggle = !!row.matrizada && !isAdmin;

                    return (
                      <tr key={virtualRow.key} data-index={idx} style={row.estado_factura === 'ANULADA' ? { opacity: 0.5, textDecoration: 'line-through', height: ROW_HEIGHT } : { height: ROW_HEIGHT }}>
                        <td style={{ textAlign: 'center' }}>
                          {flags.showMatrizada && row.estado_factura !== 'ANULADA' && canToggleMatrizado ? (
                             <label className="switch-sm" title={disableToggle ? "Solo el Administrador puede desmarcar" : "Marcar como procesado por PICIZ"} style={{ opacity: disableToggle ? 0.6 : 1 }}>
                               <input type="checkbox" checked={!!row.matrizada} disabled={disableToggle} onChange={() => handleToggleMatrizada(row.factura_id || 0, !!row.matrizada)} />
                               <span className="slider round"></span>
                             </label>
                          ) : row.matrizada ? (
                            <span style={{ fontSize: '0.8rem', color: 'var(--color-success)', fontWeight: 600 }}>Sí</span>
                          ) : null}
                        </td>
                        <td>
                          {row.num_remision || (row.es_anticipado
                            ? <span className="estado-tag anticipado" style={{ fontSize: '0.65rem' }}>ANT</span>
                            : '—'
                          )}
                        </td>
                        <td>{row.fecha_despacho || '—'}</td>
                        <td style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={row.nombre_cliente}>{row.nombre_cliente || '—'}</td>
                        <td style={{ fontFamily: 'monospace', fontSize: '0.78rem' }}>{row.codigo_cliente || '—'}</td>
                        <td style={{ fontWeight: 700 }}>{row.op}</td>
                        <td style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={row.referencia}>{row.referencia || '—'}</td>
                        <td style={{ fontFamily: 'monospace' }}>{row.codigo_alimento || '—'}</td>
                        <td style={{ fontWeight: 600 }}>{row.bultos}</td>
                        <td>{(row.kg || 0).toLocaleString()}</td>
                        <td>{row.num_pedido || '—'}</td>
                        <td>{row.num_entrega || '—'}</td>
                        <td style={{ fontFamily: 'monospace' }}>{row.orden_sap || '—'}</td>
                        <td style={{ fontWeight: 700 }}>{row.num_factura}</td>
                        <td>{row.fecha_facturacion || '—'}</td>
                        <td>{renderEstadoFactura(row.estado_factura)}</td>
                        {canEdit && (
                          <td>
                            <div style={{ display: 'flex', gap: 4 }}>
                              {flags.showAnular && (
                                <button
                                  className="btn-anular"
                                  onClick={() => setConfirmAnular({ facturaId: row.factura_id || 0, numFactura: row.num_factura || '' })}
                                >
                                  <XCircle size={12} /> Anular
                                </button>
                              )}
                              {isAdmin && flags.showDelete && (
                                <button
                                  className="btn btn-danger btn-sm btn-icon"
                                  onClick={() => handleEliminar(row.factura_id || 0, row.num_factura || '')}
                                  disabled={eliminando === row.factura_id}
                                  title="Eliminar Factura Permanentemente"
                                >
                                  <Trash2 size={12} />
                                </button>
                              )}
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                  {/* Bottom spacer for virtualization */}
                  {virtualizer.getVirtualItems().length > 0 && (
                    <tr><td colSpan={canEdit ? 17 : 16} style={{ height: virtualizer.getTotalSize() - virtualizer.getVirtualItems()[virtualizer.getVirtualItems().length - 1].end, padding: 0, border: 'none' }} /></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
          <div className="pagination" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px' }}>
            <span>
              Mostrando {((currentPage - 1) * PAGE_SIZE) + 1}–{Math.min(currentPage * PAGE_SIZE, filtered.length)} de {filtered.length} registros (Total: {data.length})
            </span>
            {totalPages > 1 && (
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <button className="btn btn-outline btn-sm" disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)}>
                  <ChevronLeft size={14} /> Ant
                </button>
                <span style={{ fontWeight: 600 }}>Pág {currentPage} / {totalPages}</span>
                <button className="btn btn-outline btn-sm" disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)}>
                  Sig <ChevronRight size={14} />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
