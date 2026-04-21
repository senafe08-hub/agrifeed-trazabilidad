import React, { useState, useEffect } from 'react';
import { RefreshCw, AlertTriangle, ArrowRightLeft, Search, Pin, PinOff, ChevronDown, ChevronRight } from 'lucide-react';
import supabase from '../lib/supabase';
import { usePermissions } from '../lib/permissions';
import { 
  fetchInventarioPT, upsertInventarioPT, fetchGruposInventario, 
  registrarReproceso,
  crearPrestamo,
  calcularSemanaISO,
  toggleReferenciaFijaPT,
  fetchDetallesMovimientosPT
} from '../lib/api/ventas';

function getSemanaActual() {
  const d = new Date();
  return { semana: calcularSemanaISO(d.toISOString().split('T')[0]), anio: d.getFullYear() };
}

export default function InventarioPTPanel() {
  const { canEdit } = usePermissions('despachos');
  const [loading, setLoading] = useState(false);
  const [grupos, setGrupos] = useState<string[]>([]);
  const [grupoSel, setGrupoSel] = useState('');
  const [semana, setSemana] = useState(getSemanaActual().semana);
  const [anio] = useState(getSemanaActual().anio);

  const [inventario, setInventario] = useState<any[]>([]);
  const [alimentos, setAlimentos] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Modals
  const [showReproceso, setShowReproceso] = useState(false);
  const [showPrestamo, setShowPrestamo] = useState(false);
  const [formData, setFormData] = useState<any>({});
  
  // Drill-down
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const [detalles, setDetalles] = useState<{ produccion: any[], despachos: any[] } | null>(null);
  const [loadingDetalles, setLoadingDetalles] = useState(false);

  // OPs pendientes (para préstamos)
  const [opsPendientes, setOpsPendientes] = useState<any[]>([]);

  useEffect(() => { loadMaestros(); }, []);
  useEffect(() => { if (grupoSel) loadData(); }, [grupoSel, semana, anio]);

  async function loadMaestros() {
    const g = await fetchGruposInventario();
    setGrupos(g);
    if (g.length > 0) setGrupoSel(g[0]);
    
    const { data: al } = await supabase.from('maestro_alimentos').select('codigo_sap, descripcion').order('descripcion');
    setAlimentos(al || []);
  }

  async function loadData() {
    setLoading(true);
    try {
      const inv = await fetchInventarioPT(semana, anio, grupoSel);
      
      // Also fetch produccion and despachos to calculate current stock
      // This is simplified. In a real scenario we might call a backend function or MRP view
      
      setInventario(inv);
    } catch (err) { console.error(err); }
    setLoading(false);
  }

  async function handleInvChange(codigo_sap: number, val: string) {
    if (!canEdit) return;
    const invInicial = Number(val);
    if (isNaN(invInicial)) return;

    try {
      await upsertInventarioPT({ grupo: grupoSel, codigo_sap, semana, anio, inventario_inicial: invInicial });
      loadData();
    } catch (err) { console.error(err); }
  }

  async function handleReproceso(e: React.FormEvent) {
    e.preventDefault();
    try {
      await registrarReproceso({
        grupo: grupoSel,
        codigo_sap: Number(formData.codigo_sap),
        cantidad: Number(formData.cantidad),
        motivo: formData.motivo,
        fecha: new Date().toISOString().split('T')[0],
        semana, anio
      });
      setShowReproceso(false);
      setFormData({});
      loadData();
    } catch (err: any) { alert('Error: ' + err.message); }
  }

  async function openPrestamoModal() {
    const { data } = await supabase.from('programacion').select('lote, codigo_sap, maestro_alimentos(descripcion), bultos_programados').order('lote', { ascending: false }).limit(50);
    setOpsPendientes(data || []);
    setShowPrestamo(true);
  }

  async function handlePrestamo(e: React.FormEvent) {
    e.preventDefault();
    try {
      await crearPrestamo({
        grupo_origen: grupoSel,
        grupo_destino: formData.grupo_destino,
        codigo_sap: Number(formData.codigo_sap),
        cantidad: Number(formData.cantidad),
        op_compensacion: Number(formData.op_compensacion),
        motivo: formData.motivo
      });
      setShowPrestamo(false);
      setFormData({});
      loadData();
    } catch (err: any) { alert('Error: ' + err.message); }
  }

  async function handleTogglePin(codigoSap: number, isPinned: boolean) {
    try {
      await toggleReferenciaFijaPT(grupoSel, codigoSap, !isPinned);
      loadData(); // Refrescar para ver el cambio
    } catch (err: any) { alert('Error: ' + err.message); }
  }

  async function handleRowClick(codigoSap: number) {
    if (expandedRow === codigoSap) {
      setExpandedRow(null);
      setDetalles(null);
      return;
    }
    setExpandedRow(codigoSap);
    setLoadingDetalles(true);
    setDetalles(null);
    try {
      const d = await fetchDetallesMovimientosPT(semana, anio, grupoSel, codigoSap);
      setDetalles(d);
    } catch (err: any) {
      alert('Error cargando detalles: ' + err.message);
    } finally {
      setLoadingDetalles(false);
    }
  }

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div className="card-header">
        <span className="card-title">Inventario de Producto Terminado</span>
        <div style={{ display: 'flex', gap: 10 }}>
          <select className="form-input btn-sm" value={grupoSel} onChange={e => setGrupoSel(e.target.value)}>
            {grupos.map(g => <option key={g} value={g}>{g}</option>)}
          </select>
          <input type="number" className="form-input btn-sm" style={{ width: 80 }} value={semana} onChange={e => setSemana(Number(e.target.value))} />
          <button className="btn btn-outline btn-sm" onClick={loadData} disabled={loading}><RefreshCw size={14} className={loading ? 'spinning' : ''} /></button>
        </div>
      </div>
      <div className="card-body">
        
        {canEdit && (
          <div className="toolbar" style={{ marginBottom: 16 }}>
            <div className="toolbar-left"></div>
            <div className="toolbar-right">
              <button className="btn btn-danger btn-sm" onClick={() => setShowReproceso(true)}><AlertTriangle size={14} /> Registrar Reproceso</button>
              <button className="btn btn-warning btn-sm" onClick={openPrestamoModal}><ArrowRightLeft size={14} /> Préstamo</button>
            </div>
          </div>
        )}

        <div className="flex justify-between items-center mb-4 mt-2">
          <div className="search-box" style={{ width: 300 }}>
            <Search size={18} />
            <input 
              type="text" 
              className="form-input" 
              placeholder="Buscar alimento por nombre o SAP..." 
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              style={{ paddingLeft: 36 }}
            />
          </div>
        </div>

        <div className="data-table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: 40 }}></th>
                <th style={{ width: 40 }}></th>
                <th>Código SAP</th>
                <th>Referencia</th>
                <th style={{ textAlign: 'right' }}>Inv. Inicial</th>
                <th style={{ textAlign: 'right', color: 'var(--text-muted)' }}>Producido</th>
                <th style={{ textAlign: 'right', color: 'var(--text-muted)' }}>Despachado</th>
                <th style={{ textAlign: 'right', fontWeight: 800 }}>Saldo Actual</th>
              </tr>
            </thead>
            <tbody>
              {alimentos.map(a => {
                const inv = inventario.find(i => i.codigo_sap === a.codigo_sap);
                
                // Filtro de búsqueda
                const st = searchTerm.toLowerCase();
                const text = `${a.codigo_sap} ${a.descripcion}`.toLowerCase();
                
                // Si hay búsqueda, filtrar. Si no hay búsqueda, mostrar solo los que tienen inventario para no saturar la vista (o los primeros si no hay nada).
                if (st) {
                  if (!text.includes(st)) return null;
                } else {
                  // Si no hay búsqueda, mostrar los que ya tienen inventario o los que se busquen
                  if (!inv && inventario.length > 0) return null;
                }

                const isPinned = inv?.isFijo || false;
                const isExpanded = expandedRow === a.codigo_sap;

                return (
                  <React.Fragment key={a.codigo_sap}>
                    <tr 
                      className={isExpanded ? 'expanded-row-active' : ''} 
                      onClick={() => handleRowClick(a.codigo_sap)}
                      style={{ cursor: 'pointer', backgroundColor: isExpanded ? 'rgba(var(--color-primary-rgb), 0.05)' : '' }}
                    >
                      <td style={{ color: 'var(--color-primary)' }}>
                        {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                      </td>
                      <td>
                        <button 
                          className={`btn-icon ${isPinned ? 'active' : ''}`}
                          onClick={(e) => { e.stopPropagation(); handleTogglePin(a.codigo_sap, isPinned); }}
                          title={isPinned ? 'Desfijar Referencia' : 'Fijar Referencia para este Cliente'}
                          style={{ color: isPinned ? 'var(--color-warning)' : 'var(--text-muted)', background: 'none', border: 'none', padding: 4 }}
                        >
                          {isPinned ? <Pin size={16} fill="currentColor" /> : <PinOff size={16} />}
                        </button>
                      </td>
                      <td>{a.codigo_sap}</td>
                      <td>{a.descripcion}</td>
                      <td style={{ textAlign: 'right' }} onClick={e => e.stopPropagation()}>
                        {canEdit ? (
                          <input 
                            key={`${inv?.inventario_inicial || 0}-${inv?.saldo_actual || 0}`}
                            type="number" className="form-input btn-sm" style={{ width: 100, textAlign: 'right' }} 
                            defaultValue={inv?.inventario_inicial || 0}
                            onBlur={e => handleInvChange(a.codigo_sap, e.target.value)}
                          />
                        ) : (
                          inv?.inventario_inicial || 0
                        )}
                      </td>
                      <td style={{ textAlign: 'right', color: 'var(--text-muted)' }}>{inv?.producido || 0}</td>
                      <td style={{ textAlign: 'right', color: 'var(--text-muted)' }}>{inv?.despachado || 0}</td>
                      <td style={{ textAlign: 'right', fontWeight: 800, color: (inv?.saldo_actual || 0) < 0 ? 'var(--color-error)' : 'var(--color-success)' }}>
                        {inv?.saldo_actual || 0}
                      </td>
                    </tr>
                    
                    {isExpanded && (
                      <tr>
                        <td colSpan={8} style={{ padding: 0, backgroundColor: 'rgba(0,0,0,0.02)' }}>
                          <div style={{ padding: '16px 40px', borderBottom: '1px solid var(--border-color)', display: 'flex', gap: 24 }}>
                            {loadingDetalles ? (
                              <div style={{ padding: 20, textAlign: 'center', width: '100%' }}>Cargando detalles...</div>
                            ) : (
                              <>
                                {/* TABLA PRODUCCION */}
                                <div style={{ flex: 1, backgroundColor: 'white', borderRadius: 6, border: '1px solid var(--border-color)', overflow: 'hidden' }}>
                                  <div style={{ padding: '8px 12px', backgroundColor: 'rgba(var(--color-success-rgb), 0.1)', fontWeight: 600, borderBottom: '1px solid var(--border-color)' }}>
                                    Órdenes de Producción (Entradas)
                                  </div>
                                  <table className="data-table" style={{ margin: 0 }}>
                                    <thead>
                                      <tr><th>Fecha</th><th>Turno</th><th>Lote (OP)</th><th style={{textAlign:'right'}}>Bultos</th></tr>
                                    </thead>
                                    <tbody>
                                      {detalles?.produccion.length === 0 && <tr><td colSpan={4} style={{textAlign:'center', color:'var(--text-muted)'}}>No hay producción en esta semana</td></tr>}
                                      {detalles?.produccion.map((p, idx) => (
                                        <tr key={idx}>
                                          <td>{p.fecha_produccion}</td>
                                          <td>{p.turno}</td>
                                          <td>{p.lote}</td>
                                          <td style={{textAlign:'right', fontWeight:600}}>{p.bultos_entregados}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>

                                {/* TABLA DESPACHOS */}
                                <div style={{ flex: 1, backgroundColor: 'white', borderRadius: 6, border: '1px solid var(--border-color)', overflow: 'hidden' }}>
                                  <div style={{ padding: '8px 12px', backgroundColor: 'rgba(var(--color-warning-rgb), 0.1)', fontWeight: 600, borderBottom: '1px solid var(--border-color)' }}>
                                    Despachos (Salidas)
                                  </div>
                                  <table className="data-table" style={{ margin: 0 }}>
                                    <thead>
                                      <tr><th>Fecha</th><th>Remisión</th><th>Lote (OP)</th><th>Placa</th><th style={{textAlign:'right'}}>Bultos</th></tr>
                                    </thead>
                                    <tbody>
                                      {detalles?.despachos.length === 0 && <tr><td colSpan={5} style={{textAlign:'center', color:'var(--text-muted)'}}>No hay despachos en esta semana</td></tr>}
                                      {detalles?.despachos.map((d, idx) => (
                                        <tr key={idx}>
                                          <td>{d.fecha}</td>
                                          <td>{d.remision}</td>
                                          <td>{d.lote}</td>
                                          <td>{d.placa}</td>
                                          <td style={{textAlign:'right', fontWeight:600}}>{d.bultos_despachados}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 10 }}>
            * Modifique el Inv. Inicial y haga clic fuera de la celda para guardar.
          </p>
        </div>
      </div>

      {/* MODAL REPROCESO */}
      {showReproceso && (
        <div className="modal-overlay" style={{ zIndex: 9999 }}>
          <div className="card" style={{ width: 400, padding: 20 }}>
            <h3 style={{ marginBottom: 16 }}>Registrar Reproceso</h3>
            <form onSubmit={handleReproceso}>
              <div className="form-group">
                <label className="form-label">Grupo Afectado</label>
                <input type="text" className="form-input" disabled value={grupoSel} />
              </div>
              <div className="form-group">
                <label className="form-label">Alimento</label>
                <select className="form-input" required value={formData.codigo_sap || ''} onChange={e => setFormData({...formData, codigo_sap: e.target.value})}>
                  <option value="">— Seleccionar —</option>
                  {alimentos.map(a => <option key={a.codigo_sap} value={a.codigo_sap}>{a.descripcion}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Cantidad (Bultos)</label>
                <input type="number" className="form-input" required min={1} value={formData.cantidad || ''} onChange={e => setFormData({...formData, cantidad: e.target.value})} />
              </div>
              <div className="form-group">
                <label className="form-label">Motivo</label>
                <input type="text" className="form-input" required value={formData.motivo || ''} onChange={e => setFormData({...formData, motivo: e.target.value})} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
                <button type="button" className="btn btn-outline" onClick={() => setShowReproceso(false)}>Cancelar</button>
                <button type="submit" className="btn btn-danger">Registrar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL PRÉSTAMO */}
      {showPrestamo && (
        <div className="modal-overlay" style={{ zIndex: 9999 }}>
          <div className="card" style={{ width: 400, padding: 20 }}>
            <h3 style={{ marginBottom: 16 }}>Préstamo de Inventario</h3>
            <form onSubmit={handlePrestamo}>
              <div className="form-group">
                <label className="form-label">Origen (Se descuenta de)</label>
                <input type="text" className="form-input" disabled value={grupoSel} />
              </div>
              <div className="form-group">
                <label className="form-label">Destino (Se presta a)</label>
                <select className="form-input" required value={formData.grupo_destino || ''} onChange={e => setFormData({...formData, grupo_destino: e.target.value})}>
                  <option value="">— Seleccionar —</option>
                  {grupos.filter(g => g !== grupoSel).map(g => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Alimento</label>
                <select className="form-input" required value={formData.codigo_sap || ''} onChange={e => setFormData({...formData, codigo_sap: e.target.value})}>
                  <option value="">— Seleccionar —</option>
                  {alimentos.map(a => <option key={a.codigo_sap} value={a.codigo_sap}>{a.descripcion}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Cantidad (Bultos)</label>
                <input type="number" className="form-input" required min={1} value={formData.cantidad || ''} onChange={e => setFormData({...formData, cantidad: e.target.value})} />
              </div>
              <div className="form-group">
                <label className="form-label">OP Pendiente de Compensación</label>
                <select className="form-input" required value={formData.op_compensacion || ''} onChange={e => setFormData({...formData, op_compensacion: e.target.value})}>
                  <option value="">— Seleccionar OP —</option>
                  {opsPendientes.filter(o => o.codigo_sap == formData.codigo_sap).map(o => (
                    <option key={o.lote} value={o.lote}>OP {o.lote} - {(o.maestro_alimentos as any)?.descripcion} ({o.bultos_programados} bt)</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Motivo / Observaciones</label>
                <input type="text" className="form-input" required value={formData.motivo || ''} onChange={e => setFormData({...formData, motivo: e.target.value})} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
                <button type="button" className="btn btn-outline" onClick={() => setShowPrestamo(false)}>Cancelar</button>
                <button type="submit" className="btn btn-warning">Crear Préstamo</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
