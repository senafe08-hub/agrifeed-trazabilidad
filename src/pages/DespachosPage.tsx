import { useState, useEffect, useCallback, Fragment } from 'react';
import { Plus, Search, Edit2, Trash2, Download, X, Truck, FileText, Package, ChevronRight as ChevronR, Upload, Printer, Calendar, Boxes } from 'lucide-react';
import { useForm, FormProvider } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { DespachoEncabezado, DespachoDetalle } from '../lib/types';
import DespachoHeaderForm from '../components/DespachoHeaderForm';
import DetalleOPList from '../components/DetalleOPList';
import InventarioMPPanel from '../components/InventarioMPPanel';
import InventarioPTPanel from '../components/InventarioPTPanel';
import { Navigate } from 'react-router-dom';
import { usePermissions } from '../lib/permissions';
import { useDespachos } from '../hooks/useDespachos';
import { useDespachosReportes } from '../hooks/useDespachosReportes';
import { despachoFormSchema, DespachoFormValues } from '../schemas/despachos';
import { fetchNextRemision, supabase } from '../lib/supabase';
import * as XLSX from 'xlsx';
import '../styles/modal.css';
import '../styles/despachos.css';

const PAGE_SIZE = 100;

export default function DespachosPage() {
  const { canView, canEdit } = usePermissions('despachos');
  const [mainTab, setMainTab] = useState<'despachos' | 'inventario' | 'inventario_pt'>('despachos');


  const methods = useForm<DespachoFormValues>({
    // @ts-expect-error Zod/react-hook-form type mismatch for dynamic arrays
    resolver: zodResolver(despachoFormSchema),
    defaultValues: {
      estado: 'borrador',
      details: []
    }
  });

  const handleOpenCreateForm = async () => {
    if (!canEdit) return;
    let nextRemision = '';
    try {
      nextRemision = String(await fetchNextRemision());
    } catch (err) {}
    setEditingId(null);
    methods.reset({
      fecha: new Date().toISOString().split('T')[0],
      remision: nextRemision,
      estado: 'borrador',
      details: []
    });
    setShowHeaderForm(true);
  };

  const handleOpenEditForm = (item: DespachoEncabezado) => {
    if (!canEdit) return;
    setEditingId(item.remision || item.id);
    methods.reset({
      id: item.id as unknown as number,
      fecha: item.fecha,
      hora: item.hora || '',
      remision: item.remision?.toString() || '',
      cliente_id: (item.cliente_id || '') as unknown as number,
      granja_id: (item.granja_id || '') as unknown as number,
      vehiculo_id: (item.vehiculo_id || '') as unknown as number,
      conductor: item.conductor || '',
      entregado_por: item.entregado_por || '',
      observaciones: item.observaciones || '',
      estado: (item.estado || 'borrador') as 'borrador' | 'despachado' | 'anulado',
      details: item.detalle?.map((d: DespachoDetalle) => ({
        id: d.id,
        op: d.op,
        cantidad_a_despachar: d.cantidad_a_despachar,
        bultos_danados: d.bultos_devueltos,
        observaciones: d.observaciones,
      })) || []
    });
    setShowHeaderForm(true);
  };

  // Pagination & filters (still on master rows)
  const [searchTerm, setSearchTerm] = useState('');
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
  const [currentPage, setCurrentPage] = useState(1);

  // Date filters
  const [fechaFiltroDesde, setFechaFiltroDesde] = useState('');
  const [fechaFiltroHasta, setFechaFiltroHasta] = useState('');

  // Export UI
  const [showExportRange, setShowExportRange] = useState(false);
  const [exportFechaDesde, setExportFechaDesde] = useState('');
  const [exportFechaHasta, setExportFechaHasta] = useState('');

  // Use the new Server-Side paginated hook
  const { 
    despachos, totalRecords, kpis, loading, expandedRows,
    showHeaderForm, setShowHeaderForm,
    editingId, setEditingId, saving, deleteConfirm,
    handleSave, confirmDelete, handleDelete,
    toggleRow, loadDespachos, setDeleteConfirm
  } = useDespachos({
    page: currentPage,
    pageSize: PAGE_SIZE,
    searchTerm,
    columnFilters,
    fechaDesde: fechaFiltroDesde,
    fechaHasta: fechaFiltroHasta
  });

  // Fetch master‑detail data
  useEffect(() => {
    if (canView) {
      loadDespachos();
    }
  }, [canView, loadDespachos]);

  if (!canView) return <Navigate to="/" replace />;

  // Filters
  const handleColFilter = useCallback((key: string, value: string) => {
    setColumnFilters(prev => ({ ...prev, [key]: value }));
    setCurrentPage(1);
  }, []);

  const totalPages = Math.ceil(totalRecords / PAGE_SIZE);

  const { fileInputRef, handleImportExcel, generateRemisionPDF } = useDespachosReportes(canEdit, despachos, loadDespachos);

  // Re-write Excel Export for Server-Side
  const exportToExcel = async () => {
    if (!exportFechaDesde && !exportFechaHasta) {
      alert("Debes definir al menos un rango de fechas para exportar.");
      return;
    }

    let query = supabase.from('vista_despachos_encabezados').select('*');
    if (exportFechaDesde) query = query.gte('fecha', exportFechaDesde);
    if (exportFechaHasta) query = query.lte('fecha', exportFechaHasta);

    const { data: headers, error } = await query;
    if (error) { alert('Error descargando datos: ' + error.message); return; }
    if (!headers || headers.length === 0) { alert('No hay datos en ese rango para exportar.'); return; }

    const headerIds = headers.map(h => h.id_encabezado);
    const { data: details, error: detError } = await supabase.from('vista_despachos_detalle').select('*').in('id_encabezado', headerIds);
    if (detError) { alert('Error descargando detalles: ' + detError.message); return; }

    let rows: Record<string, unknown>[] = [];
    headers.forEach((enc: Record<string, unknown>) => {
      const base = {
        Fecha: enc.fecha as string,
        Remisión: enc.remision as string,
        Cliente: enc.cliente_nombre as string,
        Granja: (enc.granja_nombre as string) || '',
        Placa: enc.vehiculo_placa as string,
        Conductor: enc.conductor as string,
        Observaciones: (enc.observaciones as string) || '',
        Estado: enc.estado as string,
      };
      const encDetails = (details || []).filter((d: Record<string, unknown>) => d.id_encabezado === enc.id_encabezado);
      if (encDetails.length > 0) {
        encDetails.forEach((det: Record<string, unknown>) => {
          rows.push({
            ...base,
            OP: det.op as string,
            Alimento: (det.alimento as string) || '',
            'Cant. Despachada': det.cantidad_a_despachar as number,
            'Bultos Devueltos': det.bultos_devueltos as number,
            ObservaciónDetalle: (det.observaciones as string) || '',
          });
        });
      } else {
        rows.push(base);
      }
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'DESPACHOS');
    try {
      if ('showSaveFilePicker' in window) {
        const win = window as unknown as { showSaveFilePicker: (options: unknown) => Promise<{ createWritable: () => Promise<{ write: (data: unknown) => Promise<void>; close: () => Promise<void> }> }> };
        const handle = await win.showSaveFilePicker({ suggestedName: 'Despachos.xlsx', types: [{ description: 'Excel', accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] } }] });
        const writable = await handle.createWritable();
        await writable.write(XLSX.write(wb, { bookType: 'xlsx', type: 'array' }));
        await writable.close();
      } else { XLSX.writeFile(wb, 'Despachos.xlsx'); }
    } catch (e) { }
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
        <button className={`tab ${mainTab === 'inventario_pt' ? 'active' : ''}`} onClick={() => setMainTab('inventario_pt')} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Package size={16} /> Inventario PT
        </button>
      </div>

      {mainTab === 'inventario' && <InventarioMPPanel canEdit={canEdit} />}
      {mainTab === 'inventario_pt' && <InventarioPTPanel />}

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
            <button className="btn btn-primary btn-sm" onClick={handleOpenCreateForm}>
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
            
            <FormProvider {...methods}>
              <form onSubmit={methods.handleSubmit(data => handleSave(data as unknown as DespachoFormValues))}>
                <DespachoHeaderForm />
                <DetalleOPList clienteId={methods.watch('cliente_id')} />
                <div className="modal-actions flex justify-end gap-2 mt-4">
                  <button type="button" className="btn btn-outline" onClick={() => setShowHeaderForm(false)} disabled={saving}>Cancelar</button>
                  <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Guardando...' : 'Guardar'}</button>
                </div>
              </form>
            </FormProvider>
          </div>
        </div>
      )}


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
                {loading ? <tr><td colSpan={11} style={{ textAlign: 'center', padding: '30px' }}>Cargando despachos...</td></tr> : (
                  despachos.length === 0 ? (
                    <tr><td colSpan={11} style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>No se encontraron despachos</td></tr>
                  ) : (
                    despachos.map(item => {
                      const totalBultos = item.detalle?.reduce((sum: number, d: DespachoDetalle) => sum + (d.cantidad_a_despachar || 0), 0) || 0;
                      const isExpanded = expandedRows.has(item.id);
                      const ops = item.detalle?.map((d: DespachoDetalle) => d.op) || [];
                      return (
                        <Fragment key={item.id}>
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
                                {ops.slice(0, 4).map((op: number | string, i: number) => (
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
                                    <button className="btn btn-outline btn-sm btn-icon" title="Editar" onClick={() => handleOpenEditForm(item)}><Edit2 size={14} /></button>
                                    <button className="btn btn-danger btn-sm btn-icon" title="Eliminar" onClick={() => confirmDelete(item.id as string | number)}><Trash2 size={14} /></button>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
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
                                      {item.detalle.map((d: DespachoDetalle, di: number) => (
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
                                        <td>{item.detalle.reduce((s: number, d: DespachoDetalle) => s + (d.bultos_devueltos || 0), 0)}</td>
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
                  )
                )}
              </tbody>
            </table>
          </div>
          <div className="pagination" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px' }}>
            <span>Mostrando {((currentPage - 1) * PAGE_SIZE) + 1}–{Math.min(currentPage * PAGE_SIZE, totalRecords)} de {totalRecords} despachos</span>
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

      </>}
    </div>
  );
}