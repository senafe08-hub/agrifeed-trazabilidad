import { useState, useEffect } from 'react';
import { Plus, Search, Edit2, Trash2, Download, DollarSign } from 'lucide-react';
import { Navigate } from 'react-router-dom';
import { usePermissions } from '../lib/permissions';
import supabase, { registrarAuditoria } from '../lib/supabase';
import * as XLSX from 'xlsx';

const CUPO_EDIT_ROLES = ['Administrador', 'Analista de Costos', 'Analista de Cartera'];

const tabs = [
  { id: 'alimentos', label: 'Alimentos' },
  { id: 'clientes', label: 'Clientes' },
  { id: 'vehiculos', label: 'Vehículos' },
  { id: 'granjas', label: 'Granjas' },
];

export default function MaestroPage() {
  const { canView, canEdit, userRole } = usePermissions('maestro');
  const canEditCupos = CUPO_EDIT_ROLES.includes(userRole);

  const [activeTab, setActiveTab] = useState('alimentos');
  const [searchTerm, setSearchTerm] = useState('');
  const [columnFilters, setColumnFilters] = useState<any>({});
  
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // CRUD State
  const [showForm, setShowForm] = useState(false);
  const [formMode, setFormMode] = useState<'crear' | 'editar'>('crear');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);

  useEffect(() => {
    if (canView) {
      fetchData();
      setShowForm(false);
      setColumnFilters({});
    }
  }, [activeTab, canView]);

  if (!canView) return <Navigate to="/" replace />;

  const getTableName = () => {
    if (activeTab === 'alimentos') return 'maestro_alimentos';
    if (activeTab === 'clientes') return 'maestro_clientes';
    if (activeTab === 'vehiculos') return 'maestro_vehiculos';
    if (activeTab === 'granjas') return 'maestro_granjas';
    return '';
  };

  const getOrderBy = () => {
    if (activeTab === 'alimentos') return 'codigo_sap';
    if (activeTab === 'clientes') return 'nombre';
    if (activeTab === 'vehiculos') return 'placa';
    if (activeTab === 'granjas') return 'nombre';
    return 'id';
  };

  const fetchData = async () => {
    setLoading(true);
    let table = getTableName();
    if (table) {
      const { data: result, error } = await supabase.from(table).select('*').order(getOrderBy()).limit(10000);
      if (!error && result) {
        setData(result);
      } else {
        console.error(error);
        setData([]);
      }
    }
    setLoading(false);
  };

  const handleOpenForm = (item?: any) => {
    if (!canEdit) return;
    if (item) {
      setFormMode('editar');
      setEditingId(item.id);
      setFormData({ ...item });
    } else {
      setFormMode('crear');
      setEditingId(null);
      setFormData({});
    }
    setShowForm(true);
  };

  const handleCloseForm = () => {
    setShowForm(false);
    setFormData({});
    setEditingId(null);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    let val: any = value;
    if (type === 'number') val = value ? Number(value) : null;
    if (type === 'checkbox') val = (e.target as HTMLInputElement).checked;
    
    setFormData((prev: any) => ({ ...prev, [name]: val }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit) return;
    setSaving(true);
    let table = getTableName();
    
    const payload = { ...formData };
    // Remove id and created_at if present during create/update
    delete payload.id;
    delete payload.created_at;

    try {
      if (formMode === 'crear') {
        const { error } = await supabase.from(table).insert([payload]);
        if (error) throw error;
        await registrarAuditoria('CREATE', 'Maestro de Datos', `Se creó un registro en la tabla ${table} (${payload.descripcion || payload.nombre || payload.placa || 'Nuevo Registro'})`);
      } else {
        const { error } = await supabase.from(table).update(payload).eq('id', editingId);
        if (error) throw error;
        await registrarAuditoria('UPDATE', 'Maestro de Datos', `Se actualizó un registro en la tabla ${table} (${payload.descripcion || payload.nombre || payload.placa || 'Registro ID ' + editingId})`);
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
    const table = getTableName();
    
    // Buscar el item en la lista actual para sacar su nombre comercial
    const targetItem = data.find(d => d.id === deleteConfirm);
    const itemName = targetItem ? (targetItem.descripcion || targetItem.nombre || targetItem.placa || `ID ${deleteConfirm}`) : `ID ${deleteConfirm}`;

    const { error } = await supabase.from(table).delete().eq('id', deleteConfirm);
    if (error) {
      alert(`No se pudo eliminar: Puede que este registro esté siendo usado en otras hojas.`);
    } else {
      await registrarAuditoria('DELETE', 'Maestro de Datos', `Se eliminó permanentemente: ${itemName}`);
      fetchData();
    }
    setDeleteConfirm(null);
  };

  const handleColFilter = (key: string, value: string) => {
    setColumnFilters((prev: any) => ({ ...prev, [key]: value }));
  };

  const renderFilterInput = (colKey: string) => {
    const uniqueValues = Array.from(new Set(data.map(d => d[colKey]).filter(Boolean)));
    const listId = `dl-${colKey}-${activeTab}`;
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
          {uniqueValues.map(val => (
             <option key={String(val)} value={String(val)} />
          ))}
        </datalist>
      </div>
    );
  };

  const getFilteredData = () => {
    return data.filter(item => {
      // Global search filter
      if (searchTerm) {
        const globalStr = Object.values(item).join(' ').toLowerCase();
        if (!globalStr.includes(searchTerm.toLowerCase())) return false;
      }

      // Column filters
      if (activeTab === 'alimentos') {
        if (columnFilters.codigo_sap && !String(item.codigo_sap || '').toLowerCase().includes(columnFilters.codigo_sap.toLowerCase())) return false;
        if (columnFilters.descripcion && !String(item.descripcion || '').toLowerCase().includes(columnFilters.descripcion.toLowerCase())) return false;
        if (columnFilters.categoria && !String(item.categoria || '').toLowerCase().includes(columnFilters.categoria.toLowerCase())) return false;
      }
      if (activeTab === 'clientes') {
        if (columnFilters.codigo_sap && !String(item.codigo_sap || '').toLowerCase().includes(columnFilters.codigo_sap.toLowerCase())) return false;
        if (columnFilters.nombre && !String(item.nombre || '').toLowerCase().includes(columnFilters.nombre.toLowerCase())) return false;
        if (columnFilters.poblacion && !String(item.poblacion || '').toLowerCase().includes(columnFilters.poblacion.toLowerCase())) return false;
        if (columnFilters.tipo_pago && !String(item.tipo_pago || '').toLowerCase().includes(columnFilters.tipo_pago.toLowerCase())) return false;
      }
      if (activeTab === 'vehiculos') {
        if (columnFilters.placa && !String(item.placa || '').toLowerCase().includes(columnFilters.placa.toLowerCase())) return false;
        if (columnFilters.conductor && !String(item.conductor || '').toLowerCase().includes(columnFilters.conductor.toLowerCase())) return false;
      }
      if (activeTab === 'granjas') {
        if (columnFilters.nombre && !String(item.nombre || '').toLowerCase().includes(columnFilters.nombre.toLowerCase())) return false;
      }
      return true;
    });
  };

  const exportToExcel = async () => {
    const tableData = getFilteredData();
    if (tableData.length === 0) {
      alert("No hay datos para exportar.");
      return;
    }
    const headers = Object.keys(tableData[0]).filter(k => k !== 'id' && k !== 'created_at');
    
    // Prepare Data for Excel
    const dataForExcel = tableData.map(row => {
      let filteredRow: any = {};
      headers.forEach(h => filteredRow[h] = row[h]);
      return filteredRow;
    });

    // Create Worksheet and Workbook
    const worksheet = XLSX.utils.json_to_sheet(dataForExcel);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, activeTab.toUpperCase());

    try {
      if ('showSaveFilePicker' in window) {
        // Use WebView2 native dialog
        const opts = {
          suggestedName: `Maestros_${activeTab}.xlsx`,
          types: [{
            description: 'Excel Spreadsheet',
            accept: {'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx']},
          }],
        };
        const handle = await (window as any).showSaveFilePicker(opts);
        const writable = await handle.createWritable();
        const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
        await writable.write(buffer);
        await writable.close();
      } else {
        // Fallback 
        XLSX.writeFile(workbook, `Maestros_${activeTab}.xlsx`);
      }
    } catch (e: any) {
      if (e.name !== 'AbortError') {
         alert("Error al guardar el archivo: " + e.message);
      }
    }
  };

  const renderTableContent = () => {
    if (loading) return <tr><td colSpan={5} style={{ textAlign: 'center', padding: '20px' }}>Cargando datos...</td></tr>;
    
    const filtered = getFilteredData();
    if (filtered.length === 0) return <tr><td colSpan={5} style={{ textAlign: 'center', padding: '20px' }}>No hay registros.</td></tr>;

    if (activeTab === 'alimentos') {
      return filtered.map((item) => (
        <tr key={item.id}>
          <td style={{ fontWeight: 600 }}>{item.codigo_sap}</td>
          <td>{item.descripcion}</td>
          <td><span className="badge badge-success">{item.categoria || 'Sin categoría'}</span></td>
          {canEdit && (
            <td>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="btn btn-outline btn-sm btn-icon" title="Editar" onClick={() => handleOpenForm(item)}><Edit2 size={14} /></button>
                <button className="btn btn-danger btn-sm btn-icon" title="Eliminar" onClick={() => confirmDelete(item.id)}><Trash2 size={14} /></button>
              </div>
            </td>
          )}
        </tr>
      ));
    }

    if (activeTab === 'clientes') {
      return filtered.map((item) => {
        const tipoPago = item.tipo_pago || 'CONTADO';
        const limite = Number(item.limite_credito) || 0;
        const isCredito = tipoPago.toUpperCase().includes('CREDITO') || tipoPago.toUpperCase().includes('CRÉDITO');
        const tipoInv = item.tipo_inventario || 'VARIOS';
        return (
          <tr key={item.id}>
            <td style={{ fontWeight: 600 }}>{item.codigo_sap}</td>
            <td>{item.nombre}</td>
            <td>{item.poblacion || '—'}</td>
            <td>
              <span className={`dc-tipo-badge ${isCredito ? 'credito' : 'contado'}`}>
                {tipoPago}
              </span>
            </td>
            <td style={{ textAlign: 'right', fontWeight: 600 }}>
              {isCredito ? `$ ${limite.toLocaleString('es-CO')}` : '—'}
            </td>
            <td>
              <span className={`badge ${tipoInv === 'UNICO' ? 'badge-warning' : 'badge-neutral'}`}>
                {tipoInv}
              </span>
            </td>
            <td style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>{item.grupo_inventario || '—'}</td>
            {canEdit && (
              <td>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn btn-outline btn-sm btn-icon" title="Editar" onClick={() => handleOpenForm(item)}><Edit2 size={14} /></button>
                  <button className="btn btn-danger btn-sm btn-icon" title="Eliminar" onClick={() => confirmDelete(item.id)}><Trash2 size={14} /></button>
                </div>
              </td>
            )}
          </tr>
        );
      });
    }
    
    if (activeTab === 'vehiculos') {
       return filtered.map(item => (
         <tr key={item.id}>
           <td style={{ fontWeight: 600 }}>{item.placa}</td>
           <td>{item.conductor}</td>
           <td>
              <span className={`badge ${item.activo ? 'badge-success' : 'badge-neutral'}`}>
                {item.activo ? 'Activo' : 'Inactivo'}
              </span>
           </td>
           {canEdit && (
             <td>
               <div style={{ display: 'flex', gap: 6 }}>
                 <button className="btn btn-outline btn-sm btn-icon" title="Editar" onClick={() => handleOpenForm(item)}><Edit2 size={14} /></button>
                 <button className="btn btn-danger btn-sm btn-icon" title="Eliminar" onClick={() => confirmDelete(item.id)}><Trash2 size={14} /></button>
               </div>
             </td>
           )}
         </tr>
       ));
    }

    if (activeTab === 'granjas') {
      return filtered.map(item => (
        <tr key={item.id}>
          <td>{item.nombre}</td>
          {canEdit && (
            <td>
              <div style={{ display: 'flex', gap: 6 }}>
                 <button className="btn btn-outline btn-sm btn-icon" title="Editar" onClick={() => handleOpenForm(item)}><Edit2 size={14} /></button>
                 <button className="btn btn-danger btn-sm btn-icon" title="Eliminar" onClick={() => confirmDelete(item.id)}><Trash2 size={14} /></button>
              </div>
            </td>
          )}
        </tr>
      ));
   }
  };

  const renderForm = () => {
    return (
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header">
          <span className="card-title">{formMode === 'crear' ? 'Nuevo Registro' : 'Editar Registro'} - {tabs.find(t => t.id === activeTab)?.label}</span>
          <button className="btn btn-outline btn-sm" onClick={handleCloseForm}>Cancelar</button>
        </div>
        <div className="card-body">
          <form onSubmit={handleSave}>
            <div className="grid-3">
              {activeTab === 'alimentos' && (
                <>
                  <div className="form-group">
                    <label className="form-label">Código SAP</label>
                    <input type="number" name="codigo_sap" className="form-input" required value={formData.codigo_sap || ''} onChange={handleInputChange} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Descripción</label>
                    <input type="text" name="descripcion" className="form-input" required value={formData.descripcion || ''} onChange={handleInputChange} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Categoría</label>
                    <input type="text" name="categoria" list="cat-list" className="form-input" value={formData.categoria || ''} onChange={handleInputChange} />
                    <datalist id="cat-list">
                      {Array.from(new Set(data.map(d => d.categoria).filter(Boolean))).map((cat: any) => (
                        <option key={cat} value={cat} />
                      ))}
                    </datalist>
                  </div>
                </>
              )}

              {activeTab === 'clientes' && (
                <>
                  <div className="form-group">
                    <label className="form-label">Código SAP</label>
                    <input type="number" name="codigo_sap" className="form-input" required value={formData.codigo_sap || ''} onChange={handleInputChange} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Nombre del Cliente</label>
                    <input type="text" name="nombre" className="form-input" required value={formData.nombre || ''} onChange={handleInputChange} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Población / Ciudad</label>
                    <input type="text" name="poblacion" className="form-input" value={formData.poblacion || ''} onChange={handleInputChange}
                      list="pob-list" />
                    <datalist id="pob-list">
                      {Array.from(new Set(data.map(d => d.poblacion).filter(Boolean))).map((p: any) => (
                        <option key={p} value={p} />
                      ))}
                    </datalist>
                  </div>
                  {canEditCupos && (
                    <>
                      <div className="form-group">
                        <label className="form-label">Tipo de Pago</label>
                        <select name="tipo_pago" className="form-input" value={formData.tipo_pago || 'CONTADO'} onChange={handleInputChange}>
                          <option value="CONTADO">CONTADO</option>
                          <option value="CREDITO">CRÉDITO</option>
                        </select>
                      </div>
                      <div className="form-group">
                        <label className="form-label"><DollarSign size={14} style={{ marginRight: 4 }} />Límite de Crédito</label>
                        <input type="number" name="limite_credito" className="form-input" min="0" value={formData.limite_credito || ''} onChange={handleInputChange}
                          disabled={(formData.tipo_pago || 'CONTADO') === 'CONTADO'} />
                      </div>
                    </>
                  )}
                  <div className="form-group">
                    <label className="form-label">Tipo Inventario PT</label>
                    <select name="tipo_inventario" className="form-input" value={formData.tipo_inventario || 'VARIOS'} onChange={handleInputChange}>
                      <option value="VARIOS">VARIOS (Inventario compartido)</option>
                      <option value="UNICO">UNICO (Bodega exclusiva)</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Grupo Inventario</label>
                    <input type="text" name="grupo_inventario" className="form-input" 
                      placeholder={formData.tipo_inventario === 'UNICO' ? 'Ej: VILTAGRO SAS' : 'Automático por casa formuladora'}
                      value={formData.grupo_inventario || ''} onChange={handleInputChange}
                      list="grupo-inv-list" />
                    <datalist id="grupo-inv-list">
                      {Array.from(new Set(data.map(d => d.grupo_inventario).filter(Boolean))).map((g: any) => (
                        <option key={g} value={g} />
                      ))}
                    </datalist>
                    <small style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                      {formData.tipo_inventario === 'UNICO' 
                        ? '* Escriba el nombre del grupo exclusivo de este cliente' 
                        : '* Se asignará automáticamente según casa formuladora'}
                    </small>
                  </div>
                </>
              )}

              {activeTab === 'vehiculos' && (
                <>
                  <div className="form-group">
                    <label className="form-label">Placa</label>
                    <input type="text" name="placa" className="form-input" required value={formData.placa || ''} onChange={handleInputChange} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Conductor</label>
                    <input type="text" name="conductor" className="form-input" value={formData.conductor || ''} onChange={handleInputChange} />
                  </div>
                  <div className="form-group" style={{ display: 'flex', alignItems: 'center', height: '100%', paddingTop: 24 }}>
                    <label style={{ display: 'flex', gap: 8, cursor: 'pointer' }}>
                      <input type="checkbox" name="activo" checked={formData.activo !== false} onChange={handleInputChange} />
                      Vehículo Activo
                    </label>
                  </div>
                </>
              )}

              {activeTab === 'granjas' && (
                <>
                  <div className="form-group">
                    <label className="form-label">Nombre de Granja</label>
                    <input type="text" name="nombre" className="form-input" required value={formData.nombre || ''} onChange={handleInputChange} />
                  </div>
                </>
              )}
            </div>
            
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? 'Guardando...' : 'Guardar Datos'}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  };

  return (
    <div>
      <div className="tabs">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="toolbar">
        <div className="toolbar-left">
          <div className="search-box">
            <Search size={18} />
            <input
              type="text"
              className="form-input"
              placeholder="Búsqueda global..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ paddingLeft: 40, width: 300 }}
            />
          </div>
        </div>
        <div className="toolbar-right">
          <button className="btn btn-outline btn-sm" onClick={exportToExcel}><Download size={16} /> Exportar Excel</button>
          {canEdit && (
            <button className="btn btn-primary btn-sm" onClick={() => handleOpenForm()}><Plus size={16} /> Agregar</button>
          )}
        </div>
      </div>

      {showForm && renderForm()}

      {deleteConfirm && (
        <div className="modal-overlay" style={{ zIndex: 9999 }}>
          <div className="card" style={{ width: 400, padding: 20 }}>
            <h3 style={{ marginBottom: 15, color: 'var(--color-error)' }}>Confirmar Eliminación</h3>
            <p style={{ marginBottom: 20 }}>¿Estás absolutamente seguro de eliminar este registro? Esta acción no se puede deshacer.</p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button className="btn btn-outline" onClick={() => setDeleteConfirm(null)}>Cancelar</button>
              <button className="btn btn-danger" onClick={handleDelete}>Sí, Eliminar</button>
            </div>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-body" style={{ padding: 0 }}>
          <div className="data-table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  {activeTab === 'alimentos' && (
                    <>
                      <th style={{ verticalAlign: 'top', width: '150px' }}>Código SAP {renderFilterInput("codigo_sap")}</th>
                      <th style={{ verticalAlign: 'top' }}>Descripción {renderFilterInput("descripcion")}</th>
                      <th style={{ verticalAlign: 'top' }}>Categoría {renderFilterInput("categoria")}</th>
                      {canEdit && <th style={{ verticalAlign: 'top', width: 80 }}>Acciones</th>}
                    </>
                  )}
                  {activeTab === 'clientes' && (
                    <>
                      <th style={{ verticalAlign: 'top', width: '120px' }}>Código SAP {renderFilterInput("codigo_sap")}</th>
                      <th style={{ verticalAlign: 'top' }}>Nombre del Cliente {renderFilterInput("nombre")}</th>
                      <th style={{ verticalAlign: 'top' }}>Población {renderFilterInput("poblacion")}</th>
                      <th style={{ verticalAlign: 'top', width: '100px' }}>Tipo Pago {renderFilterInput("tipo_pago")}</th>
                      <th style={{ verticalAlign: 'top', width: '140px', textAlign: 'right' }}>Límite Crédito</th>
                      <th style={{ verticalAlign: 'top', width: '90px' }}>Tipo Inv. {renderFilterInput("tipo_inventario")}</th>
                      <th style={{ verticalAlign: 'top', width: '140px' }}>Grupo Inv. {renderFilterInput("grupo_inventario")}</th>
                      {canEdit && <th style={{ verticalAlign: 'top', width: 80 }}>Acciones</th>}
                    </>
                  )}
                  {activeTab === 'vehiculos' && (
                    <>
                      <th style={{ verticalAlign: 'top' }}>Placa {renderFilterInput("placa")}</th>
                      <th style={{ verticalAlign: 'top' }}>Conductor {renderFilterInput("conductor")}</th>
                      <th style={{ verticalAlign: 'top' }}>Estado</th>
                      {canEdit && <th style={{ verticalAlign: 'top', width: 80 }}>Acciones</th>}
                    </>
                  )}
                  {activeTab === 'granjas' && (
                    <>
                      <th style={{ verticalAlign: 'top' }}>Nombre de Granja {renderFilterInput("nombre")}</th>
                      {canEdit && <th style={{ verticalAlign: 'top', width: 80 }}>Acciones</th>}
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {renderTableContent()}
              </tbody>
            </table>
          </div>
          <div className="pagination">
            <span>Total registros consolidados: {getFilteredData().length}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
