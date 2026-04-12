import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Plus, Search, Edit2, Trash2, Download, Upload, ChevronLeft, ChevronRight, Calendar, FlaskConical, Link2, Zap } from 'lucide-react';
import { Navigate } from 'react-router-dom';
import { usePermissions } from '../lib/permissions';
import supabase from '../lib/supabase';
import * as XLSX from 'xlsx';
import FormulacionPanel from './FormulacionPage';

const PAGE_SIZE = 100;

export default function ProgramacionPage() {
  const { canView, canEdit } = usePermissions('programacion');
  const { canEdit: canEditFormulas } = usePermissions('formulacion');
  const [mainTab, setMainTab] = useState<'programacion' | 'catalogo' | 'asociar' | 'explosion'>('programacion');

  const [searchTerm, setSearchTerm] = useState('');
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);

  // Export range state
  const [showExportRange, setShowExportRange] = useState(false);
  const [exportFechaDesde, setExportFechaDesde] = useState('');
  const [exportFechaHasta, setExportFechaHasta] = useState('');
  const [exportOpDesde, setExportOpDesde] = useState('');
  const [exportOpHasta, setExportOpHasta] = useState('');

  // CRUD State
  const [showForm, setShowForm] = useState(false);
  const [formMode, setFormMode] = useState<'crear' | 'editar'>('crear');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);

  // Import state
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Maestros state for dropdowns
  const [alimentos, setAlimentos] = useState<any[]>([]);
  const [clientes, setClientes] = useState<any[]>([]);

  useEffect(() => {
    if (canView) {
      fetchData();
      fetchMaestros();
    }
  }, [canView]);

  if (!canView) return <Navigate to="/" replace />;

  const fetchMaestros = async () => {
    const { data: a } = await supabase.from('maestro_alimentos').select('codigo_sap, descripcion').order('descripcion');
    if (a) setAlimentos(a);
    const { data: c } = await supabase.from('maestro_clientes').select('codigo_sap, nombre').order('nombre');
    if (c) setClientes(c);
  };

  const fetchData = async () => {
    setLoading(true);
    const { data: rawData, error } = await supabase
      .from('programacion')
      .select(`*, maestro_alimentos(descripcion), maestro_clientes(nombre)`)
      .order('lote', { ascending: false })
      .limit(10000);

    if (!error && rawData) {
      const processed = rawData.map(item => ({
        ...item,
        alimento_nombre: item.maestro_alimentos ? (item.maestro_alimentos as any).descripcion : item.alimento || 'Sin Alimento',
        cliente_nombre: item.maestro_clientes ? (item.maestro_clientes as any).nombre : '—',
      }));
      setData(processed);
    }
    setLoading(false);
  };

  // ── CRUD ──
  const handleOpenForm = useCallback((item?: any) => {
    if (!canEdit) return;
    if (item) {
      setFormMode('editar');
      setEditingId(item.id);
      setFormData({
        fecha: item.fecha, lote: item.lote, codigo_sap: item.codigo_sap,
        bultos_programados: item.bultos_programados, num_baches: item.num_baches,
        cliente_id: item.cliente_id, observaciones: item.observaciones
      });
    } else {
      setFormMode('crear');
      setEditingId(null);
      setFormData({ fecha: new Date().toISOString().split('T')[0] });
    }
    setShowForm(true);
  }, [canEdit]);

  const handleCloseForm = useCallback(() => {
    setShowForm(false);
    setFormData({});
    setEditingId(null);
  }, []);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    let val: any = value;
    if (type === 'number') val = value ? Number(value) : null;
    if (value === '') val = null;
    setFormData((prev: any) => ({ ...prev, [name]: val }));
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit) return;
    setSaving(true);
    try {
      if (formMode === 'crear') {
        const { error } = await supabase.from('programacion').insert([formData]);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('programacion').update(formData).eq('id', editingId);
        if (error) throw error;
      }
      handleCloseForm();
      fetchData();
    } catch (err: any) {
      alert(`Error al guardar: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = useCallback((id: number) => {
    if (!canEdit) return;
    setDeleteConfirm(id);
  }, [canEdit]);

  const handleDelete = async () => {
    if (!canEdit || !deleteConfirm) return;
    const { error } = await supabase.from('programacion').delete().eq('id', deleteConfirm);
    if (error) {
      alert(`No se pudo eliminar: Este lote puede tener registros de producción, despachos o facturación asociados.`);
    } else {
      fetchData();
    }
    setDeleteConfirm(null);
  };

  // ── FILTERS (memoized) ──
  const handleColFilter = useCallback((key: string, value: string) => {
    setColumnFilters(prev => ({ ...prev, [key]: value }));
    setCurrentPage(1);
  }, []);

  const filtered = useMemo(() => {
    const st = searchTerm.toLowerCase();
    return data.filter(item => {
      if (st) {
        const str = `${item.fecha} ${item.lote} ${item.codigo_sap} ${item.alimento_nombre} ${item.cliente_nombre} ${item.observaciones || ''}`.toLowerCase();
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

  // Datalist unique values — computed once from full data, not on every filter change
  const datalistValues = useMemo(() => {
    const cols = ['fecha', 'lote', 'codigo_sap', 'alimento_nombre', 'cliente_nombre', 'observaciones'];
    const result: Record<string, string[]> = {};
    for (const col of cols) {
      const set = new Set<string>();
      for (let i = 0; i < data.length; i++) {
        const v = data[i][col];
        if (v != null && v !== '') set.add(String(v));
      }
      result[col] = Array.from(set);
    }
    return result;
  }, [data]);

  // Pagination
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, currentPage]);

  const renderFilterInput = useCallback((colKey: string) => {
    const listId = `dl-prog-${colKey}`;
    return (
      <div style={{ marginTop: '6px' }}>
        <input
          type="text"
          list={listId}
          className="col-filter-input"
          placeholder="Filtrar..."
          value={columnFilters[colKey] || ''}
          onChange={(e) => handleColFilter(colKey, e.target.value)}
        />
        <datalist id={listId}>
          {(datalistValues[colKey] || []).slice(0, 200).map(val => <option key={val} value={val} />)}
        </datalist>
      </div>
    );
  }, [columnFilters, datalistValues, handleColFilter]);

  // ── EXPORT ──
  const exportToExcel = async () => {
    let tableData = [...filtered];
    if (exportFechaDesde) tableData = tableData.filter(r => r.fecha >= exportFechaDesde);
    if (exportFechaHasta) tableData = tableData.filter(r => r.fecha <= exportFechaHasta);
    if (exportOpDesde) tableData = tableData.filter(r => Number(r.lote) >= Number(exportOpDesde));
    if (exportOpHasta) tableData = tableData.filter(r => Number(r.lote) <= Number(exportOpHasta));

    if (tableData.length === 0) { alert("No hay datos en ese rango para exportar."); return; }
    
    const dataForExcel = tableData.map(row => ({
      'Fecha': row.fecha, 'Lote (OP)': row.lote, 'Código SAP': row.codigo_sap,
      'Alimento': row.alimento_nombre, 'Bultos Prog.': row.bultos_programados,
      'Baches': row.num_baches, 'Cliente': row.cliente_nombre, 'Observaciones': row.observaciones || ''
    }));

    const ws = XLSX.utils.json_to_sheet(dataForExcel);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'PROGRAMACION');

    try {
      if ('showSaveFilePicker' in window) {
        const handle = await (window as any).showSaveFilePicker({
          suggestedName: 'Programacion.xlsx',
          types: [{ description: 'Excel', accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] } }],
        });
        const writable = await handle.createWritable();
        await writable.write(XLSX.write(wb, { bookType: 'xlsx', type: 'array' }));
        await writable.close();
      } else {
        XLSX.writeFile(wb, 'Programacion.xlsx');
      }
    } catch (e: any) {
      if (e.name !== 'AbortError') alert("Error al exportar: " + e.message);
    }
  };

  // ── IMPORT ──
  const handleImportClick = () => fileInputRef.current?.click();

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!canEdit) return;
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportResult(null);

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rawRows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });

      if (rawRows.length === 0) throw new Error("El archivo está vacío.");

      const { data: clientList } = await supabase.from('maestro_clientes').select('codigo_sap, nombre');
      const clientMap = new Map<string, number>();
      if (clientList) {
        for (const c of clientList) clientMap.set(c.nombre.toUpperCase().trim(), c.codigo_sap);
      }

      const resolveClient = (clienteText: string, obsText: string): number | null => {
        const ct = (clienteText || '').toUpperCase().trim();
        const ot = (obsText || '').toUpperCase().trim();
        if (clientMap.has(ct)) return clientMap.get(ct)!;
        if (ct === 'CERDOS' || ct === '') {
          for (const [name, sap] of clientMap.entries()) {
            if (name !== 'CERDOS PREMEX' && name !== 'CERDOS NUTREXCOL' && ot.includes(name)) return sap;
          }
          return clientMap.get('CERDOS PREMEX') || null;
        }
        if (ct.includes('NUTREXCOL')) return clientMap.get('CERDOS NUTREXCOL') || null;
        for (const [name, sap] of clientMap.entries()) {
          if (ct.includes(name) || name.includes(ct)) return sap;
        }
        return null;
      };

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
          } else { fecha = fechaRaw; }
        }
        const clienteText = String(find(['CLIENTE']) || '');
        const obsText = String(find(['OBS', 'OBSERV']) || '');
        return {
          fecha, lote: Number(find(['OP', 'LOTE'])) || null,
          codigo_sap: Number(find(['COD', 'SAP'])) || null,
          bultos_programados: Number(find(['BULTO', 'PRODUCIR'])) || 0,
          num_baches: Number(find(['BACHE', 'NUMERO D'])) || null,
          cliente_id: resolveClient(clienteText, obsText),
          observaciones: obsText || null,
        };
      };

      const mappedRows = rawRows.map(mapRow).filter(r => r.lote && r.fecha);
      if (mappedRows.length === 0) throw new Error("No se encontraron filas válidas.");

      let inserted = 0, skipped = 0, errors = 0;
      for (const row of mappedRows) {
        const { error } = await supabase.from('programacion').insert([row]);
        if (error) {
          if (error.message.includes('duplicate') || error.message.includes('unique')) skipped++;
          else { errors++; console.error(`Error lote ${row.lote}:`, error.message); }
        } else { inserted++; }
      }

      setImportResult(`✅ Importación completa: ${inserted} nuevos, ${skipped} ya existían, ${errors} errores.`);
      fetchData();
    } catch (err: any) {
      setImportResult(`❌ Error: ${err.message}`);
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div>
      {/* ── Main Tabs ── */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '2px solid var(--border-color)' }}>
        {[
          { key: 'programacion', label: 'Programación', icon: Calendar },
          { key: 'catalogo', label: 'Catálogo Fórmulas', icon: FlaskConical },
          { key: 'asociar', label: 'Asociar OP ↔ Fórmula', icon: Link2 },
          { key: 'explosion', label: 'Explosión Traslado', icon: Zap },
        ].map(t => (
          <button key={t.key} onClick={() => setMainTab(t.key as any)}
            style={{
              padding: '10px 20px', display: 'flex', alignItems: 'center', gap: 8,
              border: 'none', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 600,
              borderBottom: mainTab === t.key ? '3px solid #2E7D32' : '3px solid transparent',
              color: mainTab === t.key ? '#2E7D32' : 'var(--text-muted)',
              background: mainTab === t.key ? 'rgba(46,125,50,0.06)' : 'transparent',
              borderRadius: '8px 8px 0 0', transition: 'all 0.2s',
            }}
          >
            <t.icon size={18} /> {t.label}
          </button>
        ))}
      </div>

      {/* ── Formulación tabs ── */}
      {mainTab !== 'programacion' && (
        <FormulacionPanel canEdit={canEditFormulas} tab={mainTab as 'catalogo' | 'asociar' | 'explosion'} />
      )}

      {/* ── Programación tab ── */}
      {mainTab === 'programacion' && (
      <>
      {/* Toolbar */}
      <div className="toolbar">
        <div className="toolbar-left">
          <div className="search-box">
            <Search size={18} />
            <input type="text" className="form-input" placeholder="Búsqueda global..."
              value={searchTerm} onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
              style={{ paddingLeft: 40, width: 300 }}
            />
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
              <Plus size={16} /> Nueva OP
            </button>
          )}
        </div>
      </div>

      {/* Export Range Panel */}
      {showExportRange && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-header">
            <span className="card-title">Rango de Exportación</span>
            <button className="btn btn-outline btn-sm" onClick={() => setShowExportRange(false)}>Cerrar</button>
          </div>
          <div className="card-body">
            <div className="grid-4" style={{ alignItems: 'end' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Fecha Desde</label>
                <input type="date" className="form-input" value={exportFechaDesde} onChange={e => setExportFechaDesde(e.target.value)} />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Fecha Hasta</label>
                <input type="date" className="form-input" value={exportFechaHasta} onChange={e => setExportFechaHasta(e.target.value)} />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">OP Desde</label>
                <input type="number" className="form-input" placeholder="Ej: 4900" value={exportOpDesde} onChange={e => setExportOpDesde(e.target.value)} />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">OP Hasta</label>
                <input type="number" className="form-input" placeholder="Ej: 4970" value={exportOpHasta} onChange={e => setExportOpHasta(e.target.value)} />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 12 }}>
              <button className="btn btn-outline btn-sm" onClick={() => { setExportFechaDesde(''); setExportFechaHasta(''); setExportOpDesde(''); setExportOpHasta(''); }}>Limpiar Rango</button>
              <button className="btn btn-primary btn-sm" onClick={exportToExcel}>
                <Download size={16} /> Descargar Excel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import Result */}
      {importResult && (
        <div className="card" style={{ marginBottom: 16, padding: '12px 20px', background: importResult.startsWith('✅') ? 'var(--green-100)' : '#FFEBEE' }}>
          <span style={{ fontWeight: 600 }}>{importResult}</span>
          <button className="btn btn-sm btn-outline" style={{ marginLeft: 16 }} onClick={() => setImportResult(null)}>Cerrar</button>
        </div>
      )}

      {/* Form */}
      {showForm && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-header">
            <span className="card-title">{formMode === 'crear' ? 'Nueva Operación (OP)' : 'Editar Operación (OP)'}</span>
            <button className="btn btn-outline btn-sm" onClick={handleCloseForm}>Cancelar</button>
          </div>
          <div className="card-body">
            <form onSubmit={handleSave}>
              <div className="grid-3">
                <div className="form-group">
                  <label className="form-label">Fecha</label>
                  <input type="date" name="fecha" className="form-input" required value={formData.fecha || ''} onChange={handleInputChange} />
                </div>
                <div className="form-group">
                  <label className="form-label">Lote (OP)</label>
                  <input type="number" name="lote" className="form-input" required value={formData.lote || ''} onChange={handleInputChange} />
                </div>
                <div className="form-group">
                  <label className="form-label">Alimento (Código SAP)</label>
                  <select name="codigo_sap" className="form-select" required value={formData.codigo_sap || ''} onChange={handleInputChange}>
                    <option value="">Seleccionar alimento...</option>
                    {alimentos.map((a: any) => (
                      <option key={a.codigo_sap} value={a.codigo_sap}>{a.codigo_sap} - {a.descripcion}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Bultos a Producir</label>
                  <input type="number" name="bultos_programados" className="form-input" required value={formData.bultos_programados || ''} onChange={handleInputChange} />
                </div>
                <div className="form-group">
                  <label className="form-label">Número de Baches</label>
                  <input type="number" name="num_baches" className="form-input" value={formData.num_baches || ''} onChange={handleInputChange} />
                </div>
                <div className="form-group">
                  <label className="form-label">Cliente</label>
                  <select name="cliente_id" className="form-select" value={formData.cliente_id || ''} onChange={handleInputChange}>
                    <option value="">Sin asignar</option>
                    {clientes.map((c: any) => (
                      <option key={c.codigo_sap} value={c.codigo_sap}>{c.nombre}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Observaciones</label>
                <input type="text" name="observaciones" className="form-input" value={formData.observaciones || ''} onChange={handleInputChange} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Guardando...' : 'Guardar Operación'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="modal-overlay" style={{ zIndex: 9999 }}>
          <div className="card" style={{ width: 420, padding: 24 }}>
            <h3 style={{ marginBottom: 15, color: 'var(--color-error)' }}>Confirmar Eliminación</h3>
            <p style={{ marginBottom: 20 }}>¿Estás absolutamente seguro de eliminar esta OP? Si tiene registros asociados, no se podrá borrar.</p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button className="btn btn-outline" onClick={() => setDeleteConfirm(null)}>Cancelar</button>
              <button className="btn btn-danger" onClick={handleDelete}>Sí, Eliminar</button>
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="card">
        <div className="card-body" style={{ padding: 0 }}>
          <div className="data-table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ verticalAlign: 'top' }}>Fecha {renderFilterInput("fecha")}</th>
                  <th style={{ verticalAlign: 'top' }}>Lote (OP) {renderFilterInput("lote")}</th>
                  <th style={{ verticalAlign: 'top' }}>Código {renderFilterInput("codigo_sap")}</th>
                  <th style={{ verticalAlign: 'top' }}>Alimento {renderFilterInput("alimento_nombre")}</th>
                  <th style={{ verticalAlign: 'top' }}>Bultos Prog.</th>
                  <th style={{ verticalAlign: 'top' }}>Baches</th>
                  <th style={{ verticalAlign: 'top' }}>Cliente {renderFilterInput("cliente_nombre")}</th>
                  <th style={{ verticalAlign: 'top' }}>Observaciones {renderFilterInput("observaciones")}</th>
                  {canEdit && <th style={{ verticalAlign: 'top', width: 80 }}>Acciones</th>}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={canEdit ? 9 : 8} style={{ textAlign: 'center', padding: '20px' }}>Cargando operaciones...</td></tr>
                ) : paginatedData.map((item) => (
                  <tr key={item.id}>
                    <td>{item.fecha}</td>
                    <td style={{ fontWeight: 700 }}>{item.lote}</td>
                    <td>{item.codigo_sap}</td>
                    <td style={{ maxWidth: 250, overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.alimento_nombre}</td>
                    <td>{item.bultos_programados ? item.bultos_programados.toLocaleString() : 0}</td>
                    <td>{item.num_baches}</td>
                    <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      <span className={`badge ${item.cliente_id ? 'badge-success' : 'badge-neutral'}`}>
                        {item.cliente_nombre}
                      </span>
                    </td>
                    <td style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', fontSize: '0.8rem' }}>{item.observaciones || '-'}</td>
                    {canEdit && (
                      <td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button className="btn btn-outline btn-sm btn-icon" title="Editar" onClick={() => handleOpenForm(item)}>
                            <Edit2 size={14} />
                          </button>
                          <button className="btn btn-danger btn-sm btn-icon" title="Eliminar" onClick={() => confirmDelete(item.id)}>
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="pagination" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px' }}>
            <span>Mostrando {((currentPage - 1) * PAGE_SIZE) + 1}–{Math.min(currentPage * PAGE_SIZE, filtered.length)} de {filtered.length} registros (Total: {data.length})</span>
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
      </>
      )}
    </div>
  );
}
