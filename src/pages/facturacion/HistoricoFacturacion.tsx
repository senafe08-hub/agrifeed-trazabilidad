import { useState, useEffect, useMemo, useCallback } from 'react';
import { Search, Download, Upload, XCircle, ChevronLeft, ChevronRight, History, Trash2, Calendar } from 'lucide-react';
import { fetchHistoricoFacturacion, anularFactura, eliminarFactura, importarHistoricoFacturasExcel } from '../../lib/supabase';
import { toast } from '../../components/Toast';
import * as XLSX from 'xlsx';

const PAGE_SIZE = 100;

export default function HistoricoFacturacion({ onRefreshKpis, isAdmin, canEdit = true }: { onRefreshKpis?: () => void; isAdmin?: boolean; canEdit?: boolean }) {
  const [data, setData] = useState<any[]>([]);
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
    } catch (e: any) {
      toast.error('Error cargando histórico: ' + e.message);
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
        const val = String((item as any)[key] ?? '').toLowerCase();
        if (!val.includes(fv.toLowerCase())) return false;
      }
      return true;
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
    } catch (e: any) {
      toast.error('Error al anular: ' + e.message);
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
    } catch (e: any) {
      toast.error('Error al eliminar: ' + e.message);
    }
    setEliminando(null);
  };

  const handleImportExcel = (e: any) => {
    if (!canEdit) return;
    const file = e.target.files[0];
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
        
        const res = await importarHistoricoFacturasExcel(parsedData as any[]);
        toast.success(`Importación finalizada. ${res.success} facturas creadas. Errores: ${res.errors}`);
        loadData();
        if (onRefreshKpis) onRefreshKpis();
      } catch (err: any) {
        toast.error("Error al importar: " + err.message);
      }
      setImporting(false);
      e.target.value = ''; // Reset
    };
    reader.readAsBinaryString(file);
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
        const handle = await (window as any).showSaveFilePicker({
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
    } catch (e: any) {
      if (e.name !== 'AbortError') toast.error('Error al exportar: ' + e.message);
    }
  };

  const renderEstadoFactura = (est: string) => {
    if (est === 'ANULADA') return <span className="estado-tag anulada">ANULADA</span>;
    return <span className="estado-tag facturada">FACTURADA</span>;
  };

  // Unique factura IDs (to show anular button only once per factura)
  const facturaIdsShown = new Set<number | string>();

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
            <button className="btn btn-outline btn-sm" onClick={exportToExcel}>
              <Download size={14} /> Export Excel
            </button>
          </div>
        </div>
        <div className="card-body" style={{ padding: 0 }}>
          <div className="data-table-wrapper" style={{ maxHeight: 'calc(100vh - 380px)' }}>
            <table className="data-table">
              <thead>
                <tr>
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
                {loading ? (
                  <tr><td colSpan={16} style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)' }}>
                    Cargando histórico de facturación...
                  </td></tr>
                ) : paginatedData.length === 0 ? (
                  <tr><td colSpan={16}>
                    <div className="fact-empty">
                      <History size={48} />
                      <h3>Sin registros</h3>
                      <p>No hay facturas registradas en el histórico.</p>
                    </div>
                  </td></tr>
                ) : paginatedData.map((row, idx) => {
                  const showAnular = row.estado_factura !== 'ANULADA' && !facturaIdsShown.has(row.factura_id);
                  if (row.estado_factura !== 'ANULADA') facturaIdsShown.add(row.factura_id);
                  return (
                    <tr key={idx} style={row.estado_factura === 'ANULADA' ? { opacity: 0.5, textDecoration: 'line-through' } : {}}>
                      <td>
                        {row.num_remision || (row.es_anticipado
                          ? <span className="estado-tag anticipado" style={{ fontSize: '0.65rem' }}>ANT</span>
                          : '—'
                        )}
                      </td>
                      <td>{row.fecha_despacho || '—'}</td>
                      <td style={{ maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.nombre_cliente || '—'}</td>
                      <td style={{ fontFamily: 'monospace', fontSize: '0.78rem' }}>{row.codigo_cliente || '—'}</td>
                      <td style={{ fontWeight: 700 }}>{row.op}</td>
                      <td style={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.referencia || '—'}</td>
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
                            {showAnular && (
                              <button
                                className="btn-anular"
                                onClick={() => setConfirmAnular({ facturaId: row.factura_id, numFactura: row.num_factura })}
                              >
                                <XCircle size={12} /> Anular
                              </button>
                            )}
                            {isAdmin && !facturaIdsShown.has('btn_del_' + row.factura_id) && (
                              // Add marker so we only show one delete button per matching factura row
                              (() => { facturaIdsShown.add('btn_del_' + row.factura_id); return null; })(),
                              <button
                                className="btn btn-danger btn-sm btn-icon"
                                onClick={() => handleEliminar(row.factura_id, row.num_factura)}
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
              </tbody>
            </table>
          </div>
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
