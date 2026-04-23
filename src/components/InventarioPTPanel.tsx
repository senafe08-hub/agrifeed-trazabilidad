import React, { useState, useEffect } from 'react';
import { RefreshCw, AlertTriangle, ArrowRightLeft, Search, Pin, PinOff, ChevronDown, ChevronRight, History } from 'lucide-react';
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

  // Historial de movimientos
  const [showHistorial, setShowHistorial] = useState(false);
  const [historial, setHistorial] = useState<{ reprocesos: any[], prestamos: any[] }>({ reprocesos: [], prestamos: [] });

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

  async function handleInvChange(grupo: string, codigo_sap: number, val: string) {
    if (!canEdit) return;
    const invInicial = Number(val);
    if (isNaN(invInicial)) return;

    try {
      await upsertInventarioPT({ grupo, codigo_sap, semana, anio, inventario_inicial: invInicial });
      loadData();
    } catch (err) { console.error(err); }
  }

  async function openReprocesoModal() {
    const { data } = await supabase.from('programacion').select('lote, codigo_sap, maestro_alimentos(descripcion), bultos_programados').order('lote', { ascending: false }).limit(100);
    setOpsPendientes(data || []);
    setShowReproceso(true);
  }

  async function handleReproceso(e: React.FormEvent) {
    e.preventDefault();
    try {
      const motivoFinal = formData.op_origen ? `OP ${formData.op_origen} - ${formData.motivo || ''}` : (formData.motivo || 'Reproceso general');
      await registrarReproceso({
        grupo: grupoSel,
        codigo_sap: Number(formData.codigo_sap),
        cantidad: Number(formData.cantidad),
        motivo: motivoFinal,
        fecha: new Date().toISOString().split('T')[0],
        semana, anio
      });
      setShowReproceso(false);
      setFormData({});
      loadData();
    } catch (err: any) { alert('Error: ' + err.message); }
  }

  async function openPrestamoModal() {
    const { data } = await supabase.from('programacion').select('lote, codigo_sap, maestro_alimentos(descripcion), bultos_programados').order('lote', { ascending: false }).limit(100);
    setOpsPendientes(data || []);
    setShowPrestamo(true);
  }

  async function openHistorial() {
    const [{ data: rep }, { data: prest }] = await Promise.all([
      supabase.from('reprocesos_pt').select('*').ilike('grupo', `${grupoSel}%`).order('created_at', { ascending: false }).limit(50),
      supabase.from('prestamos_inventario').select('*').or(`grupo_origen.ilike.${grupoSel}%,grupo_destino.ilike.${grupoSel}%`).order('created_at', { ascending: false }).limit(50)
    ]);
    setHistorial({ reprocesos: rep || [], prestamos: prest || [] });
    setShowHistorial(true);
  }

  async function handlePrestamo(e: React.FormEvent) {
    e.preventDefault();
    try {
      const motivoFinal = formData.op_origen ? `Préstamo tomado de OP ${formData.op_origen}` : (formData.motivo || 'Préstamo');
      await crearPrestamo({
        grupo_origen: grupoSel,
        grupo_destino: formData.grupo_destino,
        codigo_sap: Number(formData.codigo_sap),
        cantidad: Number(formData.cantidad),
        // La OP de compensación es la misma OP que se presta: cuando el DESTINO produzca su propia OP,
        // el sistema automáticamente compensará este préstamo via compensarPrestamosPorOP()
        op_compensacion: formData.op_compensacion ? Number(formData.op_compensacion) : (formData.op_origen ? Number(formData.op_origen) : undefined),
        motivo: motivoFinal
      });
      setShowPrestamo(false);
      setFormData({});
      loadData();
    } catch (err: any) { alert('Error: ' + err.message); }
  }

  async function handleTogglePin(grupo: string, codigoSap: number, isPinned: boolean) {
    if (isPinned) {
      if (!window.confirm('¿Estás seguro de que deseas desfijar esta referencia? Si no tiene saldo actual, desaparecerá de la vista principal.')) {
        return;
      }
    }
    try {
      await toggleReferenciaFijaPT(grupo, codigoSap, !isPinned);
      loadData(); // Refrescar para ver el cambio
    } catch (err: any) { alert('Error: ' + err.message); }
  }

  async function handleRowClick(grupo: string, codigoSap: number) {
    const rowKey = `${grupo}|${codigoSap}`;
    if (expandedRow === rowKey as any) {
      setExpandedRow(null);
      setDetalles(null);
      return;
    }
    setExpandedRow(rowKey as any);
    setLoadingDetalles(true);
    setDetalles(null);
    try {
      const d = await fetchDetallesMovimientosPT(semana, anio, grupo, codigoSap);
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
            {grupos.map(g => (
              <option key={g} value={g}>
                {g.includes('|') ? `${g.split('|')[0]} (${g.split('|')[1]})` : g}
              </option>
            ))}
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
              <button className="btn btn-outline btn-sm" onClick={openHistorial}><History size={14} /> Historial</button>
              <button className="btn btn-danger btn-sm" onClick={openReprocesoModal}><AlertTriangle size={14} /> Registrar Reproceso</button>
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
              {(() => {
                const rowsToDisplay: any[] = [];
                for (const a of alimentos) {
                  const invs = inventario.filter(i => i.codigo_sap === a.codigo_sap);
                  const st = searchTerm.toLowerCase();
                  const text = `${a.codigo_sap} ${a.descripcion}`.toLowerCase();
                  
                  if (st && !text.includes(st)) continue;
                  if (!st && invs.length === 0) continue;

                  if (invs.length > 0) {
                    for (const inv of invs) {
                      const isEspecial = inv.grupo.includes('|');
                      const isPinned = inv.isFijo || false;
                      const isAllZeros = (inv.inventario_inicial || 0) === 0 && (inv.producido || 0) === 0 && (inv.despachado || 0) === 0;
                      
                      if (!st && !isEspecial && !isPinned && isAllZeros) continue;

                      const especialText = isEspecial ? inv.grupo.split('|')[1] : '';
                      rowsToDisplay.push({ ...a, inv, isEspecial, especialText, rowKey: `${inv.grupo}|${a.codigo_sap}`, grp: inv.grupo });
                    }
                  } else {
                    rowsToDisplay.push({ ...a, inv: null, isEspecial: false, especialText: '', rowKey: `${grupoSel}|${a.codigo_sap}`, grp: grupoSel });
                  }
                }

                return rowsToDisplay.map(r => {
                  const isPinned = r.inv?.isFijo || false;
                  const isExpanded = expandedRow === r.rowKey;

                  return (
                    <React.Fragment key={r.rowKey}>
                      <tr 
                        className={isExpanded ? 'expanded-row-active' : ''} 
                        onClick={() => handleRowClick(r.grp, r.codigo_sap)}
                        style={{ cursor: 'pointer', backgroundColor: isExpanded ? 'rgba(var(--color-primary-rgb), 0.05)' : '' }}
                      >
                        <td style={{ color: 'var(--color-primary)' }}>
                          {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                        </td>
                        <td>
                          <button 
                            className={`btn-icon ${isPinned ? 'active' : ''}`}
                            onClick={(e) => { e.stopPropagation(); handleTogglePin(r.grp, r.codigo_sap, isPinned); }}
                            title={isPinned ? 'Desfijar Referencia' : 'Fijar Referencia para este Cliente'}
                            style={{ color: isPinned ? 'var(--color-warning)' : 'var(--text-muted)', background: 'none', border: 'none', padding: 4 }}
                          >
                            {isPinned ? <Pin size={16} fill="currentColor" /> : <PinOff size={16} />}
                          </button>
                        </td>
                        <td>{r.codigo_sap}</td>
                        <td>
                          <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <span>{r.descripcion}</span>
                            {r.isEspecial && (
                              <span style={{ fontSize: '0.8em', color: 'var(--color-primary)', fontWeight: 'bold' }}>
                                Especial: {r.especialText}
                              </span>
                            )}
                          </div>
                        </td>
                        <td style={{ textAlign: 'right' }} onClick={e => e.stopPropagation()}>
                          {canEdit ? (
                            <input 
                              key={`${r.inv?.inventario_inicial || 0}-${r.inv?.saldo_actual || 0}`}
                              type="number" className="form-input btn-sm" style={{ width: 100, textAlign: 'right' }} 
                              defaultValue={r.inv?.inventario_inicial || 0}
                              onBlur={e => handleInvChange(r.grp, r.codigo_sap, e.target.value)}
                            />
                          ) : (
                            r.inv?.inventario_inicial || 0
                          )}
                        </td>
                        <td style={{ textAlign: 'right', color: 'var(--text-muted)' }}>{r.inv?.producido || 0}</td>
                        <td style={{ textAlign: 'right', color: 'var(--text-muted)' }}>{r.inv?.despachado || 0}</td>
                        <td style={{ textAlign: 'right', fontWeight: 800, color: (r.inv?.saldo_actual || 0) < 0 ? 'var(--color-error)' : 'var(--color-success)' }}>
                          {r.inv?.saldo_actual || 0}
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
                });
              })()}
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
                <label className="form-label">OP a Reprocesar (Opcional)</label>
                <select className="form-input" value={formData.op_origen || ''} onChange={e => setFormData({...formData, op_origen: e.target.value})}>
                  <option value="">— Ninguna en específico —</option>
                  {opsPendientes.filter(o => !formData.codigo_sap || o.codigo_sap == formData.codigo_sap).map(o => (
                    <option key={o.lote} value={o.lote}>OP {o.lote} - {(o.maestro_alimentos as any)?.descripcion}</option>
                  ))}
                </select>
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
                <label className="form-label">OP Prestada (De dónde salen los bultos físicos)</label>
                <select className="form-input" required value={formData.op_origen || ''} onChange={e => setFormData({...formData, op_origen: e.target.value})}>
                  <option value="">— Seleccionar OP —</option>
                  {opsPendientes.filter(o => !formData.codigo_sap || o.codigo_sap == formData.codigo_sap).map(o => (
                    <option key={o.lote} value={o.lote}>OP {o.lote} - {(o.maestro_alimentos as any)?.descripcion} ({o.bultos_programados} bt)</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">OP de Compensación (Automática)</label>
                <select className="form-input" value={formData.op_compensacion || formData.op_origen || ''} onChange={e => setFormData({...formData, op_compensacion: e.target.value})}>
                  <option value="">— Se compensará con la misma OP prestada —</option>
                  {opsPendientes.filter(o => !formData.codigo_sap || o.codigo_sap == formData.codigo_sap).map(o => (
                    <option key={o.lote} value={o.lote}>OP {o.lote} - {(o.maestro_alimentos as any)?.descripcion} ({o.bultos_programados} bt)</option>
                  ))}
                </select>
                <small style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: 4, display: 'block' }}>
                  Cuando se entregue producción de esta OP, el sistema compensará automáticamente el préstamo.
                </small>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
                <button type="button" className="btn btn-outline" onClick={() => setShowPrestamo(false)}>Cancelar</button>
                <button type="submit" className="btn btn-warning">Crear Préstamo</button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* HISTORIAL DE MOVIMIENTOS */}
      {showHistorial && (
        <div className="modal-overlay" style={{ zIndex: 9999 }}>
          <div className="card" style={{ width: 750, padding: 20, maxHeight: '80vh', overflowY: 'auto' }}>
            <h3 style={{ marginBottom: 16 }}>📋 Historial de Movimientos — {grupoSel}</h3>
            
            {/* Reprocesos */}
            <h4 style={{ margin: '12px 0 8px', color: 'var(--color-error)' }}>🔄 Reprocesos</h4>
            {historial.reprocesos.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Sin reprocesos registrados</p>
            ) : (
              <table className="data-table" style={{ fontSize: '0.82rem', marginBottom: 16 }}>
                <thead><tr><th>Fecha</th><th>SAP</th><th>Cantidad</th><th>Motivo</th><th>Registrado por</th></tr></thead>
                <tbody>
                  {historial.reprocesos.map((r: any) => (
                    <tr key={r.id}>
                      <td>{r.fecha}</td>
                      <td>{r.codigo_sap}</td>
                      <td style={{ fontWeight: 600, color: 'var(--color-error)' }}>-{r.cantidad}</td>
                      <td>{r.motivo}</td>
                      <td>{r.created_by}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {/* Préstamos */}
            <h4 style={{ margin: '12px 0 8px', color: 'var(--color-warning, #e65100)' }}>🤝 Préstamos</h4>
            {historial.prestamos.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Sin préstamos registrados</p>
            ) : (
              <table className="data-table" style={{ fontSize: '0.82rem' }}>
                <thead><tr><th>Fecha</th><th>Origen → Destino</th><th>SAP</th><th>Cantidad</th><th>Compensado</th><th>Estado</th><th>OP Comp.</th></tr></thead>
                <tbody>
                  {historial.prestamos.map((p: any) => (
                    <tr key={p.id}>
                      <td>{p.fecha?.split('T')[0] || p.created_at?.split('T')[0]}</td>
                      <td style={{ fontSize: '0.78rem' }}>{p.grupo_origen} → {p.grupo_destino}</td>
                      <td>{p.codigo_sap}</td>
                      <td style={{ fontWeight: 600 }}>{p.cantidad}</td>
                      <td>{p.cantidad_compensada || 0}</td>
                      <td>
                        <span style={{
                          padding: '2px 8px', borderRadius: 6, fontSize: '0.75rem', fontWeight: 600,
                          background: p.estado === 'COMPENSADO' ? '#e8f5e9' : p.estado === 'PARCIAL' ? '#fff3e0' : '#fce4ec',
                          color: p.estado === 'COMPENSADO' ? '#2e7d32' : p.estado === 'PARCIAL' ? '#e65100' : '#c62828'
                        }}>
                          {p.estado}
                        </span>
                      </td>
                      <td>{p.op_compensacion || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
              <button className="btn btn-outline" onClick={() => setShowHistorial(false)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
